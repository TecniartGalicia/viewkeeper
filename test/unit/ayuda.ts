// Ayudas comunes de las pruebas del plan de mejoras: peticiones a una celda del proxy y servidores de pruebas.
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RunningProxy } from '../../src/core/proxy.ts';

export interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}
/** Petición a una celda del proxy, como la haría el iframe (documento) o un fetch de la página. */
export function cell(p: RunningProxy, path: string, o: { session?: string; doc?: boolean; method?: string; body?: string; headers?: Record<string, string>; cookie?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {
    host: `s-${o.session ?? 'main'}-${p.tag}.localhost:${p.port}`,
    cookie: `${p.gateCookie}=${p.token}${o.cookie ? '; ' + o.cookie : ''}`,
    ...(o.doc === false ? { 'sec-fetch-dest': 'empty', accept: '*/*' } : { 'sec-fetch-dest': 'iframe', accept: 'text/html' }),
    ...o.headers,
  };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: p.port, path, method: o.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(o.body);
  });
}
export interface Fake {
  origin: string;
  port: number;
  seen: { method: string; url: string; headers: http.IncomingHttpHeaders }[];
  close(): Promise<void>;
}
export function fake(handle: (req: http.IncomingMessage, res: http.ServerResponse, self: Fake) => void): Promise<Fake> {
  const seen: Fake['seen'] = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    handle(req, res, self);
  });
  let self: Fake;
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      self = {
        origin: `http://localhost:${port}`,
        port,
        seen,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      };
      resolve(self);
    });
  });
}
