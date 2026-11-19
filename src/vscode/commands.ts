// Casos de uso de la extensión. Cada comando envuelto en `wrap`: un fallo se enseña, no se traga.
import * as vscode from 'vscode';
import { DEVICES, parseCustomDevice, type Device } from '../core/devices.ts';
import { MAX_CELLS, SYNC_ALL, addSession, capCells, isLoopback, isValidSession, matrix, normalizeTarget, type Mosaic } from '../core/mosaic.ts';
import { detectRoutes, fillRoute } from '../core/routes.ts';
import { captureMosaic } from './captureFlow.ts';
import { apiTrustsApp, findDevServers } from './detect.ts';
import { PanelHost } from './panelHost.ts';
import { deleteMosaic, loadMosaics, saveMosaic } from './store.ts';

const t = vscode.l10n.t;
const FALLBACK_DEVICES = ['iphone-15', 'ipad-mini', 'laptop'];
let current: PanelHost | undefined;
let out: vscode.LogOutputChannel;

function folder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

export function customDevices(): Device[] {
  const raw = vscode.workspace.getConfiguration('viewkeeper').get<unknown[]>('customDevices') ?? [];
  return (Array.isArray(raw) ? raw : []).map(parseCustomDevice).filter((d): d is Device => d !== undefined);
}

function known(id: string): boolean {
  return DEVICES.some((d) => d.id === id) || customDevices().some((d) => d.id === id);
}

function defaultDevices(): string[] {
  const raw = vscode.workspace.getConfiguration('viewkeeper').get<unknown[]>('defaultDevices') ?? [];
  const ids = (Array.isArray(raw) ? raw : []).filter((x): x is string => typeof x === 'string' && known(x)).slice(0, MAX_CELLS);
  return ids.length ? ids : FALLBACK_DEVICES;
}

async function pickTarget(): Promise<{ origin: string; path: string } | undefined> {
  const found = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: t('ViewKeeper: looking for your dev server…') }, () => findDevServers(folder()));
  if (found.length === 1) return { origin: found[0].origin, path: '/' };
  if (found.length > 1) {
    const pick = await vscode.window.showQuickPick(
      found.map((f) => ({ label: f.origin, description: f.framework, origin: f.origin })),
      { title: t('Which dev server?') },
    );
    return pick ? { origin: pick.origin, path: '/' } : undefined;
  }
  const raw = await vscode.window.showInputBox({
    title: t('No dev server found'),
    prompt: t('Start your dev server, or type its URL or port.'),
    placeHolder: 'http://localhost:5173',
    validateInput: (v) => (normalizeTarget(v) ? undefined : t('Not a valid http(s) address.')),
  });
  return raw === undefined ? undefined : normalizeTarget(raw);
}

/** En una ventana remota dice por qué no y devuelve true. Se mira al empezar cada comando, antes de preguntar nada. */
function remote(): boolean {
  if (!vscode.env.remoteName) return false;
  void vscode.window.showWarningMessage(t('ViewKeeper works in local windows for now. In a remote window ({0}) the cells cannot reach your dev server.', vscode.env.remoteName));
  return true;
}

