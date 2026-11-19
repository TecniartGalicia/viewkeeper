// Pruebas del proxy contra servidores reales en la propia máquina. Sin navegador.
// Varias nacen de la auditoría: se rompió el código de once maneras y diez pasaban. Cada una de esas
// tiene ahora una afirmación que falla si el código se rompe igual (marcadas «mutante»).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { Readable } from 'node:stream';
import { GATE_PREFIX, PREFIX, createInjector, crossSiteAllowed, expiresCookie, findInsertion, preferredPort, rewriteLocation, rewriteSetCookie, safeLocalPath, sessionFromHost, startProxy, stripGateCookies, tagFor, type RunningProxy } from '../../src/core/proxy.ts';
import { startUpstream, type Upstream } from '../fixtures/upstream.ts';

let up: Upstream;
let px: RunningProxy;
const AGENT = '/*AGENTE*/';

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}
interface Opt {
  session?: string;
  cookie?: string | false;
  host?: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  proxy?: RunningProxy;
}
const hostOf = (p: RunningProxy, session = 'main'): string => `s-${session}-${p.tag}.localhost:${p.port}`;
function get(path: string, o: Opt = {}): Promise<Res> {
  const p = o.proxy ?? px;
  const headers: Record<string, string> = { host: o.host ?? hostOf(p, o.session), accept: 'text/html', ...o.headers };
  if (o.cookie !== false) headers.cookie = o.cookie ?? `${p.gateCookie}=${p.token}`;
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
const json = <T>(r: Res): T => JSON.parse(r.body) as T;
const api = { 'sec-fetch-dest': 'empty' };

before(async () => {
  up = await startUpstream();
  px = await startProxy({ target: up.origin, agentSource: AGENT });
  px.setPanelOrigin('vscode-webview://panel-de-prueba');
});
after(async () => {
  await px.close();
  await up.close();
});

test('P-01 sin la cookie de entrada no se sirve nada; se compara entera (mutante)', async () => {
  assert.equal((await get('/', { cookie: false })).status, 403);
  assert.equal((await get('/', { cookie: `${px.gateCookie}=${'0'.repeat(48)}` })).status, 403);
  assert.equal((await get('/', { cookie: `${px.gateCookie}=${px.token.slice(0, 47)}` })).status, 403, 'un prefijo del testigo no vale');
  assert.equal((await get('/', { cookie: `${px.gateCookie}=${px.token}x` })).status, 403);
  assert.equal((await get(`${PREFIX}/agent.js`, { cookie: false })).status, 403);
  // La cookie de entrada de OTRO mosaico (otro puerto) no abre este.
  assert.equal((await get('/', { cookie: `${GATE_PREFIX}1=${px.token}` })).status, 403);
});

test('P-02 un Host que no es s-<sesión>-<etiqueta>.localhost:<puerto> se rechaza (DNS rebinding)', async () => {
  const bad = [`evil.com:${px.port}`, `127.0.0.1:${px.port}`, `localhost:${px.port}`, `s-main-${px.tag}.localhost:1`, `s-main-${px.tag}.evil.com:${px.port}`, `s-a_b-${px.tag}.localhost:${px.port}`, `s-main-00000000.localhost:${px.port}`, `s-main.localhost:${px.port}`];
  for (const host of bad) assert.equal((await get('/', { host })).status, 421, host);
  assert.equal(sessionFromHost(`s-admin-${px.tag}.localhost:${px.port}`, px.port, px.tag), 'admin');
  assert.equal(sessionFromHost(`S-Admin-${px.tag}.LOCALHOST:${px.port}`, px.port, px.tag), 'admin');
  assert.equal(sessionFromHost(undefined, px.port, px.tag), null);
  assert.equal(tagFor('http://localhost:3000/ruta'), tagFor('http://localhost:3000'), 'la etiqueta depende del origen, no de la ruta');
  assert.notEqual(tagFor('http://localhost:3000'), tagFor('http://localhost:3001'));
});

test('P-03 la entrada deja la cookie y redirige solo a rutas locales y codificadas', async () => {
  const ok = await get(`${PREFIX}/enter?t=${px.token}&to=${encodeURIComponent('/b?x=1')}`, { cookie: false });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.location, '/b?x=1');
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.match(String(ok.headers['set-cookie']), new RegExp(`^${px.gateCookie}=${px.token}; Path=/; HttpOnly; SameSite=None; Secure$`));
  assert.equal((await get(`${PREFIX}/enter?t=mal&to=/`, { cookie: false })).status, 403);
  // Intentos de salir, incluidos los que el navegador «arregla» quitando tabuladores y saltos de línea.
  for (const to of ['//evil.com', 'https://evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', '\t//evil.com', 'evil.com', '', '/.//evil.com', '/..//evil.com', '/x/..//evil.com', '/./\\evil.com']) {
    const r = await get(`${PREFIX}/enter?t=${px.token}&to=${encodeURIComponent(to)}`, { cookie: false });
    assert.equal(r.status, 302, JSON.stringify(to));
    assert.equal(r.headers.location, '/', JSON.stringify(to));
  }
  // Rutas con caracteres no ASCII: antes tiraban el manejador; ahora salen codificadas.
  assert.equal((await get(`${PREFIX}/enter?t=${px.token}&to=${encodeURIComponent('/año/€?q=ñ')}`, { cookie: false })).headers.location, '/a%C3%B1o/%E2%82%AC?q=%C3%B1');
  assert.equal(safeLocalPath(null), '/');
  assert.equal(safeLocalPath('/a b'), '/a%20b');
});

