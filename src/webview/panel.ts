// Panel del mosaico. Corre en el webview: pinta la rejilla de iframes, la barra de herramientas,
// y hace de centralita entre agentes.
// Lo que se escribe en una celda (contraseñas incluidas) se reparte aquí, en memoria, y NUNCA se manda
// al host de la extensión: hacia allí solo salen ruta, métricas numéricas, ediciones y avisos sin contenido.
import { rowScales } from '../core/devices.ts';

/** Separación entre celdas y ancho mínimo de una celda (su rótulo tiene que caber): los mismos que en el CSS. */
const GAP = 14;
const MIN_CELL = 230;
import { MAX_CELLS, type Cell, type Edit, type SyncOptions } from '../core/mosaic.ts';
import { REARM_MS, SyncRouter, pathOf, type AgentCommand, type AgentEvent } from '../core/sync.ts';

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };

export interface CellView extends Cell {
  label: string;
  width: number;
  height: number;
  /** URL de entrada (deja la cookie y redirige a la ruta). */
  entry: string;
  /** Origen del proxy para la sesión de la celda. */
  origin: string;
  cfg: { ua?: string; touch?: boolean; lang?: string; fixCookies?: boolean };
}
export interface PanelText {
  tripped: string;
  address: string;
  addDevice: string;
  sync: string;
  scroll: string;
  click: string;
  input: string;
  nav: string;
  reload: string;
  capture: string;
  save: string;
  session: string;
  matrix: string;
  rotate: string;
  remove: string;
  empty: string;
  session1: string;
  deployed: string;
  deployedHint: string;
  route: string;
  addToRow: string;
  zoom: string;
  follow: string;
  errors: string;
  left: string;
}
export interface PanelState {
  name: string;
  cells: CellView[];
  sync: SyncOptions;
  devices: { id: string; name: string; width: number; height: number }[];
  /** Solo en la sonda: reenvía al host todo lo que dicen los agentes. El producto no lo activa nunca. */
  sonda: boolean;
  text: PanelText;
  /** El destino no es un servidor de desarrollo: se avisa en la barra. */
  deployed?: boolean;
  /** El mosaico sigue al editor: abrir el fichero de una página lleva la fila a su ruta. */
  follow?: boolean;
}

const vscode = acquireVsCodeApi();
const barEl = document.getElementById('barra') as HTMLDivElement;
const rootEl = document.getElementById('mosaico') as HTMLDivElement;

interface Live {
  view: CellView;
  fig: HTMLElement;
  frame: HTMLIFrameElement;
  /** Lo que, si cambia, obliga a volver a cargar la celda (otra sesión, otro agente de usuario…). */
  key: string;
  /** Errores de JavaScript del documento que la celda enseña ahora. El texto no sale de este panel. */
  errors: { kind: string; msg: string }[];
  errorCount: number;
  errorsOpen: boolean;
  /** Saludó el agente del documento que está cargando. */
  greeted: boolean;
  /** El documento que enseña cargó sin agente. */
  agentless: boolean;
}
const MAX_ERRORS_KEPT = 20;
/** Celda ampliada a todo el panel (las demás siguen vivas y sincronizadas, sin verse). No es parte del mosaico. */
let zoomed: string | undefined;
const live = new Map<string, Live>();
let state: PanelState | undefined;
const router = new SyncRouter([], { scroll: true, click: true, input: true, nav: true });
router.onTrip = (group) => {
  const row = rootEl.querySelector(`.fila[data-g="${group}"]`);
  if (row && !row.querySelector('.aviso') && state) {
    const p = document.createElement('p');
    p.className = 'aviso';
    p.textContent = state.text.tripped;
    row.prepend(p);
    // La fila vuelve a sincronizar sola pasado REARM_MS; el aviso se va con ella.
    setTimeout(() => p.remove(), REARM_MS);
  }
  vscode.postMessage({ t: 'trip', group });
};

// ───────────────────────── iconos propios (SVG en línea, sin fuentes de iconos)

