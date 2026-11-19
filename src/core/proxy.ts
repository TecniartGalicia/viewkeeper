// Proxy local entre las celdas y el servidor de desarrollo.
// Hace cuatro cosas que un iframe a secas no puede: quitar las cabeceras que prohíben incrustar,
// inyectar el agente de sincronización, dar a cada sesión su propio origen, y arreglar las cookies.
// Sin dependencias: solo node:http, node:https, node:net, node:tls, node:zlib.
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as tls from 'node:tls';
import * as zlib from 'node:zlib';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';
import type { Duplex } from 'node:stream';
import { isAlias } from './alias.ts';

export const PREFIX = '/__viewkeeper';
/** Las cookies no distinguen puerto: el nombre lleva el del proxy para que dos mosaicos no se pisen (H-3). */
export const GATE_PREFIX = '__vk_';
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const INJECT_LIMIT = 64 * 1024;
const TICKET_MS = 60_000;

export interface ProxyOptions {
  /** Origen del servidor de desarrollo: http://localhost:5173 */
  target: string;
  /** Código del agente (media/agent.js). */
  agentSource: string;
  /** Quitar Content-Security-Policy de las respuestas. Por defecto sí: es una vista previa de desarrollo. */
  relaxCsp?: boolean;
  /** Reescribir Set-Cookie a SameSite=None; Secure. */
  fixCookies?: boolean;
  /** Otros orígenes de esta máquina (la API en otro puerto) que la página puede llamar a través del proxy. */
  apiOrigins?: readonly string[];
  log?: (line: string) => void;
  now?: () => number;
  /** Puerto fijo. Solo para pruebas: por defecto, el preferido del destino y, si está ocupado, uno libre. */
  port?: number;
  /** Textos de las páginas que el proxy pone en una celda. Los traduce quien lo arranca; por defecto, inglés. */
  pages?: Partial<ProxyPages>;
}

/** `{0}` es el servidor (host o origen) del que se habla. */
export interface ProxyPages {
  denied: string;
  downTitle: string;
  downBody: string;
  leftTitle: string;
  leftBody: string;
  back: string;
}
export const PAGES_EN: ProxyPages = {
  denied: 'This address only serves the cells of the ViewKeeper panel.',
  downTitle: 'Nothing is listening on {0}',
  downBody: 'Start your dev server. This cell retries by itself every two seconds.',
  leftTitle: 'This page redirects outside the mosaic',
  leftBody: 'It goes to {0}. A cell only shows the site the mosaic was opened for, so the redirect was not followed. Signing in through another site cannot happen inside a cell.',
  back: 'Back',
};

export interface RunningProxy {
  port: number;
  /** Dirección en la que escucha. Siempre la interfaz local. */
  address: string;
  token: string;
  /** Etiqueta estable derivada del destino: la misma app conserva sus cookies entre aperturas. */
  tag: string;
  gateCookie: string;
  /** Origen que ve la celda: http://s-<sesion>-<etiqueta>.localhost:<puerto> */
  originFor(session: string): string;
  /** URL con la que una celda entra por primera vez: deja la cookie de entrada y redirige. */
  entryUrl(session: string, path: string): string;
  /** URL de un solo uso para la captura: entra y reproduce las cookies de la sesión. No lleva el testigo. */
  captureUrl(session: string, path: string): string;
  /** El agente solo hablará con este origen (el del webview del panel). Hay que fijarlo antes de cargar celdas. */
  setPanelOrigin(origin: string): void;
  /** Lo que el proxy no pudo hacer, para el comando de diagnóstico. Sin cuerpos ni cookies. */
  diagnostics(): string[];
  close(): Promise<void>;
}

// ───────────────────────── funciones puras (probadas en src/test/unit/proxy.test.ts)

export function tagFor(target: string): string {
  return createHash('sha256').update(new URL(target).origin).digest('hex').slice(0, 8);
}

