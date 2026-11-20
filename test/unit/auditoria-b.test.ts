// Auditoría B del plan de mejoras (panel, host, comandos y reparto): una prueba por defecto corregido y por
// mutante que sobrevivía, en lo que se puede probar sin VS Code. Identificadores del informe: B-n y mNN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYNC_ALL, matrix, type Cell, type Mosaic } from '../../src/core/mosaic.ts';
import { canReopenSilently, forMemory, syncAfterAddressChange } from '../../src/core/open.ts';
import { followTarget, frameworksIn, kindOf, routeChoices, routeForFile } from '../../src/core/routes.ts';
import { SyncRouter } from '../../src/core/sync.ts';

const c = (id: string, group = 0): Cell => ({ id, deviceId: 'laptop', landscape: false, path: '/', session: 'main', group });
const url = (p: string): string => 'http://x' + p;

function fila(opts = SYNC_ALL): { r: SyncRouter; reloj: { t: number }; llega: (id: string, p: string) => ReturnType<SyncRouter['route']> } {
  const reloj = { t: 1000 };
  const r = new SyncRouter([c('a'), c('b')], opts, () => reloj.t);
  const llega = (id: string, p: string): ReturnType<SyncRouter['route']> => [...r.route(id, { t: 'hello', url: url(p) }), ...r.route(id, { t: 'ready', url: url(p), title: '', height: 1 })];
  return { r, reloj, llega };
}

test('P-78 drive: una orden en vuelo se puede deshacer, y la llegada no rebota aunque hubiera un gesto (B-1, m10a, m10b)', () => {
  const { r, reloj, llega } = fila();
  llega('a', '/');
  llega('b', '/');
  assert.equal(r.drive(0, '/lenta').length, 2);
  reloj.t += 400;
  // Siguen en «/» (la ruta tarda): pedir «/» de nuevo les manda quedarse.
  assert.deepEqual(r.drive(0, '/'), [
    { to: 'a', cmd: { t: 'nav', path: '/' } },
    { to: 'b', cmd: { t: 'nav', path: '/' } },
  ]);
  assert.deepEqual(r.drive(0, '/'), [], 'ya no van a ninguna parte: nada que mandar');
  // Un gesto del usuario en «a» justo antes de una orden: la llegada de «a» no arrastra a «b».
  r.route('a', { t: 'gesture' });
  r.drive(0, '/precios');
  reloj.t += 100;
  assert.deepEqual(llega('a', '/precios'), [], 'la orden se apunta como pendiente y gasta el gesto');
  assert.deepEqual(llega('b', '/precios'), []);
});

test('P-79 drive: una celda que estaba cargando sigue la orden aunque la navegación esté apagada o la fila saltada (B-9, m56)', () => {
  const { r, llega } = fila({ ...SYNC_ALL, nav: false });
  llega('a', '/');
  assert.deepEqual(r.drive(0, '/x'), [{ to: 'a', cmd: { t: 'nav', path: '/x' } }]);
  assert.deepEqual(r.route('b', { t: 'hello', url: url('/') }), [{ to: 'b', cmd: { t: 'nav', path: '/x' } }], '«b» cargó después: va a /x');
  // Con el cortacircuitos saltado, la orden del usuario se cumple igual.
  const t = fila();
  t.llega('a', '/');
  t.llega('b', '/');
  for (let i = 0; i < 10; i++) {
    t.r.route('a', { t: 'gesture' });
    t.r.route('a', { t: 'nav', url: url('/p' + i) });
    t.reloj.t += 10;
  }
  assert.equal(t.r.isTripped(0), true);
  assert.ok(t.r.drive(0, '/y').length >= 1, 'la fila saltada sigue obedeciendo al usuario');
});