const ICONS: Record<string, string> = {
  plus: '<path d="M8 3v10M3 8h10"/>',
  reload: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v3h-3"/>',
  camera: '<rect x="2" y="4.5" width="12" height="8.5" rx="1.5"/><circle cx="8" cy="8.7" r="2.3"/><path d="M5.5 4.5 6.5 3h3l1 1.5"/>',
  save: '<path d="M3 2.5h8l2 2v9H3z"/><path d="M5 2.5v3.5h5V2.5M5 13.5V9.5h6v4"/>',
  user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/>',
  grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".8"/><rect x="9" y="2.5" width="4.5" height="4.5" rx=".8"/><rect x="2.5" y="9" width="4.5" height="4.5" rx=".8"/><rect x="9" y="9" width="4.5" height="4.5" rx=".8"/>',
  rotate: '<path d="M2.8 7.2A5.2 5.2 0 0 1 12 4.3"/><path d="M12.4 1.8v2.8H9.6"/><path d="M13.2 8.8A5.2 5.2 0 0 1 4 11.7"/><path d="M3.6 14.2v-2.8h2.8"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  chevron: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  expand: '<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/>',
  file: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
  globe: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11"/><path d="M8 2.5c1.6 1.6 2.3 3.5 2.3 5.5S9.6 11.9 8 13.5C6.4 11.9 5.7 10 5.7 8S6.4 4.1 8 2.5z"/>',
};
function icon(name: string): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] ?? ''; // texto fijo de este fichero, nunca datos de la página
  return s;
}
function button(label: string, iconName: string | undefined, onClick: () => void, opts: { iconOnly?: boolean; pressed?: boolean } = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (iconName) b.append(icon(iconName));
  if (opts.iconOnly) {
    b.className = 'ico';
    b.title = label;
    b.setAttribute('aria-label', label);
  } else b.append(document.createTextNode(label));
  if (opts.pressed !== undefined) b.setAttribute('aria-pressed', String(opts.pressed));
  b.addEventListener('click', onClick);
  return b;
}
const edit = (e: Edit): void => vscode.postMessage({ t: 'edit', edit: e });
/** Clave estable de un control, para devolverle el foco cuando la barra o el rótulo se vuelven a pintar. */
function withKey<T extends HTMLElement>(el: T, k: string): T {
  el.dataset.k = k;
  return el;
}
const command = (c: string): void => vscode.postMessage({ t: 'command', command: c });

const pick = (cell?: string, group?: number): void => vscode.postMessage({ t: 'pick', cell, group });

function deviceButton(c: CellView): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'disp';
  b.dataset.k = `${c.id}:dev`;
  b.title = `${c.label} · ${c.width}×${c.height}`;
  b.append(document.createTextNode(c.label), icon('chevron'));
  b.addEventListener('click', () => pick(c.id));
  return b;
}

// ───────────────────────── barra de herramientas

function renderBar(s: PanelState): void {
  barEl.textContent = '';
  const add = button(s.text.addDevice, 'plus', () => pick());
  add.dataset.k = 'bar:add';
  const label = document.createElement('span');
  label.className = 'etq';
  label.textContent = s.text.sync;
  const toggles = (['scroll', 'click', 'input', 'nav'] as const).map((k) => {
    const b = button(s.text[k], undefined, () => edit({ op: 'sync', key: k, value: !s.sync[k] }), { pressed: s.sync[k] });
    b.dataset.k = `bar:${k}`;
    return b;
  });
  const sep = (): HTMLElement => Object.assign(document.createElement('span'), { className: 'sep' });
  barEl.append(
    withKey(button(s.text.address, 'globe', () => command('openUrl')), 'bar:openUrl'),
    add,
    sep(),
    label,
    ...toggles,
    sep(),
    withKey(button(s.text.reload, 'reload', () => command('reload')), 'bar:reload'),
    withKey(button(s.text.capture, 'camera', () => command('capture')), 'bar:capture'),
    withKey(button(s.text.save, 'save', () => command('save')), 'bar:save'),
    withKey(button(s.text.session, 'user', () => command('addSession')), 'bar:addSession'),
    withKey(button(s.text.matrix, 'grid', () => command('openMatrix')), 'bar:openMatrix'),
    withKey(button(s.text.follow, 'file', () => command('toggleFollowEditor'), { pressed: s.follow === true }), 'bar:follow'),
  );
  if (s.deployed) {
    const live = document.createElement('span');
    live.className = 'vivo';
    live.textContent = s.text.deployed;
    live.title = s.text.deployedHint;
    barEl.append(live);
  }
}

