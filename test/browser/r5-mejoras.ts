// Banco de las mejoras (docs/PLAN-MEJORAS.md): el panel real, el agente real y el proxy real en un Chrome sin
// ventana, con el MISMO documento y los mismos estilos que el producto (src/webview/shell.ts). Lo único que se
// sustituye es VS Code: acquireVsCodeApi es un doble que apunta lo que el panel le manda al host.
// Cada caso se escribe como el defecto que no debe darse: «reproducido» es un fallo.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { DEVICES, findDevice } from '../../src/core/devices.ts';
import { SYNC_ALL, type Cell } from '../../src/core/mosaic.ts';
import { startProxy, type RunningProxy } from '../../src/core/proxy.ts';
import { panelCsp, panelHtml } from '../../src/webview/shell.ts';
import type { PanelState, PanelText } from '../../src/webview/panel.ts';
import { abreChrome, hasta } from './cdp.ts';
import { caso, espera, nota, resultado, servidorFalso } from './util.ts';

const raiz = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const agentSource = fs.readFileSync(path.join(raiz, 'media', 'agent.js'), 'utf8');
const built = await build({ entryPoints: [path.join(raiz, 'src', 'webview', 'panel.ts')], bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'silent' });
const panelJs = built.outputFiles[0].text;

// ───────────────────────── app de pruebas
const registro: { w: string; ev: string }[] = [];
const LOG = `<script>function log(ev){navigator.sendBeacon('/log?w='+innerWidth+'&ev='+encodeURIComponent(ev));} addEventListener('DOMContentLoaded',function(){log('cargada:'+location.pathname);}); addEventListener('resize',function(){log('resize:'+innerWidth);});</script>`;
const pagina = (titulo: string, cuerpo: string): string => `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>body{margin:0;font:14px system-ui}</style>${LOG}</head><body>${cuerpo}</body></html>`;
// Falla solo en el móvil (dos errores) y avisa por consola solo en la tableta: el escritorio, limpio.
const PAGINA_ERR = pagina(
  'err',
  `<a id="ok" href="/ok" style="position:absolute;left:10px;top:10px;display:block;width:200px;height:40px;background:#ddd">a /ok</a>
  <script>
    if (innerWidth < 500) { setTimeout(function () { throw new Error('solo-en-movil <img src=x onerror=alert(1)>'); }, 30); Promise.reject(new Error('promesa-rota')); }
    else if (innerWidth < 1000) console.error('aviso-de-tableta', { a: 1 });
  </script>`,
);
const PAGINA_OK = pagina('ok', `<a id="err" href="/err" style="position:absolute;left:10px;top:10px;display:block;width:200px;height:40px;background:#ddd">a /err</a><div style="height:3000px"></div>`);
let appOrigin = '';
const PAGINA_ABS = (): string =>
  pagina(
    'abs',
    `<a id="abs" href="${appOrigin}/ok?desde=enlace" style="position:absolute;left:10px;top:10px;display:block;width:200px;height:40px;background:#ddd">enlace con el dominio completo</a>
  <form id="f" action="${appOrigin}/ok"><input type="hidden" name="desde" value="formulario"><button id="env" style="position:absolute;left:10px;top:70px;width:200px;height:40px">enviar</button></form>
  <button id="js" style="position:absolute;left:10px;top:130px;width:200px;height:40px" onclick="location.href='${appOrigin}/ok?desde=js'">location.href</button>
  <button id="ext" style="position:absolute;left:10px;top:190px;width:200px;height:40px" onclick="location.href='http://otra-web.example/x'">fuera</button>
  <script>fetch('${appOrigin}/dato').then(function (r) { return r.text(); }).then(function (t) { log('fetch-abs:' + t); }, function (e) { log('fetch-abs:ERROR ' + e.message); });</script>`,
  );
