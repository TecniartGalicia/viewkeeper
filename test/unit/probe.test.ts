// Detección del servidor de desarrollo y comprobación CORS de una API, contra servidores reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { apiTrustsApp, probePort } from '../../src/core/probe.ts';
import { detect } from '../../src/core/ports.ts';

function servidor(host: string, handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    s.once('error', reject);
    s.listen(0, host, () =>
      resolve({
        port: (s.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((r) => {
            s.closeAllConnections();
            s.close(() => r());
          }),
      }),
    );
  });
}

const vite = '<!doctype html><html><head><script type="module" src="/@vite/client"></script></head><body></body></html>';

test('P-43 un servidor que solo escucha en ::1 (como Vite) se detecta', async (t) => {
  let s: Awaited<ReturnType<typeof servidor>>;
  try {
    s = await servidor('::1', (_q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(vite));
  } catch {
    t.skip('esta máquina no tiene IPv6 en la interfaz local');
    return;
  }
  try {
    const p = await probePort(s.port);
    assert.equal(p?.status, 200);
    assert.deepEqual(await detect([s.port], (port) => probePort(port)), [{ port: s.port, origin: `http://localhost:${s.port}`, framework: 'Vite' }]);
  } finally {
    await s.close();
  }
});

test('P-43b y uno que solo escucha en 127.0.0.1 también; un puerto sin nadie no se cuelga', async () => {
  const s = await servidor('127.0.0.1', (_q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><p>hola'));
  try {
    assert.equal((await probePort(s.port))?.status, 200);
  } finally {
    await s.close();
  }
  const t0 = Date.now();
  assert.equal(await probePort(9), undefined);
  assert.ok(Date.now() - t0 < 1500);
});

test('P-47a una API solo se pasa por el proxy si ya admite por CORS el origen de la app (N-6)', async () => {
  const app = 'http://localhost:5173';
  const conCors = await servidor('127.0.0.1', (q, r) => r.writeHead(204, { 'access-control-allow-origin': q.headers.origin === app ? app : 'http://otra' }).end());
  const abierta = await servidor('127.0.0.1', (_q, r) => r.writeHead(204, { 'access-control-allow-origin': '*' }).end());
  const sinCors = await servidor('127.0.0.1', (_q, r) => r.writeHead(200, { 'content-type': 'application/json' }).end('{"Version":"docker"}'));
  try {
    assert.equal(await apiTrustsApp(`http://127.0.0.1:${conCors.port}`, app), true);
    assert.equal(await apiTrustsApp(`http://127.0.0.1:${conCors.port}`, 'http://localhost:3000'), false, 'otra app no');
    assert.equal(await apiTrustsApp(`http://localhost:${abierta.port}`, app), true, 'CORS abierto a todos');
    assert.equal(await apiTrustsApp(`http://127.0.0.1:${sinCors.port}`, app), false, 'un servicio local sin CORS (Docker, depuración) no');
    assert.equal(await apiTrustsApp('http://192.168.1.10:80', app), false, 'fuera de esta máquina no se pregunta');
    assert.equal(await apiTrustsApp('https://localhost:1', app), false);
    assert.equal(await apiTrustsApp('no es una url', app), false);
    assert.equal(await apiTrustsApp('http://127.0.0.1:9', app), false, 'nadie escuchando');
  } finally {
    await conCors.close();
    await abierta.close();
    await sinCors.close();
  }
});
