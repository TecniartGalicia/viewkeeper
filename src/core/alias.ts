// Qué direcciones son «la misma web» que el destino del mosaico. Puro.
// Una web publicada suele contestar en cuatro orígenes (http y https, con y sin «www») y quedarse con uno;
// un servidor de desarrollo, en localhost y en 127.0.0.1. Tratar esos alias como el propio destino es lo que
// permite seguir la redirección al dominio principal y que un enlace escrito con el dominio completo no saque
// a la celda del mosaico. Nunca se considera alias otro dominio, ni otro subdominio que no sea «www».

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function bare(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}
function web(u: URL): boolean {
  return u.protocol === 'http:' || u.protocol === 'https:';
}

/** ¿`a` y `b` son la misma web? Mismo origen; o mismo nombre (salvo «www») en los puertos por defecto; o la propia máquina en el mismo puerto. */
export function isAlias(a: URL, b: URL): boolean {
  if (!web(a) || !web(b)) return false;
  if (a.origin === b.origin) return true;
  if (LOOPBACK.test(a.hostname) && LOOPBACK.test(b.hostname)) return a.protocol === b.protocol && a.port === b.port && a.port !== '';
  // URL deja el puerto vacío cuando es el del protocolo: http y https «en su puerto» son alias entre sí.
  return a.port === '' && b.port === '' && bare(a.hostname) === bare(b.hostname) && a.hostname.includes('.');
}

/** Todos los orígenes alias del destino, él incluido. Como mucho cuatro. */
export function aliasOrigins(target: string): string[] {
  let t: URL;
  try {
    t = new URL(target);
  } catch {
    return [];
  }
  if (!web(t)) return [];
  const out = new Set<string>([t.origin]);
  if (LOOPBACK.test(t.hostname)) {
    if (t.port !== '') for (const h of ['localhost', '127.0.0.1', '[::1]']) out.add(`${t.protocol}//${h}:${t.port}`);
  } else if (t.port === '' && t.hostname.includes('.') && !/^[\d.]+$/.test(t.hostname) && !t.hostname.startsWith('[')) {
    const b = bare(t.hostname);
    for (const proto of ['https:', 'http:']) for (const h of [b, `www.${b}`]) out.add(`${proto}//${h}`);
  }
  return [...out];
}
