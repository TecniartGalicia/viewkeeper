// Auditoría A del plan de mejoras (proxy, agente y sondas): una prueba por defecto corregido y por mutante que
// sobrevivía. Los identificadores A-n son los del informe; los de mutante (P6, Q12, R5…), los de su tabla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { isAlias } from '../../src/core/alias.ts';
import { isDevHost } from '../../src/core/mosaic.ts';
import { apiTrustsApp, corsAllows, resolveTarget } from '../../src/core/probe.ts';
import { GATE_PREFIX, domainMark, readDomainMarks, rewriteLocation, startProxy, type RunningProxy } from '../../src/core/proxy.ts';
import { startUpstream } from '../fixtures/upstream.ts';
import { cell, fake } from './ayuda.ts';

const html = (res: http.ServerResponse, body: string, headers: http.OutgoingHttpHeaders = {}): void => void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers }).end(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`);
const json = (r: { body: string }): Record<string, unknown> => JSON.parse(r.body) as Record<string, unknown>;

/** Un servidor en 127.0.0.2: para el código es «otra máquina» (no es localhost ni 127.0.0.1), y está a mano. */
function enOtraIp(handle: http.RequestListener): Promise<{ origin: string; close(): Promise<void> } | undefined> {
  const srv = http.createServer(handle);
  return new Promise((resolve) => {
    srv.once('error', () => resolve(undefined)); // sistemas sin 127.0.0.2: la prueba lo dice y no finge
    srv.listen(0, '127.0.0.2', () =>
      resolve({
        origin: `http://127.0.0.2:${(srv.address() as AddressInfo).port}`,
        close: () => new Promise<void>((d) => (srv.closeAllConnections(), srv.close(() => d()))),
      }),
    );
  });
}

test('P-70 páginas del proxy: escapan lo que insertan, también un «$» del host (A-10, P6, P7)', async () => {
  const app = await fake((req, res) => {
    if (req.url?.startsWith('/dolar')) return void res.writeHead(302, { location: "http://evil$'.example/x?token=SECRETO" }).end();
    html(res, 'app');
  });
  const px = await startProxy({ target: app.origin, agentSource: '/*A*/', pages: { leftTitle: '<b>Fuera</b>', leftBody: '<i>va</i> a {0}', back: '<u>Volver</u>' } });
  try {
    const r = await cell(px, '/dolar?q=PRIVADO');
    assert.ok(r.body.includes('evil$&#39;.example'), r.body);
    assert.ok(!r.body.includes('<b>') && !r.body.includes('<i>') && !r.body.includes('<u>'), 'los textos se escapan');
    assert.ok(r.body.includes('&#60;b&#62;Fuera'));
    assert.ok(!px.diagnostics().join('\n').includes('PRIVADO'), 'el diagnóstico apunta la ruta sin su consulta (P9)');
  } finally {
    await px.close();
    await app.close();
  }
});

test('P-71 Location: alias públicos a través del proxy, y las formas crudas que el navegador lee como absolutas (P8, A-11)', () => {
  const ctx = { target: new URL('https://www.ejemplo.org'), proxyOrigin: 'http://s-main-12345678.localhost:42000' };
  assert.equal(rewriteLocation('http://ejemplo.org/x?a=1#b', ctx), `${ctx.proxyOrigin}/x?a=1#b`);
  assert.equal(rewriteLocation('https://app.ejemplo.org/x', ctx), 'https://app.ejemplo.org/x', 'otro subdominio no es alias');
  const loc = { target: new URL('http://localhost:3000'), proxyOrigin: 'http://s-main-12345678.localhost:42000' };
  assert.equal(rewriteLocation('/\\127.0.0.1:3000/z', loc), `${loc.proxyOrigin}/z`);
  assert.equal(rewriteLocation('h\tttp://127.0.0.1:3000/z', loc), `${loc.proxyOrigin}/z`);
  assert.equal(rewriteLocation('/z', loc), '/z', 'lo relativo no se toca');
});

test('P-72 marcas de Domain: solo de cookies normales, con su caducidad, y nunca para las del proxy (A-5, Q12, Q21)', () => {
  assert.equal(domainMark('sso=1; Path=/; Domain=.Ejemplo.org; Max-Age=60'), '__vk_d_sso=ejemplo.org; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=60');
  assert.match(domainMark('sso=1; Path=/') ?? '', /^__vk_d_sso=; .*Max-Age=0$/, 'sin Domain: se borra la marca');
  assert.match(domainMark('sso=; Domain=ejemplo.org; Max-Age=0') ?? '', /Max-Age=0$/, 'caducada: se borra');
  assert.equal(domainMark('dos=1; Domain=a.org; Domain=b.org'), '__vk_d_dos=b.org; Path=/; HttpOnly; SameSite=None; Secure', 'el último Domain, como el navegador');
  assert.equal(domainMark(`${GATE_PREFIX}42000=x; Domain=localhost`), undefined);
  assert.equal(domainMark('mal nombre=1; Domain=a.org'), undefined);
  assert.deepEqual([...readDomainMarks('a=1; __vk_d_sso=ejemplo.org; __vk_d_x=<b>; __vk_42000=t')], [['sso', 'ejemplo.org']]);
});