/** 's-admin-1a2b3c4d.localhost:4000' → 'admin'. Cualquier otro Host se rechaza: es la defensa contra DNS rebinding. */
export function sessionFromHost(host: string | undefined, port: number, tag: string): string | null {
  if (!host) return null;
  const m = /^s-([a-z0-9]{1,20})-([a-f0-9]{8})\.localhost:(\d+)$/.exec(host.toLowerCase());
  if (!m || m[2] !== tag || Number(m[3]) !== port) return null;
  return m[1];
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Quita nuestras cookies de entrada (las de este mosaico y las de otros) antes de reenviar al servidor del usuario. */
export function stripGateCookies(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const rest = header
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p !== '' && !p.startsWith(GATE_PREFIX));
  return rest.length ? rest.join('; ') : undefined;
}

/**
 * Se reescribe a SameSite=None; Secure, que Chromium acepta en http://*.localhost por ser origen fiable,
 * y se quita Domain porque el dominio del servidor real no es el del proxy.
 * Medido: en VS Code 1.147 no hace falta (S-4); se mantiene por los hosts sin medir (D5).
 */
export function rewriteSetCookie(c: string): string {
  const parts = c.split(';').map((p) => p.trim());
  const kept = parts.filter((p, i) => {
    if (i === 0) return true;
    const k = p.toLowerCase();
    return !(k.startsWith('samesite') || k === 'secure' || k.startsWith('domain') || k === 'partitioned');
  });
  return [...kept, 'SameSite=None', 'Secure'].join('; ');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Solo rutas locales, y siempre codificadas. Se resuelve como lo haría el navegador (que ignora tabuladores
 * y saltos de línea): si el resultado cambia de origen, era un intento de salir. (H-11)
 */
export function safeLocalPath(p: string | null | undefined): string {
  if (!p) return '/';
  try {
    const u = new URL(p, 'http://x.invalid');
    if (u.origin !== 'http://x.invalid' || !p.trimStart().startsWith('/')) return '/';
    const out = u.pathname + u.search + u.hash;
    // «/.//host» se normaliza a «//host», que el navegador lee como otro servidor (N-10).
    return out.startsWith('//') || out.startsWith('/\\') ? '/' : out;
  } catch {
    return '/';
  }
}

/** Puerto preferido para un destino: estable, y en la franja alta que nadie usa para desarrollo. */
export function preferredPort(target: string): number {
  return 42000 + (parseInt(tagFor(target).slice(0, 6), 16) % 6000);
}

/** ¿Este Set-Cookie borra la cookie? (Max-Age no positivo o una fecha ya pasada) */
export function expiresCookie(c: string): boolean {
  const m = /;\s*max-age=(-?\d+)/i.exec(c);
  if (m) return Number(m[1]) <= 0;
  const e = /;\s*expires=([^;]+)/i.exec(c);
  return e !== null && Date.parse(e[1]) < Date.now();
}

export function isLoopbackHost(h: string): boolean {
  return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

export interface Ctx {
  target: URL;
  proxyOrigin: string;
}

export function rewriteRequestHeaders(h: http.IncomingHttpHeaders, ctx: Ctx, html: boolean): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined || HOP.has(k)) continue;
    out[k] = v;
  }
  out.host = ctx.target.host;
  // El servidor de desarrollo comprueba el origen (Vite, y Next con allowedDevOrigins): debe ver el suyo.
  if (typeof h.origin === 'string' && h.origin === ctx.proxyOrigin) out.origin = ctx.target.origin;
  if (typeof h.referer === 'string' && h.referer.startsWith(ctx.proxyOrigin + '/')) out.referer = ctx.target.origin + h.referer.slice(ctx.proxyOrigin.length);
  const cookie = stripGateCookies(h.cookie);
  if (cookie === undefined) delete out.cookie;
  else out.cookie = cookie;
  // El HTML se pide sin comprimir para poder inyectar sin descomprimir. Lo demás pasa tal cual.
  if (html) out['accept-encoding'] = 'identity';
  return out;
}

export interface HeaderPolicy {
  relaxCsp: boolean;
  fixCookies: boolean;
  injecting: boolean;
}

