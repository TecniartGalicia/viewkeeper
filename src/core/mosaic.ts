// Modelo del mosaico: qué celdas hay, qué enseña cada una y con quién se sincroniza. Puro.

export interface Cell {
  id: string;
  deviceId: string;
  landscape: boolean;
  /** Ruta dentro de la app: siempre empieza por '/'. */
  path: string;
  /** Celdas con la misma sesión comparten origen y, por tanto, cookies y localStorage. */
  session: string;
  /** Las celdas del mismo grupo se sincronizan entre sí. En una matriz, un grupo por ruta. */
  group: number;
  locale?: string;
}

export interface SyncOptions {
  scroll: boolean;
  click: boolean;
  input: boolean;
  nav: boolean;
}

export interface Mosaic {
  v: 1;
  name: string;
  /** Origen del servidor de desarrollo: http://localhost:5173 */
  target: string;
  cells: Cell[];
  sync: SyncOptions;
}

export const SYNC_ALL: SyncOptions = { scroll: true, click: true, input: true, nav: true };
export const MAX_CELLS = 12;

const SESSION_RE = /^[a-z0-9]{1,20}$/;

/** Acepta '3000', 'localhost:3000', 'http://127.0.0.1:5173/ruta'. Devuelve origen y ruta, o undefined. */
export function normalizeTarget(input: string): { origin: string; path: string } | undefined {
  let s = input.trim();
  if (s === '' || s.startsWith('/')) return undefined; // «/pacientes» es una ruta, no un servidor llamado «pacientes»
  if (/^\d{2,5}$/.test(s)) s = 'http://localhost:' + s;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  if (u.username !== '' || u.password !== '') return undefined;
  return { origin: u.origin, path: (u.pathname || '/') + u.search + u.hash };
}

