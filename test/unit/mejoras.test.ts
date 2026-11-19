// Pruebas del plan de mejoras (docs/PLAN-MEJORAS.md). Numeración P-57 en adelante.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { aliasOrigins, isAlias } from '../../src/core/alias.ts';
import { SYNC_ALL, isDevHost, syncForTarget } from '../../src/core/mosaic.ts';
import { resolveTarget } from '../../src/core/probe.ts';
import { leavesTo, startProxy, type RunningProxy } from '../../src/core/proxy.ts';

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}
/** Petición a una celda del proxy, como la haría el iframe (documento) o un fetch de la página. */
export function cell(p: RunningProxy, path: string, o: { session?: string; doc?: boolean; method?: string; body?: string; headers?: Record<string, string>; cookie?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {
    host: `s-${o.session ?? 'main'}-${p.tag}.localhost:${p.port}`,
    cookie: `${p.gateCookie}=${p.token}${o.cookie ? '; ' + o.cookie : ''}`,
    ...(o.doc === false ? { 'sec-fetch-dest': 'empty', accept: '*/*' } : { 'sec-fetch-dest': 'iframe', accept: 'text/html' }),
    ...o.headers,
  };
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
export interface Fake {
  origin: string;
  port: number;
  seen: { method: string; url: string; headers: http.IncomingHttpHeaders }[];
  close(): Promise<void>;
}
export function fake(handle: (req: http.IncomingMessage, res: http.ServerResponse, self: Fake) => void): Promise<Fake> {
  const seen: Fake['seen'] = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    handle(req, res, self);
  });
  let self: Fake;
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      self = {
        origin: `http://localhost:${port}`,
        port,
        seen,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      };
      resolve(self);
    });
  });
}
const html = (res: http.ServerResponse, body: string, headers: http.OutgoingHttpHeaders = {}): void => void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers }).end(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`);

// ───────────────────────── Fase A

test('P-57 web publicada o servidor de desarrollo: y en la publicada, clics y escritura nacen apagados', () => {
  for (const dev of ['http://localhost:5173', 'http://app.localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:3000', 'http://192.168.1.20:3000', 'http://10.0.0.5', 'http://172.16.4.4:8000', 'http://172.31.255.1', 'http://169.254.10.10', 'http://mipc:3000', 'https://tienda.test', 'http://nas.local:8080', 'http://api.internal', 'http://[fd12:3456::1]:3000', 'http://[fe80::1]:3000']) assert.equal(isDevHost(dev), true, dev);
  for (const pub of ['https://neurosinais.argalla.com', 'https://example.com', 'http://172.32.0.1', 'http://172.15.0.1', 'http://11.0.0.1', 'http://192.169.1.1', 'https://localhost.evil.com', 'https://local', 'no es una url', 'http://[2001:db8::1]']) {
    // «https://local» es un nombre sin punto: red local. El resto, públicos o ilegibles.
    assert.equal(isDevHost(pub), pub === 'https://local', pub);
  }
  assert.deepEqual(syncForTarget('http://localhost:5173', SYNC_ALL), SYNC_ALL);
  assert.deepEqual(syncForTarget('https://neurosinais.argalla.com', SYNC_ALL), { scroll: true, click: false, input: false, nav: true });
  // No enciende lo que el usuario apagó, ni apaga el scroll o la navegación.
  assert.deepEqual(syncForTarget('https://example.com', { scroll: false, click: true, input: true, nav: false }), { scroll: false, click: false, input: false, nav: false });
});

test('P-58 alias de la misma web: http/https y «www», o la propia máquina en el mismo puerto; nunca otro dominio', () => {
  const u = (s: string): URL => new URL(s);
  for (const [a, b] of [
    ['https://argalla.com', 'https://www.argalla.com'],
    ['http://argalla.com', 'https://argalla.com'],
    ['http://www.argalla.com', 'https://argalla.com/x'],
    ['http://localhost:3000', 'http://127.0.0.1:3000'],
    ['https://example.com:8443', 'https://example.com:8443'],
  ]) assert.equal(isAlias(u(a), u(b)), true, `${a} ~ ${b}`);
  for (const [a, b] of [
    ['https://argalla.com', 'https://app.argalla.com'],
    ['https://argalla.com', 'https://argalla.com.evil.net'],
    ['https://www.argalla.com', 'https://www2.argalla.com'],
    ['https://example.com', 'https://example.com:8443'],
    ['http://localhost:3000', 'http://localhost:3001'],
    ['http://localhost:3000', 'https://localhost:3000'],
    ['https://argalla.com', 'ftp://argalla.com'],
    ['http://intranet', 'http://www.intranet'],
  ]) assert.equal(isAlias(u(a), u(b)), false, `${a} !~ ${b}`);
  assert.deepEqual(aliasOrigins('https://www.argalla.com').sort(), ['http://argalla.com', 'http://www.argalla.com', 'https://argalla.com', 'https://www.argalla.com']);
  assert.deepEqual(aliasOrigins('http://localhost:5173').sort(), ['http://127.0.0.1:5173', 'http://[::1]:5173', 'http://localhost:5173']);
  assert.deepEqual(aliasOrigins('https://example.com:8443'), ['https://example.com:8443']);
  assert.deepEqual(aliasOrigins('http://192.168.1.20'), ['http://192.168.1.20']);
  assert.deepEqual(aliasOrigins('javascript:alert(1)'), []);
});

test('P-59 al abrir se sigue la redirección al dominio principal, y solo esa', async () => {
  const otra = await fake((_req, res) => html(res, 'otra web'));
  // Contesta distinto según el nombre por el que se le llama, como una web con dominio principal.
  const web = await fake((req, res, self) => {
    const host = req.headers.host ?? '';
    if (req.url === '/sso') return void res.writeHead(302, { location: `${otra.origin}/login?token=SECRETO` }).end();
    if (req.url === '/bucle') return void res.writeHead(302, { location: host.startsWith('localhost') ? `http://127.0.0.1:${self.port}/bucle` : `http://localhost:${self.port}/bucle` }).end();
    if (host.startsWith('localhost')) return void res.writeHead(301, { location: `http://127.0.0.1:${self.port}/gl?x=1` }).end();
    html(res, 'principal');
  });
  try {
    const alias = `http://localhost:${web.port}`;
    const principal = `http://127.0.0.1:${web.port}`;
    assert.deepEqual(await resolveTarget(alias, '/'), { origin: principal, path: '/gl?x=1', hops: [principal] });
    // Ya en el principal: nada que seguir.
    assert.deepEqual(await resolveTarget(principal, '/pacientes'), { origin: principal, path: '/pacientes', hops: [] });
    // Una redirección a OTRA web (inicio de sesión externo) no se sigue: el mosaico no cambia de web.
    assert.deepEqual(await resolveTarget(principal, '/sso'), { origin: principal, path: '/sso', hops: [] });
    // Dos alias que se mandan el uno al otro: se corta en el máximo de saltos, sin colgarse.
    const b = await resolveTarget(alias, '/bucle', 2500, 4);
    assert.equal(b.hops.length, 4);
    // Nadie escuchando, o algo que no es una dirección: se devuelve lo que se dio.
    await web.close();
    assert.deepEqual(await resolveTarget(alias, '/', 800), { origin: alias, path: '/', hops: [] });
    assert.deepEqual(await resolveTarget('no es una url', '/'), { origin: 'no es una url', path: '/', hops: [] });
  } finally {
    await web.close().catch(() => {});
    await otra.close();
  }
});

