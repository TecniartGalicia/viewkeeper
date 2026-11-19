// Preguntas de red a servidores de esta máquina. Node puro, sin 'vscode': se prueba en test/unit/probe.test.ts.
import * as http from 'node:http';
import type { Probe } from './ports.ts';

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
    if (u.protocol !== 'http:' || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return resolve(false);
    const req = http.request(
      { host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || 80, path: '/', method: 'OPTIONS', timeout: timeoutMs, headers: { origin: appOrigin, 'access-control-request-method': 'GET' } },
      (res) => {
        res.resume();
        const allow = String(res.headers['access-control-allow-origin'] ?? '');
        resolve(allow === appOrigin || allow === '*');
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}