const alAjeno: string[] = [];
const ajeno = await servidorFalso((req, res) => {
  alAjeno.push(`${req.method} ${req.url} auth=${req.headers.authorization ?? '-'}`);
  res.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }).end('ajeno');
});
const alApp: string[] = [];
// La página del auditor, en pequeño: con <base> al dominio real (A-4), una ruta «//host» (A-1), form.submit() (A-3),
// formaction (G9), XHR (G11) y una consulta con ancla que no debe perderse (G15).
const PAGINA_AGENTE = (): string =>
  pagina(
    'agente',
    `<base href="${appOrigin}/">
  <a id="rel" href="ok?desde=base#ancla" style="position:absolute;left:10px;top:10px;display:block;width:200px;height:40px;background:#ddd">relativo con base</a>
  <form id="fp" method="post" action="${appOrigin}/recibe?via=submit"><input type="hidden" name="campo" value="valor"></form>
  <button id="sub" style="position:absolute;left:10px;top:130px;width:200px;height:40px" onclick="document.getElementById('fp').submit()">form.submit()</button>
  <form id="fa" method="post"><input type="hidden" name="campo" value="fa"><button id="fab" formaction="${appOrigin}/recibe?via=formaction" style="position:absolute;left:10px;top:190px;width:200px;height:40px">formaction</button></form>
  <script>
    fetch('${appOrigin}//localhost:${ajeno.port}/robo', { method: 'POST', body: 'cuerpo', headers: { authorization: 'Bearer SECRETO' } }).then(function (r) { return r.text(); }).then(function (t) { log('fetch-doble:' + t.slice(0, 20)); }, function () { log('fetch-doble:ERROR'); });
    document.addEventListener('click', function (e) { log('clic:' + (e.target.id || e.target.tagName)); }, true);
    document.addEventListener('submit', function (e) { log('submit:' + e.target.id + ':' + (e.submitter ? e.submitter.getAttribute('formaction') : '-')); });
    fetch('dato').then(function (r) { return r.text(); }).then(function (t) { log('fetch-base:' + t); }, function () { log('fetch-base:ERROR'); });
    var x = new XMLHttpRequest(); x.open('GET', '${appOrigin}/dato'); x.onload = function () { log('xhr-abs:' + x.responseText); }; x.onerror = function () { log('xhr-abs:ERROR'); }; x.send();
  </script>`,
  );
const app = await servidorFalso((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  if (u.pathname === '/log') {
    registro.push({ w: u.searchParams.get('w') ?? '', ev: u.searchParams.get('ev') ?? '' });
    return void res.writeHead(204).end();
  }
  const html = (b: string): void => void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(b);
  if (u.pathname === '/err') html(PAGINA_ERR);
  else if (u.pathname === '/ok') html(PAGINA_OK);
  else if (u.pathname === '/abs') html(PAGINA_ABS());
  else if (u.pathname === '/agente') html(PAGINA_AGENTE());
  else if (u.pathname === '/recibe') {
    alApp.push(`${req.method} ${u.pathname}${u.search}`);
    // Como una app real: tras un POST, 303 a una página normal (la respuesta a un POST no lleva agente).
    res.writeHead(303, { location: '/ok?desde=post' }).end();
  } else if ((req.url ?? '').startsWith('//')) {
    alApp.push(`${req.method} ${req.url}`);
    res.writeHead(404, { 'content-type': 'text/plain' }).end('ruta-doble-en-la-app');
  }
  else if (u.pathname === '/dato') res.writeHead(200, { 'content-type': 'text/plain' }).end('dato-de-la-app');
  else res.writeHead(404, { 'content-type': 'text/plain' }).end('no existe');
});
appOrigin = app.origin;
const px = await startProxy({ target: app.origin, agentSource });

// ───────────────────────── panel: el documento del producto, con un doble de VS Code
const TEXTOS = ['address', 'addDevice', 'sync', 'scroll', 'click', 'input', 'nav', 'reload', 'capture', 'save', 'session', 'matrix', 'rotate', 'remove', 'empty', 'session1', 'tripped', 'deployed', 'deployedHint', 'route', 'addToRow', 'zoom', 'follow', 'errors', 'left'];
function estado(p: RunningProxy, cells: Cell[], extra: Partial<PanelState> = {}): PanelState {
  return {
    name: 'banco',
    devices: DEVICES.map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height })),
    cells: cells.map((c) => {
      const d = findDevice(c.deviceId)!;
      return { ...c, label: d.name, width: d.width, height: d.height, entry: p.entryUrl(c.session, c.path), origin: p.originFor(c.session), cfg: { ua: d.userAgent, touch: d.mobile, lang: c.locale, fixCookies: true } };
    }),
    sync: SYNC_ALL,
    sonda: false,
    text: Object.fromEntries(TEXTOS.map((k) => [k, k])) as unknown as PanelText,
    ...extra,
  };
}
const celda = (id: string, deviceId: string, p: string, group = 0): Cell => ({ id, deviceId, landscape: false, path: p, session: 'main', group });
const tres = (p: string): Cell[] => [celda('a', 'iphone-15', p), celda('b', 'ipad-mini', p), celda('c', 'laptop', p)];
const escenas: Record<string, () => PanelState> = {
  err: () => estado(px, tres('/err')),
  matriz: () => estado(px, [celda('r0a', 'iphone-15', '/ok', 0), celda('r0b', 'laptop', '/ok', 0), celda('r1a', 'iphone-15', '/err', 1), celda('r1b', 'laptop', '/err', 1)]),
  pub: () => estado(px, tres('/ok'), { deployed: true }),
  abs: () => estado(px, tres('/abs')),
  agente: () => estado(px, [celda('a', 'iphone-15', '/agente')]),
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
  const nonce = 'banco';
  const doble = `window.acquireVsCodeApi = function () { return { postMessage: function (m) {
    fetch('/host?e=${e}', { method: 'POST', body: JSON.stringify(m) });
    if (m.t === 'panelReady') window.postMessage({ t: 'state', state: ${JSON.stringify(st)} }, location.origin);
  } }; };`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(panelHtml({ csp: panelCsp(`http://*.localhost:${px.port}`, nonce, "; connect-src 'self'"), nonce, script: '/panel.js', before: doble }));
});
px.setPanelOrigin(panel.origin);

