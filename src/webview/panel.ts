// Panel del mosaico. Corre en el webview: pinta la rejilla de iframes, la barra de herramientas,
// y hace de centralita entre agentes.
// Lo que se escribe en una celda (contraseñas incluidas) se reparte aquí, en memoria, y NUNCA se manda
// al host de la extensión: hacia allí solo salen ruta, métricas numéricas, ediciones y avisos sin contenido.
import { rowScales } from '../core/devices.ts';

/** Separación entre celdas y ancho mínimo de una celda (su rótulo tiene que caber): los mismos que en el CSS. */
const GAP = 14;
const MIN_CELL = 230;
import type { Cell, Edit, SyncOptions } from '../core/mosaic.ts';
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
}
export interface PanelState {
  name: string;
  cells: CellView[];
  sync: SyncOptions;
  devices: { id: string; name: string; width: number; height: number }[];
  /** Solo en la sonda: reenvía al host todo lo que dicen los agentes. El producto no lo activa nunca. */
  sonda: boolean;
  text: PanelText;
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
}
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
const command = (c: string): void => vscode.postMessage({ t: 'command', command: c });

function deviceSelect(current: string | undefined, placeholder: string | undefined, onPick: (id: string) => void): HTMLSelectElement {
  const sel = document.createElement('select');
  if (placeholder) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = placeholder;
    sel.append(o);
  }
  for (const d of state?.devices ?? []) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = placeholder ? `${d.name} · ${d.width}×${d.height}` : d.name;
    if (d.id === current) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => {
    if (sel.value) onPick(sel.value);
    if (placeholder) sel.value = '';
  });
  return sel;
}

// ───────────────────────── barra de herramientas

function renderBar(s: PanelState): void {
  barEl.textContent = '';
  const add = deviceSelect(undefined, s.text.addDevice, (id) => edit({ op: 'add', deviceId: id }));
  add.title = s.text.addDevice;
  const label = document.createElement('span');
  label.className = 'etq';
  label.textContent = s.text.sync;
  const toggles = (['scroll', 'click', 'input', 'nav'] as const).map((k) => button(s.text[k], undefined, () => edit({ op: 'sync', key: k, value: !s.sync[k] }), { pressed: s.sync[k] }));
  const sep = (): HTMLElement => Object.assign(document.createElement('span'), { className: 'sep' });
  barEl.append(
    add,
    sep(),
    label,
    ...toggles,
    sep(),
    button(s.text.reload, 'reload', () => command('reload')),
    button(s.text.capture, 'camera', () => command('capture')),
    button(s.text.save, 'save', () => command('save')),
    button(s.text.session, 'user', () => command('addSession')),
    button(s.text.matrix, 'grid', () => command('openMatrix')),
  );
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
  const sel = deviceSelect(c.deviceId, undefined, (id) => edit({ op: 'device', cell: c.id, deviceId: id }));
  sel.title = `${c.label} · ${c.width}×${c.height}`;
  const dim = document.createElement('span');
  dim.className = 'dim';
  dim.textContent = `${c.width}×${c.height}`;
  const pct = document.createElement('span');
  pct.className = 'dim pct';
  const where = document.createElement('code');
  where.className = 'ruta';
  where.textContent = live.get(c.id)?.fig.querySelector('.ruta')?.textContent ?? c.path;
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
  acc.append(button(s.text.rotate, 'rotate', () => edit({ op: 'rotate', cell: c.id }), { iconOnly: true }), button(s.text.remove, 'close', () => edit({ op: 'remove', cell: c.id }), { iconOnly: true }));
  cap.append(where, acc);
  fig.querySelector('figcaption')?.remove();
  fig.prepend(cap);
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
  return { view: c, fig, frame: f, key: cellKey(c) };
}

function layout(): void {
  if (!state) return;
  const rows = new Map<number, CellView[]>();
  for (const c of state.cells) rows.set(c.group, [...(rows.get(c.group) ?? []), c]);
  const top = barEl.getBoundingClientRect().height;
  // Alto de cada fila: el de la ventana repartido entre filas, menos el rótulo de las celdas.
  const availH = Math.max(160, (window.innerHeight - top - 24) / Math.max(1, rows.size) - 56);
  const availW = Math.max(200, rootEl.clientWidth - 26);
  for (const row of rows.values()) {
    const scales = rowScales(row, availW, availH, GAP, MIN_CELL);
    row.forEach((c, i) => {
      const l = live.get(c.id);
      if (!l) return;
      const stage = l.frame.parentElement as HTMLElement;
      const s = scales[i];
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
    });
  }
}

/**
 * Pinta el estado nuevo tocando lo mínimo: sacar un iframe del documento lo recarga, así que las celdas
 * que siguen se dejan donde están y solo se añaden, quitan o redimensionan las que cambian.
 */
function render(next: PanelState): void {
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
        if (l) l.fig.replaceWith(nl.fig);
        else row.append(nl.fig);
        live.set(c.id, nl);
        loads.push([nl.frame, c.entry]);
        l = nl;
      }
      l.view = c;
      caption(c, l.fig);
    }
  }
  for (const r of Array.from(rootEl.querySelectorAll<HTMLElement>('.fila'))) if (!r.querySelector('figure')) r.remove();
  layout();
  // La dirección se pone con el iframe ya colocado y medido: la página nunca ve un ancho de 0 al arrancar.
  for (const [f, src] of loads) f.src = src;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

window.addEventListener('message', (ev: MessageEvent) => {
  // 1) ¿Viene de una celda? Se exige ventana Y origen: una página no puede hacerse pasar por otra.
  for (const [id, l] of live) {
    if (ev.source !== l.frame.contentWindow) continue;
    const m = ev.data as (AgentEvent & { vk?: number }) | undefined;
    if (ev.origin !== l.view.origin || !m || m.vk !== 1 || typeof m.t !== 'string') return;
    for (const d of router.route(id, m)) toCell(d.to, d.cmd);
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
  const m = ev.data as { t?: string; state?: PanelState; cell?: string; cmd?: AgentCommand } | undefined;
  if (!m) return;
  if (m.t === 'state' && m.state) render(m.state);
  else if (m.t === 'toCell' && m.cell && m.cmd) toCell(m.cell, m.cmd);
  else if (m.t === 'reload') {
    // Recargar rearma el cortacircuitos y retira su aviso (N-2).
    router.rearm();
    for (const a of Array.from(rootEl.querySelectorAll('.aviso'))) a.remove();
    for (const id of live.keys()) toCell(id, { t: 'reload' });
  }
});

new ResizeObserver(layout).observe(rootEl);
// Navegaciones en espera (GRACE_MS): las celdas que no llegaron solas reciben la orden.
setInterval(() => {
  for (const d of router.due()) toCell(d.to, d.cmd);
}, 250);
vscode.postMessage({ t: 'panelReady', origin: window.origin });
