// Pruebas del núcleo puro: dispositivos, modelo, reparto de eventos, rutas, puertos y captura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES, findDevice, fitScale, parseCustomDevice, rotate } from '../../src/core/devices.ts';
import { MAX_CELLS, SYNC_ALL, addSession, applyEdit, capCells, isLoopback, matrix, normalizeTarget, parseMosaic, type Cell } from '../../src/core/mosaic.ts';
import { SyncRouter, pageKey } from '../../src/core/sync.ts';
import { detectRoutes, fillRoute } from '../../src/core/routes.ts';
import { detect, identify, portsFromScripts } from '../../src/core/ports.ts';
import { MAX_SHOT_HEIGHT, browserCandidates, capture, captureArgs, contactSheet, findBrowser } from '../../src/core/capture.ts';

test('P-20 dispositivos: catálogo coherente, giro y escala que nunca amplía', () => {
  assert.equal(new Set(DEVICES.map((d) => d.id)).size, DEVICES.length);
  const d = findDevice('iphone-15')!;
  assert.deepEqual([rotate(d).width, rotate(d).height], [d.height, d.width]);
  assert.equal(fitScale({ width: 400, height: 800 }, 200, 800), 0.5);
  assert.equal(fitScale({ width: 400, height: 800 }, 4000, 4000), 1);
  assert.equal(fitScale({ width: 400, height: 800 }, 0, 0), 1);
  assert.equal(parseCustomDevice({ name: 'Kiosco', width: 1080, height: 1920 })?.id, 'custom-kiosco');
  for (const bad of [null, {}, { name: '', width: 1, height: 1 }, { name: 'x', width: 10, height: 500 }, { name: 'x', width: 1.5, height: 500 }, { name: 'x', width: '300', height: 99999 }]) {
    assert.equal(parseCustomDevice(bad), undefined);
  }
});

