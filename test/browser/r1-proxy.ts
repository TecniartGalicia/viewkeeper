// Auditoría, segunda pasada: reproducciones contra el proxy reescrito (src/core/proxy.ts). Sin navegador.
// Ejecutar desde la carpeta del prototipo:  node --no-warnings auditoria/r1-proxy.ts
// Cada caso dice si el defecto se REPRODUCE todavía. «no reproducido» = cerrado en esa comprobación.
import * as zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { GATE_PREFIX, PREFIX, createInjector, crossSiteAllowed, rewriteLocation, safeLocalPath, sessionFromHost, startProxy, tagFor, type RunningProxy } from '../../src/core/proxy.ts';
import { normalizePath } from '../../src/core/mosaic.ts';
import { caso, crudo, espera, nota, pedir, servidorFalso, resultado } from './util.ts';

const AGENT = '/*AGENTE*/';
const excepciones: string[] = [];
process.on('uncaughtException', (e) => {
  excepciones.push(String(e && (e as Error).message));
});

const DOC = '<!doctype html><html><head><title>t</title></head><body>hola</body></html>';

const up = await servidorFalso((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/sse')) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: 1\n\n');
    return; // se queda abierta
  }
  if (url.startsWith('/corta-html')) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<!doctype html><html><head><title>a medias</title>');
    setTimeout(() => res.socket?.destroy(), 150);
    return;
  }
  if (url.startsWith('/corta-json')) {
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '1000' });
    res.write('{"a":');
    setTimeout(() => res.socket?.destroy(), 150);
    return;
  }
  if (url.startsWith('/304')) return void res.writeHead(304, { 'content-type': 'text/html', etag: '"x"' }).end();
  if (url.startsWith('/204')) return void res.writeHead(204, { 'content-type': 'text/html' }).end();
  if (url.startsWith('/vacio')) return void res.writeHead(200, { 'content-type': 'text/html', 'content-length': '0' }).end();
  if (url.startsWith('/redir-vacio')) return void res.writeHead(302, { 'content-type': 'text/html', location: '/b' }).end();
  if (url.startsWith('/cl')) return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(DOC)), etag: '"abc"' }).end(DOC);
  if (url.startsWith('/br')) return void res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'br' }).end(zlib.brotliCompressSync(DOC));
  if (url.startsWith('/zstd')) return void res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'zstd' }).end(Buffer.from('no importa'));
  if (url.startsWith('/loc')) {
    const q = new URL(url, 'http://x').searchParams;
    return void res.writeHead(302, { location: q.get('a') ?? '/' }).end();
  }
  if (url.startsWith('/cookies')) {
    const q = new URL(url, 'http://x').searchParams;
    return void res
      .writeHead(200, {
        'content-type': 'text/plain',
        'set-cookie': ['__Host-sid=1; Path=/; Secure; HttpOnly; SameSite=Lax', '__Secure-x=1; SECURE; SAMESITE=STRICT; DOMAIN=example.com', 'exp=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/', `${q.get('g') ?? '__vk_0'}=pisada; Path=/`, ` ${q.get('g') ?? '__vk_0'}=pisada2; Path=/x`],
      })
      .end('ok');
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ url, host: req.headers.host, cookie: req.headers.cookie ?? '', origin: req.headers.origin ?? null }));
});

// Una API en otro puerto, como FastAPI o Django: redirige /usuarios → /usuarios/ con URL absoluta, y pone cookie con Path.
const api = await servidorFalso((req, res) => {
  const url = req.url ?? '/';
  if (url === '/usuarios') return void res.writeHead(307, { location: `http://${req.headers.host}/usuarios/` }).end();
  if (url === '/rel') return void res.writeHead(302, { location: '/usuarios/' }).end();
  if (url === '/sesion') return void res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['api_sid=1; Path=/api; HttpOnly'] }).end('{}');
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ api: true, url, host: req.headers.host, origin: req.headers.origin ?? null, cookie: req.headers.cookie ?? '' }));
});