test('P-73 API de otro servidor: tope del bote, su cookie gana a la de la app, caducidad, Referer recortado y respuestas en una caja (A-6, A-9, Q13, Q14, Q20, A-16)', async () => {
  let reloj = 1_000_000;
  const api = await fake((req, res) => {
    const headers: http.OutgoingHttpHeaders = { 'content-type': 'text/html' };
    if (req.url === '/muchas') headers['set-cookie'] = Array.from({ length: 70 }, (_, i) => `c${i}=${i}; Path=/`);
    if (req.url === '/breve') headers['set-cookie'] = ['breve=1; Path=/; Max-Age=1', 'tema=oscuro; Path=/'];
    res.writeHead(200, headers).end(JSON.stringify({ cookie: req.headers.cookie ?? '', referer: req.headers.referer ?? null }));
  });
  const app = await fake((req, res) => {
    if (req.url === '/muchas') return html(res, 'x', { 'set-cookie': Array.from({ length: 70 }, (_, i) => `d${i}=${i}; Path=/; Domain=localhost`) });
    html(res, 'app', { 'set-cookie': ['tema=claro; Path=/; Domain=localhost'] });
  });
  const px = await startProxy({ target: app.origin, agentSource: '/*A*/', now: () => reloj, apiOrigins: [{ origin: `http://localhost:${api.port}`, cookies: 'own' }] });
  const pide = async (ruta: string, cookie = '', session = 'main'): Promise<Record<string, unknown> & { headers: http.IncomingHttpHeaders }> => {
    const r = await cell(px, `/__viewkeeper/api/0${ruta}`, { doc: false, cookie, session, headers: { origin: px.originFor(session), referer: `${px.originFor(session)}/pagina?token=SECRETO` } });
    return { ...json(r), headers: r.headers };
  };
  try {
    const marcas = (await cell(px, '/muchas')).headers['set-cookie']?.filter((c) => c.startsWith('__vk_d_')) ?? [];
    assert.equal(marcas.length, 50, 'como mucho 50 marcas por respuesta');
    await pide('/muchas', '', 'admin');
    assert.equal(String((await pide('/x', '', 'admin')).cookie).split('; ').length, 50, 'el bote de una API guarda como mucho 50');
    // La app tiene «tema» con Domain que cubre a la API; la API pone el suyo: le llega el suyo.
    const casa = (await cell(px, '/')).headers['set-cookie']?.find((c) => c.startsWith('__vk_d_tema'))?.split(';')[0] ?? '';
    await pide('/breve');
    const r = await pide('/x', `tema=claro; ${casa}`);
    assert.match(String(r.cookie), /(^|; )tema=oscuro(;|$)/);
    assert.doesNotMatch(String(r.cookie), /tema=claro/);
    assert.match(String(r.cookie), /breve=1/);
    reloj += 1500;
    assert.doesNotMatch(String((await pide('/x')).cookie), /breve=1/, 'Max-Age=1: pasado un segundo y medio ya no viaja');
    assert.equal(r.referer, `${app.origin}/`, 'a una API solo le llega de qué web viene la llamada');
    assert.equal(r.headers['content-security-policy'], 'sandbox');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  } finally {
    await px.close();
    await app.close();
    await api.close();
  }
});

test('P-74 puerto reenviado: cookie de entrada con el puerto que ve el navegador, WebSocket por los dos puertos, puerto 80 sin número (A-7, A-16, T3, T4, T8)', async () => {
  const up = await startUpstream();
  const px = await startProxy({ target: up.origin, agentSource: '/*A*/' });
  const FUERA = px.port === 45000 ? 45001 : 45000;
  const ws = (host: string, origin: string, cookie: string): Promise<string> =>
    new Promise((resolve) => {
      const s = new WebSocket(`ws://127.0.0.1:${px.port}/ws`, { headers: { host, origin, cookie } });
      s.on('open', () => s.send('ping'));
      s.on('message', (d) => (resolve(String(d).split(':')[0]), s.close()));
      s.on('unexpected-response', (_q, r) => resolve('HTTP ' + r.statusCode));
      s.on('error', (e) => resolve('ERROR ' + e.message));
    });
  try {
    px.setPublicPort(-5);
    assert.equal(px.shownPort(), px.port, 'un puerto negativo no se acepta');
    assert.equal(px.gateCookie, `${GATE_PREFIX}${px.port}`);
    px.setPublicPort(FUERA);
    assert.equal(px.gateCookie, `${GATE_PREFIX}${FUERA}`, 'la cookie de entrada lleva el puerto que ve el navegador');
    const gate = `${px.gateCookie}=${px.token}`;
    const h = (p: number): string => `s-main-${px.tag}.localhost:${p}`;
    assert.equal(await ws(h(FUERA), `http://${h(FUERA)}`, gate), 'eco');
    assert.equal(await ws(h(px.port), `http://${h(px.port)}`, gate), 'eco');
    assert.equal(await ws(h(FUERA), `http://${h(px.port)}`, gate), 'HTTP 403', 'Host por un puerto y Origin por el otro');
    assert.equal(await ws(h(px.port), `http://${h(FUERA)}`, gate), 'HTTP 403');
    px.setPublicPort(80);
    const r = await cell(px, '/', { headers: { host: `s-main-${px.tag}.localhost`, cookie: `${px.gateCookie}=${px.token}` } });
    assert.notEqual(r.status, 421, 'por el puerto 80 el navegador no escribe el número');
  } finally {
    await px.close();
    await up.close();
  }
});

