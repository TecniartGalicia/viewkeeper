// Adaptador de VS Code: une un mosaico, su proxy y su panel webview.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEVICES, findDevice, rotate, type Device } from '../core/devices.ts';
import { applyEdit, isDevHost, normalizePath, parseMosaic, type Mosaic } from '../core/mosaic.ts';
import type { Route } from '../core/routes.ts';
import { startProxy, type ProxyOptions, type ProxyPages, type RunningProxy } from '../core/proxy.ts';
import type { AgentCommand, AgentEvent } from '../core/sync.ts';
import type { CellView, PanelState, PanelText } from '../webview/panel.ts';
import { panelCsp, panelHtml } from '../webview/shell.ts';

export interface HostOptions {
  proxy?: Partial<Pick<ProxyOptions, 'relaxCsp' | 'fixCookies' | 'apiOrigins'>>;
  customDevices?: readonly Device[];
  log?: (line: string) => void;
  /** La página llamó a otro puerto de esta máquina y falló: candidato a pasar por el proxy. */
  onHint?: (origin: string) => void;
  /** Solo la sonda: instrumentos que se insertan en el agente. El producto no los lleva en el paquete. */
  sonda?: { inicio: string; pregunta: string };
  /** Las rutas del proyecto, para ofrecerlas al cambiar la de una fila. */
  routes?: () => Promise<Route[]>;
  /** ¿Está encendido «seguir al editor»? Se pregunta cada vez que se pinta la barra. */
  follow?: () => boolean;
  /**
   * En una ventana remota: trae el puerto del proxy a esta máquina y devuelve el puerto local, o undefined si
   * desde aquí solo se llega por otro dominio (VS Code en el navegador), donde las celdas no pueden funcionar.
   */
  expose?: (port: number) => Promise<number | undefined>;
}

export interface Metrics {
  width: number;
  height: number;
  pageHeight: number;
  scrollY: number;
}

interface FromPanel {
  t?: string;
  origin?: string;
  cell?: string;
  path?: string;
  id?: number;
  data?: Metrics;
  group?: number;
  n?: number;
  edit?: unknown;
  command?: string;
  ev?: AgentEvent & { boot?: string };
}

/** Botones de la barra que lanzan un comando de la extensión. Lo demás que pida el panel se ignora. */
const PANEL_COMMANDS = new Set(['openUrl', 'reload', 'capture', 'captureFullPage', 'save', 'addSession', 'openMatrix', 'doctor', 'toggleFollowEditor']);

function texts(): PanelText {
  const t = vscode.l10n.t;
  return {
    tripped: t('These cells kept sending each other to different pages, so navigation sync is paused for this row for 30 seconds. Reload the mosaic to resume now.'),
    address: t('Address'),
    addDevice: t('Add device'),
    sync: t('Sync'),
    scroll: t('Scroll'),
    click: t('Clicks'),
    input: t('Typing'),
    nav: t('Navigation'),
    reload: t('Reload all'),
    capture: t('Capture'),
    save: t('Save mosaic'),
    session: t('Add session'),
    matrix: t('Routes'),
    rotate: t('Rotate'),
    remove: t('Remove'),
    empty: t('No cells. Add a device to start.'),
    session1: t('session'),
    deployed: t('Deployed site'),
    deployedHint: t('Click and typing sync start switched off on a deployed site, so nothing is done once per device on real data.'),
    route: t('Change the route of this row'),
    addToRow: t('Add a device to this row'),
    zoom: t('Enlarge this cell (Esc to go back)'),
    follow: t('Follow editor'),
    errors: t('JavaScript errors on this page'),
    left: t('Outside the mosaic, not opened'),
  };
}