const px = await startProxy({ target: up.origin, agentSource: AGENT, apiOrigins: [api.origin, 'https://api.example.com', 'http://localhost.evil.example:1', 'http://127.0.0.1@evil.example'] });
px.setPanelOrigin('vscode-webview://panel');
const H = (p: RunningProxy, s = 'main'): string => `s-${s}-${p.tag}.localhost:${p.port}`;
const C = `${px.gateCookie}=${px.token}`;
const O = px.originFor('main');
const get = (path: string, o: Parameters<typeof pedir>[2] = {}, p: RunningProxy = px, session = 'main'): ReturnType<typeof pedir> => pedir(p.port, path, { host: H(p, session), ...o });
console.log(`proxy en ${px.port} (etiqueta ${px.tag}, cookie ${px.gateCookie}), servidor falso en ${up.port}, API falsa en ${api.port}`);

// ───────────────────────── H-11: entrada /__viewkeeper/enter
{
  const loc = async (to: string): Promise<string> => {
    const r = await get(`${PREFIX}/enter?t=${px.token}&to=${encodeURIComponent(to)}`, { plazo: 1500 });
    return 'error' in r ? `ERROR ${r.error}` : String(r.headers.location);
  };
  const fuera = (l: string): string => {
    try {
      return new URL(l, O + `${PREFIX}/enter`).origin;
    } catch {
      return '?';
    }
  };
  const tab = await loc('/\t/evil.example/x');
  caso('ENT-1', '[H-11] "/<TAB>/host" como destino de la entrada', fuera(tab) !== O, `Location=${JSON.stringify(tab)}`);
  const antes = excepciones.length;
  const euro = await loc('/productos/€');
  caso('ENT-2', '[H-11] ruta con caracteres fuera de Latin-1 tira el manejador', euro.startsWith('ERROR') || excepciones.length > antes, `Location=${JSON.stringify(euro)}; excepciones nuevas: ${excepciones.length - antes}`);
  const ene = await loc('/año');
  caso('ENT-3', '[H-11] ruta con ñ sale sin codificar', !ene.includes('%C3%B1'), `Location=${JSON.stringify(ene)}`);

  // NUEVO: la normalización no es idempotente. «/.//host» se resuelve a la ruta «//host», que el navegador lee como otro servidor.
  console.log('\n[ENT-4] variantes con segmentos de punto (una sola pasada de safeLocalPath, como hace /enter con «to»)');
  let alguna = '';
  for (const to of ['/.//evil.example/x', '/..//evil.example', '/%2e//evil.example', '/a/..//evil.example', '/.\\/evil.example', '/./\\evil.example', '/x/../..//evil.example?q#h']) {
    const l = await loc(to);
    const o = fuera(l);
    if (o !== O && !alguna) alguna = `${to} → Location ${l} → ${o}`;
    nota(`to=${JSON.stringify(to)} → Location=${JSON.stringify(l)} → el navegador iría a ${o}${o !== O ? '   ← FUERA' : ''}`);
  }
  caso('ENT-4', '[NUEVO] safeLocalPath devuelve «//host» para «/.//host»: redirección abierta con una sola pasada', alguna !== '', alguna || 'ninguna variante sale del origen');
  nota(`safeLocalPath('/.//evil.example') = ${JSON.stringify(safeLocalPath('/.//evil.example'))}; normalizePath (mosaic.ts) = ${JSON.stringify(normalizePath('/.//evil.example'))}`);
  nota(`por entryUrl (dos pasadas) el destino queda en: ${JSON.stringify(decodeURIComponent(px.entryUrl('main', '/.//evil.example/x').split('to=')[1]))} → y /enter lo deja en ${JSON.stringify(safeLocalPath(decodeURIComponent(px.entryUrl('main', '/.//evil.example/x').split('to=')[1])))}`);
}