// ───────────────────────── celdas

function toCell(id: string, cmd: AgentCommand): void {
  const l = live.get(id);
  // Siempre con el origen de la celda como destino: si el iframe ya no enseña la app, el mensaje no se entrega.
  if (l?.frame.contentWindow) l.frame.contentWindow.postMessage({ vk: 1, ...cmd }, l.view.origin);
}

function cellKey(c: CellView): string {
  return JSON.stringify([c.origin, c.cfg, c.deviceId]);
}

function caption(c: CellView, fig: HTMLElement): void {
  const s = state as PanelState;
  const cap = document.createElement('figcaption');
  const sel = deviceButton(c);
  const dim = document.createElement('span');
  dim.className = 'dim';
  dim.textContent = `${c.width}×${c.height}`;
  const pct = document.createElement('span');
  pct.className = 'dim pct';
  // La ruta es un botón: lleva toda la fila a otra página (el host pregunta cuál).
  const where = document.createElement('button');
  where.type = 'button';
  where.className = 'ruta';
  where.dataset.k = `${c.id}:ruta`;
  where.title = s.text.route;
  where.textContent = live.get(c.id)?.fig.querySelector('.ruta')?.textContent ?? c.path;
  where.addEventListener('click', () => vscode.postMessage({ t: 'route', cell: c.id }));
  cap.append(sel, dim, pct);
  if (c.session !== 'main') {
    const ses = document.createElement('span');
    ses.className = 'ses';
    ses.textContent = `${s.text.session1}: ${c.session}`;
    cap.append(ses);
  }
  // Girar y quitar, juntos y a la derecha.
  const acc = document.createElement('span');
  acc.className = 'acc';
  acc.append(
    withKey(button(s.text.zoom, 'expand', () => toggleZoom(c.id), { iconOnly: true, pressed: zoomed === c.id }), `${c.id}:zoom`),
    withKey(button(s.text.rotate, 'rotate', () => edit({ op: 'rotate', cell: c.id }), { iconOnly: true }), `${c.id}:rot`),
    withKey(button(s.text.remove, 'close', () => edit({ op: 'remove', cell: c.id }), { iconOnly: true }), `${c.id}:del`),
  );
  cap.append(where, errorBadge(c.id), acc);
  fig.querySelector('figcaption')?.remove();
  fig.prepend(cap);
  paintErrors(c.id);
}

// ───────────────────────── errores de la página, por celda

/** El contador del rótulo. Oculto mientras no haya errores; al pulsarlo se despliega la lista. */
function errorBadge(id: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'err';
  b.dataset.k = `${id}:err`;
  b.hidden = true;
  b.addEventListener('click', () => {
    const l = live.get(id);
    if (!l) return;
    l.errorsOpen = !l.errorsOpen;
    paintErrors(id);
  });
  return b;
}

function paintErrors(id: string): void {
  const l = live.get(id);
  if (!l || !state) return;
  const b = l.fig.querySelector<HTMLButtonElement>('button.err');
  if (b) {
    b.hidden = l.errorCount === 0;
    // El agente deja de contar en 50 (una página en bucle de errores): se dice que hay más.
    b.textContent = l.errorCount >= 50 ? '50+' : String(l.errorCount);
    b.title = `${l.errorCount} ${state.text.errors}`;
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-expanded', String(l.errorsOpen));
  }
  l.fig.querySelector('.errs')?.remove();
  if (!l.errorsOpen || l.errorCount === 0) return;
  const list = document.createElement('ul');
  list.className = 'errs';
  for (const e of l.errors) {
    const li = document.createElement('li');
    li.textContent = e.msg; // texto de la página: siempre como texto, nunca como HTML
    li.dataset.kind = e.kind;
    list.append(li);
  }
  l.fig.querySelector('figcaption')?.after(list);
}

function toggleZoom(id: string): void {
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.k;
  zoomed = zoomed === id ? undefined : id;
  if (state) for (const c of state.cells) if (live.has(c.id)) caption(c, (live.get(c.id) as Live).fig);
  layout();
  if (focused) document.querySelector<HTMLElement>(`[data-k="${CSS.escape(focused)}"]`)?.focus();
}

