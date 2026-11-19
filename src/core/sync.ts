// Reparto de eventos entre celdas. Puro: lo usa el panel (webview) y se prueba en Node.
import type { Cell, SyncOptions } from './mosaic.ts';

/** Lo que el agente inyectado manda al panel. */
export type AgentEvent =
  | { t: 'hello'; url: string }
  | { t: 'ready'; url: string; title: string; height: number }
  | { t: 'gesture' }
  | { t: 'scroll'; sel: string; rx: number; ry: number }
  | { t: 'click'; sel: string; fp?: string; tx?: string }
  | { t: 'input'; sel: string; kind?: 'input' | 'change'; fp?: string; tx?: string; value?: string; checked?: boolean }
  | { t: 'enter'; sel: string; fp?: string; tx?: string }
  | { t: 'nav'; url: string }
  | { t: 'miss'; kind: string }
  | { t: 'hint'; kind: string; origin: string }
  | { t: 'error'; kind: string; msg: string }
  | { t: 'answer'; id: number; data: unknown };

/** Lo que el panel manda a un agente. */
export type AgentCommand =
  | { t: 'scroll'; sel: string; rx: number; ry: number }
  | { t: 'click'; sel: string; fp?: string; tx?: string }
  | { t: 'input'; sel: string; kind?: 'input' | 'change'; fp?: string; tx?: string; value?: string; checked?: boolean }
  | { t: 'enter'; sel: string; fp?: string; tx?: string }
  | { t: 'nav'; path: string }
  | { t: 'reload' }
  | { t: 'ask'; id: number; q: string; arg?: unknown };

export interface Delivery {
  to: string;
  cmd: AgentCommand;
}

/** Ruta + búsqueda + ancla de una URL absoluta del proxy. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return '/';
  }
}

/**
 * Dos rutas «son la misma página» si solo difieren en la barra final o en un ancla de posición.
 * Un ancla que empieza por «#/» o «#!» no es una posición: es la ruta de una app con enrutado por ancla. (N-3)
 */
export function pageKey(path: string): string {
  const i = path.indexOf('#');
  const hash = i >= 0 ? path.slice(i) : '';
  const [p, q] = (i >= 0 ? path.slice(0, i) : path).split('?');
  const trimmed = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
  const route = hash.startsWith('#/') || hash.startsWith('#!') ? hash : '';
  return (q === undefined ? trimmed : `${trimmed}?${q}`) + route;
}

/** Un gesto del usuario justifica UNA navegación, durante este tiempo. El agente lo renueva al salir del documento. */
export const GESTURE_MS = 8000;
/** Una celda a la que se mandó navegar no reparte nada hasta que llega o pasa este tiempo. */
export const PENDING_MS = 15000;
/** Cortacircuitos: nadie pasa ocho páginas en tres segundos; un bucle, sí. */
export const TRIP_COUNT = 8;
export const TRIP_MS = 3000;
/** Tras saltar, la fila vuelve a sincronizar la navegación sola pasado este tiempo, o al recargar. */
export const REARM_MS = 30000;
/**
 * Una seguidora a la que se acaba de reproducir un clic o un Enter suele navegar sola (una SPA hace su
 * pushState unos milisegundos después que el líder). Se le deja este margen antes de mandarla: mandarla
 * antes la obliga a cargar la página entera (NAV-6, una carrera que el banco de navegador destapó).
 */
export const GRACE_MS = 1500;

/**
 * Reglas de navegación, todas nacidas de la auditoría (H-2 y N-2, N-8, N-9):
 *  1. Solo se reparte una navegación precedida de un gesto del usuario EN ESA celda, y el gesto se gasta.
 *     Una redirección del servidor, o un hello de la celda seguidora al llegar, no llevan gesto: no rebotan.
 *  2. La posición de una celda se anota cuando ella la confirma, no cuando se le manda la orden.
 *     Si el servidor la redirige a otro sitio (un invitado mandado a /admin acaba en /login), se anota donde acabó.
 *  3. Mientras una celda tiene una orden pendiente, lo que anuncie es el resultado de la orden, no una decisión suya;
 *     y al mandarle la orden se le quita el gesto que tuviera.
 *  4. Para decidir si hay que mover a una celda se mira adónde va (su orden pendiente), no dónde estaba.
 *  5. Si aun así el grupo navega a velocidad de máquina, se pausa la navegación de esa fila y se avisa.
 */
