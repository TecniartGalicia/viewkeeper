// Casos de uso de la extensión. Cada comando envuelto en `wrap`: un fallo se enseña, no se traga.
import * as vscode from 'vscode';
import { DEVICES, parseCustomDevice, type Device } from '../core/devices.ts';
import { MAX_CELLS, SYNC_ALL, addSession, capCells, isLoopback, isValidSession, matrix, normalizeTarget, parseMosaic, type Mosaic } from '../core/mosaic.ts';
import { canReopenSilently, forMemory, prepareOpen, syncAfterAddressChange } from '../core/open.ts';
import { answers, resolveTarget } from '../core/probe.ts';
import { fillRoute, followTarget, frameworksIn, matchesRoute, routeForFile, type RouteKind } from '../core/routes.ts';
import { pageKey } from '../core/sync.ts';
import { projectRoutes } from './projectRoutes.ts';
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

type Target = { origin: string; path: string };

/** El último mosaico de este proyecto, tal como quedó. Vive en el almacén del área de trabajo, no en git. */
const LAST_KEY = 'viewkeeper.lastMosaic';

function remember(ctx: vscode.ExtensionContext, host: PanelHost): Thenable<void> | undefined {
  const m = forMemory(host.mosaic());
  return m ? ctx.workspaceState.update(LAST_KEY, m) : undefined;
}

function lastMosaic(ctx: vscode.ExtensionContext): Mosaic | undefined {
  return parseMosaic(ctx.workspaceState.get(LAST_KEY));
}

function followOn(): boolean {
  return vscode.workspace.getConfiguration('viewkeeper').get<boolean>('followEditor') === true;
}

/**
 * El mosaico sigue al editor: al abrir el fichero de una página, la fila va a su ruta. Solo con una fila
 * (en una matriz cada fila es una ruta fija) y solo a rutas sin segmentos dinámicos: sin un valor para
 * «[id]» no hay adónde ir, y si la fila ya enseña una página de esa ruta se queda donde está.
 */
/** El último fichero seguido y la última ruta mandada, por mosaico abierto. */
let followed: { host: PanelHost; uri: string; sent?: string } | undefined;

async function followEditor(ed: vscode.TextEditor | undefined, force = false): Promise<void> {
  const host = current;
  const base = folder();
  // Solo ficheros de la carpeta del mosaico (B-12).
  if (!host || !ed || !followOn() || !base || vscode.workspace.getWorkspaceFolder(ed.document.uri)?.uri.toString() !== base.uri.toString()) return;
  const uri = ed.document.uri.toString();
  // Volver al mismo fichero (el foco pasó por el panel y regresó) no es una orden nueva (B-2).
  if (!force && followed?.host === host && followed.uri === uri) return;
  followed = { host, uri, sent: followed?.host === host ? followed.sent : undefined };
  const rows = host.groups();
  const route = routeForFile(vscode.workspace.asRelativePath(ed.document.uri, false));
  if (!route || rows.length !== 1) return;
  // Una página solo lo es si su proyecto usa el framework que la sirve (B-3).
  let frameworks = new Set<RouteKind>(['html']);
  try {
    frameworks = frameworksIn(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(base.uri, route.root, 'package.json'))).toString('utf8'));
  } catch {
    /* sin package.json en esa carpeta: solo HTML */
  }
  if (current !== host) return;
  const now = host.pathOfGroup(rows[0]) ?? '/';
  const to = followTarget({ rows: rows.length, route, frameworks, now, last: followed.sent });
  if (route.dynamic && !matchesRoute(route.path, now)) out.info(`follow editor: ${route.path} needs a value, staying on ${now.split(/[?#]/)[0]}`);
  if (to === undefined) return;
  followed.sent = to;
  host.drive(rows[0], to);
}

/** Pide una dirección escrita a mano (también de producción): https://app.ejemplo.com/ruta, localhost:3000 o 3000. */
async function askAddress(title: string, value?: string): Promise<Target | undefined> {
  const raw = await vscode.window.showInputBox({
    title,
    prompt: t('Type a URL or a port. It can be a deployed site: https://example.com/path'),
    placeHolder: 'http://localhost:5173',
    value,
    validateInput: (v) => (normalizeTarget(v) ? undefined : t('Not a valid http(s) address.')),
  });
  return raw === undefined ? undefined : normalizeTarget(raw);
}

