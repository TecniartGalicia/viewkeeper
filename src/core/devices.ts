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
  const id = 'custom-' + r.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { id, name: r.name.trim(), width: w, height: h, dpr: 1, mobile: r.mobile === true };
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