export function isLoopback(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * ¿Es un servidor de desarrollo (esta máquina o la red local)? Lo demás se trata como una web publicada,
 * con datos de verdad. Sin lista de sufijos públicos: IP privadas, nombres sin punto y los dominios reservados
 * para redes locales y pruebas.
 */
export function isDevHost(origin: string): boolean {
  let h: string;
  try {
    h = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.startsWith('[')) return h === '[::1]' || /^\[(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(h);
  const ip = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (ip) {
    const a = Number(ip[1]);
    const b = Number(ip[2]);
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  if (!h.includes('.')) return true; // «mipc», «intranet»: un nombre de la red local
  return /\.(local|test|internal|lan|home\.arpa|example|invalid)$/.test(h);
}

/**
 * En una web publicada, cada clic y cada tecla se repetirían una vez por celda sobre datos reales («Guardar»
 * pulsado tres veces). Ahí esas dos sincronizaciones nacen apagadas; el usuario las enciende si quiere.
 */
export function syncForTarget(target: string, sync: SyncOptions): SyncOptions {
  return isDevHost(target) ? sync : { ...sync, click: false, input: false };
}

/** Ruta local y codificada. Se resuelve como el navegador (que ignora tabuladores): si cambia de origen, se descarta. */
export function normalizePath(p: string): string {
  const s = p.trim();
  if (s === '') return '/';
  try {
    const u = new URL(s.startsWith('/') ? s : '/' + s, 'http://x.invalid');
    if (u.origin !== 'http://x.invalid') return '/';
    const out = u.pathname + u.search + u.hash;
    return out.startsWith('//') ? '/' : out;
  } catch {
    return '/';
  }
}

/** Matriz rutas × dispositivos. Una fila (un grupo de sincronización) por ruta. */
export function matrix(routes: readonly string[], deviceIds: readonly string[], session = 'main'): Cell[] {
  const cells: Cell[] = [];
  routes.forEach((route, row) => {
    deviceIds.forEach((deviceId, col) => {
      cells.push({ id: `r${row}c${col}`, deviceId, landscape: false, path: normalizePath(route), session, group: row });
    });
  });
  return cells.slice(0, MAX_CELLS);
}

/** Un mosaico abre como mucho MAX_CELLS celdas: cada una es una página entera viva. */
export function capCells(cells: readonly Cell[]): { cells: Cell[]; dropped: number } {
  const out = cells.slice(0, MAX_CELLS);
  return { cells: out, dropped: cells.length - out.length };
}

/** Lee un mosaico guardado en .vscode/viewkeeper.json. Nunca lanza: lo inválido se descarta. */
export function parseMosaic(raw: unknown): Mosaic | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.name !== 'string' || typeof r.target !== 'string' || !Array.isArray(r.cells)) return undefined;
  const t = normalizeTarget(r.target);
  if (!t) return undefined;
  const cells: Cell[] = [];
  const seen = new Set<string>();
  for (const c of r.cells as unknown[]) {
    if (typeof c !== 'object' || c === null) continue;
    const x = c as Record<string, unknown>;
    if (typeof x.id !== 'string' || !/^[a-z0-9]{1,16}$/i.test(x.id) || seen.has(x.id)) continue;
    if (typeof x.deviceId !== 'string' || typeof x.path !== 'string') continue;
    const session = typeof x.session === 'string' && SESSION_RE.test(x.session) ? x.session : 'main';
    const group = Number.isInteger(x.group) && (x.group as number) >= 0 && (x.group as number) < MAX_CELLS ? (x.group as number) : 0;
    const locale = typeof x.locale === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(x.locale) ? x.locale : undefined;
    seen.add(x.id);
    cells.push({ id: x.id, deviceId: x.deviceId, landscape: x.landscape === true, path: normalizePath(x.path), session, group, locale });
    if (cells.length === MAX_CELLS) break;
  }
  if (cells.length === 0) return undefined;
  const s = (typeof r.sync === 'object' && r.sync !== null ? r.sync : {}) as Record<string, unknown>;
  return {
    v: 1,
    name: r.name.slice(0, 60),
    target: t.origin,
    cells,
    sync: { scroll: s.scroll !== false, click: s.click !== false, input: s.input !== false, nav: s.nav !== false },
  };
}

export function isValidSession(s: string): boolean {
  return SESSION_RE.test(s);
}

/** Lo que la barra de herramientas del panel puede pedir. El host lo aplica y vuelve a pintar. */
export type Edit =
  | { op: 'device'; cell: string; deviceId: string }
  | { op: 'rotate'; cell: string }
  | { op: 'remove'; cell: string }
  | { op: 'add'; deviceId: string; group?: number }
  | { op: 'sync'; key: keyof SyncOptions; value: boolean };

const SYNC_KEYS: readonly (keyof SyncOptions)[] = ['scroll', 'click', 'input', 'nav'];

/** Siguiente identificador libre: c0, c1… Corto y estable, para que valga en un mosaico guardado. */
function nextId(cells: readonly Cell[]): string {
  for (let i = 0; ; i++) if (!cells.some((c) => c.id === `c${i}`)) return `c${i}`;
}

/**
 * Aplica una edición. Puro y defensivo: el mensaje viene del webview, así que se valida aquí y
 * lo que no tiene sentido devuelve el mosaico tal cual. `known` dice qué dispositivos existen.
 */
export function applyEdit(m: Mosaic, raw: unknown, known: (deviceId: string) => boolean): Mosaic {
  if (typeof raw !== 'object' || raw === null) return m;
  const e = raw as Record<string, unknown>;
  const cell = typeof e.cell === 'string' ? m.cells.find((c) => c.id === e.cell) : undefined;
  const map = (fn: (c: Cell) => Cell): Mosaic => ({ ...m, cells: m.cells.map((c) => (c === cell ? fn(c) : c)) });
  switch (e.op) {
    case 'device':
      if (!cell || typeof e.deviceId !== 'string' || !known(e.deviceId)) return m;
      return map((c) => ({ ...c, deviceId: e.deviceId as string, landscape: false }));
    case 'rotate':
      return cell ? map((c) => ({ ...c, landscape: !c.landscape })) : m;
    case 'remove':
      // Quitar siempre se puede, también la última celda: el panel enseña entonces cómo añadir una.
      return cell ? { ...m, cells: m.cells.filter((c) => c !== cell) } : m;
    case 'add': {
      if (typeof e.deviceId !== 'string' || !known(e.deviceId) || m.cells.length >= MAX_CELLS) return m;
      const group = Number.isInteger(e.group) && (e.group as number) >= 0 && (e.group as number) < MAX_CELLS ? (e.group as number) : (m.cells[0]?.group ?? 0);
      // La celda nueva copia ruta y sesión de la fila a la que se suma, para entrar ya sincronizada.
      const like = m.cells.find((c) => c.group === group) ?? m.cells[0];
      const added: Cell = { id: nextId(m.cells), deviceId: e.deviceId, landscape: false, path: like?.path ?? '/', session: like?.session ?? 'main', group: like ? group : 0, locale: like?.locale };
      return { ...m, cells: [...m.cells, added] };
    }
    case 'sync':
      if (typeof e.key !== 'string' || !SYNC_KEYS.includes(e.key as keyof SyncOptions) || typeof e.value !== 'boolean') return m;
      return { ...m, sync: { ...m.sync, [e.key]: e.value } };
    default:
      return m;
  }
}

/** Una celda más con otra sesión, en la misma fila y ruta que la primera. */
export function addSession(m: Mosaic, session: string): Mosaic | undefined {
  if (!isValidSession(session) || m.cells.length >= MAX_CELLS) return undefined;
  const like = m.cells[0];
  if (!like) return undefined;
  return { ...m, cells: [...m.cells, { ...like, id: nextId(m.cells), session }] };
}