/** Location que apunta al servidor (o a su alias de loopback con el mismo puerto) → al origen del proxy. (H-13) */
export function rewriteLocation(loc: string, ctx: Ctx): string {
  let u: URL;
  try {
    u = new URL(loc, ctx.target);
  } catch {
    return loc;
  }
  const t = ctx.target;
  // También los alias de la misma web (http/https, con y sin «www»): el destino ya es el dominio principal.
  const same = u.origin === t.origin || (u.protocol === t.protocol && u.port === t.port && isLoopbackHost(u.hostname) && isLoopbackHost(t.hostname)) || isAlias(u, t);
  if (!same) return loc;
  // Una ruta relativa ya vale tal cual; solo se toca lo que nombraba al servidor.
  if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(loc.trim())) return loc;
  return ctx.proxyOrigin + u.pathname + u.search + u.hash;
}

/**
 * ¿Esta redirección saca a la celda del mosaico? Devuelve el origen al que iría, o undefined si se queda.
 * Se queda si va al propio destino o a un alias suyo; pero un alias que redirige a la MISMA ruta es el servidor
 * mandando a su dominio principal: reescribirla sería un bucle, así que también cuenta como salida.
 */
export function leavesTo(loc: string, ctx: Ctx, requestPath: string): string | undefined {
  let u: URL;
  try {
    u = new URL(loc, ctx.target.origin + requestPath);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  if (rewriteLocation(u.href, ctx) === u.href) return u.origin; // no es el destino ni un alias
  if (u.origin !== ctx.target.origin && u.pathname + u.search === requestPath) return u.origin;
  return undefined;
}

export function rewriteResponseHeaders(h: http.IncomingHttpHeaders, ctx: Ctx, p: HeaderPolicy): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined || HOP.has(k)) continue;
    if (k === 'x-frame-options') continue;
    if (p.relaxCsp && (k === 'content-security-policy' || k === 'content-security-policy-report-only')) continue;
    if (p.injecting && (k === 'content-length' || k === 'content-encoding' || k === 'etag' || k === 'last-modified')) continue;
    out[k] = v;
  }
  if (typeof h.location === 'string') out.location = rewriteLocation(h.location, ctx);
  const sc = h['set-cookie'];
  if (sc) {
    // La app no puede pisar nuestra cookie de entrada.
    const own = sc.filter((c) => !c.trimStart().startsWith(GATE_PREFIX));
    if (own.length) out['set-cookie'] = p.fixCookies ? own.map(rewriteSetCookie) : own;
    else delete out['set-cookie'];
  }
  if (p.injecting) out['cache-control'] = 'no-store';
  return out;
}

/**
 * Dónde insertar el agente: tras <head>, o si no lo hay, tras el doctype y <html>. Nunca antes del doctype
 * (pondría la página en modo quirks), ni dentro de un comentario, ni partiendo un atributo. (H-10)
 * Devuelve la posición, o -1 si hace falta leer más.
 */
export function findInsertion(s: string, final: boolean): number {
  let i = s.charCodeAt(0) === 0xfeff ? 1 : s.startsWith('ï»¿') ? 3 : 0; // BOM (leído como latin1 son 3 bytes)
  let best = i;
  let sawHtml = false;
  for (;;) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) return final ? best : -1;
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      if (end < 0) return final ? best : -1;
      i = end + 3;
      continue;
    }
    // Con menos de 10 caracteres por delante no se distingue «<he» de «<head>»: se espera al siguiente trozo.
    if (!final && s.length - i < 10) return -1;
    const m = /^<(!doctype|html|head)(?=[\s>/])/i.exec(s.slice(i, i + 12));
    if (!m) return best; // primer contenido real: se inserta justo antes
    const kind = m[1].toLowerCase();
    if (kind === 'html' && sawHtml) return best;
    // Fin de la etiqueta respetando comillas: un «>» dentro de un atributo no la cierra.
    let j = i + m[0].length;
    let quote = '';
    for (; j < s.length; j++) {
      const ch = s[j];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
    }
    if (j >= s.length) return final ? best : -1;
    i = j + 1;
    best = i;
    if (kind === 'head') return best;
    if (kind === 'html') sawHtml = true;
  }
}