/** Las páginas que el proxy pone en una celda cuando no puede enseñar la app. */
function proxyPages(): ProxyPages {
  const t = vscode.l10n.t;
  return {
    denied: t('This address only serves the cells of the ViewKeeper panel.'),
    downTitle: t('Nothing is listening on {0}'),
    downBody: t('Start your dev server. This cell retries by itself every two seconds.'),
    leftTitle: t('This page redirects outside the mosaic'),
    leftBody: t('It goes to {0}. A cell only shows the site the mosaic was opened for, so the redirect was not followed. Signing in through another site cannot happen inside a cell.'),
    back: t('Back'),
  };
}

export class PanelHost implements vscode.Disposable {
  /** Solo en modo sonda: todo lo que los agentes han dicho, con su celda y su instante. */
  readonly events: { at: number; cell: string; ev: AgentEvent & { boot?: string } }[] = [];
  readonly panel: vscode.WebviewPanel;
  readonly proxy: RunningProxy;
  readonly customDevices: readonly Device[];
  private model: Mosaic;
  private readonly fixCookies: boolean;
  private readonly sonda: boolean;
  private readonly extensionUri: vscode.Uri;
  private readonly paths = new Map<string, string>();
  private readonly misses = new Map<string, number>();
  private readonly errorCounts = new Map<string, number>();
  private readonly routes: (() => Promise<Route[]>) | undefined;
  private readonly follow: (() => boolean) | undefined;
  private readonly moved = new vscode.EventEmitter<void>();
  /** Una celda ha cambiado de página: lo usa la extensión para recordar el mosaico tal como quedó. */
  readonly onDidMove = this.moved.event;
  private readonly waiters = new Map<number, (data: unknown) => void>();
  private readonly changed = new vscode.EventEmitter<Mosaic>();
  /** Cada vez que el mosaico cambia de forma (no al navegar): lo usa la extensión para saber qué hay abierto. */
  readonly onDidChange = this.changed.event;
  private askId = 0;
  private disposed = false;

  private constructor(panel: vscode.WebviewPanel, proxy: RunningProxy, model: Mosaic, opts: HostOptions, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.proxy = proxy;
    this.model = model;
    this.customDevices = opts.customDevices ?? [];
    this.fixCookies = opts.proxy?.fixCookies !== false;
    this.sonda = opts.sonda !== undefined;
    this.extensionUri = extensionUri;
    this.routes = opts.routes;
    this.follow = opts.follow;
  }