function newCell(c: CellView): Live {
  const fig = document.createElement('figure');
  fig.dataset.id = c.id;
  const stage = document.createElement('div');
  stage.className = 'escena';
  const f = document.createElement('iframe');
  // El nombre lleva la configuración de la celda: el agente la lee de forma síncrona al arrancar.
  f.name = 'vk:' + JSON.stringify(c.cfg);
  f.title = c.label;
  // Sin allow-top-navigation: una app con código anti-iframe no puede llevarse el panel por delante.
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads');
  stage.append(f);
  fig.append(stage);
  const l: Live = { view: c, fig, frame: f, key: cellKey(c), errors: [], errorCount: 0, errorsOpen: false, greeted: false, agentless: false };
  // El agente saluda antes de que el documento termine de cargar. Un documento que carga sin saludar (una ruta que
  // contesta JSON o texto, un error del servidor sin HTML) no tiene agente: las órdenes no le llegarían (B-10).
  f.addEventListener('load', () => {
    l.agentless = !l.greeted;
    l.greeted = false;
  });
  return l;
}

function layout(): void {
  if (!state) return;
  const rows = new Map<number, CellView[]>();
  for (const c of state.cells) rows.set(c.group, [...(rows.get(c.group) ?? []), c]);
  const top = barEl.getBoundingClientRect().height;
  // Alto de cada fila: el de la ventana repartido entre filas, menos el rótulo de las celdas.
  const availH = Math.max(160, (window.innerHeight - top - 24) / Math.max(1, rows.size) - 56);
  // Con varias filas cada una lleva al final su botón «+»: se le reserva sitio.
  const availW = Math.max(200, rootEl.clientWidth - 26 - (rows.size > 1 ? 42 : 0));
  if (zoomed && !state.cells.some((c) => c.id === zoomed)) zoomed = undefined;
  rootEl.classList.toggle('ampliado', zoomed !== undefined);
  for (const c of state.cells) live.get(c.id)?.fig.classList.toggle('oculta', zoomed !== undefined && c.id !== zoomed);
  if (zoomed) {
    const c = state.cells.find((x) => x.id === zoomed) as CellView;
    const l = live.get(c.id);
    if (l) {
      const s = rowScales([c], Math.max(200, rootEl.clientWidth - 26), Math.max(160, window.innerHeight - top - 24 - 56), GAP, MIN_CELL)[0];
      size(l, c, s);
    }
    for (const row of rows.values()) {
      const scales = rowScales(row, availW, availH, GAP, MIN_CELL);
      row.forEach((o, i) => {
        const lo = live.get(o.id);
        if (lo && o.id !== zoomed && !lo.frame.getAttribute('width')) size(lo, o, scales[i]);
      });
    }
    return;
  }
  for (const row of rows.values()) {
    const scales = rowScales(row, availW, availH, GAP, MIN_CELL);
    row.forEach((c, i) => {
      const l = live.get(c.id);
      if (l) size(l, c, scales[i]);
    });
  }
}

/** Pone una celda a una escala. El iframe conserva siempre el tamaño del dispositivo: la página no se entera. */
function size(l: Live, c: CellView, s: number): void {
  const stage = l.frame.parentElement as HTMLElement;
  l.frame.width = String(c.width);
  l.frame.height = String(c.height);
  l.frame.style.transform = `scale(${s})`;
  stage.style.width = `${Math.round(c.width * s)}px`;
  stage.style.height = `${Math.round(c.height * s)}px`;
  // En una celda estrecha el rótulo se compacta (sin medidas) para no partirse en dos líneas.
  l.fig.classList.toggle('estrecha', c.width * s < 320);
  l.fig.style.width = `${Math.max(MIN_CELL, Math.round(c.width * s))}px`;
  const pct = l.fig.querySelector('.pct');
  if (pct) pct.textContent = `${Math.round(s * 100)} %`;
}

/**
 * Pinta el estado nuevo tocando lo mínimo: sacar un iframe del documento lo recarga, así que las celdas
 * que siguen se dejan donde están y solo se añaden, quitan o redimensionan las que cambian.
 */
