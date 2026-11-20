// Preguntas de red a servidores de esta máquina. Node puro, sin 'vscode': se prueba en test/unit/probe.test.ts.
import * as http from 'node:http';
import * as https from 'node:https';
import { isAlias } from './alias.ts';
import type { Probe } from './ports.ts';

export interface Resolved {
  origin: string;
  path: string;
  /** Orígenes por los que pasó, en orden, sin el de partida. Vacío si no hubo redirección de dominio. */
  hops: string[];
}

/**
 * Sigue la redirección al dominio principal: «ejemplo.com» → «https://www.ejemplo.com». Solo entre alias de la
 * misma web (isAlias): una redirección a otro dominio —un inicio de sesión externo, un acortador— no se sigue,
 * porque el mosaico acabaría enseñando otra web. Nunca lanza: ante un fallo devuelve lo que se le dio.
 */
export async function resolveTarget(origin: string, path: string, timeoutMs = 2500, maxHops = 5): Promise<Resolved> {
  const start = { origin, path, hops: [] as string[] };
  let at: URL;
  try {
    at = new URL(path, origin);
  } catch {
    return start;
  }
  const hops: string[] = [];
  for (let i = 0; i < maxHops; i++) {
    const loc = await redirectOf(at, timeoutMs);
    if (loc === undefined) break;
    let next: URL;
    try {
      next = new URL(loc, at);
    } catch {
      break;
    }
    if (!followable(at, next)) break;
    hops.push(next.origin);
    at = next;
  }
  if (hops.length === 0) return start;
  return { origin: at.origin, path: at.pathname + at.search + at.hash, hops };
}

/**
 * ¿Se sigue esta redirección al abrir? Solo a otro origen que sea alias de la misma web (dentro del mismo origen lo
 * resuelve la propia celda; a otra web no se va), sin credenciales y nunca de https a http (F6).
 */
export function followable(at: URL, next: URL): boolean {
  if (next.origin === at.origin || !isAlias(next, at) || next.username !== '' || next.password !== '') return false;
  return !(at.protocol === 'https:' && next.protocol === 'http:');
}

/** ¿Contesta algo por HTTP en ese origen? Cualquier respuesta vale (también un 404 o un 500): hay servidor. */
export async function answers(origin: string, timeoutMs = 700): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return (await ask(u, timeoutMs)) !== undefined;
}

/** El Location de una respuesta 3xx, o undefined si no redirige o no contesta. */
async function redirectOf(u: URL, timeoutMs: number): Promise<string | undefined> {
  const r = await ask(u, timeoutMs);
  return r && r.status >= 300 && r.status < 400 ? r.location : undefined;
}

/** GET sin leer el cuerpo. Un certificado autofirmado solo se tolera contra la propia máquina. */
function ask(u: URL, timeoutMs: number): Promise<{ status: number; location: string | undefined } | undefined> {
  return new Promise((resolve) => {
    const secure = u.protocol === 'https:';
    const req = (secure ? https : http).request(
      { protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (secure ? 443 : 80), path: u.pathname + u.search, method: 'GET', timeout: timeoutMs, headers: { accept: 'text/html', 'user-agent': 'ViewKeeper' }, rejectUnauthorized: !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) },
      (res) => {
        const loc = res.headers.location;
        res.destroy();
        resolve({ status: res.statusCode ?? 0, location: typeof loc === 'string' ? loc : undefined });
      },
    );
    const total = setTimeout(() => {
      req.destroy();
      resolve(undefined);
    }, timeoutMs * 2);
    req.on('close', () => clearTimeout(total));
    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
    req.on('error', () => resolve(undefined));
    req.end();
  });
}

/**
 * Siempre por NOMBRE («localhost»), nunca 127.0.0.1: Vite escucha solo en ::1 (sonda S-8)
 * y Node prueba las dos familias por su cuenta.
 */
export function probePort(port: number, timeoutMs = 700): Promise<Probe | undefined> {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port, path: '/', headers: { accept: 'text/html' }, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => {
        body += c;
        if (body.length >= 4096) {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
          req.destroy();
        }
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      res.on('error', () => resolve(undefined));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
    req.on('error', () => resolve(undefined));
  });
}

/**
 * ¿La respuesta CORS de la API nombra a la app? En esta máquina vale también «*». Fuera, tiene que nombrarla
 * tal cual: una API que admite a cualquiera ya funciona sin el proxy, y «*» no distingue a esta app de otra.
 */
export function corsAllows(allowOrigin: string | string[] | undefined, appOrigin: string, local: boolean): boolean {
  const allow = String(Array.isArray(allowOrigin) ? allowOrigin[0] : (allowOrigin ?? '')).trim();
  return allow === appOrigin || (local && allow === '*');
}

/**
 * ¿Esta API ya se fía del origen de la app? Se le pregunta desde aquí, con el Origin de la app, y se mira su
 * respuesta CORS. Es lo que impide que una página fabrique un aviso para que el proxy le abra un servicio
 * local cualquiera (el puerto de depuración de un navegador, un Docker): esos no contestan con ese permiso. (N-6)
 */
export function apiTrustsApp(apiOrigin: string, appOrigin: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(apiOrigin);
    } catch {
      return resolve(false);
    }
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    // De esta máquina, por http (como hasta ahora). De fuera, solo https.
    if (!(local ? u.protocol === 'http:' : u.protocol === 'https:') || u.username !== '' || u.password !== '') return resolve(false);
    const secure = u.protocol === 'https:';
    const req = (secure ? https : http).request(
      { protocol: u.protocol, host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (secure ? 443 : 80), path: '/', method: 'OPTIONS', timeout: local ? timeoutMs : Math.max(timeoutMs, 4000), headers: { origin: appOrigin, 'access-control-request-method': 'GET' } },
      (res) => {
        res.resume();
        resolve(corsAllows(res.headers['access-control-allow-origin'], appOrigin, local));
      },
    );
    // El plazo de node es de inactividad: un servidor que gotea bytes lo esquivaría. Este es total (A-12).
    const total = setTimeout(() => {
      req.destroy();
      resolve(false);
    }, timeoutMs * 2);
    req.on('close', () => clearTimeout(total));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}