test('P-80 del fichero a su ruta: solo páginas de verdad (B-3)', () => {
  for (const no of ['src/components/pages/LoginForm.tsx', 'docs/pages/README.md', 'src/pages/Home.test.tsx', 'packages/ui/src/pages/Boton.stories.tsx', 'e2e/app/login/page.ts', 'tests/pages/checkout.ts', 'server/app/page.js', 'src/pages/types.d.ts', 'src/app/x/page.module.css']) {
    assert.equal(routeForFile(no), undefined, no);
  }
  assert.equal(routeForFile('src/pages/Home.tsx')?.kind, 'next', 'la forma de una página de Next; su package.json decide');
  assert.equal(kindOf('pages/contacto.vue'), 'nuxt');
  assert.equal(kindOf('src/pages/blog.astro'), 'astro');
  assert.equal(kindOf('src/pages/blog.md'), 'astro');
  assert.equal(kindOf('src/routes/+page.svelte'), 'sveltekit');
  assert.equal(kindOf('public/aviso.html'), 'html');
  assert.deepEqual([...frameworksIn('{"dependencies":{"next":"15"},"devDependencies":{"@sveltejs/kit":"2"}}')].sort(), ['html', 'next', 'sveltekit']);
  assert.deepEqual([...frameworksIn('{"dependencies":{"react":"19","vite":"6"}}')], ['html'], 'un proyecto de Vite con React: src/pages/ no son rutas');
  assert.deepEqual([...frameworksIn('no es json')], ['html']);
});

test('P-81 seguir al editor: framework, una fila, sin dinámicas, y comparando con lo último mandado (B-1, B-2, m25)', () => {
  const next = frameworksIn('{"dependencies":{"next":"15"}}');
  const vite = frameworksIn('{"dependencies":{"vite":"6"}}');
  const precios = routeForFile('app/precios/page.tsx');
  const raiz = routeForFile('app/page.tsx');
  assert.equal(followTarget({ rows: 1, route: precios, frameworks: next, now: '/' }), '/precios');
  assert.equal(followTarget({ rows: 1, route: precios, frameworks: vite, now: '/' }), undefined, 'sin Next en su package.json no es una página');
  assert.equal(followTarget({ rows: 2, route: precios, frameworks: next, now: '/' }), undefined, 'en una matriz, nada');
  assert.equal(followTarget({ rows: 1, route: routeForFile('app/blog/[slug]/page.tsx'), frameworks: next, now: '/' }), undefined);
  assert.equal(followTarget({ rows: 1, route: precios, frameworks: next, now: '/precios/?x=1' }), undefined, 'ya está ahí');
  // Se mandó a /precios (aún no llegó: sigue en «/») y se vuelve a la portada: hay que mandarla.
  assert.equal(followTarget({ rows: 1, route: raiz, frameworks: next, now: '/', last: '/precios' }), '/');
  assert.equal(followTarget({ rows: 1, route: precios, frameworks: next, now: '/', last: '/precios' }), undefined, 'lo mismo que ya se mandó');
  assert.equal(followTarget({ rows: 1, route: undefined, frameworks: next, now: '/' }), undefined);
});

test('P-82 reabrir, recordar, cambiar de dirección y rutas de la lista (m23, m29, m30, m33)', () => {
  const m = (target: string, cells = matrix(['/a?token=X#y'], ['laptop'])): Mosaic => ({ v: 1, name: 'm', target, cells, sync: { ...SYNC_ALL, click: false } });
  assert.equal(canReopenSilently(m('http://localhost:5173')), true);
  assert.equal(canReopenSilently(m('https://neurosinais.argalla.com')), false, 'una web publicada no se reabre sola');
  assert.equal(forMemory(m('http://localhost:5173', [])), undefined, 'un mosaico vacío no se recuerda');
  assert.equal(forMemory(m('http://localhost:5173'))?.cells[0].path, '/a', 'sin consulta ni ancla');
  assert.deepEqual(syncAfterAddressChange(m('http://localhost:5173'), 'http://localhost:3000'), { ...SYNC_ALL, click: false }, 'desarrollo a desarrollo: se conserva');
  assert.deepEqual(syncAfterAddressChange(m('https://a.example.com'), 'http://localhost:3000'), SYNC_ALL, 'de publicada a desarrollo: todo encendido');
  assert.deepEqual(syncAfterAddressChange(undefined, 'http://localhost:3000'), SYNC_ALL);
  assert.deepEqual(
    routeChoices([
      { path: '/', dynamic: false, source: 'app/page.tsx' },
      { path: '/blog/[slug]', dynamic: true, source: 'x' },
      { path: '/precios', dynamic: false, source: 'y' },
    ]),
    ['/', '/precios'],
  );
});