test('P-04 se quitan las cabeceras que prohíben incrustar y se inyecta el agente una vez', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-frame-options'], undefined);
  assert.equal(r.headers['content-security-policy'], undefined);
  assert.equal(r.headers['cache-control'], 'no-store', 'mutante: el documento inyectado no se guarda en caché');
  assert.equal(r.body.split(`${PREFIX}/agent.js`).length - 1, 1);
  assert.ok(r.body.indexOf(`${PREFIX}/agent.js`) < r.body.indexOf('<title>'), 'el agente va antes que nada de la página');
  assert.match(r.body, /PAGINA-A/);
  // El agente sale con el origen del panel incrustado: es lo único con lo que hablará.
  const a = await get(`${PREFIX}/agent.js`);
  // …y con los orígenes que son la propia app (plan de mejoras, M3), para no salir de la celda por un enlace con el dominio completo.
  const puerto = new URL(up.origin).port;
  assert.equal(a.body, `var __VK_PANEL="vscode-webview://panel-de-prueba",__VK_APIS=[],__VK_TARGETS=${JSON.stringify([up.origin, ...['localhost', '127.0.0.1', '[::1]'].map((h) => `http://${h}:${puerto}`).filter((o) => o !== up.origin)])};\n${AGENT}`);
  assert.equal(a.headers['cache-control'], 'no-store');
});

test('P-05 HTML comprimido a la fuerza: se descomprime, se inyecta y no se anuncia comprimido', async () => {
  const r = await get('/gz');
  assert.equal(r.headers['content-encoding'], undefined);
  assert.match(r.body, /PAGINA-GZ/);
  assert.match(r.body, /agent\.js/);
});

test('P-06 lo que no es un documento pasa intacto y sin agente', async () => {
  const j = json<{ host: string; cookie: string }>(await get('/whoami', { headers: { accept: 'application/json', ...api } }));
  assert.equal('http://' + j.host, up.origin, 'el servidor ve su propio Host');
  assert.equal(j.cookie, '', 'la cookie de entrada no llega al servidor del usuario');
  assert.doesNotMatch((await get('/b', { headers: api })).body, /agent\.js/, 'HTML pedido por fetch no se toca');
  assert.equal((await get('/', { method: 'HEAD' })).body, '');
});