export class SyncRouter {
  private readonly where = new Map<string, string>();
  private readonly gestureAt = new Map<string, number>();
  private readonly pending = new Map<string, { since: number; path: string }>();
  private readonly groupPath = new Map<number, string>();
  private readonly navTimes = new Map<number, number[]>();
  private readonly tripped = new Map<number, number>();
  /** Última vez que se le reprodujo a cada celda un clic o un Enter. */
  private readonly replayedAt = new Map<string, number>();
  /** Navegaciones esperadas: si la celda no llega sola antes de `at`, `due()` la manda. */
  private readonly expect = new Map<string, { path: string; at: number }>();
  private cells: readonly Cell[];
  private opts: SyncOptions;
  private readonly now: () => number;
  /** Se llama una vez cada vez que salta el cortacircuitos de un grupo. */
  onTrip: (group: number) => void = () => {};

  constructor(cells: readonly Cell[], opts: SyncOptions, now: () => number = Date.now) {
    this.cells = cells;
    this.opts = opts;
    this.now = now;
  }

  update(cells: readonly Cell[], opts: SyncOptions): void {
    this.cells = cells;
    this.opts = opts;
    for (const id of [...this.where.keys()]) {
      if (cells.some((c) => c.id === id)) continue;
      this.where.delete(id);
      this.gestureAt.delete(id);
      this.pending.delete(id);
      this.expect.delete(id);
      this.replayedAt.delete(id);
    }
  }

  /** Vuelve a sincronizar la navegación de todas las filas. Lo llama el panel al recargar. */
  rearm(): void {
    this.tripped.clear();
    this.navTimes.clear();
  }

  currentPath(cellId: string): string | undefined {
    return this.where.get(cellId);
  }

  isTripped(group: number): boolean {
    const at = this.tripped.get(group);
    if (at === undefined) return false;
    if (this.now() - at < REARM_MS) return true;
    this.tripped.delete(group);
    return false;
  }

  /**
   * Navegaciones que se dejaron en espera y ya vencieron: las celdas que no llegaron solas reciben la orden.
   * El panel lo llama cada pocos cientos de milisegundos.
   */
  due(): Delivery[] {
    const t = this.now();
    const out: Delivery[] = [];
    for (const [id, e] of [...this.expect]) {
      if (t < e.at) continue;
      this.expect.delete(id);
      const c = this.cells.find((x) => x.id === id);
      if (!c || !this.opts.nav || this.isTripped(c.group)) continue;
      const at = this.where.get(id);
      if (at !== undefined && pageKey(at) === pageKey(e.path)) continue; // llegó sola
      this.pending.set(id, { since: t, path: e.path });
      out.push({ to: id, cmd: { t: 'nav', path: e.path } });
    }
    return out;
  }

  /**
   * Navegación pedida desde fuera de las celdas (el rótulo de la fila, el editor): toda la fila va a esa ruta.
   * Cada celda queda con la orden pendiente, así que su llegada no se toma por una decisión suya ni rebota;
   * y la fila recuerda la ruta, para que una celda que se añada después entre ya en ella.
   * No mira `nav` ni el cortacircuitos: no es una celda arrastrando a otra, es el usuario mandando.
   */
  drive(group: number, path: string): Delivery[] {
    const t = this.now();
    const out: Delivery[] = [];
    if (!this.cells.some((c) => c.group === group)) return out;
    const prev = this.groupPath.get(group);
    if (prev === undefined || pageKey(prev) !== pageKey(path)) this.groupPath.set(group, path);
    for (const c of this.cells) {
      if (c.group !== group) continue;
      this.expect.delete(c.id);
      this.gestureAt.delete(c.id);
      const at = this.where.get(c.id);
      // Una celda que aún no cargó se pondrá al día sola con su primer aviso (groupPath).
      if (at === undefined || pageKey(at) === pageKey(path)) continue;
      this.pending.set(c.id, { since: t, path });
      out.push({ to: c.id, cmd: { t: 'nav', path } });
    }
    return out;
  }

  /** ¿Sigue esta celda a medio cumplir una orden de navegación? Una orden que no se cumple caduca. */
  private busy(id: string, t: number): boolean {
    const p = this.pending.get(id);
    if (p === undefined) return false;
    if (t - p.since <= PENDING_MS) return true;
    this.pending.delete(id);
    return false;
  }