async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic): Promise<void> {
  // En una ventana remota (WSL, SSH, contenedor, Codespaces) el proxy corre en la otra máquina y las celdas,
  // que se pintan en esta, no lo alcanzan: mejor decirlo que abrir un panel en blanco (P-46).
  if (remote()) return;
  const capped = capCells(mosaic.cells);
  if (capped.dropped > 0) void vscode.window.showWarningMessage(t('A mosaic holds up to {0} cells; the rest were left out.', MAX_CELLS));
  const next: Mosaic = { ...mosaic, cells: capped.cells };
  if (current) current.dispose();
  const cfg = vscode.workspace.getConfiguration('viewkeeper');
  // La lista puede venir escrita en los ajustes del repositorio: cada origen se comprueba antes de usarlo (N-6).
  const declared = (cfg.get<string[]>('apiOrigins') ?? []).filter((o) => typeof o === 'string' && isLoopback(o)).slice(0, 8);
  const trusted = (await Promise.all(declared.map(async (o) => ((await apiTrustsApp(o, next.target)) ? o : undefined)))).filter((o): o is string => o !== undefined);
  for (const o of declared) if (!trusted.includes(o)) out.warn(`apiOrigins: ${o} does not allow ${next.target} by CORS; not routed through the proxy`);
  current = await PanelHost.open(ctx, next, {
    customDevices: customDevices(),
    log: (l) => out.info(l),
    proxy: { relaxCsp: cfg.get<boolean>('relaxCsp') !== false, fixCookies: cfg.get<boolean>('fixCookies') !== false, apiOrigins: trusted },
    onHint: (origin) => void offerApi(ctx, origin),
  });
  const host = current;
  out.info(`mosaic open: ${next.target}, ${next.cells.length} cells, proxy on port ${host.proxy.port}`);
  host.panel.onDidDispose(() => {
    if (current === host) current = undefined;
    void vscode.commands.executeCommand('setContext', 'viewkeeper.open', current !== undefined);
  });
  void vscode.commands.executeCommand('setContext', 'viewkeeper.open', true);
}

const offered = new Set<string>();
/** La app llama a otro puerto de esta máquina y el navegador lo bloquea: se ofrece pasarlo por el proxy. */
async function offerApi(ctx: vscode.ExtensionContext, raw: string): Promise<void> {
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    return;
  }
  if (offered.has(origin) || !isLoopback(origin) || !current) return;
  offered.add(origin);
  // El aviso viene de la página, y una página puede fabricarlo: solo se ofrece si la API ya se fía de esta app.
  if (!(await apiTrustsApp(origin, current.mosaic().target))) {
    out.info(`the page called ${origin} and failed; not offering to route it because it does not allow ${current.mosaic().target} by CORS`);
    return;
  }
  const yes = t('Yes');
  const where = folder() ? t('this workspace') : t('your user settings');
  const pick = await vscode.window.showInformationMessage(t('Your app calls {0} and the browser is blocking it inside the mosaic. Route it through ViewKeeper? It will be saved in "viewkeeper.apiOrigins" of {1}.', origin, where), yes, t('No'));
  if (pick !== yes || !current) return;
  const cfg = vscode.workspace.getConfiguration('viewkeeper');
  const list = [...new Set([...(cfg.get<string[]>('apiOrigins') ?? []), origin])];
  await cfg.update('apiOrigins', list, folder() ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);
  await show(ctx, current.mosaic());
}

async function openDefault(ctx: vscode.ExtensionContext): Promise<void> {
  if (remote()) return;
  // Con un mosaico abierto, el botón de la barra de estado lo trae al frente en vez de abrir otro.
  if (current) {
    current.panel.reveal();
    return;
  }
  const target = await pickTarget();
  if (!target) return;
  await show(ctx, { v: 1, name: new URL(target.origin).host, target: target.origin, cells: matrix([target.path], defaultDevices()), sync: SYNC_ALL });
}