test('P-07 cookies: se reescriben, la nuestra no se filtra y la app no puede pisarla', async () => {
  const sc = (await get('/login')).headers['set-cookie'] ?? [];
  assert.equal(sc.length, 4);
  for (const c of sc) {
    assert.match(c, /; SameSite=None; Secure$/);
    assert.doesNotMatch(c, /domain=/i);
    assert.doesNotMatch(c, /samesite=(lax|strict)/i);
  }
  assert.match(sc[0], /^sid=abc; Path=\/; HttpOnly;/);
  assert.equal(rewriteSetCookie('a=1; Secure; SameSite=Strict; Partitioned'), 'a=1; SameSite=None; Secure');
  assert.equal(rewriteSetCookie('__Host-a=1; Path=/; SECURE; samesite=LAX; Expires=Wed, 21 Oct 2026 07:28:00 GMT'), '__Host-a=1; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; SameSite=None; Secure');
  assert.equal(stripGateCookies(`a=1; ${px.gateCookie}=x; ${GATE_PREFIX}999=y; b=2`), 'a=1; b=2');
  assert.equal(stripGateCookies(`${px.gateCookie}=x`), undefined);
  assert.equal(json<{ cookie: string }>(await get('/whoami', { cookie: `${px.gateCookie}=${px.token}; sid=abc; ${GATE_PREFIX}1=otro`, headers: api })).cookie, 'sid=abc');
  const pisa = (await get('/pisa', { headers: { 'x-puerto': String(px.port) } })).headers['set-cookie'] ?? [];
  assert.deepEqual(pisa.map((c) => c.split('=')[0]), ['mia'], 'el Set-Cookie con nuestro nombre se descarta');
  // Con la reescritura apagada las cookies pasan como las mandó el servidor.
  const crudo = await startProxy({ target: up.origin, agentSource: AGENT, fixCookies: false });
  try {
    assert.deepEqual((await get('/login', { proxy: crudo })).headers['set-cookie']?.[1], 'lax=1; Path=/; SameSite=Lax');
  } finally {
    await crudo.close();
  }
});

test('P-08 Location: lo que apunta al servidor vuelve al proxy; lo ajeno y lo relativo no se tocan (mutante)', async () => {
  const r = await get('/redir');
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, `http://${hostOf(px)}/b`);
  const ctx = { target: new URL('http://localhost:3000'), proxyOrigin: 'http://s-main-aaaaaaaa.localhost:9' };
  const P = ctx.proxyOrigin;
  assert.equal(rewriteLocation('http://localhost:3000/a?b#c', ctx), `${P}/a?b#c`);
  assert.equal(rewriteLocation('HTTP://LOCALHOST:3000/a', ctx), `${P}/a`);
  assert.equal(rewriteLocation('http://127.0.0.1:3000/a', ctx), `${P}/a`, 'alias de la propia máquina con el mismo puerto');
  assert.equal(rewriteLocation('//localhost:3000/a', ctx), `${P}/a`);
  assert.equal(rewriteLocation('http://localhost:3000', ctx), `${P}/`);
  assert.equal(rewriteLocation('/relativa?x=1', ctx), '/relativa?x=1');
  assert.equal(rewriteLocation('otra', ctx), 'otra');
  assert.equal(rewriteLocation('http://localhost:30001/a', ctx), 'http://localhost:30001/a', 'un prefijo no basta');
  assert.equal(rewriteLocation('http://localhost:3000.evil.com/a', ctx), 'http://localhost:3000.evil.com/a');
  assert.equal(rewriteLocation('https://accounts.example.com/login', ctx), 'https://accounts.example.com/login');
});

test('P-09 Origin y Referer llegan al servidor con SU origen; un origen ajeno no se disfraza', async () => {
  const o = `http://${hostOf(px)}`;
  const w = json<{ origin: string; referer: string }>(await get('/whoami', { headers: { ...api, origin: o, referer: `${o}/pagina` } }));
  assert.equal(w.origin, up.origin);
  assert.equal(w.referer, `${up.origin}/pagina`);
  assert.equal(json<{ origin: string }>(await get('/whoami', { headers: { ...api, origin: 'http://evil.com' } })).origin, 'http://evil.com');
  assert.equal(json<{ referer: string }>(await get('/whoami', { headers: { ...api, referer: `${o}.evil.com/x` } })).referer, `${o}.evil.com/x`);
});