  /** Devuelve a qué celdas hay que mandar qué, dado un evento de una celda. */
  route(from: string, ev: AgentEvent): Delivery[] {
    const src = this.cells.find((c) => c.id === from);
    if (!src) return [];
    const t = this.now();
    const peers = this.cells.filter((c) => c.id !== from && c.group === src.group);
    // Antes de nada se purga una orden caducada: si no, se tragaría la siguiente navegación del usuario.
    const waiting = this.busy(from, t);

    if (ev.t === 'gesture') {
      this.gestureAt.set(from, t);
      return [];
    }

    if (ev.t === 'hello' || ev.t === 'ready' || ev.t === 'nav') {
      const path = pathOf(ev.url);
      const before = this.where.get(from);
      this.where.set(from, path); // regla 2
      const ex = this.expect.get(from);
      if (ex && pageKey(ex.path) === pageKey(path)) this.expect.delete(from);
      if (waiting) {
        // regla 3: es la llegada de una orden nuestra. Se da por cumplida con el documento listo, no con el primer aviso.
        if (ev.t !== 'hello') this.pending.delete(from);
        return [];
      }
      if (!this.opts.nav || this.isTripped(src.group)) return [];
      if (before === undefined) {
        // Primera carga de la celda: no es una navegación. Si su grupo ya se movió, se la pone al día.
        const g = this.groupPath.get(src.group);
        if (g !== undefined && pageKey(g) !== pageKey(path)) {
          this.pending.set(from, { since: t, path: g });
          return [{ to: from, cmd: { t: 'nav', path: g } }];
        }
        return [];
      }
      if (pageKey(before) === pageKey(path)) return [];
      const g = this.gestureAt.get(from);
      if (g === undefined || t - g > GESTURE_MS) return []; // regla 1
      this.gestureAt.delete(from); // un gesto, una navegación
      const times = (this.navTimes.get(src.group) ?? []).filter((x) => t - x < TRIP_MS);
      times.push(t);
      this.navTimes.set(src.group, times);
      if (times.length > TRIP_COUNT) {
        // regla 5
        this.tripped.set(src.group, t);
        this.navTimes.delete(src.group);
        this.onTrip(src.group);
        return [];
      }
      this.groupPath.set(src.group, path);
      const out: Delivery[] = [];
      for (const p of peers) {
        const going = this.busy(p.id, t) ? this.pending.get(p.id)?.path : this.where.get(p.id); // regla 4
        if (going === undefined) continue; // aún no cargó: se pondrá al día con su primer hello
        if (pageKey(going) === pageKey(path)) continue;
        this.pending.set(p.id, { since: t, path });
        const r = this.replayedAt.get(p.id);
        if (r !== undefined && t - r < GRACE_MS) {
          // Acaba de recibir el mismo clic: se le da margen para llegar sola. Si llega, su aviso consume la
          // orden pendiente como si la hubiera cumplido; si no, due() la manda.
          this.expect.set(p.id, { path, at: r + GRACE_MS });
          continue;
        }
        this.gestureAt.delete(p.id); // regla 3
        out.push({ to: p.id, cmd: { t: 'nav', path } });
      }
      return out;
    }

    // Scroll, clic y escritura: solo entre celdas que enseñan la misma página y no están a medio navegar.
    if (waiting) return [];
    const here = this.where.get(from);
    if (here === undefined) return [];
    const same = peers.filter((p) => !this.busy(p.id, t) && this.where.get(p.id) !== undefined && pageKey(this.where.get(p.id) as string) === pageKey(here));
    if (ev.t === 'click' || ev.t === 'enter' || ev.t === 'input') this.gestureAt.set(from, t);
    // El texto del elemento solo sirve de huella entre celdas con el mismo idioma y la misma sesión:
    // «Menu» y «Menú», o «Hola, Ana» y «Hola, invitado», son el mismo botón. (N-7)
    const tx = (p: Cell, text: string | undefined): string | undefined => (p.locale === src.locale && p.session === src.session ? text : undefined);
    if (ev.t === 'scroll') return this.opts.scroll ? same.map((p) => ({ to: p.id, cmd: { t: 'scroll', sel: ev.sel, rx: ev.rx, ry: ev.ry } })) : [];
    if ((ev.t === 'click' && this.opts.click) || (ev.t === 'enter' && this.opts.input)) for (const p of same) this.replayedAt.set(p.id, t);
    if (ev.t === 'click') return this.opts.click ? same.map((p) => ({ to: p.id, cmd: { t: 'click', sel: ev.sel, fp: ev.fp, tx: tx(p, ev.tx) } })) : [];
    if (ev.t === 'input') return this.opts.input ? same.map((p) => ({ to: p.id, cmd: { t: 'input', sel: ev.sel, kind: ev.kind, fp: ev.fp, tx: tx(p, ev.tx), value: ev.value, checked: ev.checked } })) : [];
    if (ev.t === 'enter') return this.opts.input ? same.map((p) => ({ to: p.id, cmd: { t: 'enter', sel: ev.sel, fp: ev.fp, tx: tx(p, ev.tx) } })) : [];
    return [];
  }
}