/** Inserta la etiqueta del agente sin esperar a tener el documento entero: el HTML en streaming sigue llegando por trozos. */
export function createInjector(tag: string): Transform {
  let pending: Buffer | null = Buffer.alloc(0);
  const emit = (at: number): Buffer => {
    const b = pending as Buffer;
    pending = null;
    return Buffer.concat([b.subarray(0, at), Buffer.from(tag), b.subarray(at)]);
  };
  return new Transform({
    transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
      if (pending === null) return cb(null, chunk);
      pending = Buffer.concat([pending, chunk]);
      // latin1: un byte, un carácter. Las posiciones valen como desplazamientos en el buffer.
      const at = findInsertion(pending.toString('latin1'), pending.length >= INJECT_LIMIT);
      if (at < 0) return cb();
      cb(null, emit(at));
    },
    flush(cb: TransformCallback): void {
      if (pending === null) return cb();
      cb(null, emit(findInsertion(pending.toString('latin1'), true)));
    },
  });
}

function wantsHtml(req: http.IncomingMessage): boolean {
  const dest = req.headers['sec-fetch-dest'];
  if (dest === 'document' || dest === 'iframe' || dest === 'frame') return true;
  if (dest !== undefined) return false;
  return (req.headers.accept ?? '').includes('text/html');
}

/**
 * Una petición que viene de OTRO sitio solo se admite si es la navegación de un iframe (así entra el panel).
 * Cualquier otra —fetch, imagen, formulario lanzado desde una página ajena— se rechaza: la reescritura de
 * cookies a SameSite=None le quitaría a la app su protección contra peticiones cruzadas. (H-1)
 */
export function crossSiteAllowed(req: Pick<http.IncomingMessage, 'method' | 'headers'>): boolean {
  const site = req.headers['sec-fetch-site'];
  // «same-site» es otra sesión del mismo mosaico (otro subdominio de localhost): tampoco entra.
  if (site !== 'cross-site' && site !== 'same-site') return true;
  const dest = req.headers['sec-fetch-dest'];
  return req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate' && (dest === 'iframe' || dest === 'document');
}