// ───────────────────────── H-3: dos mosaicos, etiqueta estable
{
  const px2 = await startProxy({ target: up.origin, agentSource: AGENT }); // la MISMA app, segundo mosaico
  const otra = await startProxy({ target: api.origin, agentSource: AGENT }); // OTRA app
  const sc = async (p: RunningProxy): Promise<string> => {
    const r = await get(`${PREFIX}/enter?t=${p.token}&to=/`, {}, p);
    return 'error' in r ? '' : String((r.headers['set-cookie'] ?? [])[0]);
  };
  // Bote de cookies según RFC 6265: clave (nombre, dominio, ruta). El puerto NO forma parte.
  const bote = new Map<string, string>();
  const guardar = (host: string, setCookie: string): void => {
    const [par, ...attrs] = setCookie.split(';').map((x) => x.trim());
    const path = attrs.find((a) => a.toLowerCase().startsWith('path='))?.slice(5) ?? '/';
    bote.set(`${par.split('=')[0]}|${host}|${path}`, par);
  };
  const para = (host: string): string => [...bote].filter(([k]) => k.split('|')[1] === host).map(([, v]) => v).join('; ');
  guardar(`s-main-${px.tag}.localhost`, await sc(px));
  guardar(`s-main-${px2.tag}.localhost`, await sc(px2));
  guardar(`s-main-${otra.tag}.localhost`, await sc(otra));
  const a = await get('/x', { headers: { cookie: para(`s-main-${px.tag}.localhost`) } });
  const b = await get('/x', { headers: { cookie: para(`s-main-${px2.tag}.localhost`) } }, px2);
  const c = await get('/x', { headers: { cookie: para(`s-main-${otra.tag}.localhost`) } }, otra);
  const st = (r: Awaited<ReturnType<typeof pedir>>): string => ('error' in r ? r.error : String(r.status));
  caso('COK-1', '[H-3] dos mosaicos a la vez se pisan la cookie de entrada', st(a) !== '200' || st(b) !== '200' || st(c) !== '200', `misma app, mosaico 1: ${st(a)}; misma app, mosaico 2: ${st(b)}; otra app: ${st(c)}. Etiquetas: ${px.tag}/${px2.tag}/${otra.tag}`);
  nota(`cabecera Cookie que manda el navegador a la app con dos mosaicos de la misma app abiertos: ${para(`s-main-${px.tag}.localhost`).replace(/=[0-9a-f]{48}/g, '=…')}`);
  nota(`cada apertura deja una cookie ${GATE_PREFIX}<puerto> más en el mismo host (no caducan hasta cerrar el navegador): tras N aperturas, N×${`${px.gateCookie}=${px.token}; `.length} bytes en cada petición (Node corta a 16 KB → 431)`);
  await px2.close();
  await otra.close();
}

// ───────────────────────── H-12: cookies recordadas para la captura
{
  await get('/whoami', { headers: { cookie: `${C}; sid=SECRETO`, 'sec-fetch-dest': 'empty' } }, px, 'adm');
  await get('/whoami', { headers: { cookie: C, 'sec-fetch-dest': 'empty' } }, px, 'adm'); // ya sin sesión
  const u1 = new URL(px.captureUrl('adm', '/'));
  const r1 = await get(u1.pathname + u1.search, {}, px, 'adm');
  const sc1 = 'error' in r1 ? [] : (r1.headers['set-cookie'] ?? []);
  caso('COK-2', '[H-12] la captura reproduce cookies de una sesión ya cerrada', sc1.some((c) => c.startsWith('sid=SECRETO')), `Set-Cookie de la captura tras cerrar sesión: ${sc1.length - 1} cookies de la app`);
  // Con sesión viva: ¿se conserva HttpOnly? ¿y la URL lleva el testigo?
  await get('/whoami', { headers: { cookie: `${C}; sid=SECRETO`, 'sec-fetch-dest': 'empty' } }, px, 'adm');
  const u2 = new URL(px.captureUrl('adm', '/'));
  const r2 = await get(u2.pathname + u2.search, {}, px, 'adm');
  const sc2 = 'error' in r2 ? [] : (r2.headers['set-cookie'] ?? []);
  caso('COK-3', '[H-12] la URL de captura lleva el testigo maestro', u2.href.includes(px.token), `URL de captura: ${u2.href.replace(/k=[0-9a-f]+/, 'k=<tique>')}`);
  caso('COK-4', '[H-12, parte] las cookies reproducidas pierden HttpOnly', sc2.some((c) => c.startsWith('sid=') && !/httponly/i.test(c)), JSON.stringify(sc2.filter((c) => c.startsWith('sid='))));
  // NUEVO: «lo último que mandó» incluye peticiones a las que no les tocaba cookie.
  await get('/whoami', { headers: { cookie: `${C}; sid=SECRETO`, 'sec-fetch-dest': 'empty' } }, px, 'adm');
  await get('/favicon.ico', { headers: { cookie: C, 'sec-fetch-dest': 'image' } }, px, 'adm'); // p. ej. cookie con Path=/app: aquí no viaja
  const u3 = new URL(px.captureUrl('adm', '/'));
  const r3 = await get(u3.pathname + u3.search, {}, px, 'adm');
  const sc3 = 'error' in r3 ? [] : (r3.headers['set-cookie'] ?? []);
  caso('COK-5', '[NUEVO] una sola petición sin cookies de la app (cookie con Path, fetch sin credenciales…) borra lo recordado: la captura sale sin sesión', sc3.length === 1, `tras sid=SECRETO y luego una petición a /favicon.ico sin sid: la captura reproduce ${sc3.length - 1} cookies`);
}