const nav = await abreChrome();
if (!nav) {
  console.log('No se pudo arrancar Chrome sin ventana; este guion no ha comprobado nada.');
  process.exit(2);
}
const { pestana, evalua, clic, clicPanel, cdp } = nav;
const veces = (ev: string | RegExp, desde = 0): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of registro.slice(desde)) if (typeof ev === 'string' ? r.ev === ev : ev.test(r.ev)) out[r.w] = (out[r.w] ?? 0) + 1;
  return out;
};
const cargadas = (ruta: string, desde: number, cuantas: number, ms = 8000): Promise<boolean> => hasta(() => registro.slice(desde).filter((r) => r.ev === 'cargada:' + ruta).length >= cuantas, ms);
const alHost = (e: string, desde = 0): Record<string, unknown>[] => haciaHost.slice(desde).filter((x) => x.e === e).map((x) => x.m);
const j = JSON.stringify;

try {
  // ══════════ M6 · errores de JavaScript por celda
  {
    const s = await pestana(`${panel.origin}/?e=err`);
    if (!(await cargadas('/err', 0, 3))) throw new Error('el mosaico no carga en este montaje');
    const insignias = (): Promise<(string | null)[]> => evalua<(string | null)[]>(s, `[...document.querySelectorAll('figure')].map(function (f) { var b = f.querySelector('button.err'); return !b || b.hidden ? null : b.textContent; })`);
    await hasta(() => alHost('err').filter((m) => m.t === 'errors').length >= 3, 5000);
    await espera(300);
    const ins = await insignias();
    caso('M6-1', 'el rótulo no cuenta los errores de cada celda (móvil 2, tableta 1, escritorio ninguno)', j(ins) !== j(['2', '1', null]), `insignias por celda: ${j(ins)}`);

    await clicPanel(s, '[data-k="a:err"]');
    await espera(200);
    const lista = await evalua<{ textos: string[]; img: number }>(s, `(function () { var u = document.querySelector('figure[data-id="a"] .errs'); return { textos: u ? [...u.querySelectorAll('li')].map(function (l) { return l.textContent; }) : [], img: document.querySelectorAll('.errs img').length }; })()`);
    const todoAlHost = j(haciaHost);
    caso('M6-2', 'la lista de errores no se despliega, pinta HTML de la página, o el mensaje sale del panel hacia el host', lista.textos.length !== 2 || !lista.textos.some((t) => t.includes('solo-en-movil')) || lista.img !== 0 || /solo-en-movil|promesa-rota|aviso-de-tableta/.test(todoAlHost), `lista del móvil: ${j(lista.textos)}; <img> pintados: ${lista.img}; ¿texto de un error en lo enviado al host? ${/solo-en-movil|promesa-rota|aviso-de-tableta/.test(todoAlHost)}`);
    nota(`al host solo va la cuenta: ${j(alHost('err').filter((m) => m.t === 'errors'))}`);

    // ══════════ M8 · la ruta del rótulo es un botón, y el host manda la fila a otra página
    const h0 = haciaHost.length;
    await clicPanel(s, '[data-k="b:ruta"]');
    await hasta(() => alHost('err', h0).some((m) => m.t === 'route'), 3000);
    const pide = alHost('err', h0).find((m) => m.t === 'route');
    caso('M8-1', 'pulsar la ruta de una celda no le pide al host cambiarla', pide?.cell !== 'b', `mensaje al host: ${j(pide)}`);

    let d = registro.length;
    const h1 = haciaHost.length;
    await evalua(s, `window.postMessage({ t: 'drive', group: 0, path: '/ok' }, location.origin)`);
    const llegan = await cargadas('/ok', d, 3);
    await espera(1500); // margen para ver un rebote: una celda que, al llegar, mandara a las otras de vuelta
    const cargas = veces(/^cargada:/, d);
    const rutas = await evalua<string[]>(s, `[...document.querySelectorAll('.ruta')].map(function (x) { return x.textContent; })`);
    caso('M8-2', 'mandar la fila a otra ruta no lleva a las tres celdas, o las celdas rebotan', !llegan || j(cargas) !== j({ '393': 1, '768': 1, '1366': 1 }) || rutas.some((r) => r !== '/ok'), `cargas tras la orden: ${j(cargas)}; rutas en los rótulos: ${j(rutas)}`);
    const ins2 = await insignias();
    const ceros = alHost('err', h1).filter((m) => m.t === 'errors' && m.n === 0).length;
    caso('M6-3', 'al cambiar de página la cuenta de errores no vuelve a cero', ins2.some((x) => x !== null) || ceros < 2, `insignias en /ok: ${j(ins2)}; avisos de cuenta a cero al host: ${ceros}`);

    // Tras una orden del host, la navegación del usuario se sigue repartiendo (la orden no deja nada pendiente).
    d = registro.length;
    await clic(s, 0, 60, 30);
    const siguen = await cargadas('/err', d, 3);
    caso('M8-3', 'después de mandar la fila a una ruta, un clic del usuario en un enlace ya no arrastra a las otras celdas', !siguen, `cargas de /err tras el clic en el móvil: ${j(veces('cargada:/err', d))}`);

    // ══════════ M11 · ampliar una celda
    await hasta(() => alHost('err').filter((m) => m.t === 'errors' && m.n !== 0).length >= 6, 4000);
    d = registro.length;
    const medidas = (): Promise<{ ocultas: string[]; marcos: number; ancho: number; visibles: string[]; mas: number }> =>
      evalua(s, `(function () { var fs = [...document.querySelectorAll('figure')]; return {
        ocultas: fs.filter(function (f) { return f.classList.contains('oculta'); }).map(function (f) { return f.dataset.id; }),
        visibles: fs.filter(function (f) { return getComputedStyle(f).visibility !== 'hidden'; }).map(function (f) { return f.dataset.id; }),
        marcos: document.querySelectorAll('iframe').length,
        ancho: document.querySelector('figure[data-id="b"] .escena').getBoundingClientRect().width,
        mas: document.querySelectorAll('.mas').length }; })()`);
    const antes = await medidas();
    await clicPanel(s, '[data-k="b:zoom"]');
    await espera(400);
    const dentro = await medidas();
    await espera(600);
    const movidas = veces(/^(cargada|resize):/, d);
    caso('M11-1', 'ampliar una celda no esconde las demás, las recarga o les cambia el tamaño', j(dentro.ocultas) !== j(['a', 'c']) || j(dentro.visibles) !== j(['b']) || dentro.marcos !== 3 || dentro.ancho <= antes.ancho || Object.keys(movidas).length > 0, `ocultas: ${j(dentro.ocultas)}; visibles: ${j(dentro.visibles)}; marcos: ${dentro.marcos}; ancho de la celda ${Math.round(antes.ancho)} → ${Math.round(dentro.ancho)} px; recargas o cambios de tamaño en las páginas: ${j(movidas)}`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, s);
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, s);
    await espera(400);
    const fuera = await medidas();
    caso('M11-2', 'Esc no devuelve el mosaico a como estaba', fuera.ocultas.length !== 0 || fuera.visibles.length !== 3 || Math.round(fuera.ancho) !== Math.round(antes.ancho), `ocultas: ${j(fuera.ocultas)}; ancho de la celda: ${Math.round(fuera.ancho)} px (antes ${Math.round(antes.ancho)})`);
    caso('M9-2', 'un mosaico de una sola fila enseña el «+» de fila (para eso ya está «Añadir dispositivo»)', antes.mas !== 0, `botones «+» de fila: ${antes.mas}`);
  }

  // ══════════ M9 · en una matriz, cada fila tiene su «+»
  {
    const d = registro.length;
    const s = await pestana(`${panel.origin}/?e=matriz`);
    await hasta(() => registro.slice(d).filter((r) => r.ev.startsWith('cargada:')).length >= 4, 8000);
    const mas = await evalua<{ n: number; ultimos: boolean }>(s, `(function () { var filas = [...document.querySelectorAll('.fila')]; return { n: document.querySelectorAll('.fila > .mas').length, ultimos: filas.every(function (f) { return f.lastElementChild && f.lastElementChild.classList.contains('mas'); }) }; })()`);
    const h0 = haciaHost.length;
    await clicPanel(s, '[data-k="fila1:add"]');
    await hasta(() => alHost('matriz', h0).some((m) => m.t === 'pick'), 3000);
    const pide = alHost('matriz', h0).find((m) => m.t === 'pick');
    caso('M9-1', 'en una matriz las filas no tienen su propio «+», o no dice a qué fila añadir', mas.n !== 2 || !mas.ultimos || pide?.group !== 1 || pide?.cell !== undefined, `botones «+»: ${mas.n} (¿el último de cada fila? ${mas.ultimos}); mensaje al host: ${j(pide)}`);
  }

  // ══════════ M3 · la app nombrada con su dominio completo no saca a la celda del mosaico
  {
    let d = registro.length;
    const s = await pestana(`${panel.origin}/?e=abs`);
    await cargadas('/abs', d, 3);
    await hasta(() => registro.slice(d).filter((r) => r.ev.startsWith('fetch-abs:')).length >= 3, 5000);
    const fetchs = registro.slice(d).filter((r) => r.ev.startsWith('fetch-abs:')).map((r) => r.ev.slice(10));
    caso('M3-2', 'un fetch a la propia app escrito con el dominio completo falla dentro de la celda (CORS)', fetchs.length !== 3 || fetchs.some((t) => t !== 'dato-de-la-app'), `respuestas del fetch por celda: ${j(fetchs)}`);
    const volver = async (): Promise<void> => {
      const d0 = registro.length;
      await evalua(s, `window.postMessage({ t: 'drive', group: 0, path: '/abs' }, location.origin)`);
      await cargadas('/abs', d0, 3);
      await espera(400);
    };
    const prueba = async (id: string, titulo: string, y: number): Promise<void> => {
      d = registro.length;
      await clic(s, 0, 60, y);
      const llegan = await cargadas('/ok', d, 3, 6000);
      const en = await evalua<string[]>(s, `[...document.querySelectorAll('.ruta')].map(function (x) { return x.textContent; })`);
      caso(id, titulo, !llegan || !en.every((r) => r.includes('?desde=')), `cargas de /ok tras el clic en el móvil: ${j(veces('cargada:/ok', d))}; rutas en los rótulos: ${j(en)}`);
      await volver();
    };
    await espera(400);
    await prueba('M3-1', 'un enlace escrito con el dominio completo deja las celdas en blanco en vez de abrir la página', 30);
    await prueba('M3-3', 'un formulario cuyo destino lleva el dominio completo deja las celdas en blanco', 90);
    await prueba('M3-4', 'una navegación por código (location.href) al dominio completo deja las celdas en blanco', 150);

    // A otra web: no se va (se quedaría en blanco), se dice en el rótulo y la celda sigue viva.
    d = registro.length;
    const h0 = haciaHost.length;
    await clic(s, 0, 60, 210);
    await hasta(() => alHost('abs', h0).filter((m) => m.t === 'left').length >= 1, 4000);
    await espera(600);
    const avisos = await evalua<string[]>(s, `[...document.querySelectorAll('.fuera')].map(function (x) { return x.textContent; })`);
    const alhost = alHost('abs', h0).filter((m) => m.t === 'left');
    const recargas = veces(/^cargada:/, d);
    await clic(s, 0, 60, 30);
    const viva = await cargadas('/ok', d, 3, 6000);
    caso('M3-5', 'un salto por código a otra web deja la celda en blanco, o no se explica', avisos.length < 1 || !avisos[0].includes('otra-web.example') || alhost[0]?.origin !== 'http://otra-web.example' || Object.keys(recargas).length > 0 || !viva, `avisos en los rótulos: ${j(avisos)}; al host: ${j(alhost)}; recargas: ${j(recargas)}; ¿la celda sigue viva (el enlace siguiente funciona)? ${viva}`);
  }

  // ══════════ Auditoría A · el agente con <base>, rutas «//host», form.submit(), formaction y XHR
  {
    let d = registro.length;
    const s = await pestana(`${panel.origin}/?e=agente`);
    await cargadas('/agente', d, 1);
    await hasta(() => registro.slice(d).filter((r) => /^(fetch-doble|fetch-base|xhr-abs):/.test(r.ev)).length >= 3, 6000);
    const ev = (p: string): string => registro.slice(d).find((r) => r.ev.startsWith(p))?.ev ?? '(nada)';
    caso('AUD-A1', '[A-1] un fetch a la propia app con una ruta «//host/…» sale a otro servidor con sus cabeceras', alAjeno.length > 0 || !alApp.some((x) => x.includes('//localhost')), `al servidor ajeno: ${j(alAjeno)}; a la app: ${j(alApp)}; la página vio: ${ev('fetch-doble:')}`);
    caso('AUD-A4a', '[A-4] con <base> al dominio real, un fetch relativo no pasa por la celda', ev('fetch-base:') !== 'fetch-base:dato-de-la-app', ev('fetch-base:'));
    caso('AUD-G11', '[G11] un XHR al dominio completo de la app no pasa por la celda', ev('xhr-abs:') !== 'xhr-abs:dato-de-la-app', ev('xhr-abs:'));
    const volver = async (): Promise<void> => {
      const d0 = registro.length;
      await evalua(s, `window.postMessage({ t: 'drive', group: 0, path: '/agente' }, location.origin)`);
      await cargadas('/agente', d0, 1, 6000);
      await espera(500);
    };
    // Enlace relativo con <base>: se queda en la celda, con su consulta y su ancla.
    d = registro.length;
    await clic(s, 0, 60, 30);
    const base = await cargadas('/ok', d, 1, 6000);
    const ruta = await evalua<string>(s, `document.querySelector('.ruta').textContent`);
    caso('AUD-A4b', '[A-4, G15] con <base> al dominio real, un enlace relativo saca a la celda, o pierde la consulta o el ancla', !base || ruta !== '/ok?desde=base#ancla', `¿llegó a /ok? ${base}; ruta en el rótulo: ${ruta}`);
    // La orden «nav» del panel con <base> en la página: vuelve sin salir de la celda.
    d = registro.length;
    await evalua(s, `window.postMessage({ t: 'drive', group: 0, path: '/agente' }, location.origin)`);
    const vuelve = await cargadas('/agente', d, 1, 6000);
    caso('AUD-A4c', '[A-4] con <base> al dominio real, la orden de navegar del panel saca a la celda', !vuelve, `¿volvió a /agente? ${vuelve}`);
    await espera(500);
    // form.submit() con POST al dominio completo (A-3): POST, y en la celda.
    const n0 = alApp.length;
    await clic(s, 0, 60, 150);
    await hasta(() => alApp.length > n0, 5000);
    caso('AUD-A3', '[A-3, G5] form.submit() con POST al dominio completo se va del proxy, o deja de ser POST', !alApp.slice(n0).includes('POST /recibe?via=submit'), `lo que recibió la app: ${j(alApp.slice(n0))}`);
    await volver();
    const n1 = alApp.length;
    await clic(s, 0, 60, 210);
    await hasta(() => alApp.length > n1, 5000);
    caso('AUD-G9', '[G9] un botón con formaction al dominio completo se va del proxy', !alApp.slice(n1).includes('POST /recibe?via=formaction'), `lo que recibió la app: ${j(alApp.slice(n1))}`);
  }

  // ══════════ M1 · una web publicada se anuncia en la barra
  {
    const d = registro.length;
    const s = await pestana(`${panel.origin}/?e=pub`);
    await cargadas('/ok', d, 3);
    const vivo = await evalua<string | null>(s, `(function () { var v = document.querySelector('#barra .vivo'); return v ? v.textContent : null; })()`);
    caso('M1-1', 'con una web publicada la barra no lo dice', vivo !== 'deployed', `aviso en la barra: ${j(vivo)}`);
  }
} catch (e) {
  console.log(`\nERROR del montaje: ${(e as Error).message}`);
  caso('MONTAJE', 'el banco no pudo montar el panel', true, (e as Error).message);
} finally {
  for (const x of [px, app, panel, ajeno]) await x.close();
  await nav.cierra();
}
process.exit(resultado());
