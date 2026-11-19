// Servidor sintético de la sonda: reúne en una app todo lo que rompe a un iframe a secas.
import * as http from 'node:http';
import * as zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';

const alto = '<div style="height:4000px;background:linear-gradient(#eee,#999)"></div>';
const estilo = '<style>body{margin:0;font:16px system-ui} @media (max-width:500px){body{background:#fee}}</style>';

function pagina(marca: string, extra = ''): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${marca}</title>${estilo}</head><body><h1>${marca}</h1><input id="q" placeholder="buscar"><a id="lnk" href="/b">ir a B</a>${extra}${alto}<p id="fin">fin</p></body></html>`;
}

export interface Upstream {
  origin: string;
  close(): Promise<void>;
}

export function startUpstream(): Promise<Upstream> {
  const wss = new WebSocketServer({ noServer: true });
  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const html = (body: string, headers: http.OutgoingHttpHeaders = {}): void => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers }).end(body);
    };
    if (url === '/') {
      // Las dos cabeceras con las que una app prohíbe que la incrusten.
      html(pagina('PAGINA-A'), { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'; default-src 'self' 'unsafe-inline'" });
    } else if (url === '/b') {
      html(pagina('PAGINA-B'));
    } else if (url === '/login') {
      html(pagina('LOGIN-OK'), {
        'set-cookie': ['sid=abc; Path=/; HttpOnly', 'lax=1; Path=/; SameSite=Lax', 'estricta=1; Path=/; SameSite=Strict', 'condominio=1; Path=/; Domain=localhost'],
      });
    } else if (url === '/whoami') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          cookie: req.headers.cookie ?? '',
          host: req.headers.host,
          origin: req.headers.origin ?? null,
          referer: req.headers.referer ?? null,
          ua: req.headers['user-agent'],
        }),
      );
    } else if (url === '/logout') {
      html(pagina('ADIOS'), { 'set-cookie': ['rol=; Path=/; Max-Age=0', 'sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'] });
    } else if (url === '/con-api') {
      // Una app cuyo frontal llama a su API en otro puerto (P-47). Escribe en la página lo que obtuvo.
      const api = new URL(req.url ?? '/', 'http://x').searchParams.get('api') ?? '';
      html(`<!doctype html><html><head><meta charset="utf-8"><title>con api</title></head><body><p id="r">esperando</p><script>
        fetch(${JSON.stringify(api)} + '/datos', { method: 'POST', body: 'hola', headers: { 'content-type': 'text/plain' } })
          .then(function (r) { return r.text(); })
          .then(function (t) { document.getElementById('r').textContent = 'API-OK:' + t; }, function () { document.getElementById('r').textContent = 'API-FALLA'; });
      </script></body></html>`);
    } else if (url === '/eco') {
      // Devuelve el cuerpo recibido: prueba que un POST llega entero.
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(Buffer.concat(chunks)));
    } else if (url === '/sinhead') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength('<!doctype html><p>sin cabeza</p>') }).end('<!doctype html><p>sin cabeza</p>');
    } else if (url === '/pisa') {
      // Una app que intenta pisar la cookie de entrada del proxy.
      html(pagina('PISA'), { 'set-cookie': ['__vk_' + (req.headers['x-puerto'] ?? '0') + '=malo; Path=/', 'mia=1; Path=/'] });
    } else if (url === '/redir') {
      const self = `http://${req.headers.host}`;
      res.writeHead(302, { location: `${self}/b` }).end();
    } else if (url === '/gz') {
      // Un servidor que comprime aunque se le pida identity.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' }).end(zlib.gzipSync(pagina('PAGINA-GZ')));
    } else if (url === '/stream') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.write('<!doctype html><html><head><meta charset="utf-8"><title>STREAM</title>');
      setTimeout(() => res.write('</head><body><h1>STREAM-1</h1>'), 500);
      setTimeout(() => res.end('<p>STREAM-2</p></body></html>'), 1000);
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('no existe');
    }
  });
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (data) => ws.send(`eco:${String(data)}:origen=${req.headers.origin ?? ''}:host=${req.headers.host ?? ''}`));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        origin: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((done) => {
            wss.close();
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Una API en otro puerto que solo admite por CORS el origen de la app (P-47). */
export function startApi(appOrigin: string): Promise<Upstream> {
  const server = http.createServer((req, res) => {
    const cors = { 'access-control-allow-origin': appOrigin, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', vary: 'origin' };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ origen: req.headers.origin ?? null, cuerpo: Buffer.concat(chunks).toString() })));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        origin: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
