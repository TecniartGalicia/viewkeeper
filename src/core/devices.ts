// Catálogo de dispositivos. Puro: sin 'vscode', sin DOM.

export interface Device {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Densidad de píxeles. Un iframe no puede emularla; solo se usa en la captura (F3). */
  dpr: number;
  mobile: boolean;
  userAgent?: string;
}

const UA_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const UA_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export const DEVICES: readonly Device[] = [
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667, dpr: 2, mobile: true, userAgent: UA_IOS },
  { id: 'iphone-15', name: 'iPhone 15', width: 393, height: 852, dpr: 3, mobile: true, userAgent: UA_IOS },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', width: 430, height: 932, dpr: 3, mobile: true, userAgent: UA_IOS },
  { id: 'pixel-8', name: 'Pixel 8', width: 412, height: 915, dpr: 2.625, mobile: true, userAgent: UA_ANDROID },
  { id: 'galaxy-s24', name: 'Galaxy S24', width: 360, height: 780, dpr: 3, mobile: true, userAgent: UA_ANDROID },
  { id: 'ipad-mini', name: 'iPad Mini', width: 768, height: 1024, dpr: 2, mobile: true, userAgent: UA_IPAD },
  { id: 'ipad-pro-11', name: 'iPad Pro 11', width: 834, height: 1194, dpr: 2, mobile: true, userAgent: UA_IPAD },
  { id: 'laptop', name: 'Laptop', width: 1366, height: 768, dpr: 1, mobile: false },
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080, dpr: 1, mobile: false },
];

export function findDevice(id: string, custom: readonly Device[] = []): Device | undefined {
  return custom.find((d) => d.id === id) ?? DEVICES.find((d) => d.id === id);
}

export function rotate(d: Device): Device {
  return { ...d, width: d.height, height: d.width };
}

/** Valida un dispositivo definido por el usuario en los ajustes. Nunca lanza. */
export function parseCustomDevice(raw: unknown): Device | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const w = Number(r.width);
  const h = Number(r.height);
  if (typeof r.name !== 'string' || r.name.trim() === '') return undefined;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 200 || h < 200 || w > 7680 || h > 7680) return undefined;
  const name = r.name.trim().slice(0, 40);
  let id: string;
  if (typeof r.id === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(r.id)) id = r.id;
  else {
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
    // Un nombre sin letras latinas («手机») no deja nada: se usa un resumen del nombre para que no choquen.
    id = 'custom-' + (slug || [...name].reduce((h, ch) => (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0, 7).toString(36));
  }
  return { id, name, width: w, height: h, dpr: 1, mobile: r.mobile === true };
}

/**
 * Escala con la que un dispositivo cabe en una caja. Nunca amplía por encima de 1:
 * un móvil ampliado engaña sobre el tamaño real del texto.
 */
export function fitScale(d: Pick<Device, 'width' | 'height'>, boxW: number, boxH: number): number {
  if (boxW <= 0 || boxH <= 0) return 1;
  const s = Math.min(boxW / d.width, boxH / d.height, 1);
  return Math.max(0.1, Math.round(s * 1000) / 1000);
}

/**
 * Escalas de una fila del mosaico: todas las celdas a la MISMA altura en pantalla, la mayor que quepa en el
 * ancho disponible, sin ampliar ninguna por encima del 100 %. Cada celda ocupa al menos `minWidth` (su rótulo
 * tiene que caber). Así un portátil no se queda diminuto al lado de un móvil, y se comparan a la misma altura.
 */
/** Alto mínimo en pantalla de una celda: por debajo no se lee nada. Si no cabe, la fila se parte en líneas. */
export const MIN_ROW_HEIGHT = 240;

export function rowScales(sizes: readonly Pick<Device, 'width' | 'height'>[], availW: number, availH: number, gap: number, minWidth = 190): number[] {
  if (sizes.length === 0) return [];
  const room = Math.max(1, availW - gap * (sizes.length - 1));
  const used = (h: number): number => sizes.reduce((sum, d) => sum + Math.max(minWidth, d.width * Math.min(h / d.height, 1)), 0);
  // La anchura ocupada crece con la altura: búsqueda binaria de la mayor altura que cabe.
  let lo = 40;
  let hi = Math.max(lo, availH);
  if (used(hi) <= room) lo = hi;
  else {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (used(mid) <= room) lo = mid;
      else hi = mid;
    }
  }
  // H1 de la auditoría: sin este suelo, tres dispositivos en un editor partido en dos bajaban a 40 px de alto.
  const h = Math.max(lo, Math.min(availH, MIN_ROW_HEIGHT));
  return sizes.map((d) => Math.max(0.05, Math.round(Math.min(h / d.height, 1) * 1000) / 1000));
}