/** Elegir rutas del proyecto y dispositivos, y abrir la matriz: una fila por ruta, una columna por dispositivo. */
async function openMatrix(ctx: vscode.ExtensionContext): Promise<void> {
  if (remote()) return;
  const target = current ? { origin: current.mosaic().target, path: '/' } : await pickTarget();
  if (!target) return;
  const base = folder();
  let routes: ReturnType<typeof detectRoutes> = [];
  if (base) {
    const files = await vscode.workspace.findFiles('**/*.{tsx,jsx,ts,js,mdx,md,svelte,astro,vue,html}', '**/{node_modules,dist,build,out,.next,.svelte-kit,.astro,.nuxt,.output,coverage}/**', 4000);
    routes = detectRoutes(files.map((f) => vscode.workspace.asRelativePath(f, false)));
  }
  const other = t('Type a route…');
  const picked = await vscode.window.showQuickPick(
    [
      ...[{ path: '/', dynamic: false, source: '' }, ...routes.filter((r) => r.path !== '/')].map((r) => ({ label: r.path, description: r.dynamic ? t('needs a value') : r.source, route: r, picked: r.path === '/' })),
      { label: other, description: '', route: undefined, picked: false },
    ],
    { title: t('Routes to show (one row each)'), canPickMany: true },
  );
  if (!picked?.length) return;
  const paths: string[] = [];
  for (const p of picked) {
    if (!p.route) {
      const v = await vscode.window.showInputBox({ title: t('Routes to show (one row each)'), prompt: t('One or more routes, separated by commas'), placeHolder: '/, /pricing, /cart' });
      if (v === undefined) return;
      paths.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (!p.route.dynamic) {
      paths.push(p.route.path);
      continue;
    }
    const values: Record<string, string> = {};
    for (const m of p.route.path.matchAll(/\[\[?\.{0,3}([^\]]+)\]\]?/g)) {
      const v = await vscode.window.showInputBox({ title: p.route.path, prompt: t('Value for {0}', m[1]) });
      if (v === undefined) return;
      values[m[1]] = v;
    }
    const filled = fillRoute(p.route.path, values);
    if (filled) paths.push(filled);
  }
  if (!paths.length) return;
  const preset = defaultDevices();
  const devices = await vscode.window.showQuickPick(
    [...DEVICES, ...customDevices()].map((d) => ({ label: d.name, description: `${d.width}×${d.height}`, id: d.id, picked: preset.includes(d.id) })),
    { title: t('Devices (one column each)'), canPickMany: true },
  );
  if (!devices?.length) return;
  if (paths.length * devices.length > MAX_CELLS) void vscode.window.showWarningMessage(t('A mosaic holds up to {0} cells; the rest were left out.', MAX_CELLS));
  const cells = matrix(paths, devices.map((d) => d.id));
  await show(ctx, { v: 1, name: new URL(target.origin).host, target: target.origin, cells, sync: SYNC_ALL });
}

/** Una celda más con otra sesión, para ver la misma pantalla con otro usuario. */
async function addSessionCmd(): Promise<void> {
  const host = current;
  if (!host) return;
  const m = host.mosaic();
  if (m.cells.length === 0) {
    void vscode.window.showInformationMessage(t('Add a device first.'));
    return;
  }
  const used = new Set(m.cells.map((c) => c.session));
  const name = await vscode.window.showInputBox({
    title: t('Session name'),
    prompt: t('Each session has its own cookies and storage: sign in as another user there.'),
    placeHolder: 'admin',
    validateInput: (v) => (!isValidSession(v) ? t('Lowercase letters and digits only.') : used.has(v) ? t('That session is already open.') : undefined),
  });
  if (!name || host.isDisposed) return;
  const next = addSession(host.mosaic(), name);
  if (!next) {
    void vscode.window.showWarningMessage(t('A mosaic holds up to {0} cells; the rest were left out.', MAX_CELLS));
    return;
  }
  host.apply(next);
}