test('P-10 WebSocket: exige cookie, Host y que lo abra la propia celda (mutantes)', async () => {
  const open = (o: { cookie?: string; host?: string; origin?: string }): Promise<string> =>
    new Promise((resolve) => {
      const headers: Record<string, string> = { host: o.host ?? hostOf(px), origin: o.origin ?? `http://${hostOf(px)}` };
      if (o.cookie) headers.cookie = o.cookie;
      const ws = new WebSocket(`ws://127.0.0.1:${px.port}/ws`, { headers });
      ws.on('open', () => ws.send('ping'));
      ws.on('message', (d) => {
        resolve(String(d));
        ws.close();
      });
      ws.on('error', (e) => resolve('ERROR ' + e.message));
      ws.on('unexpected-response', (_req, res) => resolve('HTTP ' + res.statusCode));
    });
  const gate = `${px.gateCookie}=${px.token}`;
  assert.equal(await open({ cookie: gate }), `eco:ping:origen=${up.origin}:host=${up.origin.slice(7)}`);
  assert.equal(await open({}), 'HTTP 403');
  assert.equal(await open({ cookie: gate, host: `evil.com:${px.port}` }), 'HTTP 403', 'Host ajeno');
  assert.equal(await open({ cookie: gate, origin: 'http://evil.com' }), 'HTTP 403', 'abierto desde otra página');
  assert.equal(await open({ cookie: gate, origin: `http://${hostOf(px, 'otra')}` }), 'HTTP 403', 'abierto desde otra sesión');
});

test('P-11 HTML en streaming: el agente sale con el primer trozo, sin esperar al final', async () => {
  const t0 = Date.now();
  let first = 0;
  let body = '';
  await new Promise<void>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: px.port, path: '/stream', headers: { host: hostOf(px), accept: 'text/html', cookie: `${px.gateCookie}=${px.token}` } }, (res) => {
        res.on('data', (c: Buffer) => {
          if (!first) first = Date.now() - t0;
          body += c.toString();
        });
        res.on('end', resolve);
      })
      .on('error', reject);
  });
  assert.ok(first < 400, `primer trozo a los ${first} ms`);
  assert.ok(Date.now() - t0 >= 900);
  assert.equal(body.split('agent.js').length - 1, 1);
  assert.match(body, /STREAM-2/);
});

test('P-12 inyector: nunca antes del doctype, ni dentro de un comentario, ni partiendo un atributo', async () => {
  const run = async (chunks: (string | Buffer)[]): Promise<string> => {
    const out: Buffer[] = [];
    for await (const c of Readable.from(chunks.map((c) => Buffer.from(c))).pipe(createInjector('[A]'))) out.push(c as Buffer);
    return Buffer.concat(out).toString();
  };
  assert.equal(await run(['<html><he', 'ad lang="x"', '><title>t</title>']), '<html><head lang="x">[A]<title>t</title>');
  assert.equal(await run(['<!DOCTYPE html>\n<HTML>\n<HEAD>', 'x']), '<!DOCTYPE html>\n<HTML>\n<HEAD>[A]x');
  // Sin <head>: tras el doctype (y tras <html>), nunca delante. Delante pondría la página en modo quirks.
  assert.equal(await run(['<!doctype html><p>sin cabeza</p>']), '<!doctype html>[A]<p>sin cabeza</p>');
  assert.equal(await run(['<!doctype html><html lang="es"><body>x']), '<!doctype html><html lang="es">[A]<body>x');
  assert.equal(await run(['<p>sin nada</p>']), '[A]<p>sin nada</p>');
  assert.equal(await run(['<header>no es head</header>']), '[A]<header>no es head</header>');
  // Un comentario que menciona <head> no engaña, y un «>» dentro de un atributo no cierra la etiqueta.
  assert.equal(await run(['<!doctype html><!-- el <head> va luego --><html><head>x']), '<!doctype html><!-- el <head> va luego --><html><head>[A]x');
  assert.equal(await run(['<html data-x="a>b"><head data-y=\'c>d\'>x']), '<html data-x="a>b"><head data-y=\'c>d\'>[A]x');
  // BOM: el agente va detrás.
  assert.equal(await run([Buffer.from([0xef, 0xbb, 0xbf]), '<!doctype html><head>x']), '﻿<!doctype html><head>[A]x');
  // Multibyte partido entre trozos: no se corrompe.
  const euro = Buffer.from('<head><title>€</title>');
  assert.equal(await run([euro.subarray(0, 14), euro.subarray(14)]), '<head>[A]<title>€</title>');
  assert.equal(await run([]), '[A]');
  assert.ok((await run(['<!doctype html>' + ' '.repeat(70000), '<head>'])).startsWith('<!doctype html>[A]'), 'pasado el límite se inserta en la mejor posición vista');
  assert.equal(findInsertion('<!doctype html><he', false), -1, 'con la etiqueta a medias se espera');
  assert.equal(findInsertion('<!-- sin cerrar', false), -1);
});