// ───────────────────────── H-9: fugas y cuelgues
{
  const r = await get('/corta-json', { headers: { cookie: C, 'sec-fetch-dest': 'empty' }, plazo: 2500 });
  const h = await get('/corta-html', { headers: { cookie: C, 'sec-fetch-dest': 'iframe' }, plazo: 2500 });
  const colgada = (x: Awaited<ReturnType<typeof pedir>>): boolean => !('error' in x) && !x.ended && !x.aborted;
  caso('FLU-1', '[H-9] el servidor corta a media respuesta y la celda no se entera', colgada(r) || colgada(h), `JSON: ${'error' in r ? r.error : `ended=${r.ended} aborted=${r.aborted}`}; HTML inyectado: ${'error' in h ? h.error : `ended=${h.ended} aborted=${h.aborted}`}`);
  const base = up.abiertas();
  const N = 5;
  for (let i = 0; i < N; i++) await get('/sse', { headers: { cookie: C, 'sec-fetch-dest': 'empty', accept: 'text/event-stream' }, plazo: 200 });
  await espera(1500);
  caso('FLU-2', '[H-9] la celda cierra un EventSource y la conexión con el servidor queda abierta', up.abiertas() - base >= N, `${N} clientes cerrados → ${up.abiertas() - base} conexiones de más en el servidor tras 1,5 s`);
  const solo = await startProxy({ target: up.origin, agentSource: AGENT });
  const b2 = up.abiertas();
  await get('/sse', { headers: { cookie: `${solo.gateCookie}=${solo.token}`, 'sec-fetch-dest': 'empty' }, plazo: 200 }, solo);
  await get('/x', { headers: { cookie: `${solo.gateCookie}=${solo.token}`, 'sec-fetch-dest': 'empty' } }, solo); // deja una conexión keep-alive en reposo
  await solo.close();
  await espera(800);
  caso('FLU-3', '[H-9] close() del proxy deja conexiones salientes vivas', up.abiertas() - b2 >= 1, `conexiones que sobreviven al cierre: ${up.abiertas() - b2}`);
}