test('P-75 sondas: plazo total contra un servidor que gotea, alias con credenciales, 200 con Location, CORS exacto, http de fuera (A-12, R2, R5, R6, R8, R9)', async () => {
  // Gotea una cabecera cada 200 ms: nunca está inactivo, nunca termina.
  const goteo = await fake((_req, res) => {
    res.socket?.write('HTTP/1.1 200 OK\r\n');
    const t = setInterval(() => res.socket?.write(`X-${Date.now()}: a\r\n`), 200);
    res.socket?.on('close', () => clearInterval(t));
  });
  const red = await fake((req, res, self) => {
    if (req.url === '/cred') return void res.writeHead(302, { location: `http://u:p@127.0.0.1:${self.port}/` }).end();
    if (req.url === '/ok-con-location') return void res.writeHead(200, { location: `http://127.0.0.1:${self.port}/otra` }).end('');
    html(res, 'x');
  });
  const otra = await enOtraIp((req, res) => void res.writeHead(204, { 'access-control-allow-origin': String(req.headers.origin ?? '') }).end());
  try {
    let t0 = Date.now();
    const r = await resolveTarget(goteo.origin, '/', 400);
    assert.ok(Date.now() - t0 < 3000, `resolveTarget tardó ${Date.now() - t0} ms`);
    assert.deepEqual(r.hops, []);
    t0 = Date.now();
    assert.equal(await apiTrustsApp(goteo.origin, 'http://localhost:3000', 400), false);
    assert.ok(Date.now() - t0 < 3000, `apiTrustsApp tardó ${Date.now() - t0} ms`);
    assert.deepEqual((await resolveTarget(red.origin, '/cred')).hops, [], 'un alias con credenciales no se sigue');
    assert.deepEqual((await resolveTarget(red.origin, '/ok-con-location')).hops, [], 'solo se sigue un 3xx');
    assert.equal(corsAllows('https://app.ejemplo.org, https://otra', 'https://app.ejemplo.org', false), false);
    assert.equal(corsAllows('https://app.ejemplo.org', 'https://app.ejemplo.or', false), false);
    if (otra) {
      // Contesta que sí a cualquier origen, y está «fuera» de esta máquina: por http no se le pregunta.
      assert.equal(await apiTrustsApp(otra.origin, 'http://localhost:3000', 800), false, 'de fuera, solo https');
      assert.equal(await apiTrustsApp(otra.origin.replace('http://', 'https://u:c@'), 'http://localhost:3000', 800), false);
    }
  } finally {
    await goteo.close();
    await red.close();
    await otra?.close();
  }
});

test('P-76 qué es desarrollo y qué es una web publicada: los casos de la auditoría (A-14, A8, S4, S7)', () => {
  for (const dev of ['http://0.0.0.0:3000', 'http://localhost.:5173', 'http://[::ffff:7f00:1]:3000', 'http://100.101.1.1:3000', 'http://[::]:3000']) assert.equal(isDevHost(dev), true, dev);
  for (const pub of ['http://10.0.0.1.evil.com', 'https://tienda.milan', 'https://shop.evillocal.com', 'http://100.128.0.1', 'http://127.0.0.1.nip.io']) assert.equal(isDevHost(pub), false, pub);
  assert.equal(isAlias(new URL('http://localhost'), new URL('http://127.0.0.1')), false, 'la propia máquina, solo en el mismo puerto explícito');
});

/** Para que la prueba no dependa de la red (P-68 pasaba porque api.ejemplo.org no resuelve). */
test('P-77 un servidor de otra IP que admite cualquier origen no se ofrece si es http', async () => {
  const otra = await enOtraIp((_req, res) => void res.writeHead(204, { 'access-control-allow-origin': '*' }).end());
  if (!otra) return;
  try {
    assert.equal(await apiTrustsApp(otra.origin, 'http://localhost:3000', 800), false);
  } finally {
    await otra.close();
  }
});

export type { RunningProxy };