test('P-21 destino: se aceptan puerto, host y URL; se rechaza lo que no es http', () => {
  assert.deepEqual(normalizeTarget('3000'), { origin: 'http://localhost:3000', path: '/' });
  assert.deepEqual(normalizeTarget('localhost:5173/app?x=1#y'), { origin: 'http://localhost:5173', path: '/app?x=1#y' });
  assert.deepEqual(normalizeTarget(' https://staging.example.com '), { origin: 'https://staging.example.com', path: '/' });
  for (const bad of ['', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://x', 'http://user:pass@host', 'http://']) assert.equal(normalizeTarget(bad), undefined, bad);
  assert.ok(isLoopback('http://localhost:3000') && isLoopback('http://127.0.0.1:1') && isLoopback('http://app.localhost'));
  assert.ok(!isLoopback('http://localhost.evil.com') && !isLoopback('https://example.com'));
});

test('P-22 matriz: una fila y un grupo por ruta, con tope de celdas', () => {
  const m = matrix(['/', 'carrito', '//evil'], ['iphone-15', 'laptop']);
  assert.deepEqual(m.map((c) => `${c.id}:${c.path}:${c.group}`), ['r0c0:/:0', 'r0c1:/:0', 'r1c0:/carrito:1', 'r1c1:/carrito:1', 'r2c0:/:2', 'r2c1:/:2']);
  assert.equal(matrix(Array.from({ length: 10 }, (_, i) => '/' + i), ['a', 'b', 'c']).length, MAX_CELLS);
});

test('P-23 tope de celdas: doce como mucho, y se dice cuántas quedaron fuera', () => {
  const cells = matrix(['/', '/b', '/c', '/d'], ['iphone-15', 'ipad-mini', 'laptop', 'desktop']);
  assert.equal(cells.length, MAX_CELLS, 'matrix ya recorta');
  const muchas = [...cells, ...cells.map((c) => ({ ...c, id: c.id + 'x' }))];
  const r = capCells(muchas);
  assert.equal(r.cells.length, MAX_CELLS);
  assert.equal(r.dropped, MAX_CELLS);
  assert.deepEqual(capCells([]), { cells: [], dropped: 0 });
});

test('P-24 mosaico guardado: lo inválido se descarta sin lanzar', () => {
  const ok = parseMosaic({ v: 1, name: 'x', target: 'localhost:3000', cells: [{ id: 'a', deviceId: 'laptop', path: 'b', session: 'Admin!', group: -1, locale: 'gl' }, { id: 'a', deviceId: 'dup', path: '/' }, { id: '../x', deviceId: 'l', path: '/' }, 7], sync: { nav: false } });
  assert.deepEqual(ok, { v: 1, name: 'x', target: 'http://localhost:3000', cells: [{ id: 'a', deviceId: 'laptop', landscape: false, path: '/b', session: 'main', group: 0, locale: 'gl' }], sync: { scroll: true, click: true, input: true, nav: false } });
  for (const bad of [null, 1, {}, { v: 2, name: 'x', target: '3000', cells: [] }, { v: 1, name: 'x', target: 'file:///x', cells: [{ id: 'a', deviceId: 'l', path: '/' }] }, { v: 1, name: 'x', target: '3000', cells: [] }]) {
    assert.equal(parseMosaic(bad), undefined);
  }
});

const C = (id: string, group = 0, session = 'main', locale?: string): Cell => ({ id, deviceId: 'laptop', landscape: false, path: '/', session, group, locale });
const U = (p: string): string => 'http://s-main-aaaaaaaa.localhost:1' + p;
/** Reparto con reloj de mano y las celdas ya cargadas en '/'. */
function montar(cells: Cell[], opts = SYNC_ALL): { r: SyncRouter; reloj: { t: number } } {
  const reloj = { t: 1000 };
  const r = new SyncRouter(cells, opts, () => reloj.t);
  for (const c of cells) {
    r.route(c.id, { t: 'hello', url: U('/') });
    r.route(c.id, { t: 'ready', url: U('/'), title: '', height: 1 });
  }
  return { r, reloj };
}
const llega = (r: SyncRouter, id: string, p: string): void => {
  assert.deepEqual(r.route(id, { t: 'hello', url: U(p) }), [], `hello de ${id}`);
  assert.deepEqual(r.route(id, { t: 'ready', url: U(p), title: '', height: 1 }), [], `ready de ${id}`);
};
const nav = (to: string, path: string): { to: string; cmd: { t: 'nav'; path: string } } => ({ to, cmd: { t: 'nav', path } });

test('P-25 navegación: solo se reparte con un gesto del usuario, el gesto se gasta y caduca', () => {
  const { r, reloj } = montar([C('a'), C('b'), C('c')]);
  // Sin gesto (una redirección, un temporizador de la página): nadie se mueve.
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/x') }), []);
  assert.equal(r.currentPath('a'), '/x', 'pero se anota dónde está');
  // Con gesto: b y c reciben la orden.
  r.route('a', { t: 'gesture' });
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/y') }), [nav('b', '/y'), nav('c', '/y')]);
  // El mismo gesto no justifica una segunda navegación (pushState seguido de un replaceState de la app).
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/z') }), []);
  llega(r, 'b', '/y');
  llega(r, 'c', '/y');
  // Un gesto viejo no vale (mutante: el gesto no caduca).
  r.route('a', { t: 'gesture' });
  reloj.t += 9000;
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/tarde') }), []);
  // Un clic o una tecla repartidos también cuentan como gesto (mutante).
  const m = montar([C('a'), C('b')]);
  m.r.route('a', { t: 'click', sel: '#enlace' });
  // b recibió el mismo clic: se le da margen para llegar sola (P-36); si no llega, due() la manda.
  assert.deepEqual(m.r.route('a', { t: 'hello', url: U('/destino') }), []);
  m.reloj.t += 1600;
  assert.deepEqual(m.r.due(), [nav('b', '/destino')]);
});

test('P-31 navegación (H-2): admin e invitado en el mismo grupo no entran en bucle', () => {
  const { r } = montar([C('admin', 0, 'admin'), C('inv', 0, 'inv')]);
  // El invitado había tocado su celda hace un momento: ese gesto no puede justificar lo que venga de una orden.
  r.route('inv', { t: 'gesture' });
  r.route('admin', { t: 'gesture' });
  assert.deepEqual(r.route('admin', { t: 'hello', url: U('/admin') }), [nav('inv', '/admin')]);
  r.route('admin', { t: 'ready', url: U('/admin'), title: '', height: 1 });
  // Al invitado el servidor lo manda a /login. Es el resultado de la orden, no una navegación suya.
  llega(r, 'inv', '/login');
  assert.equal(r.currentPath('inv'), '/login', 'se anota donde acabó, no donde se le mandó');
  assert.equal(r.currentPath('admin'), '/admin', 'y el admin no se mueve');
  // Ya cumplida la orden, una redirección de cliente del invitado tampoco saca al admin: su gesto se le quitó (mutante).
  assert.deepEqual(r.route('inv', { t: 'nav', url: U('/login?siguiente=1') }), []);
  // No enseñan la misma página: un clic del admin no se le reproduce al invitado.
  assert.deepEqual(r.route('admin', { t: 'click', sel: 'body' }), []);
  assert.deepEqual(r.route('admin', { t: 'scroll', sel: '', rx: 0, ry: 1 }), []);
});

test('P-32 navegación: la posición se anota al confirmarse, y a medio camino esa celda ni recibe ni reparte', () => {
  const { r, reloj } = montar([C('a'), C('b')]);
  r.route('a', { t: 'gesture' });
  assert.equal(r.route('a', { t: 'nav', url: U('/x') }).length, 1);
  assert.equal(r.currentPath('b'), '/', 'b sigue donde estaba hasta que lo diga ella');
  assert.deepEqual(r.route('a', { t: 'click', sel: '#ok' }), [], 'un clic de a no se le manda: acertaría en la página vieja');
  assert.deepEqual(r.route('b', { t: 'click', sel: '#ok' }), [], 'y b, a medio navegar, no reparte (mutante)');
  // Con el primer aviso del documento nuevo aún no está: falta que cargue (mutante).
  assert.deepEqual(r.route('b', { t: 'hello', url: U('/x') }), []);
  assert.deepEqual(r.route('a', { t: 'scroll', sel: '', rx: 0, ry: 0.5 }), []);
  assert.deepEqual(r.route('b', { t: 'ready', url: U('/x'), title: '', height: 1 }), []);
  assert.deepEqual(r.route('a', { t: 'click', sel: '#ok', fp: 'f', tx: 't' }), [{ to: 'b', cmd: { t: 'click', sel: '#ok', fp: 'f', tx: 't' } }]);
  reloj.t += 2000; // fuera del margen del clic reproducido de arriba
  // Ir y volver deprisa (N-8): b aún va camino de /y cuando a vuelve a /x. Se la manda a /x, no se da por buena.
  r.route('a', { t: 'gesture' });
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/y') }), [nav('b', '/y')]);
  r.route('a', { t: 'gesture' });
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/x') }), [nav('b', '/x')]);
  // Una orden que nunca se cumple caduca, y no se traga la siguiente navegación del usuario en esa celda (N-8).
  reloj.t += 16_000;
  r.route('b', { t: 'gesture' });
  assert.deepEqual(r.route('b', { t: 'nav', url: U('/q') }), [nav('a', '/q')]);
});

test('P-33 navegación: barra final y ancla de posición no son otra página; el enrutado por ancla sí', () => {
  const { r } = montar([C('a'), C('b')]);
  r.route('a', { t: 'gesture' });
  r.route('a', { t: 'nav', url: U('/docs') });
  // El servidor redirige a /docs/ en las dos: no es una navegación nueva ni rompe el «misma página».
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/docs/') }), []);
  llega(r, 'b', '/docs/');
  assert.equal(r.route('a', { t: 'scroll', sel: '', rx: 0, ry: 0.5 }).length, 1);
  assert.deepEqual([pageKey('/docs/'), pageKey('/docs#x'), pageKey('/'), pageKey('/a/?q=1#h')], ['/docs', '/docs', '/', '/a?q=1']);
  // Apps con enrutado por ancla (N-3): #/ruta es la ruta.
  assert.deepEqual([pageKey('/#/clientes'), pageKey('/#!/a'), pageKey('/app/#/x?y=1')], ['/#/clientes', '/#!/a', '/app#/x?y=1']);
  const h = montar([C('a'), C('b')]);
  h.r.route('a', { t: 'gesture' });
  assert.deepEqual(h.r.route('a', { t: 'nav', url: U('/#/clientes') }), [nav('b', '/#/clientes')]);
  assert.deepEqual(h.r.route('a', { t: 'click', sel: 'body' }), [], 'y dos vistas distintas no son la misma página');
  // Una celda que carga cuando su grupo ya navegó recibe la ruta del grupo, una vez.
  const r2 = new SyncRouter([C('a'), C('b')], SYNC_ALL, () => 1);
  r2.route('a', { t: 'hello', url: U('/') });
  r2.route('a', { t: 'gesture' });
  assert.deepEqual(r2.route('a', { t: 'nav', url: U('/x') }), [], 'b aún no existe: no se le manda nada');
  assert.deepEqual(r2.route('b', { t: 'hello', url: U('/') }), [nav('b', '/x')]);
  assert.deepEqual(r2.route('b', { t: 'ready', url: U('/'), title: '', height: 1 }), []);
  assert.equal(r2.currentPath('a'), '/x', 'y la tardía no devuelve al líder al inicio');
});

test('P-34 cortacircuitos: salta con navegaciones a velocidad de máquina, no con alguien pasando páginas', () => {
  const pasar = (cada: number, veces: number): { repartidas: number; avisos: number; r: SyncRouter; reloj: { t: number } } => {
    const { r, reloj } = montar([C('a'), C('b'), C('z', 1)]);
    let avisos = 0;
    let repartidas = 0;
    r.onTrip = () => avisos++;
    for (let i = 0; i < veces; i++) {
      reloj.t += cada;
      r.route('a', { t: 'gesture' });
      repartidas += r.route('a', { t: 'nav', url: U('/p' + i) }).length;
      llega(r, 'b', '/p' + i);
    }
    return { repartidas, avisos, r, reloj };
  };
  // Una persona, un clic cada 1,2 s, veinte páginas: no salta (N-2; mutante: la ventana no se aplica).
  const persona = pasar(1200, 20);
  assert.deepEqual([persona.repartidas, persona.avisos], [20, 0]);
  // Un bucle: doce navegaciones en 1,2 s.
  const bucle = pasar(100, 12);
  assert.deepEqual([bucle.repartidas, bucle.avisos], [8, 1]);
  assert.ok(bucle.r.isTripped(0) && !bucle.r.isTripped(1));
  // Se rearma sola pasado un rato…
  bucle.reloj.t += 31_000;
  assert.ok(!bucle.r.isTripped(0));
  // …o al recargar.
  const otro = pasar(100, 12);
  otro.r.rearm();
  assert.ok(!otro.r.isTripped(0));
  otro.reloj.t += 100;
  otro.r.route('a', { t: 'gesture' });
  assert.equal(otro.r.route('a', { t: 'nav', url: U('/tras-recargar') }).length, 1);
});

test('P-26 reparto: scroll, clic y escritura solo entre celdas del mismo grupo y la misma página', () => {
  const { r } = montar([C('a'), C('b'), C('z', 1)]);
  const s = { t: 'scroll', sel: '', rx: 0, ry: 0.5 } as const;
  assert.deepEqual(r.route('a', s), [{ to: 'b', cmd: s }]);
  assert.deepEqual(r.route('z', s), []);
  assert.deepEqual(r.route('desconocida', s), []);
  // El tipo de evento de escritura y las dos huellas viajan tal cual.
  assert.deepEqual(r.route('a', { t: 'input', sel: '#q', kind: 'change', fp: 'f', tx: 't', value: 'x' }), [{ to: 'b', cmd: { t: 'input', sel: '#q', kind: 'change', fp: 'f', tx: 't', value: 'x', checked: undefined } }]);
  // Lo que no es para repartir no se reparte.
  assert.deepEqual(r.route('a', { t: 'miss', kind: 'click' }), []);
  assert.deepEqual(r.route('a', { t: 'hint', kind: 'api', origin: 'http://localhost:1' }), []);
  assert.deepEqual(r.route('a', { t: 'answer', id: 1, data: null }), []);
  // Entre celdas de distinto idioma o sesión el texto no sirve de huella: se manda sin él (N-7).
  const i = montar([C('es'), C('gl', 0, 'main', 'gl'), C('adm', 0, 'admin')]);
  assert.deepEqual(i.r.route('es', { t: 'click', sel: '#m', fp: 'button||||', tx: '|Menú' }), [
    { to: 'gl', cmd: { t: 'click', sel: '#m', fp: 'button||||', tx: undefined } },
    { to: 'adm', cmd: { t: 'click', sel: '#m', fp: 'button||||', tx: undefined } },
  ]);
  // Con la navegación sincronizada apagada, cada celda va por su lado y deja de recibir.
  const m = montar([C('a'), C('b')], { ...SYNC_ALL, nav: false });
  m.r.route('a', { t: 'gesture' });
  assert.deepEqual(m.r.route('a', { t: 'nav', url: U('/otra') }), []);
  assert.deepEqual(m.r.route('a', { t: 'click', sel: 'body' }), []);
  const n = montar([C('a'), C('b')], { scroll: false, click: false, input: false, nav: true });
  assert.deepEqual(n.r.route('a', s), []);
  assert.deepEqual(n.r.route('a', { t: 'input', sel: '#q', value: 'x' }), []);
  assert.deepEqual(n.r.route('a', { t: 'click', sel: 'body' }), []);
});


test('P-27 rutas: Next (app y pages), SvelteKit, Astro, Nuxt y HTML suelto', () => {
  const r = detectRoutes([
    'app/page.tsx', 'app/(marketing)/precios/page.tsx', 'app/blog/[slug]/page.tsx', 'app/@modal/(.)foto/page.tsx', 'app/_privado/page.tsx', 'app/api/route.ts',
    'src\\pages\\contacto.astro', 'pages/api/hola.ts', 'pages/_app.tsx', 'pages/cuenta/index.tsx',
    'src/routes/tienda/+page.svelte', 'pages/equipo.vue', 'public/legal.html', 'index.html', 'node_modules/x/app/page.tsx', '.next/server/app/page.js',
  ]);
  assert.deepEqual(r.map((x) => x.path), ['/', '/contacto', '/cuenta', '/equipo', '/legal.html', '/precios', '/tienda', '/blog/[slug]']);
  assert.equal(r.at(-1)?.dynamic, true);
  assert.equal(fillRoute('/blog/[slug]', { slug: 'hola mundo' }), '/blog/hola%20mundo');
  assert.equal(fillRoute('/docs/[[...ruta]]', { ruta: 'a/b' }), '/docs/a/b');
  assert.equal(fillRoute('/blog/[slug]', {}), undefined);
});

test('P-28 puertos: los del package.json primero, y solo cuenta quien sirve HTML', async () => {
  assert.deepEqual(portsFromScripts('{"scripts":{"dev":"next dev -p 4000","start":"PORT=4100 node x","build":"vite build --port 9","serve":"vite --port=4200"}}'), [4000, 4100, 4200]);
  assert.deepEqual(portsFromScripts('no es json'), []);
  const found = await detect([4000, 5173, 3000, 4000], async (port) => {
    if (port === 5173) return { status: 200, headers: { 'content-type': 'text/html' }, body: '<script type="module" src="/@vite/client"></script>' };
    if (port === 3000) return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"api":true}' };
    if (port === 4000) throw new Error('rechazada');
    return undefined;
  });
  assert.deepEqual(found, [{ port: 5173, origin: 'http://localhost:5173', framework: 'Vite' }]);
  assert.equal(identify({ status: 200, headers: { 'x-powered-by': 'Next.js' }, body: '' }), 'Next.js');
  assert.equal(identify({ status: 200, headers: {}, body: '<html>' }), undefined);
});

test('P-29 captura: argumentos sin shell, altura acotada y navegador encontrado por orden', async () => {
  const shot = { label: 'iPhone', url: 'http://s-main.localhost:1/__viewkeeper/enter?t=x&to=%2F&replay=1', out: 'C:\\t\\a b.png', width: 393, height: 99999, dpr: 3, userAgent: 'UA con espacios' };
  const args = captureArgs(shot, 'C:\\perfil temporal');
  assert.equal(args.at(-1), shot.url);
  assert.ok(args.includes(`--window-size=393,${MAX_SHOT_HEIGHT}`));
  assert.ok(args.includes('--screenshot=C:\\t\\a b.png') && args.includes('--user-agent=UA con espacios'));
  assert.ok(browserCandidates('win32', { PROGRAMFILES: 'C:\\PF' }).includes('C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe'));
  assert.ok(browserCandidates('darwin', {}).every((p) => p.startsWith('/Applications/')));
  const io = { exists: async (p: string) => p === '/usr/bin/chromium' || p === 'ok.png', run: async (_e: string, a: string[]) => (a.some((x) => x === '--screenshot=ok.png') ? 0 : 1) };
  assert.equal(await findBrowser(io, 'linux', {}), '/usr/bin/chromium');
  assert.equal(await findBrowser(io, 'linux', {}, '/no/existe'), '/usr/bin/chromium');
  assert.equal(await findBrowser({ ...io, exists: async () => false }, 'linux', {}), undefined);
  const res = await capture(io, '/usr/bin/chromium', [{ ...shot, out: 'ok.png' }, { ...shot, out: 'mal.png' }], 'p');
  assert.deepEqual([res.ok.length, res.failed.length], [1, 1]);
});

test('P-30 hoja de contactos: escapa los textos y calcula su tamaño', () => {
  const s = contactSheet('<Mi app>', [{ label: '/a&b', shots: [{ label: '"x"', file: 'a.png', width: 400, height: 800 }, { label: 'y', file: 'b.png', width: 1600, height: 800 }] }], 400);
  assert.match(s.html, /&lt;Mi app&gt;/);
  assert.match(s.html, /\/a&amp;b/);
  assert.match(s.html, /&quot;x&quot;/);
  assert.deepEqual([s.width, s.height], [24 + 200 + 24 + 800 + 24 + 24, 64 + 400 + 96]);
});

test('P-35 barra de herramientas: las ediciones del panel, validadas como entrada no fiable', () => {
  const known = (id: string): boolean => DEVICES.some((d) => d.id === id);
  const base: import('../../src/core/mosaic.ts').Mosaic = { v: 1, name: 'x', target: 'http://localhost:3000', sync: SYNC_ALL, cells: matrix(['/', '/b'], ['iphone-15', 'laptop']) };
  // cambiar dispositivo deshace el giro
  const girada = applyEdit(base, { op: 'rotate', cell: 'r0c0' }, known);
  assert.equal(girada.cells[0].landscape, true);
  const otra = applyEdit(girada, { op: 'device', cell: 'r0c0', deviceId: 'pixel-8' }, known);
  assert.deepEqual([otra.cells[0].deviceId, otra.cells[0].landscape], ['pixel-8', false]);
  // añadir copia ruta y sesión de su fila, con id nuevo
  const mas = applyEdit(base, { op: 'add', deviceId: 'ipad-mini', group: 1 }, known);
  assert.deepEqual(mas.cells.at(-1), { id: 'c0', deviceId: 'ipad-mini', landscape: false, path: '/b', session: 'main', group: 1, locale: undefined });
  // quitar, también la última
  let vacia = base;
  for (const c of base.cells) vacia = applyEdit(vacia, { op: 'remove', cell: c.id }, known);
  assert.equal(vacia.cells.length, 0);
  assert.deepEqual(applyEdit(vacia, { op: 'add', deviceId: 'laptop' }, known).cells[0].path, '/', 'añadir a un mosaico vacío');
  // interruptores
  assert.equal(applyEdit(base, { op: 'sync', key: 'nav', value: false }, known).sync.nav, false);
  // basura: devuelve el mismo objeto
  for (const bad of [null, 'x', {}, { op: 'device', cell: 'r0c0', deviceId: 'inventado' }, { op: 'remove', cell: 'nada' }, { op: 'sync', key: '__proto__', value: true }, { op: 'sync', key: 'nav', value: 'no' }, { op: 'add', deviceId: 'laptop', group: -1 }, { op: 'borrar-todo' }]) {
    const r = applyEdit(base, bad, known);
    if ((bad as { op?: string })?.op === 'add') assert.equal(r.cells.at(-1)?.group, 0, 'grupo inválido → fila 0');
    else assert.equal(r, base, JSON.stringify(bad));
  }
  // tope
  let llena = base;
  for (let i = 0; i < 20; i++) llena = applyEdit(llena, { op: 'add', deviceId: 'laptop' }, known);
  assert.equal(llena.cells.length, MAX_CELLS);
  // sesiones
  assert.deepEqual(addSession(base, 'admin')?.cells.at(-1), { ...base.cells[0], id: 'c0', session: 'admin' });
  assert.equal(addSession(base, 'Admin!'), undefined);
  assert.equal(addSession(vacia, 'admin'), undefined);
});

test('P-36 navegación tras un clic reproducido: la seguidora tiene margen para llegar sola (NAV-6)', () => {
  const { r, reloj } = montar([C('a'), C('b'), C('c')]);
  // El usuario pulsa «Siguiente» en a; el clic se reproduce en b y c.
  assert.equal(r.route('a', { t: 'click', sel: '#sig' }).length, 2);
  reloj.t += 150;
  // La SPA de a hace pushState: no se manda a nadie todavía, porque b y c acaban de recibir el mismo clic.
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/spa?p=1') }), []);
  // b llega sola; c no.
  reloj.t += 20;
  assert.deepEqual(r.route('b', { t: 'nav', url: U('/spa?p=1') }), [], 'llegar sola no reparte nada');
  assert.deepEqual(r.due(), [], 'antes de vencer, nada');
  reloj.t += 1500;
  assert.deepEqual(r.due(), [nav('c', '/spa?p=1')], 'al vencer, solo la que no llegó');
  assert.deepEqual(r.due(), [], 'y una sola vez');
  llega(r, 'c', '/spa?p=1');
  // Sin clic reproducido (un enlace en a que b no tiene) la orden sale en el acto.
  reloj.t += 5000;
  r.route('a', { t: 'gesture' });
  assert.deepEqual(r.route('a', { t: 'nav', url: U('/otra') }), [nav('b', '/otra'), nav('c', '/otra')]);
});
