// Escáner de seguridad antes de la 0.2.0 (CLAUDE-SECURITY-20261120-071139): una prueba por hallazgo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as net from 'node:net';
import { capture, redirectPage, type CaptureIo } from '../../src/core/capture.ts';
import { normalizeTarget, parseMosaic } from '../../src/core/mosaic.ts';
import { followable } from '../../src/core/probe.ts';
import { preferredPort, sessionFromHost, startProxy, tagFor } from '../../src/core/proxy.ts';
import { cell, fake } from './ayuda.ts';

test('P-83 el tique de captura no va en la línea de órdenes del navegador (F1)', async () => {
  const lineas: string[][] = [];
  const guardadas: string[] = [];
  const borradas: string[] = [];
  const io: CaptureIo = {
    exists: async () => true,
    run: async (_exe, args) => (lineas.push(args), 0),
    stash: async (url) => {
      guardadas.push(url);
      return { href: 'file:///tmp/entrada-x.html', drop: () => void borradas.push(url) };
    },
  };
  const url = 'http://s-main-0123456789abcdef0123456789abcdef.localhost:42000/__viewkeeper/enter?k=TIQUE-SECRETO&to=%2F';
  const r = await capture(io, 'chrome', [{ label: 'a', url: () => url, out: 'a.png', width: 400, height: 800, dpr: 1 }, { label: 'hoja', url: 'file:///tmp/hoja.html', out: 'h.png', width: 400, height: 400, dpr: 1 }], '/tmp/perfil');
  assert.equal(r.ok.length, 2);
  assert.ok(!JSON.stringify(lineas).includes('TIQUE-SECRETO'), 'ningún argumento lleva el tique');
  assert.equal(lineas[0].at(-1), 'file:///tmp/entrada-x.html');
  assert.equal(lineas[1].at(-1), 'file:///tmp/hoja.html', 'lo que ya es local va tal cual');
  assert.deepEqual(guardadas, [url]);
  assert.deepEqual(borradas, [url], 'la página con el tique se borra al terminar');
  // Si no se puede guardar la página privada, no se recurre a la línea de órdenes.
  const sin: CaptureIo = { ...io, stash: async () => Promise.reject(new Error('disco lleno')) };
  lineas.length = 0;
  const r2 = await capture(sin, 'chrome', [{ label: 'a', url, out: 'a.png', width: 400, height: 800, dpr: 1 }], '/tmp/perfil');
  assert.equal(r2.failed.length, 1);
  assert.equal(lineas.length, 0);
  assert.match(redirectPage('http://x/?a=1&b="2"<'), /content="0;url=http:\/\/x\/\?a=1&#38;b=&#34;2&#34;&#60;"/);
});

test('P-84 un dispositivo con un identificador raro no entra en el mosaico (F2)', () => {
  const m = parseMosaic({
    v: 1,
    name: 'm',
    target: 'http://localhost:5173',
    cells: [
      { id: 'a', deviceId: 'iphone-15', path: '/' },
      { id: 'b', deviceId: 'x); [Add the missing devices](command:workbench.action.terminal.sendSequence?%7B%7D) (', path: '/' },
      { id: 'c', deviceId: 'Custom-Mayúsculas', path: '/' },
    ],
  });
  assert.deepEqual(m?.cells.map((c) => c.id), ['a']);
});

test('P-85 la etiqueta de cada destino tiene 128 bits, y el Host de una celda tiene que llevarla entera (F3)', () => {
  const t = tagFor('http://localhost:3000');
  assert.match(t, /^[a-f0-9]{32}$/);
  assert.equal(sessionFromHost(`s-main-${t}.localhost:42000`, 42000, t), 'main');
  assert.equal(sessionFromHost(`s-main-${t.slice(0, 8)}.localhost:42000`, 42000, t.slice(0, 8)), null, 'una etiqueta corta ya no vale');
  assert.notEqual(preferredPort('http://localhost:3000'), 0);
});