test('P-60 una redirección que saca a la celda del mosaico se explica; no deja la celda en blanco', async () => {
  const otra = await fake((_req, res) => html(res, 'otra web'));
  const app = await fake((req, res, self) => {
    if (req.url === '/sso') return void res.writeHead(302, { location: `${otra.origin}/login?token=SECRETO`, 'set-cookie': ['antes=1; Path=/'] }).end();
    if (req.url === '/alias') return void res.writeHead(302, { location: `http://127.0.0.1:${self.port}/destino` }).end();
    if (req.url === '/canonico') return void res.writeHead(301, { location: `http://127.0.0.1:${self.port}/canonico` }).end();
    if (req.url === '/dentro') return void res.writeHead(302, { location: '/destino' }).end();
    html(res, 'app');
  });
  const px = await startProxy({ target: app.origin, agentSource: '/*A*/', pages: { leftTitle: 'FUERA', leftBody: 'iba a {0}', back: 'VOLVER' } });
  try {
    const ctx = { target: new URL(app.origin), proxyOrigin: px.originFor('main') };
    assert.equal(leavesTo(`${otra.origin}/x`, ctx, '/sso'), otra.origin);
    assert.equal(leavesTo('/destino', ctx, '/dentro'), undefined);
    assert.equal(leavesTo(`http://127.0.0.1:${app.port}/destino`, ctx, '/alias'), undefined);
    assert.equal(leavesTo(`http://127.0.0.1:${app.port}/canonico`, ctx, '/canonico'), `http://127.0.0.1:${app.port}`);
    assert.equal(leavesTo('mailto:a@b.c', ctx, '/x'), undefined);

    // El documento de la celda: página propia, con el origen y sin la dirección entera (lleva un testigo).
    const r = await cell(px, '/sso');
    assert.equal(r.status, 200);
    assert.match(r.body, /FUERA/);
    assert.ok(r.body.includes(`iba a ${otra.origin}`));
    assert.ok(!r.body.includes('SECRETO'), 'la dirección entera no se enseña');
    assert.match(r.body, /VOLVER/);
    assert.equal(r.headers.location, undefined);
    assert.match(String(r.headers['set-cookie']), /antes=1/, 'las cookies de la redirección se conservan');
    assert.ok(!r.body.includes('agent.js'), 'la página de aviso no lleva agente');
    // Un fetch de la página: la redirección pasa tal cual (es la app quien decide qué hacer con ella).
    const f = await cell(px, '/sso', { doc: false });
    assert.equal(f.status, 302);
    assert.equal(f.headers.location, `${otra.origin}/login?token=SECRETO`);
    // A un alias de la misma web (otra ruta): se queda en la celda.
    const a = await cell(px, '/alias');
    assert.equal(a.status, 302);
    assert.equal(a.headers.location, `${px.originFor('main')}/destino`);
    // El servidor manda a su dominio principal con la misma ruta: seguirla sería un bucle; se explica.
    const c = await cell(px, '/canonico');
    assert.equal(c.status, 200);
    assert.ok(c.body.includes(`iba a http://127.0.0.1:${app.port}`));
    // Dentro de la app: intacta.
    const d = await cell(px, '/dentro');
    assert.equal(d.status, 302);
    assert.equal(d.headers.location, '/destino');
    assert.ok(px.diagnostics().some((l) => l.includes('redirect out of the mosaic: /sso')), 'queda en el diagnóstico, sin la consulta');
    assert.ok(!px.diagnostics().join('\n').includes('SECRETO'));
  } finally {
    await px.close();
    await app.close();
    await otra.close();
  }
});