/**
 * Lo que se abre al pulsar el botón: los servidores encontrados y, siempre, la opción de escribir otra dirección.
 * Lo que se escribe en la lista, si es una dirección, aparece arriba para abrirla con Intro.
 */
async function pickTarget(): Promise<Target | undefined>;
async function pickTarget(reopen: Mosaic | undefined): Promise<Target | Mosaic | undefined>;
async function pickTarget(reopen?: Mosaic): Promise<Target | Mosaic | undefined> {
  const found = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: t('ViewKeeper: looking for your dev server…') }, () => findDevServers(folder()));
  if (found.length === 0 && !reopen) return askAddress(t('No dev server found'));
  type Item = vscode.QuickPickItem & { target?: Target; other?: true; mosaic?: Mosaic };
  const base: Item[] = [
    // Lo último que hubo abierto en este proyecto, con sus dispositivos y sus rutas.
    ...(reopen ? [{ label: t('Reopen {0}', reopen.name), description: `${reopen.cells.length} · ${reopen.target}`, mosaic: reopen }] : []),
    ...found.map((f) => ({ label: f.origin, description: f.framework, target: { origin: f.origin, path: '/' } })),
    { label: t('Another address…'), description: t('URL or port, also a deployed site'), other: true, alwaysShow: true },
  ];
  const qp = vscode.window.createQuickPick<Item>();
  qp.title = t('Open in ViewKeeper');
  qp.placeholder = t('Pick your dev server or type an address (https://example.com/path)');
  qp.items = base;
  qp.onDidChangeValue((v) => {
    const typed = normalizeTarget(v);
    if (!typed) return void (qp.items = base);
    // alwaysShow: si no, el filtro de la lista lo escondería al no coincidir con ninguna etiqueta. Arriba solo si
    // lo escrito ya parece una dirección (puerto, punto, dos puntos o barra); una palabra suelta («localhost»,
    // «intranet») va al final, para que escribir y pulsar Intro siga eligiendo el servidor que coincide.
    const it: Item = { label: typed.origin + typed.path, description: t('Open this address'), target: typed, alwaysShow: true };
    qp.items = /^\d{2,5}$|[.:/]/.test(v.trim()) ? [it, ...base] : [...base, it];
  });
  const chosen = await new Promise<Item | undefined>((resolve) => {
    qp.onDidAccept(() => {
      resolve(qp.selectedItems[0]);
      qp.hide();
    });
    qp.onDidHide(() => resolve(undefined));
    qp.show();
  });
  qp.dispose();
  if (!chosen) return undefined;
  if (chosen.other) return askAddress(t('Open in ViewKeeper'));
  return chosen.mosaic ?? chosen.target;
}

/** Abrir una dirección cualquiera, haya o no un mosaico abierto (lo sustituye, con sus dispositivos). */
async function openUrl(ctx: vscode.ExtensionContext): Promise<void> {
  const now = current?.mosaic();
  const rows = now ? [...new Set(now.cells.map((c) => c.group))].sort((a, b) => a - b) : [];
  // Una fila: se propone la dirección con la ruta que enseña. Una matriz: solo el origen (cada fila tiene la suya).
  const first = now?.cells.find((c) => c.group === rows[0]);
  const target = await askAddress(t('Open in ViewKeeper'), now ? now.target + (rows.length === 1 && first ? first.path : '') : undefined);
  if (!target) return;
  const path = matrix([target.path], ['x'])[0].path;
  // Mismos dispositivos, giros y sesiones que el mosaico abierto. En una matriz, si se escribe solo el origen,
  // cada fila conserva su ruta; con una ruta escrita, todas las filas van a ella.
  const keepRows = rows.length > 1 && path === '/';
  const cells = now && now.cells.length > 0 ? now.cells.map((c) => (keepRows ? c : { ...c, path })) : matrix([target.path], defaultDevices());
  // De una web publicada (clics y escritura apagados por seguridad) a un servidor de desarrollo: vuelven encendidos.
  const sync = syncAfterAddressChange(now, target.origin);
  await show(ctx, { v: 1, name: new URL(target.origin).host, target: target.origin, cells, sync });
}