// ───────────────────────── H-10: inyector
{
  const run = async (chunks: (string | Buffer)[]): Promise<string> => {
    const out: Buffer[] = [];
    for await (const c of Readable.from(chunks.map((c) => Buffer.from(c))).pipe(createInjector('[A]'))) out.push(c as Buffer);
    return Buffer.concat(out).toString();
  };
  const a = await run(['<!doctype html><title>sin head</title><p>hola']);
  caso('INY-1', '[H-10] sin <head>, la etiqueta va antes del doctype', a.startsWith('[A]'), JSON.stringify(a));
  const b = await run(['<!doctype html><!-- plantilla: el <head> va abajo --><html><head><title>t</title></head>']);
  caso('INY-2', '[H-10] <head> dentro de un comentario', b.includes('<head>[A] va abajo'), JSON.stringify(b));
  const c = await run(['<html><head data-x="a>b"><title>t</title>']);
  caso('INY-3', '[H-10] ">" dentro de un atributo de <head>', !c.includes('data-x="a>b">[A]'), JSON.stringify(c));
  const d = await run([Buffer.from([0xef, 0xbb, 0xbf]), '<p>con BOM</p>']);
  caso('INY-4', '[H-10] la etiqueta va delante del BOM', d.startsWith('[A]'), JSON.stringify(d));

  // Regresiones: documentos reales y casos límite. Propiedad: el resultado no depende de cómo llegue troceado.
  const docs: Record<string, string> = {
    vite: '<!doctype html>\n<html lang="en">\n  <head>\n    <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";</script>\n    <script type="module" src="/@vite/client"></script>\n    <meta charset="UTF-8" />\n    <title>Vite + React</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
    next: '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/css/app/layout.css" data-precedence="next_static/chunks/[turbopack]"/><script src="/_next/static/chunks/main-app.js" async=""></script><title>Create Next App</title></head><body class="__className_x"><main>hola</main><script>(self.__next_f=self.__next_f||[]).push([0])</script></body></html>',
    sveltekit: '<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<link rel="icon" href="./favicon.png" />\n\t</head>\n\t<body data-sveltekit-preload-data="hover">\n\t\t<div style="display: contents">x</div>\n\t</body>\n</html>\n',
    astro: '<!DOCTYPE html><html lang="en"> <head><meta charset="utf-8"><script type="module" src="/@vite/client"></script><title>Astro</title></head> <body> <h1>Astro</h1> </body></html>',
    xhtml: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body/></html>',
    ie: '<!DOCTYPE html>\n<!--[if lt IE 9]><html class="ie"><![endif]-->\n<!--[if gt IE 8]><!--><html lang="es"><!--<![endif]-->\n<head><meta charset="utf-8"></head><body>x</body></html>',
    comentarioVacio: '<!doctype html><!--><html><head><title>t</title></head><body><script>var a = 1; /* --> */ var b = "<head>";</script></body></html>',
    apostrofo: "<!doctype html><html lang=es data-nota=it's><head><title>t</title></head><body>" + 'x'.repeat(300) + '</body></html>',
    soloTexto: 'Aviso: variable sin definir en linea 3\n<!doctype html><html><head><title>t</title></head><body>x</body></html>',
    fragmento: '<div class="tarjeta"><h2>htmx</h2></div>',
    headMayus: '<!DOCTYPE HTML>\r\n<HTML>\r\n<HEAD profile="a>b">\r\n<TITLE>x</TITLE></HEAD><BODY>x</BODY></HTML>',
    utf8: '<!doctype html><html lang="gl"><head><title>Ñandú — añoranza €</title></head><body>ñ</body></html>',
  };
  console.log('\n[INY-6] regresiones del inyector: dónde cae el agente y si depende del troceado');
  let incoherentes = 0;
  for (const [nombre, doc] of Object.entries(docs)) {
    const buf = Buffer.from(doc);
    const entero = await run([buf]);
    const porBytes = await run([...buf].map((x) => Buffer.from([x])));
    let distintos = 0;
    for (let k = 1; k < buf.length; k++) if ((await run([buf.subarray(0, k), buf.subarray(k)])) !== entero) distintos++;
    if (porBytes !== entero || distintos) incoherentes++;
    const at = entero.indexOf('[A]');
    const quitado = entero.replace('[A]', '') === doc;
    nota(`${nombre}: …${JSON.stringify(entero.slice(Math.max(0, at - 28), at))} [A] ${JSON.stringify(entero.slice(at + 3, at + 25))}…  intacto=${quitado} byte a byte igual=${porBytes === entero} cortes que cambian el resultado=${distintos}`);
  }
  caso('INY-6', '[NUEVO] el punto de inserción depende de cómo lleguen los trozos', incoherentes > 0, `${incoherentes} documentos de ${Object.keys(docs).length} dan resultados distintos según el troceado`);
  // ¿Cuánto retiene antes de soltar el primer byte?
  const lento = createInjector('[A]');
  let soltado = 0;
  lento.on('data', (x: Buffer) => (soltado += x.length));
  lento.write(Buffer.from("<!doctype html><html lang=es data-nota=it's><head><title>t</title></head><body>"));
  lento.write(Buffer.from('x'.repeat(30000)));
  await espera(30);
  nota(`apóstrofo suelto en un atributo sin comillas de <html>: tras 30 KB de documento el inyector ha soltado ${soltado} bytes (retiene hasta 64 KB o el final)`);
  lento.destroy();
}
{
  const antes = excepciones.length;
  const s = (r: Awaited<ReturnType<typeof pedir>>): string => ('error' in r ? `ERROR ${r.error}` : `${r.status} len=${r.body.length} cl=${r.headers['content-length'] ?? '-'} te=${r.headers['transfer-encoding'] ?? '-'} ce=${r.headers['content-encoding'] ?? '-'} agente=${r.body.includes('agent.js')}`);
  const h = { cookie: C, 'sec-fetch-dest': 'iframe' };
  console.log('\n[INY-5] respuestas sin cuerpo y con content-length (comprobación)');
  nota(`304 text/html      → ${s(await get('/304', { headers: h }))}`);
  nota(`204 text/html      → ${s(await get('/204', { headers: h }))}`);
  nota(`HEAD con c-length  → ${s(await get('/cl', { method: 'HEAD', headers: h }))}`);
  const cl = await get('/cl', { headers: h });
  nota(`GET con c-length   → ${s(cl)}  completo=${!('error' in cl) && cl.body.toString().endsWith('</html>')}`);
  nota(`brotli             → ${s(await get('/br', { headers: h }))}`);
  nota(`zstd (no sabemos)  → ${s(await get('/zstd', { headers: h }))}`);
  nota(`200 cuerpo vacío   → ${s(await get('/vacio', { headers: h }))}`);
  nota(`302 cuerpo vacío   → ${s(await get('/redir-vacio', { headers: h }))}`);
  nota(`excepciones no capturadas en este bloque: ${excepciones.length - antes}; diagnóstico: ${JSON.stringify(px.diagnostics().filter((l) => l.includes('zstd')).map((l) => l.slice(25)))}`);
}