test('P-61 abrir: desarrollo tal cual; web publicada en su dominio principal y con clics y escritura apagados', async () => {
  const { prepareOpen } = await import('../../src/core/open.ts');
  const { matrix } = await import('../../src/core/mosaic.ts');
  const m = (target: string, name = new URL(target).host) => ({ v: 1 as const, name, target, cells: matrix(['/pacientes'], ['iphone-15', 'laptop']), sync: SYNC_ALL });
  const calls: string[] = [];
  const to = (origin: string) => async (o: string, p: string) => {
    calls.push(o + p);
    return { origin, path: p, hops: origin === o ? [] : [origin] };
  };
  // Desarrollo: ni se pregunta a la red ni se toca nada.
  const dev = await prepareOpen(m('http://localhost:5173'), to('https://otra.example.org'));
  assert.deepEqual(dev, { mosaic: m('http://localhost:5173'), deployed: false });
  assert.equal(calls.length, 0);
  // Publicada sin redirección: mismo destino, clics y escritura apagados.
  const pub = await prepareOpen(m('https://neurosinais.argalla.com'), to('https://neurosinais.argalla.com'));
  assert.equal(pub.deployed, true);
  assert.equal(pub.redirectedFrom, undefined);
  assert.equal(pub.mosaic.target, 'https://neurosinais.argalla.com');
  assert.deepEqual(pub.mosaic.sync, { scroll: true, click: false, input: false, nav: true });
  assert.deepEqual(calls, ['https://neurosinais.argalla.com/pacientes'], 'se pregunta por la ruta que se va a abrir');
  // Publicada que manda a su dominio principal: se abre ese, y el nombre por defecto lo sigue.
  const red = await prepareOpen(m('http://argalla.com'), to('https://www.argalla.com'));
  assert.equal(red.mosaic.target, 'https://www.argalla.com');
  assert.equal(red.mosaic.name, 'www.argalla.com');
  assert.equal(red.redirectedFrom, 'http://argalla.com');
  assert.equal(red.mosaic.cells[0].path, '/pacientes', 'las rutas de las celdas no cambian');
  // Un nombre puesto por el usuario no se pisa.
  assert.equal((await prepareOpen(m('http://argalla.com', 'Producción'), to('https://www.argalla.com'))).mosaic.name, 'Producción');
  // Una «redirección» que acabara en esta máquina no se acepta.
  const mala = await prepareOpen(m('https://example.org'), to('http://localhost:2375'));
  assert.equal(mala.mosaic.target, 'https://example.org');
  assert.equal(mala.redirectedFrom, undefined);
});

