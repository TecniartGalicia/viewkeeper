// Adaptador de VS Code: une un mosaico, su proxy y su panel webview.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEVICES, findDevice, rotate, type Device } from '../core/devices.ts';
import { applyEdit, parseMosaic, type Mosaic } from '../core/mosaic.ts';
import { startProxy, type ProxyOptions, type RunningProxy } from '../core/proxy.ts';
import type { AgentCommand, AgentEvent } from '../core/sync.ts';
import type { CellView, PanelState, PanelText } from '../webview/panel.ts';

export interface HostOptions {
  proxy?: Partial<Pick<ProxyOptions, 'relaxCsp' | 'fixCookies' | 'apiOrigins'>>;
  customDevices?: readonly Device[];
  log?: (line: string) => void;
  /** La página llamó a otro puerto de esta máquina y falló: candidato a pasar por el proxy. */
  onHint?: (origin: string) => void;
  /** Solo la sonda: instrumentos que se insertan en el agente. El producto no los lleva en el paquete. */
  sonda?: { inicio: string; pregunta: string };
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
  edit?: unknown;
  command?: string;
  ev?: AgentEvent & { boot?: string };
}

/** Botones de la barra que lanzan un comando de la extensión. Lo demás que pida el panel se ignora. */
const PANEL_COMMANDS = new Set(['reload', 'capture', 'captureFullPage', 'save', 'addSession', 'openMatrix', 'doctor']);

function texts(): PanelText {
  const t = vscode.l10n.t;
  return {
    tripped: t('These cells kept sending each other to different pages, so navigation sync is paused for this row for 30 seconds. Reload the mosaic to resume now.'),
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
  /** Orígenes que la política del webview deja incrustar ahora mismo. */
  private allowed = new Set<string>();
  private readonly paths = new Map<string, string>();
  private readonly misses = new Map<string, number>();
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
  }

  static async open(ctx: vscode.ExtensionContext, input: Mosaic, opts: HostOptions = {}): Promise<PanelHost> {
    // Todo mosaico pasa por el validador, venga de donde venga: las sesiones acaban en un nombre de host y en la CSP.
    const mosaic = parseMosaic(input) ?? (input.cells.length === 0 ? emptyMosaic(input) : undefined);
    if (!mosaic) throw new Error('mosaico no válido');
    let agentSource = fs.readFileSync(path.join(ctx.extensionPath, 'media', 'agent.js'), 'utf8');
    if (opts.sonda) agentSource = agentSource.replace('/*SONDA-INICIO*/', opts.sonda.inicio).replace('/*SONDA*/', opts.sonda.pregunta);
    const proxy = await startProxy({ target: mosaic.target, agentSource, log: opts.log, ...opts.proxy });
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
      this.paths.set(m.cell, m.path);
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
    } else if (m.t === 'trip') {
      opts.log?.(`navegación en bucle en la fila ${m.group}: sincronización de navegación en pausa`);
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
    return { cells: this.views(), sync: this.model.sync, sonda: this.sonda, text: texts(), devices, name: this.model.name };
  }

  private postState(): void {
    void this.panel.webview.postMessage({ t: 'state', state: this.state() });
  }

  /** La política del webview nombra los orígenes de las sesiones; con una sesión nueva hay que reescribirla. */
  private writeHtml(): void {
    this.allowed = new Set(this.views().map((c) => c.origin));
    this.allowed.add(this.proxy.originFor('main'));
    this.panel.webview.html = html(this.panel.webview, this.extensionUri, [...this.allowed]);
  }

  /** Sustituye el mosaico del panel. Las celdas que siguen igual no se recargan. */
  apply(next: Mosaic): void {
    const valid = next.cells.length === 0 ? emptyMosaic(next) : parseMosaic(next);
    if (!valid || valid.target !== this.model.target) return;
    // Lo que cambie de forma se recuerda; la ruta de cada celda la sigue dando la propia celda.
    for (const id of [...this.paths.keys()]) if (!valid.cells.some((c) => c.id === id)) this.paths.delete(id);
    this.model = valid;
    this.panel.title = `ViewKeeper · ${valid.name}`;
    const origins = this.views().map((c) => c.origin);
    if (origins.some((o) => !this.allowed.has(o))) this.writeHtml();
    else this.postState();
    this.changed.fire(this.mosaic());
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
    const miss = [...this.misses].map(([cell, n]) => `celda ${cell}: ${n} acciones no reproducidas (el elemento no era el mismo en ese ancho)`);
    return [...this.proxy.diagnostics(), ...miss];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.changed.dispose();
    void this.proxy.close();
    this.panel.dispose();
  }
}

/** Un mosaico sin celdas no pasa por parseMosaic (que exige al menos una), pero es un estado válido del panel. */
function emptyMosaic(m: Mosaic): Mosaic | undefined {
  const probe = parseMosaic({ ...m, cells: [{ id: 'x', deviceId: 'laptop', path: '/' }] });
  return probe ? { ...probe, cells: [] } : undefined;
}

function html(webview: vscode.Webview, extensionUri: vscode.Uri, frameOrigins: string[]): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'panel.js'));
  // La política solo deja incrustar los orígenes del proxy de ESTE panel, y ejecutar NUESTRO script.
  // Los orígenes salen de sesiones ya validadas ([a-z0-9]), así que no pueden colar directivas.
  const csp = `default-src 'none'; frame-src ${frameOrigins.join(' ')}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:`;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">${CSS}</style></head>
<body><div id="barra"></div><div id="mosaico"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
}

const CSS = `
  body { margin: 0; padding: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: 12px var(--vscode-font-family); }
  #barra { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-panel-border); }
  #barra .sep { width: 1px; height: 20px; background: var(--vscode-panel-border); margin: 0 4px; }
  #barra .etq { opacity: .75; margin-right: 2px; }
  button, select { font: inherit; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 4px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible, select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button.ico { padding: 3px 5px; background: transparent; color: var(--vscode-foreground); }
  button.ico:hover { background: var(--vscode-toolbar-hoverBackground); }
  svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  #mosaico { padding: 12px; box-sizing: border-box; }
  .fila { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
  .aviso { flex-basis: 100%; margin: 0; padding: 6px 10px; border-radius: 4px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
  .vacio { padding: 40px 12px; text-align: center; opacity: .8; }
  figure { margin: 0; flex: none; }
  figcaption { display: flex; align-items: center; gap: 4px; padding: 0 0 6px; white-space: nowrap; min-height: 26px; }
  figcaption select { padding: 1px 4px; max-width: 150px; flex: none; }
  figure.estrecha .dim { display: none; }
  figure.estrecha figcaption select { max-width: 112px; }
  figcaption .acc { margin-left: auto; display: inline-flex; }
  figcaption .dim { opacity: .7; }
  figcaption .ruta { opacity: .85; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; max-width: 220px; }
  figcaption .ses { font-size: 11px; padding: 0 5px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .escena { overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: #fff; }
  iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
`;