function render(next: PanelState): void {
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.k;
  state = next;
  router.update(next.cells, next.sync);
  renderBar(next);
  for (const [id, l] of live) {
    if (next.cells.some((c) => c.id === id)) continue;
    l.fig.remove();
    live.delete(id);
  }
  rootEl.querySelector('.vacio')?.remove();
  if (next.cells.length === 0) {
    rootEl.textContent = '';
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = next.text.empty;
    rootEl.append(p);
    return;
  }
  const loads: [HTMLIFrameElement, string][] = [];
  const groups = [...new Set(next.cells.map((c) => c.group))].sort((a, b) => a - b);
  for (const g of groups) {
    let row = rootEl.querySelector<HTMLElement>(`.fila[data-g="${g}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'fila';
      row.dataset.g = String(g);
      const after = Array.from(rootEl.querySelectorAll<HTMLElement>('.fila')).find((r) => Number(r.dataset.g) > g);
      rootEl.insertBefore(row, after ?? null);
    }
    for (const c of next.cells.filter((x) => x.group === g)) {
      let l = live.get(c.id);
      if (!l || cellKey(c) !== l.key) {
        // Otro dispositivo u otra sesión: la página tiene que arrancar de nuevo, en el mismo sitio de la fila.
        const nl = newCell(c);
        if (l) {
          l.fig.replaceWith(nl.fig);
          if (l.errorCount > 0) vscode.postMessage({ t: 'errors', cell: c.id, n: 0 });
        } else row.append(nl.fig);
        live.set(c.id, nl);
        loads.push([nl.frame, c.entry]);
        l = nl;
      }
      l.view = c;
      caption(c, l.fig);
    }
    // En una matriz, «Añadir dispositivo» de la barra no sabe de qué fila hablas: cada fila tiene el suyo, al final.
    let more = row.querySelector<HTMLButtonElement>(':scope > .mas');
    if (groups.length > 1 && next.cells.length < MAX_CELLS) {
      if (!more) {
        more = withKey(button(next.text.addToRow, 'plus', () => pick(undefined, g), { iconOnly: true }), `fila${g}:add`);
        more.classList.add('mas');
      }
      row.append(more); // siempre el último, también tras añadir una celda
    } else more?.remove();
  }
  for (const r of Array.from(rootEl.querySelectorAll<HTMLElement>('.fila'))) if (!r.querySelector('figure')) r.remove();
  layout();
  // La dirección se pone con el iframe ya colocado y medido: la página nunca ve un ancho de 0 al arrancar.
  for (const [f, src] of loads) f.src = src;
  if (focused) document.querySelector<HTMLElement>(`[data-k="${CSS.escape(focused)}"]`)?.focus();
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Vuelve a entrar en la celda por su dirección de entrada (la que da el host), con otra ruta. */
function reenter(l: Live, path: string): void {
  try {
    const u = new URL(l.view.entry);
    u.searchParams.set('to', path); // el proxy la vuelve a validar (safeLocalPath)
    l.agentless = false;
    l.frame.src = u.href;
  } catch {
    /* entrada ilegible: nada */
  }
}

window.addEventListener('message', (ev: MessageEvent) => {
  // 1) ¿Viene de una celda? Se exige ventana Y origen: una página no puede hacerse pasar por otra.
  for (const [id, l] of live) {
    if (ev.source !== l.frame.contentWindow) continue;
    const m = ev.data as (AgentEvent & { vk?: number }) | undefined;
    if (ev.origin !== l.view.origin || !m || m.vk !== 1 || typeof m.t !== 'string') return;
    if (m.t === 'hello') {
      l.greeted = true;
      l.agentless = false;
    }
    for (const d of router.route(id, m)) toCell(d.to, d.cmd);
    if (m.t === 'hello' && (l.errorCount > 0 || l.errorsOpen)) {
      l.errors = [];
      l.errorCount = 0;
      l.errorsOpen = false;
      paintErrors(id);
      vscode.postMessage({ t: 'errors', cell: id, n: 0 });
    }
    if (m.t === 'error') {
      if (typeof m.msg !== 'string' || typeof m.kind !== 'string') return;
      l.errorCount++;
      if (l.errors.length < MAX_ERRORS_KEPT) l.errors.push({ kind: m.kind.slice(0, 12), msg: m.msg.slice(0, 300) });
      paintErrors(id);
      // Al host, solo el número: el mensaje de un error puede llevar datos de la página.
      vscode.postMessage({ t: 'errors', cell: id, n: l.errorCount });
      if (state?.sonda) vscode.postMessage({ t: 'fromCell', cell: id, ev: m });
      return;
    }
    if (m.t === 'left') {
      // La página quiso irse a otra web: no cabe en la celda (se quedaría en blanco). Se dice un momento en su rótulo.
      if (typeof m.origin !== 'string' || !state) return;
      let host = '';
      try {
        host = new URL(m.origin).host;
      } catch {
        return;
      }
      l.fig.querySelector('.fuera')?.remove();
      const p = document.createElement('p');
      p.className = 'fuera';
      p.textContent = `${state.text.left}: ${host}`;
      l.fig.querySelector('figcaption')?.after(p);
      setTimeout(() => p.remove(), 6000);
      vscode.postMessage({ t: 'left', cell: id, origin: m.origin.slice(0, 80) });
      return;
    }
    if (m.t === 'hello' || m.t === 'ready' || m.t === 'nav') {
      if (typeof m.url !== 'string') return;
      const cap = l.fig.querySelector('.ruta');
      if (cap) cap.textContent = pathOf(m.url);
      vscode.postMessage({ t: 'where', cell: id, path: pathOf(m.url) });
    } else if (m.t === 'answer' && isNum(m.id)) {
      // Hacia el host solo pasan números: nunca un texto que la página haya podido colar en la respuesta.
      const d = (m.data ?? {}) as Record<string, unknown>;
      const data = { width: isNum(d.width) ? d.width : 0, height: isNum(d.height) ? d.height : 0, pageHeight: isNum(d.pageHeight) ? d.pageHeight : 0, scrollY: isNum(d.scrollY) ? d.scrollY : 0 };
      if (!state?.sonda) vscode.postMessage({ t: 'answer', cell: id, id: m.id, data });
    } else if (m.t === 'hint' && m.kind === 'api' && typeof m.origin === 'string') {
      vscode.postMessage({ t: 'hint', origin: m.origin.slice(0, 80) });
    } else if (m.t === 'miss') {
      vscode.postMessage({ t: 'miss', cell: id });
    }
    if (state?.sonda) vscode.postMessage({ t: 'fromCell', cell: id, ev: m });
    return;
  }
  // 2) Si no, solo se atiende al host de la extensión, que llega con el origen del propio webview.
  if (ev.origin !== window.origin) return;
  const m = ev.data as { t?: string; state?: PanelState; cell?: string; cmd?: AgentCommand; group?: number; path?: string } | undefined;
  if (!m) return;
  if (m.t === 'state' && m.state) render(m.state);
  else if (m.t === 'toCell' && m.cell && m.cmd) toCell(m.cell, m.cmd);
  else if (m.t === 'drive' && typeof m.group === 'number' && typeof m.path === 'string' && m.path.startsWith('/')) {
    // El usuario manda la fila a otra página (desde el rótulo o desde el editor): pasa por el reparto, que
    // apunta la orden en cada celda para que su llegada no rebote.
    for (const d of router.drive(m.group, m.path)) toCell(d.to, d.cmd);
    // Una celda sin agente no recibe la orden: se le vuelve a poner la dirección de entrada, con la ruta nueva.
    for (const l of live.values()) if (l.view.group === m.group && l.agentless) reenter(l, m.path);
  }
  else if (m.t === 'reload') {
    // Recargar rearma el cortacircuitos y retira su aviso (N-2).
    router.rearm();
    for (const a of Array.from(rootEl.querySelectorAll('.aviso'))) a.remove();
    for (const [id, l] of live) {
      if (l.agentless) reenter(l, router.currentPath(id) ?? l.view.path);
      else toCell(id, { t: 'reload' });
    }
  }
});

new ResizeObserver(layout).observe(rootEl);
// El observador solo ve el ancho del mosaico; si la ventana crece solo en alto, las celdas también deben crecer.
window.addEventListener('resize', layout);
// Esc deshace la ampliación (el foco está en el panel; dentro de una celda, la tecla es de la página).
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && zoomed) toggleZoom(zoomed);
});
// Navegaciones en espera (GRACE_MS): las celdas que no llegaron solas reciben la orden.
setInterval(() => {
  for (const d of router.due()) toCell(d.to, d.cmd);
}, 250);
vscode.postMessage({ t: 'panelReady', origin: window.origin });