// ───────────────────────── Fase B

test('P-62 mandar una fila a otra ruta: va toda la fila, la llegada no rebota y una celda nueva entra ya en ella', async () => {
  const { SyncRouter } = await import('../../src/core/sync.ts');
  let t = 1000;
  const c = (id: string, group: number) => ({ id, deviceId: 'laptop', landscape: false, path: '/', session: 'main', group });
  const cells = [c('a', 0), c('b', 0), c('z', 1)];
  const r = new SyncRouter(cells, SYNC_ALL, () => t);
  const at = (id: string, path: string, kind: 'hello' | 'ready' = 'hello') => r.route(id, kind === 'hello' ? { t: 'hello', url: 'http://x' + path } : { t: 'ready', url: 'http://x' + path, title: '', height: 1 });
  for (const id of ['a', 'b', 'z']) at(id, '/');
  // Un gesto pendiente en «a»: la orden lo gasta, para que la llegada no cuente como navegación del usuario.
  r.route('a', { t: 'gesture' });
  assert.deepEqual(r.drive(0, '/precios'), [
    { to: 'a', cmd: { t: 'nav', path: '/precios' } },
    { to: 'b', cmd: { t: 'nav', path: '/precios' } },
  ]);
  // Llegan: ni «a» manda a «b» ni al revés, y la otra fila no se entera.
  t += 200;
  assert.deepEqual(at('a', '/precios'), []);
  assert.deepEqual(at('a', '/precios', 'ready'), []);
  assert.deepEqual(at('b', '/precios'), []);
  assert.deepEqual(at('b', '/precios', 'ready'), []);
  assert.equal(r.currentPath('z'), '/');
  // Quien ya está en la ruta no recibe orden; a una fila que no existe, nada.
  assert.deepEqual(r.drive(0, '/precios/'), []);
  assert.deepEqual(r.drive(7, '/x'), []);
  // Una celda que se añade después a esa fila y carga en la ruta vieja: se la pone al día.
  r.update([...cells, c('n', 0)], SYNC_ALL);
  assert.deepEqual(at('n', '/'), [{ to: 'n', cmd: { t: 'nav', path: '/precios' } }]);
  at('n', '/precios');
  at('n', '/precios', 'ready');
  // Y la navegación del usuario sigue repartiéndose como siempre.
  t += 20_000;
  r.route('a', { t: 'gesture' });
  assert.deepEqual(
    at('a', '/carrito').map((d) => d.to),
    ['b', 'n'],
  );
  // Con la navegación apagada, la orden del usuario se cumple igual: no es una celda arrastrando a otra.
  const off = new SyncRouter([c('a', 0), c('b', 0)], { ...SYNC_ALL, nav: false }, () => t);
  off.route('a', { t: 'hello', url: 'http://x/' });
  off.route('b', { t: 'hello', url: 'http://x/' });
  assert.equal(off.drive(0, '/x').length, 2);
});