// ───────────────────────── cabeceras
{
  const r = await get(`/cookies?g=${px.gateCookie}`, { headers: { cookie: C, 'sec-fetch-dest': 'empty' } });
  const sc = 'error' in r ? [] : (r.headers['set-cookie'] ?? []);
  console.log('\n[CAB-1] Set-Cookie reescritas');
  for (const c of sc) nota(c);
  caso('CAB-2', '[H-3] la app puede pisar la cookie de entrada con un Set-Cookie propio', sc.some((c) => c.trimStart().startsWith(px.gateCookie)), `Set-Cookie con nuestro nombre que llegan a la celda: ${sc.filter((c) => c.trimStart().startsWith(GATE_PREFIX)).length}`);
}
{
  const t = up.origin;
  const prueba = async (a: string): Promise<string> => {
    const r = await get(`/loc?a=${encodeURIComponent(a)}`, { headers: { cookie: C, 'sec-fetch-dest': 'iframe' } });
    return 'error' in r ? r.error : String(r.headers.location);
  };
  console.log('\n[CAB-3] [H-13] Location');
  let mal = 0;
  const casos: [string, boolean][] = [[`${t}/b`, true], [`${t}`, true], [`${t}?x=1`, true], [`${t}1/b`, false], [`${t.toUpperCase()}/b`, true], [`//127.0.0.1:${up.port}/b`, true], ['/b', false], ['b?x', false], ['https://otro.example/cb', false], [`${t.replace('127.0.0.1', 'localhost')}/b`, true], [`http://[::1]:${up.port}/b`, true], [`https://127.0.0.1:${up.port}/b`, false]];
  for (const [a, debe] of casos) {
    const l = await prueba(a);
    const reescrita = l.startsWith(O);
    if (reescrita !== debe) mal++;
    nota(`${a}  →  ${l}${reescrita !== debe ? '   ← INESPERADO' : ''}`);
  }
  caso('CAB-3', '[H-13] Location con alias del servidor no se reescribe', mal > 0, `${mal} casos inesperados de ${casos.length}`);
  nota(`rewriteLocation('http://otra.localhost:3000/x') con destino localhost:3000 → ${rewriteLocation('http://otra.localhost:3000/x', { target: new URL('http://localhost:3000'), proxyOrigin: 'http://P' })} (cualquier *.localhost con el mismo puerto se toma por el servidor)`);
}