test('P-13 el cuerpo de un POST llega entero (mutante) y las cabeceras de longitud son coherentes al inyectar', async () => {
  const cuerpo = 'a=1&b=' + 'x'.repeat(70000);
  const r = await get('/eco', { method: 'POST', body: cuerpo, headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(cuerpo.length), ...api } });
  assert.equal(r.body, cuerpo);
  // El servidor mandó Content-Length del documento original; al inyectar no puede conservarse.
  const s = await get('/sinhead');
  assert.equal(s.headers['content-length'], undefined, 'mutante: longitud original conservada');
  assert.equal(s.body, `<!doctype html><script src="${PREFIX}/agent.js"></script><p>sin cabeza</p>`);
});

test('P-14 servidor caído: la celda recibe una página que se reintenta sola, no un error del navegador', async () => {
  const solo = await startProxy({ target: 'http://localhost:9', agentSource: AGENT });
  try {
    const r = await get('/', { proxy: solo });
    assert.equal(r.status, 502);
    assert.match(r.body, /http-equiv="refresh"/);
    assert.ok(solo.diagnostics().some((l) => l.includes('no answer from http://localhost:9')));
  } finally {
    await solo.close();
  }
});

test('P-15 captura: tique de un solo uso, solo para su sesión, y sin el testigo en la URL', async () => {
  await get('/whoami', { session: 'admin', cookie: `${px.gateCookie}=${px.token}; rol=admin`, headers: api });
  const url = new URL(px.captureUrl('admin', '/b'));
  assert.ok(!url.href.includes(px.token), 'el testigo no viaja en la línea de órdenes');
  const path = url.pathname + url.search;
  // En otra sesión no vale, y además se gasta.
  const otra = new URL(px.captureUrl('admin', '/'));
  assert.equal((await get(otra.pathname + otra.search, { session: 'invitado', cookie: false })).status, 403);
  assert.equal((await get(otra.pathname + otra.search, { session: 'admin', cookie: false })).status, 403, 'gastado por el intento anterior');
  const a = await get(path, { session: 'admin', cookie: false });
  assert.equal(a.status, 302);
  assert.equal(a.headers.location, '/b');
  assert.ok((a.headers['set-cookie'] ?? []).some((c) => c.startsWith('rol=admin;')));
  assert.equal((await get(path, { session: 'admin', cookie: false })).status, 403, 'segundo uso');
  // Una petición que no trae la cookie (tiene Path, o es de un recurso) no borra lo recordado (N-12)…
  await get('/whoami', { session: 'admin', headers: api });
  const sigue = new URL(px.captureUrl('admin', '/'));
  assert.ok(((await get(sigue.pathname + sigue.search, { session: 'admin', cookie: false })).headers['set-cookie'] ?? []).some((c) => c.startsWith('rol=admin;')));
  // …se olvida cuando la app la caduca: tras cerrar sesión, la captura no reproduce la antigua.
  await get('/logout', { session: 'admin', cookie: `${px.gateCookie}=${px.token}; rol=admin` });
  const b = new URL(px.captureUrl('admin', '/'));
  assert.equal(((await get(b.pathname + b.search, { session: 'admin', cookie: false })).headers['set-cookie'] ?? []).length, 1);
  assert.ok(expiresCookie('a=; Max-Age=0') && expiresCookie('a=; max-age=-1') && expiresCookie('a=; Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
  assert.ok(!expiresCookie('a=1; Max-Age=3600') && !expiresCookie('a=1; Path=/') && !expiresCookie('a=1; Expires=Fri, 01 Jan 2100 00:00:00 GMT'));
  // Caducidad
  let reloj = 1_000;
  const lento = await startProxy({ target: up.origin, agentSource: AGENT, now: () => reloj });
  try {
    const c = new URL(lento.captureUrl('main', '/'));
    reloj += 61_000;
    assert.equal((await get(c.pathname + c.search, { proxy: lento, cookie: false })).status, 403);
  } finally {
    await lento.close();
  }
});

test('P-16 el proxy escucha solo en la interfaz local (mutante) y cada mosaico tiene su cookie', async () => {
  assert.equal(px.address, '127.0.0.1');
  // El puerto sale del destino: la misma app vuelve al mismo origen y no acumula cookies de entrada (N-13).
  assert.equal(px.port, preferredPort(up.origin), 'si falla, ese puerto está ocupado o reservado en este equipo');
  assert.equal(preferredPort('http://localhost:3000/x'), preferredPort('http://localhost:3000'));
  assert.ok(preferredPort('http://localhost:3000') >= 42000 && preferredPort('http://localhost:3000') < 48000);
  const otro = await startProxy({ target: up.origin, agentSource: AGENT });
  try {
    assert.notEqual(otro.port, px.port, 'con el preferido ocupado se usa otro');
    assert.notEqual(otro.gateCookie, px.gateCookie, 'dos mosaicos de la misma app no se pisan la cookie de entrada');
    assert.equal(otro.tag, px.tag, 'pero comparten host: la sesión iniciada se conserva');
    // Con las cookies de los dos en la misma petición, cada uno reconoce la suya.
    const both = `${px.gateCookie}=${px.token}; ${otro.gateCookie}=${otro.token}`;
    assert.equal((await get('/b', { cookie: both })).status, 200);
    assert.equal((await get('/b', { cookie: both, proxy: otro })).status, 200);
  } finally {
    await otro.close();
  }
  assert.match(px.entryUrl('main', '//evil.com'), /to=%2F$/);
});

test('P-17 una petición lanzada desde otro sitio solo entra si es la navegación de un iframe', async () => {
  const cross = { 'sec-fetch-site': 'cross-site' };
  assert.equal((await get('/b', { headers: { ...cross, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' } })).status, 200, 'así entra el panel');
  assert.equal((await get('/whoami', { headers: { ...cross, 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } })).status, 403, 'fetch desde otra web');
  assert.equal((await get('/b', { headers: { ...cross, 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' } })).status, 403);
  assert.equal((await get('/eco', { method: 'POST', body: 'x', headers: { ...cross, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' } })).status, 403, 'formulario cruzado');
  assert.equal((await get('/b', { headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } })).status, 200);
  assert.ok(crossSiteAllowed({ method: 'POST', headers: {} }), 'sin cabeceras Sec-Fetch (captura, clientes antiguos) no se bloquea');
  // Navegación cruzada que no es un iframe ni un documento (mutante): <object>, <embed>.
  assert.equal((await get('/b', { headers: { ...cross, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'object' } })).status, 403);
  // Otra sesión del mismo mosaico es «same-site»: tampoco entra (mutante).
  assert.equal((await get('/whoami', { headers: { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } })).status, 403);
  // Lo que lanza la propia página sin credenciales (fetch con credentials:'omit', el manifiesto) entra sin cookie (N-11)…
  assert.equal((await get('/whoami', { cookie: false, headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } })).status, 200);
  // …pero nada más entra sin ella.
  assert.equal((await get('/whoami', { cookie: false, headers: { 'sec-fetch-site': 'none', 'sec-fetch-dest': 'empty' } })).status, 403);
  assert.equal((await get('/whoami', { cookie: false, headers: { 'sec-fetch-site': 'same-site', 'sec-fetch-dest': 'empty' } })).status, 403);
});

test('P-18 flujos: si la celda cierra se suelta el servidor, y si el servidor corta la celda se entera', async () => {
  let abiertas = 0;
  let cortar: (() => void) | undefined;
  const sse = http.createServer((req, res) => {
    abiertas++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: 1\n\n');
    cortar = () => res.destroy();
    req.on('close', () => abiertas--);
  });
  await new Promise<void>((r) => sse.listen(0, '127.0.0.1', r));
  const p = await startProxy({ target: `http://127.0.0.1:${(sse.address() as AddressInfo).port}`, agentSource: AGENT });
  const abrir = (): Promise<{ req: http.ClientRequest; res: http.IncomingMessage }> =>
    new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: p.port, path: '/eventos', headers: { host: hostOf(p), cookie: `${p.gateCookie}=${p.token}`, ...api } }, (res) => res.once('data', () => resolve({ req, res })));
      req.on('error', () => {});
    });
  const hasta = async (fn: () => boolean): Promise<boolean> => {
    for (let i = 0; i < 40 && !fn(); i++) await new Promise((r) => setTimeout(r, 25));
    return fn();
  };
  try {
    const a = await abrir();
    assert.equal(abiertas, 1);
    a.req.destroy(); // la celda se recarga
    assert.ok(await hasta(() => abiertas === 0), 'la conexión con el servidor se cierra');
    const b = await abrir();
    let fin = false;
    b.res.on('close', () => (fin = true));
    b.res.on('error', () => (fin = true));
    cortar?.(); // el servidor de desarrollo se reinicia
    assert.ok(await hasta(() => fin), 'la celda ve el corte y puede reconectar');
    // close() no deja conexiones salientes vivas
    await abrir();
    await p.close();
    assert.ok(await hasta(() => abiertas === 0), 'cerrar el proxy suelta al servidor');
  } finally {
    await p.close().catch(() => {});
    sse.closeAllConnections();
    await new Promise<void>((r) => sse.close(() => r()));
  }
});

test('P-19 API en otro puerto: pasa por el proxy con el origen de la app, y solo si está en la lista y es local', async () => {
  const apiUp = await startUpstream();
  // De fuera de esta máquina solo se admite https (plan de mejoras, M4): por http se descarta al arrancar.
  const p = await startProxy({ target: up.origin, agentSource: AGENT, apiOrigins: [apiUp.origin, 'http://api.example.com'] });
  try {
    const o = `http://${hostOf(p)}`;
    const w = json<{ host: string; origin: string; cookie: string }>(await get(`${PREFIX}/api/0/whoami`, { proxy: p, cookie: `${p.gateCookie}=${p.token}; sid=1`, headers: { ...api, origin: o } }));
    assert.equal('http://' + w.host, apiUp.origin, 'la API ve su propio Host');
    assert.equal(w.origin, up.origin, 'y como origen, el de la app: su lista de CORS lo reconoce');
    assert.equal(w.cookie, 'sid=1');
    assert.equal((await get(`${PREFIX}/api/1/x`, { proxy: p, headers: api })).status, 404, 'un origen de fuera de esta máquina y sin https se descarta al arrancar');
    assert.equal((await get(`${PREFIX}/api/0/whoami`, { proxy: p, cookie: false, headers: api })).status, 403);
    assert.match((await get(`${PREFIX}/agent.js`, { proxy: p })).body, new RegExp(`__VK_APIS=\\["${apiUp.origin}"\\]`));
    const reservado = await get(`${PREFIX}/otra-cosa`, { proxy: p });
    assert.equal(reservado.status, 404);
    assert.match(reservado.body, /ViewKeeper/, 'mutante: responde el proxy, no el servidor del usuario');
    // Tampoco desde otro sitio (mutante), y el HTML de la API no lleva agente (mutante).
    assert.equal((await get(`${PREFIX}/api/0/whoami`, { proxy: p, headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } })).status, 403);
    const htmlApi = await get(`${PREFIX}/api/0/b`, { proxy: p, headers: { 'sec-fetch-dest': 'document' } });
    assert.match(htmlApi.body, /PAGINA-B/);
    assert.doesNotMatch(htmlApi.body, /agent\.js/);
    // Una redirección de la API vuelve al paso, no a la app (N-4).
    assert.equal((await get(`${PREFIX}/api/0/redir`, { proxy: p, headers: api })).headers.location, `${PREFIX}/api/0/b`);
  } finally {
    await p.close();
    await apiUp.close();
  }
});