  static async open(ctx: vscode.ExtensionContext, input: Mosaic, opts: HostOptions = {}): Promise<PanelHost> {
    // Todo mosaico pasa por el validador, venga de donde venga: las sesiones acaban en un nombre de host y en la CSP.
    const parsed = parseMosaic(input) ?? (input.cells.length === 0 ? emptyMosaic(input) : undefined);
    if (!parsed) throw new Error(vscode.l10n.t('This mosaic is not valid.'));
    const unknown = [...new Set(parsed.cells.filter((c) => !findDevice(c.deviceId, opts.customDevices)).map((c) => c.deviceId))];
    const mosaic: Mosaic = { ...parsed, cells: parsed.cells.map((c) => (findDevice(c.deviceId, opts.customDevices) ? c : { ...c, deviceId: 'laptop', landscape: false })) };
    if (unknown.length) void vscode.window.showWarningMessage(vscode.l10n.t('This mosaic uses devices this computer does not have ({0}); they are shown as Laptop. Add them to "viewkeeper.customDevices".', unknown.join(', ')));
    let agentSource = fs.readFileSync(path.join(ctx.extensionPath, 'media', 'agent.js'), 'utf8');
    if (opts.sonda) agentSource = agentSource.replace('/*SONDA-INICIO*/', opts.sonda.inicio).replace('/*SONDA*/', opts.sonda.pregunta);
    const proxy = await startProxy({ target: mosaic.target, agentSource, log: opts.log, pages: proxyPages(), ...opts.proxy });
    if (opts.expose) {
      const shown = await opts.expose(proxy.port).catch(() => undefined);
      if (shown === undefined) {
        await proxy.close();
        throw new Error(vscode.l10n.t('ViewKeeper cannot open a mosaic in this window: its cells need the preview on a local port, and from here it is only reachable through another domain.'));
      }
      proxy.setPublicPort(shown);
    }
    const panel = vscode.window.createWebviewPanel('viewkeeper.mosaic', `ViewKeeper · ${mosaic.name}`, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'dist')],
    });
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.png');
    const host = new PanelHost(panel, proxy, mosaic, opts, ctx.extensionUri);
    host.writeHtml();
    panel.webview.onDidReceiveMessage((m: FromPanel) => host.onMessage(m, opts));
    panel.onDidDispose(() => host.dispose());
    return host;
  }

  private onMessage(m: FromPanel, opts: HostOptions): void {
    if (m.t === 'panelReady') {
      // El agente solo hablará con este origen. Se fija ANTES de mandar el estado, que es lo que carga las celdas.
      if (typeof m.origin === 'string' && /^vscode-webview:\/\/[a-z0-9-]+$/i.test(m.origin)) this.proxy.setPanelOrigin(m.origin);
      this.postState();
    } else if (m.t === 'where' && typeof m.cell === 'string' && typeof m.path === 'string') {
      if (this.paths.get(m.cell) !== m.path) {
        this.paths.set(m.cell, m.path);
        this.moved.fire();
      }
    } else if (m.t === 'pick') {
      void this.pickDevice(typeof m.cell === 'string' ? m.cell : undefined, Number.isInteger(m.group) ? m.group : undefined);
    } else if (m.t === 'route' && typeof m.cell === 'string') {
      void this.pickRoute(m.cell);
    } else if (m.t === 'errors' && typeof m.cell === 'string' && typeof m.n === 'number' && Number.isFinite(m.n)) {
      this.errorCounts.set(m.cell, Math.max(0, Math.floor(m.n)));
    } else if (m.t === 'edit') {
      this.apply(applyEdit(this.mosaic(), m.edit, (id) => findDevice(id, this.customDevices) !== undefined));
    } else if (m.t === 'command' && typeof m.command === 'string' && PANEL_COMMANDS.has(m.command)) {
      void vscode.commands.executeCommand(`viewkeeper.${m.command}`);
    } else if (m.t === 'answer' && typeof m.id === 'number') {
      this.waiters.get(m.id)?.(m.data);
      this.waiters.delete(m.id);
    } else if (m.t === 'hint' && typeof m.origin === 'string') {
      opts.onHint?.(m.origin);
    } else if (m.t === 'miss' && typeof m.cell === 'string') {
      this.misses.set(m.cell, (this.misses.get(m.cell) ?? 0) + 1);
    } else if (m.t === 'left' && typeof m.cell === 'string' && typeof m.origin === 'string') {
      // Solo el origen, y solo si lo es: el texto viene de la página.
      try {
        opts.log?.(`cell ${m.cell}: the page tried to go to ${new URL(m.origin).origin}, outside the mosaic; not followed`);
      } catch {
        /* no era un origen */
      }
    } else if (m.t === 'trip') {
      opts.log?.(`row ${m.group}: cells kept navigating each other, navigation sync paused`);
    } else if (m.t === 'fromCell' && m.cell && m.ev && this.sonda) {
      this.events.push({ at: Date.now(), cell: m.cell, ev: m.ev });
      if (m.ev.t === 'answer') {
        this.waiters.get(m.ev.id)?.(m.ev.data);
        this.waiters.delete(m.ev.id);
      }
    }
  }

  private views(): CellView[] {
    return this.model.cells.map((c) => {
      const base = findDevice(c.deviceId, this.customDevices) ?? findDevice('laptop')!;
      const d = c.landscape ? rotate(base) : base;
      return {
        ...c,
        label: d.name,
        width: d.width,
        height: d.height,
        // Una celda que se vuelve a cargar (otro dispositivo) entra en la página donde estaba, no en la inicial.
        entry: this.proxy.entryUrl(c.session, this.paths.get(c.id) ?? c.path),
        origin: this.proxy.originFor(c.session),
        cfg: { ua: d.userAgent, touch: d.mobile, lang: c.locale, fixCookies: this.fixCookies },
      };
    });
  }

  private state(): PanelState {
    const devices = [...DEVICES, ...this.customDevices].map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height }));
    return { cells: this.views(), sync: this.model.sync, sonda: this.sonda, text: texts(), devices, name: this.model.name, deployed: !isDevHost(this.model.target), follow: this.follow?.() === true };
  }

  private postState(): void {
    void this.panel.webview.postMessage({ t: 'state', state: this.state() });
  }

  /** Vuelve a pintar la barra: un ajuste que el panel enseña (seguir al editor) ha cambiado. */
  refresh(): void {
    if (!this.disposed) this.postState();
  }

  /** Lleva una fila entera a otra ruta. El reparto lo hace el panel, que sabe dónde está cada celda. */
  drive(group: number, path: string): void {
    if (this.disposed || !this.model.cells.some((c) => c.group === group)) return;
    void this.panel.webview.postMessage({ t: 'drive', group, path: normalizePath(path) });
  }

  /** Las filas del mosaico, de arriba abajo. */
  groups(): number[] {
    return [...new Set(this.model.cells.map((c) => c.group))].sort((a, b) => a - b);
  }

  /** Dónde está ahora la primera celda de una fila. */
  pathOfGroup(group: number): string | undefined {
    const c = this.model.cells.find((x) => x.group === group);
    return c ? (this.paths.get(c.id) ?? c.path) : undefined;
  }

  /** Cambiar la ruta de la fila de una celda: las rutas del proyecto, o la que se escriba. */
  private async pickRoute(cell: string): Promise<void> {
    const c = this.model.cells.find((x) => x.id === cell);
    if (!c) return;
    const now = this.paths.get(c.id) ?? c.path;
    const known = (this.routes ? await this.routes() : []).filter((r) => !r.dynamic);
    if (this.disposed) return;
    type Item = vscode.QuickPickItem & { path: string };
    const base: Item[] = [{ path: '/', source: '' }, ...known.filter((r) => r.path !== '/')].map((r) => ({ label: r.path, description: r.source, path: r.path }));
    const qp = vscode.window.createQuickPick<Item>();
    qp.title = vscode.l10n.t('Route for this row');
    qp.placeholder = vscode.l10n.t('Pick a route or type one (/pricing)');
    qp.value = now;
    const offer = (v: string): void => {
      const typed = v.trim();
      // Lo escrito siempre se puede abrir, aunque no coincida con ninguna ruta detectada.
      qp.items = typed === '' || base.some((b) => b.path === normalizePath(typed)) ? base : [{ label: normalizePath(typed), description: vscode.l10n.t('Go to this route'), path: normalizePath(typed), alwaysShow: true }, ...base];
    };
    offer(now);
    qp.onDidChangeValue(offer);
    const chosen = await new Promise<Item | undefined>((resolve) => {
      qp.onDidAccept(() => {
        resolve(qp.selectedItems[0]);
        qp.hide();
      });
      qp.onDidHide(() => resolve(undefined));
      qp.show();
    });
    qp.dispose();
    if (chosen) this.drive(c.group, chosen.path);
  }

  /** Se escribe una vez: la política admite cualquier sesión de ESTE proxy (http://*.localhost:<su puerto>). */
  private writeHtml(): void {
    this.panel.webview.html = html(this.panel.webview, this.extensionUri, `http://*.localhost:${this.proxy.shownPort()}`);
  }

  /** Sustituye el mosaico del panel. Las celdas que siguen igual no se recargan. */
  apply(next: Mosaic): void {
    const valid = next.cells.length === 0 ? emptyMosaic(next) : parseMosaic(next);
    if (!valid || valid.target !== this.model.target) return;
    // Lo que cambie de forma se recuerda; la ruta de cada celda la sigue dando la propia celda.
    for (const id of [...this.paths.keys()]) if (!valid.cells.some((c) => c.id === id)) this.paths.delete(id);
    for (const id of [...this.errorCounts.keys()]) if (!valid.cells.some((c) => c.id === id)) this.errorCounts.delete(id);
    this.model = valid;
    this.panel.title = `ViewKeeper · ${valid.name}`;
    this.postState();
    this.changed.fire(this.mosaic());
  }

  /** Selector de dispositivo: para cambiar el de una celda o, sin celda, para añadir una. */
  private async pickDevice(cell: string | undefined, group?: number): Promise<void> {
    const current = cell ? this.model.cells.find((c) => c.id === cell) : undefined;
    if (cell && !current) return;
    const items = [...DEVICES, ...this.customDevices].map((d) => ({ label: d.name, description: `${d.width}×${d.height}`, id: d.id, picked: d.id === current?.deviceId }));
    const choice = await vscode.window.showQuickPick(items, { title: cell ? vscode.l10n.t('Device for this cell') : vscode.l10n.t('Add device') });
    if (!choice || this.disposed) return;
    const known = (id: string): boolean => findDevice(id, this.customDevices) !== undefined;
    this.apply(applyEdit(this.mosaic(), cell ? { op: 'device', cell, deviceId: choice.id } : { op: 'add', deviceId: choice.id, group }, known));
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** El mosaico tal como está ahora: cada celda en la ruta a la que se haya navegado. */
  mosaic(): Mosaic {
    return { ...this.model, cells: this.model.cells.map((c) => ({ ...c, path: this.paths.get(c.id) ?? c.path })) };
  }

  send(cell: string, cmd: AgentCommand): void {
    void this.panel.webview.postMessage({ t: 'toCell', cell, cmd });
  }

  reload(): void {
    void this.panel.webview.postMessage({ t: 'reload' });
  }

  ask(cell: string, q: string, arg?: unknown, timeoutMs = 6000): Promise<unknown> {
    const id = ++this.askId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        resolve(undefined);
      }, timeoutMs);
      this.waiters.set(id, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      this.send(cell, { t: 'ask', id, q, arg });
    });
  }

  /** Medidas de una celda viva. undefined si no contesta (está navegando, o la página no es nuestra). */
  async metrics(cell: string): Promise<Metrics | undefined> {
    const d = (await this.ask(cell, 'metrics', undefined, 3000)) as Partial<Metrics> | undefined;
    if (!d || typeof d.pageHeight !== 'number' || d.pageHeight <= 0) return undefined;
    return { width: Number(d.width) || 0, height: Number(d.height) || 0, pageHeight: d.pageHeight, scrollY: Number(d.scrollY) || 0 };
  }

  diagnostics(): string[] {
    const miss = [...this.misses].map(([cell, n]) => `cell ${cell}: ${n} actions not replayed (the element was not the same at that width)`);
    const errors = [...this.errorCounts].filter(([, n]) => n > 0).map(([cell, n]) => `cell ${cell}: ${n} JavaScript errors on the page it shows now`);
    return [...this.proxy.diagnostics(), ...miss, ...errors];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.changed.dispose();
    this.moved.dispose();
    void this.proxy.close();
    this.panel.dispose();
  }
}

/** Un mosaico sin celdas no pasa por parseMosaic (que exige al menos una), pero es un estado válido del panel. */
function emptyMosaic(m: Mosaic): Mosaic | undefined {
  const probe = parseMosaic({ ...m, cells: [{ id: 'x', deviceId: 'laptop', path: '/' }] });
  return probe ? { ...probe, cells: [] } : undefined;
}

function html(webview: vscode.Webview, extensionUri: vscode.Uri, frameSource: string): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'panel.js'));
  // La política solo deja incrustar el proxy de ESTE panel (su puerto, cualquier sesión), y ejecutar NUESTRO script.
  // El puerto es un número que da el sistema: no puede colar directivas.
  return panelHtml({ csp: panelCsp(frameSource, nonce), nonce, script: String(script) });
}