function decoder(encoding: string | undefined): Transform | null {
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip();
  if (encoding === 'br') return zlib.createBrotliDecompress();
  if (encoding === 'deflate') return zlib.createInflate();
  return null;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Página propia del proxy. Los textos se escapan aquí: pueden llevar un nombre de servidor que viene de fuera. */
function page(status: number, title: string, body: string, refresh: boolean, back?: string): { status: number; html: string } {
  const meta = refresh ? '<meta http-equiv="refresh" content="2">' : '';
  const link = back ? `<p><a href="#" onclick="history.back();return false">&larr; ${esc(back)}</a></p>` : '';
  return {
    status,
    html: `<!doctype html><html><head><meta charset="utf-8">${meta}<title>${esc(title)}</title></head><body style="font:14px system-ui;padding:24px;color:#555"><h3>${esc(title)}</h3><p>${esc(body)}</p>${link}</body></html>`,
  };
}

// ───────────────────────── servidor

export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
  const target = new URL(opts.target);
  const tag = tagFor(opts.target);
  const token = randomBytes(24).toString('hex');
  const relaxCsp = opts.relaxCsp !== false;
  const fixCookies = opts.fixCookies !== false;
  const log = opts.log ?? ((): void => {});
  const now = opts.now ?? Date.now;
  const pages: ProxyPages = { ...PAGES_EN, ...opts.pages };
  // Solo orígenes de esta máquina: el proxy no es una pasarela hacia la red.
  const apis = (opts.apiOrigins ?? []).map((o) => new URL(o)).filter((u) => isLoopbackHost(u.hostname) && (u.protocol === 'http:' || u.protocol === 'https:'));
  const seenCookies = new Map<string, Map<string, string>>();
  const tickets = new Map<string, { session: string; expires: number }>();
  const notes: string[] = [];
  const note = (line: string): void => {
    log(line);
    notes.push(`${new Date(now()).toISOString()} ${line}`);
    if (notes.length > 200) notes.shift();
  };
  const sockets = new Set<Duplex>();
  // Conexiones salientes propias: se cierran con el proxy y no se mezclan con las del resto de la extensión. (H-9)
  const agentHttp = new http.Agent({ keepAlive: true });
  const agentHttps = new https.Agent({ keepAlive: true });
  let port = 0;
  let panelOrigin = '';
  let gateCookie = '';

  const originFor = (session: string): string => `http://s-${session}-${tag}.localhost:${port}`;
  const scriptTag = `<script src="${PREFIX}/agent.js"></script>`;

  const authorize = (req: http.IncomingMessage): { session: string } | { status: number } => {
    const session = sessionFromHost(req.headers.host, port, tag);
    if (session === null) return { status: 421 };
    if (!crossSiteAllowed(req)) return { status: 403 };
    // Sin cookie solo pasa lo que el navegador marca como lanzado por una página de ESTE origen, que para
    // existir ya tuvo que entrar con la cookie (fetch con credentials:'omit', el manifiesto de la app) (N-11).
    if (req.headers['sec-fetch-site'] === 'same-origin') return { session };
    const c = readCookie(req.headers.cookie, gateCookie);
    if (c === undefined || !safeEqual(c, token)) return { status: 403 };
    return { session };
  };

  const deny = (res: http.ServerResponse, status: number): void => {
    const p = page(status, 'ViewKeeper', pages.denied, false);
    res.writeHead(p.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(p.html);
  };

  const enter = (url: string, session: string, res: http.ServerResponse): void => {
    const q = new URL(url, 'http://x.invalid').searchParams;
    const set = [`${gateCookie}=${token}; Path=/; HttpOnly; SameSite=None; Secure`];
    const k = q.get('k');
    if (k !== null) {
      // Tique de captura: de un solo uso y de vida corta, para que el testigo no viaje en una línea de órdenes. (H-12)
      const t = tickets.get(k);
      tickets.delete(k);
      if (!t || t.session !== session || t.expires < now()) return deny(res, 403);
      for (const [name, value] of seenCookies.get(session) ?? []) {
        if (!/[\r\n;]/.test(name + value)) set.push(`${name}=${value}; Path=/; SameSite=None; Secure`);
      }
    } else if (!safeEqual(q.get('t') ?? '', token)) return deny(res, 403);
    res.writeHead(302, { location: safeLocalPath(q.get('to')), 'set-cookie': set, 'cache-control': 'no-store' });
    res.end();
  };

  const forward = (req: http.IncomingMessage, res: http.ServerResponse, dest: URL, path: string, ctx: Ctx, mayInject: boolean, apiPrefix?: string, jar?: Map<string, string>): void => {
    const html = mayInject && wantsHtml(req);
    const headers = rewriteRequestHeaders(req.headers, ctx, html);
    headers.host = dest.host; // la API ve su propio Host y, como Origin, el de la app
    const secure = dest.protocol === 'https:';
    const up = (secure ? https : http).request(
      {
        protocol: dest.protocol,
        // Por NOMBRE, nunca 127.0.0.1: Vite escucha solo en ::1 (S-8).
        hostname: dest.hostname,
        port: dest.port || (secure ? 443 : 80),
        method: req.method,
        path,
        headers,
        agent: secure ? agentHttps : agentHttp,
        // Certificado autofirmado solo se tolera contra la propia máquina.
        rejectUnauthorized: !isLoopbackHost(dest.hostname),
      },
      (ur) => {
        const type = String(ur.headers['content-type'] ?? '');
        const status = ur.statusCode ?? 502;
        const enc = ur.headers['content-encoding'];
        const dec = decoder(enc);
        const encoded = enc !== undefined && enc !== 'identity';
        // Solo se inyecta en HTML que se pidió como documento, con cuerpo, y que sabemos leer.
        const injecting = html && type.includes('text/html') && req.method === 'GET' && status !== 204 && status !== 304 && (!encoded || dec !== null);
        if (html && type.includes('text/html') && encoded && dec === null) note(`no agent in ${path}: unknown content-encoding ${enc}`);
        const outHeaders = rewriteResponseHeaders(ur.headers, ctx, { relaxCsp, fixCookies, injecting });
        if (apiPrefix !== undefined && typeof ur.headers.location === 'string') {
          // Una redirección de la API (la barra final, por ejemplo) tiene que volver al paso, no a la app (N-4).
          try {
            const u = new URL(ur.headers.location, dest.origin + path);
            if (u.origin === dest.origin) outHeaders.location = apiPrefix + u.pathname + u.search;
          } catch {
            /* Location ilegible: se deja como vino */
          }
        }
        if (jar) for (const c of ur.headers['set-cookie'] ?? []) if (expiresCookie(c)) jar.delete(c.split('=')[0].trim());
        // Un documento que redirige a otra web: el panel no deja a la celda ir allí y se quedaría en blanco.
        // Se le dice adónde iba (solo el origen: la dirección entera puede llevar un testigo). Las cookies que
        // traía la redirección se conservan.
        if (apiPrefix === undefined && html && status >= 300 && status < 400 && typeof ur.headers.location === 'string') {
          const out = leavesTo(ur.headers.location, ctx, path);
          if (out !== undefined) {
            ur.resume();
            note(`redirect out of the mosaic: ${path.split('?')[0]} -> ${out}`);
            const p = page(200, pages.leftTitle, pages.leftBody.replace('{0}', out), false, pages.back);
            const h: http.OutgoingHttpHeaders = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
            if (outHeaders['set-cookie']) h['set-cookie'] = outHeaders['set-cookie'];
            res.writeHead(p.status, h).end(p.html);
            return;
          }
        }
        res.writeHead(status, outHeaders);
        // Si el servidor corta a media respuesta, la celda tiene que enterarse (un EventSource debe reconectar). (H-9)
        ur.on('aborted', () => res.destroy());
        ur.on('error', () => res.destroy());
        if (!injecting) {
          ur.pipe(res);
          return;
        }
        const inj = createInjector(scriptTag);
        (dec ? ur.pipe(dec) : ur).pipe(inj).pipe(res);
        dec?.on('error', () => res.destroy());
      },
    );
    // Si la celda cierra (recarga, o un flujo de eventos que se abandona), se suelta la conexión con el servidor. (H-9)
    res.on('close', () => {
      if (!res.writableFinished) up.destroy();
    });
    up.on('error', (e) => {
      if (res.destroyed) return;
      note(`no answer from ${dest.origin}${path.split('?')[0]}: ${e.message}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const p = page(502, pages.downTitle.replace('{0}', dest.host), pages.downBody, true);
      res.writeHead(p.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(p.html);
    });
    req.pipe(up);
  };

  const handle = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const url = req.url ?? '/';
    const session0 = sessionFromHost(req.headers.host, port, tag);
    if (session0 === null) {
      res.writeHead(421, { 'content-type': 'text/plain' }).end('Host no admitido');
      return;
    }
    if (url.startsWith(PREFIX + '/enter?')) return enter(url, session0, res);
    const auth = authorize(req);
    if ('status' in auth) return deny(res, auth.status);
    const ctx: Ctx = { target, proxyOrigin: originFor(auth.session) };
    if (url === PREFIX + '/agent.js') {
      // El agente nace sabiendo con quién puede hablar: el origen del panel va incrustado, no se lee de la página. (H-1)
      const body = `var __VK_PANEL=${JSON.stringify(panelOrigin)},__VK_APIS=${JSON.stringify(apis.map((a) => a.origin))};\n${opts.agentSource}`;
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }).end(body);
      return;
    }
    // API en otro puerto: la página la llama por aquí y el servidor de la API ve el origen de la app, no el del proxy.
    if (url.startsWith(PREFIX + '/api/')) {
      const m = /^\/(\d+)(\/.*)$/.exec(url.slice(PREFIX.length + 4));
      const api = m ? apis[Number(m[1])] : undefined;
      if (!m || !api) return deny(res, 404);
      return forward(req, res, api, m[2], ctx, false, `${PREFIX}/api/${m[1]}`);
    }
    if (url.startsWith(PREFIX + '/')) return deny(res, 404);
    // Lo que la sesión manda se recuerda por nombre, para la captura. Una petición sin cookies no borra nada
    // (una cookie con Path no viaja en todas); se olvida cuando la app la caduca, en remember(). (H-12, N-12)
    const jar = seenCookies.get(auth.session) ?? new Map<string, string>();
    for (const pair of (stripGateCookies(req.headers.cookie) ?? '').split(';')) {
      const i = pair.indexOf('=');
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    seenCookies.set(auth.session, jar);
    forward(req, res, target, url, ctx, true, undefined, jar);
  };

  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (e) {
      // Ninguna petición rara debe dejar una conexión colgada ni tirar el host de la extensión. (H-11)
      note(`internal error: ${(e as Error).message}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end();
    }
  });

  // WebSocket (recarga en caliente): túnel TCP con la petición reescrita.
  server.on('upgrade', (req, socket: Duplex, head: Buffer) => {
    const auth = authorize(req);
    const session = 'session' in auth ? auth.session : '';
    // Un WebSocket no pasa por CORS: se exige que lo abra la propia celda.
    if ('status' in auth || req.headers.origin !== originFor(session)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const ctx: Ctx = { target, proxyOrigin: originFor(session) };
    const headers = rewriteRequestHeaders(req.headers, ctx, false);
    headers.connection = 'Upgrade';
    headers.upgrade = req.headers.upgrade ?? 'websocket';
    const secure = target.protocol === 'https:';
    const p = Number(target.port || (secure ? 443 : 80));
    const upstream: net.Socket = secure
      ? tls.connect({ host: target.hostname, port: p, servername: target.hostname, rejectUnauthorized: !isLoopbackHost(target.hostname) })
      : net.connect({ host: target.hostname, port: p });
    sockets.add(socket).add(upstream);
    const drop = (): void => {
      socket.destroy();
      upstream.destroy();
      sockets.delete(socket);
      sockets.delete(upstream);
    };
    upstream.on(secure ? 'secureConnect' : 'connect', () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(headers)) {
        for (const one of Array.isArray(v) ? v : [v]) if (one !== undefined) raw += `${k}: ${String(one)}\r\n`;
      }
      upstream.write(raw + '\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', drop);
    socket.on('error', drop);
    upstream.on('close', drop);
    socket.on('close', drop);
  });

  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  return new Promise((resolve, reject) => {
    // Solo la interfaz local: nunca se escucha en la red. Se intenta primero un puerto derivado del destino:
    // así la misma app vuelve al mismo origen (conserva localStorage) y no deja una cookie de entrada nueva
    // en cada apertura. Si está ocupado —un segundo mosaico de la misma app—, uno cualquiera. (N-13)
    server.once('error', (e: NodeJS.ErrnoException) => {
      // Ocupado, o reservado por el sistema (Windows aparta franjas de puertos para Hyper-V).
      if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') return reject(e);
      server.once('error', reject);
      server.listen(0, '127.0.0.1');
    });
    server.once('listening', () => {
      const addr = server.address() as net.AddressInfo;
      port = addr.port;
      gateCookie = GATE_PREFIX + port;
      resolve({
        port,
        address: addr.address,
        token,
        tag,
        gateCookie,
        originFor,
        entryUrl: (session, path) => `${originFor(session)}${PREFIX}/enter?t=${token}&to=${encodeURIComponent(safeLocalPath(path))}`,
        captureUrl: (session, path) => {
          const k = randomBytes(18).toString('hex');
          tickets.set(k, { session, expires: now() + TICKET_MS });
          return `${originFor(session)}${PREFIX}/enter?k=${k}&to=${encodeURIComponent(safeLocalPath(path))}`;
        },
        setPanelOrigin: (o) => {
          panelOrigin = o;
        },
        diagnostics: () => [`target ${target.origin} · proxy port ${port} · sessions with cookies: ${[...seenCookies].filter(([, j]) => j.size > 0).map(([s]) => s).join(', ') || 'none'}`, ...notes],
        close: () =>
          new Promise<void>((done) => {
            for (const s of sockets) s.destroy();
            agentHttp.destroy();
            agentHttps.destroy();
            server.close(() => done());
          }),
      });
    });
    server.listen(opts.port ?? preferredPort(opts.target), '127.0.0.1');
  });
}
