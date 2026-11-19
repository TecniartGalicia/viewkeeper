// Lo que se decide al abrir un mosaico que el usuario acaba de pedir. Puro: la red se inyecta.
import { SYNC_ALL, isDevHost, syncForTarget, type Mosaic, type SyncOptions } from './mosaic.ts';
import type { Resolved } from './probe.ts';

export interface Prepared {
  mosaic: Mosaic;
  /** El destino es una web publicada: clics y escritura han quedado apagados. */
  deployed: boolean;
  /** El origen que se pidió, si el servidor mandó a su dominio principal y se abre ese. */
  redirectedFrom?: string;
}

/**
 * Un servidor de desarrollo se abre tal cual. Una web publicada: se sigue la redirección a su dominio principal
 * (una redirección a otro origen dejaría las celdas fuera del mosaico) y la sincronización de clics y de
 * escritura empieza apagada.
 */
export async function prepareOpen(m: Mosaic, resolve: (origin: string, path: string) => Promise<Resolved>): Promise<Prepared> {
  if (isDevHost(m.target)) return { mosaic: m, deployed: false };
  let next = m;
  let redirectedFrom: string | undefined;
  const r = await resolve(m.target, m.cells[0]?.path ?? '/');
  // Solo se acepta lo que sigue siendo una web publicada: nunca acabar, por una redirección, en esta máquina.
  if (r.origin !== m.target && !isDevHost(r.origin)) {
    redirectedFrom = m.target;
    // El nombre por defecto es el servidor: si era ese, sigue al nuevo.
    next = { ...m, target: r.origin, name: m.name === hostOf(m.target) ? hostOf(r.origin) : m.name };
  }
  return { mosaic: { ...next, sync: syncForTarget(next.target, next.sync) }, deployed: true, redirectedFrom };
}

/** El botón reabre sin preguntar solo un servidor de desarrollo: una web publicada se ofrece en la lista. */
export function canReopenSilently(m: Mosaic): boolean {
  return isDevHost(m.target);
}

/** Lo que se recuerda de un mosaico: nada si está vacío, y las rutas sin consulta ni ancla (pueden llevar un testigo). */
export function forMemory(m: Mosaic): Mosaic | undefined {
  if (m.cells.length === 0) return undefined;
  return { ...m, cells: m.cells.map((c) => ({ ...c, path: c.path.split(/[?#]/)[0] || '/' })) };
}

/** Al cambiar de dirección: se conserva lo que el usuario encendió o apagó, salvo al pasar entre una web publicada y un servidor de desarrollo. */
export function syncAfterAddressChange(now: Mosaic | undefined, target: string): SyncOptions {
  return now && isDevHost(now.target) === isDevHost(target) ? now.sync : SYNC_ALL;
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