test('P-63 del fichero abierto a su ruta, también en un monorepo; y si una ruta concreta es de una dinámica', async () => {
  const { routeForFile, matchesRoute } = await import('../../src/core/routes.ts');
  const ruta = (f: string): string | undefined => routeForFile(f)?.path;
  assert.equal(ruta('app/precios/page.tsx'), '/precios');
  assert.equal(ruta('src/app/(tienda)/carrito/page.tsx'), '/carrito');
  assert.equal(ruta('apps/web/app/precios/page.tsx'), '/precios');
  assert.equal(ruta('apps\\web\\src\\routes\\about\\+page.svelte'), '/about');
  assert.equal(ruta('packages/sitio/src/pages/blog/index.astro'), '/blog');
  assert.equal(ruta('pages/contacto.vue'), '/contacto');
  assert.equal(ruta('index.html'), '/');
  assert.equal(ruta('apps/web/public/aviso.html'), '/aviso.html');
  assert.deepEqual(routeForFile('app/blog/[slug]/page.tsx'), { path: '/blog/[slug]', dynamic: true, source: 'app/blog/[slug]/page.tsx' });
  // Lo que no es una página no lleva a ningún sitio.
  for (const no of ['app/precios/Tabla.tsx', 'app/layout.tsx', 'src/lib/util.ts', 'README.md', 'docs/notas/apunte.html', 'node_modules/x/app/page.tsx', 'pages/api/hola.ts', '.next/server/app/page.js']) assert.equal(ruta(no), undefined, no);

  assert.equal(matchesRoute('/blog/[slug]', '/blog/hola'), true);
  assert.equal(matchesRoute('/blog/[slug]', '/blog/hola/?x=1#y'), true);
  assert.equal(matchesRoute('/blog/[slug]', '/blog'), false);
  assert.equal(matchesRoute('/blog/[slug]', '/blog/a/b'), false);
  assert.equal(matchesRoute('/blog/[slug]', '/tienda/hola'), false);
  assert.equal(matchesRoute('/docs/[...resto]', '/docs/a/b/c'), true);
  assert.equal(matchesRoute('/docs/[...resto]', '/docs'), false);
  assert.equal(matchesRoute('/docs/[[...resto]]', '/docs'), true);
  assert.equal(matchesRoute('/u/:id/perfil', '/u/7/perfil'), true);
  assert.equal(matchesRoute('/', '/'), true);
  assert.equal(matchesRoute('/', '/x'), false);
});

test('P-64 añadir un dispositivo a una fila concreta: entra en esa fila, con su ruta y su sesión', async () => {
  const { applyEdit } = await import('../../src/core/mosaic.ts');
  const c = (id: string, group: number, path: string, session = 'main') => ({ id, deviceId: 'laptop', landscape: false, path, session, group });
  const m = { v: 1 as const, name: 'm', target: 'http://localhost:3000', cells: [c('r0c0', 0, '/'), c('r1c0', 1, '/carrito', 'admin')], sync: SYNC_ALL };
  const known = (id: string): boolean => id === 'laptop' || id === 'iphone-15';
  const fila1 = applyEdit(m, { op: 'add', deviceId: 'iphone-15', group: 1 }, known).cells.at(-1);
  assert.deepEqual(fila1, { id: 'c0', deviceId: 'iphone-15', landscape: false, path: '/carrito', session: 'admin', group: 1, locale: undefined });
  // Sin fila (el botón de la barra): a la primera, como hasta ahora.
  assert.equal(applyEdit(m, { op: 'add', deviceId: 'iphone-15' }, known).cells.at(-1)?.group, 0);
  // Una fila que no existe o que no es un número: el mensaje viene del webview, no se cree a ciegas.
  assert.equal(applyEdit(m, { op: 'add', deviceId: 'iphone-15', group: 5 }, known).cells.at(-1)?.group, 0);
  assert.equal(applyEdit(m, { op: 'add', deviceId: 'iphone-15', group: 'x' }, known).cells.at(-1)?.group, 0);
  assert.equal(applyEdit(m, { op: 'add', deviceId: 'iphone-15', group: -1 }, known).cells.at(-1)?.group, 0);
});

test('P-65 ¿hay alguien en ese origen? cualquier respuesta cuenta; un puerto vacío, no', async () => {
  const { answers } = await import('../../src/core/probe.ts');
  const srv = await fake((_req, res) => void res.writeHead(500).end('roto, pero vivo'));
  try {
    assert.equal(await answers(srv.origin), true);
    assert.equal(await answers(`http://127.0.0.1:${srv.port}`), true);
  } finally {
    await srv.close();
  }
  assert.equal(await answers(srv.origin, 500), false);
  assert.equal(await answers('ftp://localhost'), false);
  assert.equal(await answers('no es una url'), false);
});