// ───────────────────────── paso de API
{
  const hs = { cookie: `${C}; sid=app`, 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'same-origin', origin: O };
  const j = async (path: string, o: Parameters<typeof pedir>[2] = {}): Promise<string> => {
    const r = await get(path, { headers: hs, ...o });
    return 'error' in r ? `ERROR ${r.error}` : `${r.status} ${r.headers.location ? 'Location=' + r.headers.location + ' ' : ''}${r.headers['set-cookie'] ? 'Set-Cookie=' + JSON.stringify(r.headers['set-cookie']) + ' ' : ''}${r.body.toString().slice(0, 160)}`;
  };
  console.log('\n[API-1] paso /__viewkeeper/api/<n>/ (comprobación)');
  nota(`índice 0 (API local de la lista)       → ${await j(`${PREFIX}/api/0/datos?x=1`)}`);
  for (const n of ['1', '2', '3', '-1', '00', '0x0', '1e3', '99999999999999999999']) nota(`índice ${n.padEnd(22)} → ${(await j(`${PREFIX}/api/${n}/x`)).slice(0, 60)}`);
  nota(`sin barra final /api/0                → ${(await j(`${PREFIX}/api/0`)).slice(0, 40)}`);
  nota(`/api/0/../../fuera                    → ${await j(`${PREFIX}/api/0/../../fuera`)}`);
  nota(`/api/0//evil.example/x                → ${await j(`${PREFIX}/api/0//evil.example/x`)}`);
  nota(`sin cookie de entrada                 → ${(await j(`${PREFIX}/api/0/x`, { headers: { 'sec-fetch-dest': 'empty' } })).slice(0, 40)}`);
  nota(`fetch desde otro sitio (cross-site)   → ${(await j(`${PREFIX}/api/0/x`, { headers: { ...hs, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' } })).slice(0, 40)}`);
  const n0 = api.vistas.length;
  const redAbs = await j(`${PREFIX}/api/0/usuarios`);
  const redRel = await j(`${PREFIX}/api/0/rel`);
  caso('API-2', '[NUEVO] redirección de la API (barra final de FastAPI/Django): Location sale del paso y la llamada vuelve a ser de otro origen', redAbs.includes(`Location=${api.origin}`), `absoluta: ${redAbs.slice(0, 90)}`);
  caso('API-3', '[NUEVO] redirección relativa de la API: el navegador la resuelve contra el proxy y acaba en la APP, no en la API', /Location=\/usuarios\//.test(redRel), `relativa: ${redRel.slice(0, 60)} → el navegador pedirá ${new URL('/usuarios/', O).href} (eso es la app)`);
  const ck = await j(`${PREFIX}/api/0/sesion`);
  caso('API-4', '[NUEVO] cookie de la API con Path distinto de «/»: el Path no se traduce al prefijo del paso y el navegador no la devolverá', /Path=\/api;/.test(ck), ck.slice(0, 120));
  nota(`peticiones que vio la API en este bloque: ${JSON.stringify(api.vistas.slice(n0).map((v) => v.url))}`);
  // Túnel WebSocket hacia la API: el upgrade solo conoce el destino principal.
  const ws = await crudo(px.port, `GET ${PREFIX}/api/0/ws HTTP/1.1\r\nHost: ${H(px)}\r\nCookie: ${C}\r\nOrigin: ${O}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`, 600);
  nota(`WebSocket a ${PREFIX}/api/0/ws → va al destino principal con esa ruta, no a la API: ${JSON.stringify(up.vistas.at(-1)?.url)} ${JSON.stringify(ws.split('\r\n')[0])}`);
}

// ───────────────────────── línea de petición, Host, cruce de sitios
{
  console.log('\n[REQ-1] líneas de petición raras (con cookie válida): qué llega al servidor');
  const n0 = up.vistas.length;
  const base = `Host: ${H(px)}\r\nCookie: ${C}\r\nSec-Fetch-Dest: empty\r\nConnection: close\r\n\r\n`;
  const antes = excepciones.length;
  for (const linea of ['GET http://evil.example/abs HTTP/1.1', 'GET //evil.example/dos HTTP/1.1', `GET http://x${PREFIX}/api/0/abs HTTP/1.1`, `GET ${PREFIX}/agent.js?x HTTP/1.1`, `GET ${PREFIX}/enter HTTP/1.1`, 'OPTIONS * HTTP/1.1']) {
    const resp = await crudo(px.port, Buffer.from(`${linea}\r\n${base}`, 'latin1'), 500);
    nota(`${JSON.stringify(linea)} → ${JSON.stringify(resp.split('\r\n')[0])}`);
  }
  for (const v of up.vistas.slice(n0)) nota(`   el servidor vio: ${v.method} ${JSON.stringify(v.url)} host=${v.headers.host}`);
  nota(`excepciones no capturadas en este bloque: ${JSON.stringify(excepciones.slice(antes))}`);
}
{
  console.log('\n[REQ-2] Host');
  for (const h of [H(px), `s-main-${px.tag}.localhost:0${px.port}`, `s-main-${px.tag}.localhost.:${px.port}`, `s-main.localhost:${px.port}`, `s-main-${tagFor('http://otro:1')}.localhost:${px.port}`, `s-ma-in-${px.tag}.localhost:${px.port}`, `s-main-${px.tag.toUpperCase()}.LOCALHOST:${px.port}`, `s-main-${px.tag}.localhost:${px.port}@evil.example`]) nota(`${JSON.stringify(h)} → sesión ${JSON.stringify(sessionFromHost(h, px.port, px.tag))}`);
  const w = async (extra: string): Promise<string> => (await crudo(px.port, `GET /ws HTTP/1.1\r\n${extra}Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n`, 400)).split('\r\n')[0];
  nota(`WebSocket con Host ajeno y cookie válida → ${await w(`Host: evil.example\r\nCookie: ${C}\r\nOrigin: ${O}\r\n`)}`);
  nota(`WebSocket sin cookie → ${await w(`Host: ${H(px)}\r\nOrigin: ${O}\r\n`)}`);
  nota(`WebSocket con Origin de otra web → ${await w(`Host: ${H(px)}\r\nCookie: ${C}\r\nOrigin: https://evil.example\r\n`)}`);
  nota(`WebSocket sin Origin → ${await w(`Host: ${H(px)}\r\nCookie: ${C}\r\n`)}`);
}
{
  console.log('\n[CRZ-1] crossSiteAllowed (comprobación a nivel HTTP; el comportamiento real del navegador está en r4)');
  const m = (method: string, site: string | undefined, mode?: string, dest?: string): string => {
    const headers: Record<string, string> = {};
    if (site) headers['sec-fetch-site'] = site;
    if (mode) headers['sec-fetch-mode'] = mode;
    if (dest) headers['sec-fetch-dest'] = dest;
    return `${method} site=${site ?? '-'} mode=${mode ?? '-'} dest=${dest ?? '-'} → ${crossSiteAllowed({ method, headers }) ? 'pasa' : '403'}`;
  };
  for (const l of [m('GET', 'cross-site', 'navigate', 'iframe'), m('GET', 'cross-site', 'navigate', 'document'), m('POST', 'cross-site', 'navigate', 'iframe'), m('GET', 'cross-site', 'no-cors', 'image'), m('GET', 'cross-site', 'no-cors', 'script'), m('GET', 'cross-site', 'cors', 'empty'), m('GET', 'cross-site', 'websocket', 'websocket'), m('POST', 'same-site', 'cors', 'empty'), m('POST', 'same-origin', 'cors', 'empty'), m('POST', 'none', 'navigate', 'document'), m('POST', undefined)]) nota(l);
  const r = await get('/cl', { headers: { cookie: C, 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', referer: 'https://evil.example/' } });
  caso('EMB-1', '[H-1, resto] con la cookie en el bote, una página ajena aún puede INCRUSTAR la app (GET de iframe): sin X-Frame-Options', !('error' in r) && r.status === 200 && r.headers['x-frame-options'] === undefined, 'error' in r ? r.error : `status=${r.status}; es indistinguible de la entrada del panel. Lo que cambia es que el agente ya no le habla (ver r4, AGE-1)`);
  const a = await get(`${PREFIX}/agent.js`, { headers: { cookie: C, 'sec-fetch-dest': 'script', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' } });
  nota(`agent.js cargado como <script> desde otra web → ${'error' in a ? a.error : a.status}`);
}

await px.close();
await up.close();
await api.close();
console.log(`\nexcepciones no capturadas en total: ${excepciones.length} ${JSON.stringify(excepciones)}`);
process.exit(0);
process.exitCode = resultado();