/**
 * En una ventana remota (WSL, SSH, contenedor) la extensión, el proxy y el servidor de desarrollo corren en la
 * otra máquina, y las celdas se pintan en esta. VS Code trae el puerto del proxy a un puerto local: las celdas
 * entran por él. Si lo que devuelve no es un puerto de esta máquina (VS Code en el navegador: sale por otro
 * dominio), no hay «*.localhost» que valga y se dice.
 */
async function expose(port: number): Promise<number | undefined> {
  if (!vscode.env.remoteName) return port;
  const ext = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${port}`));
  const m = /^(?:localhost|127\.0\.0\.1)(?::(\d+))?$/.exec(ext.authority);
  if (ext.scheme !== 'http' || !m) return undefined;
  out.info(`remote window (${vscode.env.remoteName}): proxy port ${port} forwarded to local port ${m[1] ?? '80'}`);
  return Number(m[1] ?? 80);
}

const warned = new Set<string>();

/**
 * Abre el mosaico. `fresh` es una apertura pedida por el usuario (no un volver a abrir el mismo tras un ajuste):
 * ahí se sigue la redirección al dominio principal y, si es una web publicada, los clics y la escritura nacen apagados.
 */
async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic, fresh = true): Promise<void> {
  const capped = capCells(mosaic.cells);
  if (capped.dropped > 0) void vscode.window.showWarningMessage(t('A mosaic holds up to {0} cells; the rest were left out.', MAX_CELLS));
  let next: Mosaic = { ...mosaic, cells: capped.cells };
  if (fresh) {
    const p = await prepareOpen(next, resolveTarget);
    next = p.mosaic;
    if (p.redirectedFrom) out.info(`${p.redirectedFrom} redirects to ${next.target}: opening that one`);
    if (p.deployed && !warned.has(next.target)) {
      warned.add(next.target);
      void vscode.window.showInformationMessage(t('{0} is a deployed site, so click and typing sync start switched off: otherwise every click and keystroke would be repeated once per device on real data. You can switch them on in the toolbar.', new URL(next.target).host));
    }
  }
  if (current) current.dispose();
  const cfg = vscode.workspace.getConfiguration('viewkeeper');
  // La lista puede venir escrita en los ajustes del repositorio: cada origen se comprueba antes de usarlo (N-6).
  // De esta máquina o, por https, de fuera. El proxy vuelve a filtrarla (parseApis); aquí se comprueba CORS.
  const declared = (cfg.get<string[]>('apiOrigins') ?? []).filter((o) => typeof o === 'string' && (isLoopback(o) || /^https:\/\//i.test(o))).slice(0, 8);
  const trusted = (await Promise.all(declared.map(async (o) => ((await apiTrustsApp(o, next.target)) ? o : undefined)))).filter((o): o is string => o !== undefined);
  for (const o of declared) if (!trusted.includes(o)) out.warn(`apiOrigins: ${o} does not allow ${next.target} by CORS; not routed through the proxy`);
  current = await PanelHost.open(ctx, next, {
    customDevices: customDevices(),
    log: (l) => out.info(l),
    proxy: { relaxCsp: cfg.get<boolean>('relaxCsp') !== false, fixCookies: cfg.get<boolean>('fixCookies') !== false, apiOrigins: trusted },
    onHint: (origin) => void offerApi(ctx, origin),
    routes: () => projectRoutes(folder()),
    follow: followOn,
    expose,
  });
  const host = current;
  // Se recuerda cómo queda: al abrirlo, cada vez que cambia de forma y, con un respiro, cuando una celda navega.
  remember(ctx, host);
  let moving: ReturnType<typeof setTimeout> | undefined;
  host.onDidChange(() => remember(ctx, host));
  host.onDidMove(() => {
    clearTimeout(moving);
    moving = setTimeout(() => remember(ctx, host), 1000);
    // La fila llegó a lo que le mandó «seguir al editor»: ya no va de camino, y lo que haga después el usuario manda.
    const sent = followed?.host === host ? followed.sent : undefined;
    const row = host.groups()[0];
    if (sent !== undefined && row !== undefined && pageKey(host.pathOfGroup(row) ?? '') === pageKey(sent) && followed) followed.sent = undefined;
  });
  out.info(`mosaic open: ${next.target}, ${next.cells.length} cells, proxy on port ${host.proxy.port}`);
  host.panel.onDidDispose(() => {
    clearTimeout(moving);
    void remember(ctx, host);
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
  // Cada origen se mira una vez, y como mucho doce por sesión: el aviso viene de la página.
  if (offered.has(origin) || offered.size >= 12 || !current) return;
  if (!isLoopback(origin) && !origin.startsWith('https://')) return;
  offered.add(origin);
  // El aviso viene de la página, y una página puede fabricarlo: solo se ofrece si la API ya se fía de esta app.
  if (!(await apiTrustsApp(origin, current.mosaic().target))) {
    out.info(`the page called ${origin} and failed; not offering to route it because it does not allow ${current.mosaic().target} by CORS`);
    return;
  }
  const yes = t('Yes');
  const where = folder() ? t('this workspace') : t('your user settings');
  const ask = t('Your app calls {0} and the browser is blocking it inside the mosaic. Route it through ViewKeeper? It will be saved in "viewkeeper.apiOrigins" of {1}.', origin, where);
  // De fuera de esta máquina: se dice qué viaja.
  const far = isLoopback(origin) ? '' : ' ' + t('It is on another server: those calls will go out from this computer with the origin of your app, with the cookies that server sets and the ones your app set for its domain.');
  const pick = await vscode.window.showInformationMessage(ask + far, yes, t('No'));
  if (pick !== yes || !current) return;
  const cfg = vscode.workspace.getConfiguration('viewkeeper');
  const list = [...new Set([...(cfg.get<string[]>('apiOrigins') ?? []), origin])];
  await cfg.update('apiOrigins', list, folder() ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);
  await show(ctx, current.mosaic(), false);
}

async function openDefault(ctx: vscode.ExtensionContext): Promise<void> {
  // Con un mosaico abierto, el botón de la barra de estado lo trae al frente en vez de abrir otro.
  if (current) {
    current.panel.reveal();
    return;
  }
  // Lo último que tenías en este proyecto, si su servidor de desarrollo sigue en marcha: se reabre sin preguntar.
  // Una web publicada, o un servidor que ya no contesta, se ofrece en la lista en vez de abrirse sola.
  const last = lastMosaic(ctx);
  if (last && canReopenSilently(last) && (await answers(last.target))) return show(ctx, last);
  const picked = await pickTarget(last);
  if (!picked) return;
  if ('cells' in picked) return show(ctx, picked);
  await show(ctx, { v: 1, name: new URL(picked.origin).host, target: picked.origin, cells: matrix([picked.path], defaultDevices()), sync: SYNC_ALL });
}

/** Elegir rutas del proyecto y dispositivos, y abrir la matriz: una fila por ruta, una columna por dispositivo. */
async function openMatrix(ctx: vscode.ExtensionContext): Promise<void> {
  const target = current ? { origin: current.mosaic().target, path: '/' } : await pickTarget();
  if (!target) return;
  const routes = await projectRoutes(folder());
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
  reg('viewkeeper.openUrl', () => openUrl(ctx));
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
  reg('viewkeeper.toggleFollowEditor', async () => {
    const cfg = vscode.workspace.getConfiguration('viewkeeper');
    const where = cfg.inspect<boolean>('followEditor');
    const scope = where?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder : where?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await cfg.update('followEditor', !followOn(), scope);
    // Recién encendido: el fichero que ya está abierto cuenta, aunque sea el último que se siguió.
    if (followOn()) await followEditor(vscode.window.activeTextEditor, true);
  });
  let following: ReturnType<typeof setTimeout> | undefined;
  ctx.subscriptions.push(
    // Con un respiro: al pasar por varias pestañas seguidas solo cuenta en la que te quedas.
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      clearTimeout(following);
      following = setTimeout(() => void followEditor(ed), 250);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('viewkeeper.followEditor')) current?.refresh();
    }),
    { dispose: () => clearTimeout(following) },
  );
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