async function save(): Promise<void> {
  const f = folder();
  const host = current;
  if (!host) return;
  if (!f) {
    void vscode.window.showInformationMessage(t('Open a folder to save mosaics with your project.'));
    return;
  }
  const m = host.mosaic();
  if (m.cells.length === 0) {
    void vscode.window.showInformationMessage(t('Add a device first.'));
    return;
  }
  const name = await vscode.window.showInputBox({ title: t('Name for this mosaic'), value: m.name, validateInput: (v) => (v.trim() === '' ? t('Give it a name.') : undefined) });
  if (!name) return;
  // El fichero va a git: se guarda la ruta sin su consulta ni su ancla, que pueden llevar un testigo o un dato personal.
  const cells = m.cells.map((c) => ({ ...c, path: c.path.split(/[?#]/)[0] || '/' }));
  await saveMosaic(f, { ...m, cells, name: name.trim() });
  if (!host.isDisposed) host.apply({ ...host.mosaic(), name: name.trim() });
  void vscode.window.showInformationMessage(t('Saved to .vscode/viewkeeper.json'));
}

async function openSaved(ctx: vscode.ExtensionContext): Promise<void> {
  if (remote()) return;
  const f = folder();
  if (!f) {
    void vscode.window.showInformationMessage(t('Open a folder to save mosaics with your project.'));
    return;
  }
  const list = await loadMosaics(f);
  if (!list.length) {
    void vscode.window.showInformationMessage(t('No saved mosaics in this project yet.'));
    return;
  }
  const del: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: t('Delete') };
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { mosaic: Mosaic }>();
  qp.title = t('Saved mosaics');
  qp.items = list.map((m) => ({ label: m.name, description: `${m.cells.length} · ${m.target}`, mosaic: m, buttons: [del] }));
  qp.onDidTriggerItemButton(async (e) => {
    await deleteMosaic(f, e.item.mosaic.name);
    qp.items = qp.items.filter((i) => i !== e.item);
  });
  qp.onDidAccept(async () => {
    const m = qp.selectedItems[0]?.mosaic;
    qp.hide();
    if (!m) return;
    // El fichero viaja con el repositorio: un destino que no es esta máquina se pregunta antes de abrirlo.
    if (!isLoopback(m.target)) {
      const ok = await vscode.window.showWarningMessage(t('This mosaic points to {0}, not to this computer. Open it?', m.target), { modal: true }, t('Open'));
      if (!ok) return;
    }
    await show(ctx, m);
  });
  qp.onDidHide(() => qp.dispose());
  qp.show();
}

/** Diagnóstico: lo que el proxy ha visto y lo que no pudo hacer. No incluye cuerpos ni cookies. */
function doctor(): void {
  if (current) for (const line of current.diagnostics()) out.info(line);
  else out.info('no mosaic open');
  out.show(true);
}

export function registerCommands(ctx: vscode.ExtensionContext): void {
  out = vscode.window.createOutputChannel('ViewKeeper', { log: true });
  const wrap = (fn: () => Promise<void> | void) => async (): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      out.error(String((e as Error).stack ?? e));
      void vscode.window.showErrorMessage(t('ViewKeeper: {0}', (e as Error).message ?? String(e)));
    }
  };
  const reg = (id: string, fn: () => Promise<void> | void): void => void ctx.subscriptions.push(vscode.commands.registerCommand(id, wrap(fn)));
  reg('viewkeeper.open', () => openDefault(ctx));
  reg('viewkeeper.openMatrix', () => openMatrix(ctx));
  reg('viewkeeper.addSession', () => addSessionCmd());
  reg('viewkeeper.save', () => save());
  reg('viewkeeper.openSaved', () => openSaved(ctx));
  reg('viewkeeper.reload', () => current?.reload());
  reg('viewkeeper.capture', async () => {
    if (current) await captureMosaic(current, false, (l) => out.info(l));
  });
  reg('viewkeeper.captureFullPage', async () => {
    if (current) await captureMosaic(current, true, (l) => out.info(l));
  });
  reg('viewkeeper.doctor', doctor);
  ctx.subscriptions.push(out, { dispose: () => current?.dispose() });

  // Visible desde el primer arranque: sin esto, instalar la extensión no cambia nada en pantalla.
  const item = vscode.window.createStatusBarItem('viewkeeper.status', vscode.StatusBarAlignment.Right, 90);
  item.name = 'ViewKeeper';
  item.text = '$(multiple-windows) ViewKeeper';
  item.tooltip = t('Open your dev server in several devices at once');
  item.command = 'viewkeeper.open';
  item.show();
  ctx.subscriptions.push(item);
}

/** Solo para la sonda y las pruebas de integración: el mosaico abierto. */
export function currentHost(): PanelHost | undefined {
  return current;
}