test('P-86 si alguien escucha en [::1] en el puerto del proxy, el proxy se va a otro y escucha en las dos direcciones (F4)', async (t) => {
  const app = await fake((_q, r) => void r.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>a</title>'));
  const P = preferredPort(app.origin);
  const intruso = net.createServer((c) => c.end('HTTP/1.1 200 OK\r\ncontent-length: 7\r\n\r\nintruso'));
  const tiene6 = await new Promise<boolean>((r) => {
    intruso.once('error', () => r(false));
    intruso.listen(P, '::1', () => r(true));
  });
  if (!tiene6) {
    await app.close();
    t.skip('esta máquina no tiene IPv6 en ::1 o el puerto está ocupado');
    return;
  }
  const px = await startProxy({ target: app.origin, agentSource: '/*A*/' });
  try {
    assert.notEqual(px.port, P, 'no se queda en un puerto que otro tiene en ::1');
    // Por ::1 contesta el proxy, no un intruso.
    const r = await new Promise<number>((res, rej) => {
      http.get({ host: '::1', port: px.port, path: '/', headers: { host: `s-main-${px.tag}.localhost:${px.port}`, cookie: `${px.gateCookie}=${px.token}`, accept: 'text/html' } }, (x) => (x.resume(), res(x.statusCode ?? 0))).on('error', rej);
    });
    assert.equal(r, 200);
  } finally {
    await px.close();
    await new Promise<void>((r) => intruso.close(() => r()));
    await app.close();
  }
});

test('P-87 la captura repone las cookies con su HttpOnly; las de origen desconocido, HttpOnly (F5)', async () => {
  const app = await fake((req, res) => {
    if (req.url === '/entrar') return void res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': ['sesion=S; Path=/; HttpOnly', 'tema=claro; Path=/'] }).end('<!doctype html><title>a</title>');
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>a</title>');
  });
  const px = await startProxy({ target: app.origin, agentSource: '/*A*/' });
  try {
    await cell(px, '/entrar');
    await cell(px, '/', { cookie: 'sesion=S; tema=claro; dejs=J' });
    const k = new URL(px.captureUrl('main', '/')).search;
    const r = await cell(px, `/__viewkeeper/enter${k}`, { cookie: '', headers: { cookie: '' } });
    const sc = (r.headers['set-cookie'] ?? []).filter((c) => !c.startsWith('__vk_'));
    const de = (n: string): string => sc.find((c) => c.startsWith(n + '=')) ?? '';
    assert.match(de('sesion'), /; HttpOnly$/);
    assert.doesNotMatch(de('tema'), /HttpOnly/, 'la que el servidor puso legible sigue legible');
    assert.match(de('dejs'), /; HttpOnly$/, 'la de origen desconocido, por si acaso, no se deja leer');
  } finally {
    await px.close();
    await app.close();
  }
});

test('P-88 una web publicada sin esquema se abre por https, y nunca se sigue un salto de https a http (F6)', async () => {
  assert.equal(normalizeTarget('app.example.com/x')?.origin, 'https://app.example.com');
  assert.equal(normalizeTarget('neurosinais.argalla.com')?.origin, 'https://neurosinais.argalla.com');
  assert.equal(normalizeTarget('localhost:3000')?.origin, 'http://localhost:3000');
  assert.equal(normalizeTarget('192.168.1.20:8080')?.origin, 'http://192.168.1.20:8080');
  assert.equal(normalizeTarget('mipc:3000')?.origin, 'http://mipc:3000');
  assert.equal(normalizeTarget('3000')?.origin, 'http://localhost:3000');
  assert.equal(normalizeTarget('http://app.example.com')?.origin, 'http://app.example.com', 'lo que se escribe con esquema se respeta');
  const u = (x: string): URL => new URL(x);
  assert.equal(followable(u('http://ejemplo.org/'), u('https://www.ejemplo.org/')), true, 'subir a https sí');
  assert.equal(followable(u('https://ejemplo.org/'), u('http://www.ejemplo.org/')), false, 'bajar a http no');
  assert.equal(followable(u('https://ejemplo.org/'), u('https://www.ejemplo.org/')), true);
  assert.equal(followable(u('https://ejemplo.org/'), u('https://otra.org/')), false);
});
