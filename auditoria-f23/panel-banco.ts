// Auditoría F2-F3: el panel real (src/webview/panel.ts) con el CSS real de panelHost.ts, en Chrome sin ventana.
// El host es un doble en Node: recibe 'edit' por fetch, aplica applyEdit y devuelve el estado por CDP.
// Las celdas apuntan a un servidor falso local (no hace falta el agente para lo que se mide aquí).
// Ejecutar desde la raíz del repo:  node --no-warnings auditoria-f23/panel-banco.ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { build } from 'esbuild';
import { DEVICES, findDevice, rotate } from '../src/core/devices.ts';
import { SYNC_ALL, applyEdit, type Cell, type Mosaic } from '../src/core/mosaic.ts';
import { servidorFalso, espera } from '../test/browser/util.ts';
import type { PanelState, PanelText } from '../src/webview/panel.ts';

const CHROME = process.env.AUD_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const panelJs = (await build({ entryPoints: ['src/webview/panel.ts'], bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'silent' })).outputFiles[0].text;
const hostSrc = fs.readFileSync('src/vscode/panelHost.ts', 'utf8');
const CSS = /const CSS = `([\s\S]*?)`;/.exec(hostSrc)![1];

// App falsa: cuenta cargas por celda (?c=<id>)
const cargas: Record<string, number> = {};
const app = await servidorFalso((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  const c = u.searchParams.get('c') ?? '?';
  cargas[c] = (cargas[c] ?? 0) + 1;
  res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><title>${c}</title><body style="margin:0;background:#def">celda ${c}</body>`);
});

let model: Mosaic = { v: 1, name: 'banco', target: 'http://localhost:5173', sync: SYNC_ALL, cells: [] };
function stateOf(m: Mosaic): PanelState {
  return {
    name: m.name,
    devices: DEVICES.map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height })),
    cells: m.cells.map((c) => {
      const base = findDevice(c.deviceId) ?? findDevice('laptop')!;
      const d = c.landscape ? rotate(base) : base;
      return { ...c, label: d.name, width: d.width, height: d.height, entry: `${app.origin}/?c=${c.id}`, origin: app.origin, cfg: { ua: d.userAgent, touch: d.mobile, fixCookies: true } };
    }),
    sync: m.sync,
    sonda: false,
    text: Object.fromEntries(['addDevice', 'sync', 'scroll', 'click', 'input', 'nav', 'reload', 'capture', 'save', 'session', 'matrix', 'rotate', 'remove', 'empty', 'session1', 'tripped'].map((k) => [k, k])) as unknown as PanelText,
  };
}

const alHost: Record<string, unknown>[] = [];
let sesion = '';
const panel = await servidorFalso((req, res, body) => {
  const u = new URL(req.url ?? '/', 'http://x');
  if (u.pathname === '/panel.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(panelJs);
  if (u.pathname === '/host') {
    const m = JSON.parse(body) as { t: string; edit?: unknown };
    alHost.push(m);
    if (m.t === 'edit') {
      model = applyEdit(model, m.edit, (id) => findDevice(id) !== undefined);
      void empuja();
    }
    return void res.writeHead(204).end();
  }
  const nonce = 'n';
  const csp = `default-src 'none'; frame-src ${app.origin}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}"><style nonce="${nonce}">${CSS}</style></head>
<body><div id="barra"></div><div id="mosaico"></div>
<script nonce="${nonce}">window.acquireVsCodeApi=function(){return{postMessage:function(m){fetch('/host',{method:'POST',body:JSON.stringify(m)});}};};</script>
<script nonce="${nonce}" src="/panel.js"></script></body></html>`);
});

// Chrome + CDP
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-aud23-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore' });
let wsUrl = '';
for (let i = 0; i < 100 && !wsUrl; i++) {
  await espera(100);
  try {
    const [p, r] = fs.readFileSync(path.join(perfil, 'DevToolsActivePort'), 'utf8').trim().split('\n');
    wsUrl = `ws://127.0.0.1:${p.trim()}${r.trim()}`;
  } catch {
    /* aún no */
  }
}
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));
let seq = 0;
const pend = new Map<number, (m: { result?: Record<string, unknown>; error?: { message: string } }) => void>();
ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.id) pend.get(m.id)?.(m);
});
const cdp = (method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> =>
  new Promise((ok, ko) => {
    const id = ++seq;
    pend.set(id, (m) => (m.error ? ko(new Error(method + ': ' + m.error.message)) : ok(m.result ?? {})));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const { targetId } = (await cdp('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
const { sessionId: s } = (await cdp('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
await cdp('Page.enable', {}, s);
const tam = (width: number, height: number): Promise<Record<string, unknown>> => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, s);
const ev = async <T>(expr: string): Promise<T> => ((await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, s)) as { result: { value: T } }).result.value;
async function empuja(): Promise<void> {
  await ev(`window.postMessage({ t: 'state', state: ${JSON.stringify(stateOf(model))} }, location.origin)`);
}
const medidas = (): Promise<{ id: string; w: number; h: number; top: number; pct: string }[]> =>
  ev(`Array.from(document.querySelectorAll('figure')).map(f => { const e = f.querySelector('.escena').getBoundingClientRect(); return { id: f.dataset.id, w: Math.round(e.width), h: Math.round(e.height), top: Math.round(e.top), pct: f.querySelector('.pct').textContent }; })`);
const docAlto = (): Promise<{ sh: number; ih: number }> => ev(`({ sh: document.documentElement.scrollHeight, ih: innerHeight })`);
const informe = (id: string, rep: boolean, txt: string): void => console.log(`${rep ? 'DEFECTO ' : 'sin def.'} ${id}: ${txt}`);

try {
  await tam(1400, 900);
  model = { ...model, cells: [{ id: 'a', deviceId: 'iphone-15', landscape: false, path: '/', session: 'main', group: 0 }, { id: 'b', deviceId: 'ipad-mini', landscape: false, path: '/', session: 'main', group: 0 }, { id: 'c', deviceId: 'laptop', landscape: false, path: '/', session: 'main', group: 0 }] };
  await cdp('Page.navigate', { url: panel.origin + '/' }, s);
  await espera(1200);
  await empuja();
  await espera(1200);

  // B-1 · Cambiar solo la altura de la ventana (abrir/cerrar el terminal de VS Code): ¿se reajustan las celdas?
  const m900 = await medidas();
  await tam(1400, 500);
  await espera(800);
  const m500 = await medidas();
  const d500 = await docAlto();
  informe('B-1 alto de ventana', JSON.stringify(m900) === JSON.stringify(m500) && d500.sh > d500.ih, `a 900 px: ${JSON.stringify(m900.map((x) => x.h))}; a 500 px: ${JSON.stringify(m500.map((x) => x.h))}; documento ${d500.sh} px en ${d500.ih} px de ventana`);
  // y al cambiar el ancho sí se reajustan (para contraste)
  await tam(1300, 500);
  await espera(800);
  const m500w = await medidas();
  informe('B-1b (contraste) cambiar el ancho', false, `con 1300×500: ${JSON.stringify(m500w.map((x) => x.h))}`);

  // B-2 · ¿la página oscila (barra de desplazamiento que aparece y desaparece)?
  await tam(1400, 900);
  await espera(600);
  await ev(`(window.__cambios = 0, new MutationObserver(() => window.__cambios++).observe(document.getElementById('mosaico'), { subtree: true, characterData: true, childList: true, attributes: true, attributeFilter: ['style'] }), 0)`);
  await espera(2000);
  const cambios = await ev<number>('window.__cambios');
  informe('B-2 oscilación', cambios > 6, `${cambios} mutaciones en 2 s sin hacer nada`);

  // B-3 · teclado: Tab hasta «scroll» y Espacio. ¿Dónde queda el foco cuando vuelve el estado?
  await ev(`(Array.from(document.querySelectorAll('#barra button')).find(b => b.textContent === 'scroll').focus(), 0)`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' }, s);
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }, s);
  await espera(800);
  const foco = await ev<string>(`(document.activeElement && (document.activeElement.tagName + ' ' + (document.activeElement.textContent || ''))) || 'nada'`);
  const pulsado = await ev<string>(`Array.from(document.querySelectorAll('#barra button')).find(b => b.textContent === 'scroll').getAttribute('aria-pressed')`);
  informe('B-3 foco tras un interruptor', foco.startsWith('BODY'),`scroll ahora aria-pressed=${pulsado}; el foco quedó en: ${foco}`);

  // B-3b · teclado sobre «Añadir dispositivo»: una flecha abajo con el desplegable cerrado
  const n0 = model.cells.length;
  await ev(`(document.querySelector('#barra select').focus(), 0)`);
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, s);
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, s);
  await espera(800);
  const foco2 = await ev<string>(`document.activeElement ? document.activeElement.tagName : 'nada'`);
  informe('B-3b flecha en «Añadir dispositivo»', model.cells.length > n0, `celdas ${n0} → ${model.cells.length}; foco en ${foco2}`);
  // y deshacerlo para no estorbar a lo siguiente
  model = { ...model, cells: model.cells.slice(0, n0) };
  await empuja();
  await espera(800);

  // B-4 · girar no recarga; cambiar de dispositivo recarga SOLO esa celda
  const c0 = { ...cargas };
  model = applyEdit(model, { op: 'rotate', cell: 'a' }, () => true);
  await empuja();
  await espera(800);
  model = applyEdit(model, { op: 'device', cell: 'b', deviceId: 'pixel-8' }, () => true);
  await empuja();
  await espera(1000);
  const dif = Object.fromEntries(Object.keys(cargas).map((k) => [k, cargas[k] - (c0[k] ?? 0)]));
  informe('B-4 render incremental', !(dif.a === 0 && dif.b === 1 && dif.c === 0), `cargas nuevas por celda: ${JSON.stringify(dif)}`);

  // B-5 · dispositivo desconocido (mosaico de un compañero con su dispositivo propio): ¿qué enseña el rótulo?
  model = { ...model, cells: [...model.cells, { id: 'd', deviceId: 'custom-movil-de-ana', landscape: false, path: '/', session: 'main', group: 1 }] };
  await empuja();
  await espera(800);
  const rot = await ev<{ sel: string; w: number }>(`(() => { const f = document.querySelector('figure[data-id="d"]'); const s = f.querySelector('select'); return { sel: s.options[s.selectedIndex].textContent, w: Math.round(parseFloat(f.querySelector('iframe').width)) }; })()`);
  informe('B-5 dispositivo desconocido', rot.sel !== 'Laptop', `el desplegable dice «${rot.sel}» y el iframe mide ${rot.w} px de ancho`);

  // B-6 · quitar todas y añadir: estado vacío y vuelta
  for (const id of ['a', 'b', 'c', 'd']) model = applyEdit(model, { op: 'remove', cell: id }, () => true);
  await empuja();
  await espera(500);
  const vacio = await ev<string>(`document.getElementById('mosaico').innerText`);
  model = applyEdit(model, { op: 'add', deviceId: 'laptop' }, () => true);
  await empuja();
  await espera(800);
  const filas = await ev<number>(`document.querySelectorAll('.fila').length + document.querySelectorAll('.vacio').length * 100`);
  informe('B-6 vacío y vuelta', filas !== 1, `vacío: «${vacio.trim()}»; tras añadir: ${filas} filas (100 = sigue el texto de vacío)`);

  // B-7 · doce celdas en una fila (el máximo) en un panel de 900 px
  await tam(900, 800);
  model = { ...model, cells: Array.from({ length: 12 }, (_, i) => ({ id: 'x' + i, deviceId: 'iphone-15', landscape: false, path: '/', session: 'main', group: 0 })) };
  await empuja();
  await espera(1200);
  const m12 = await medidas();
  const d12 = await docAlto();
  const lineas = new Set(m12.map((x) => x.top)).size;
  informe('B-7 doce celdas en 900 px', m12[0]?.h < 100, `${lineas} líneas de celdas, alto ${m12[0]?.h}px cada una, documento ${d12.sh} px en ${d12.ih} px de ventana (escala ${m12[0]?.pct})`);

  // B-8 · los tres dispositivos por defecto en un panel de 700 px (editor partido en dos) y cinco en 1200 px
  const tres = ['iphone-15', 'ipad-mini', 'laptop'].map((d, i) => ({ id: 't' + i, deviceId: d, landscape: false, path: '/', session: 'main', group: 0 }));
  for (const [w, cells] of [[700, tres], [760, tres], [1200, ['iphone-se', 'iphone-15', 'pixel-8', 'ipad-mini', 'laptop'].map((d, i) => ({ id: 'f' + i, deviceId: d, landscape: false, path: '/', session: 'main', group: 0 }))]] as const) {
    await tam(w, 900);
    model = { ...model, cells: cells as Cell[] };
    await empuja();
    await espera(1200);
    const mm = await medidas();
    informe(`B-8 ${cells.length} celdas en ${w}×900`, mm.some((x) => x.h < 100), `alto en pantalla ${JSON.stringify(mm.map((x) => x.h))} px, escalas ${JSON.stringify(mm.map((x) => x.pct))}, líneas ${new Set(mm.map((x) => x.top)).size}`);
  }

  // B-1c · crecer solo en alto (cerrar el terminal): ¿vuelven a crecer las celdas?
  model = { ...model, cells: tres };
  await tam(1400, 500);
  await empuja();
  await espera(1000);
  const a500 = await medidas();
  await tam(1400, 950);
  await espera(1000);
  const a950 = await medidas();
  informe('B-1c crecer en alto', JSON.stringify(a500) === JSON.stringify(a950), `a 500 px: ${JSON.stringify(a500.map((x) => x.h))}; tras crecer a 950 px: ${JSON.stringify(a950.map((x) => x.h))}`);
} finally {
  ws.close();
  chrome.kill();
  await app.close();
  await panel.close();
  await espera(500);
  try {
    fs.rmSync(perfil, { recursive: true, force: true });
  } catch {
    /* Chrome suelta el perfil tarde */
  }
}
process.exit(0);
