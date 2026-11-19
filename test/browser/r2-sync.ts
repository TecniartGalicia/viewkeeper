// Auditoría, segunda pasada: el reparto de navegación rehecho (src/core/sync.ts), simulando lo que hace cada celda.
// Ejecutar desde la carpeta del prototipo:  node --no-warnings auditoria/r2-sync.ts
import { GESTURE_MS, PENDING_MS, SyncRouter, TRIP_COUNT, TRIP_MS, pageKey, type AgentEvent, type Delivery } from '../../src/core/sync.ts';
import { SYNC_ALL, type Cell } from '../../src/core/mosaic.ts';
import { caso, nota, resultado } from './util.ts';

const C = (id: string, session = 'main', group = 0): Cell => ({ id, deviceId: 'laptop', landscape: false, path: '/', session, group });
const U = (c: Cell, p: string): string => `http://s-${c.session}-aaaaaaaa.localhost:1${p}`;

/**
 * Mundo mínimo con reloj. Al recibir la orden nav la celda hace location.assign (agent.js, applyNav): el servidor
 * contesta con la ruta final y el agente de la página nueva dice hello y ready. `cliente` permite que la página,
 * ya cargada, cambie de URL por su cuenta (redirección en JavaScript).
 */
function mundo(cells: Cell[], servidor: (c: Cell, path: string) => string, cliente: (c: Cell, path: string) => string | undefined = () => undefined) {
  const reloj = { t: 1_000_000 };
  const r = new SyncRouter(cells, SYNC_ALL, () => reloj.t);
  const real = new Map<string, string>();
  const diario: string[] = [];
  let ordenes = 0;
  let saltos = 0;
  r.onTrip = () => saltos++;
  const cola: Delivery[] = [];
  const emitir = (id: string, ev: AgentEvent): Delivery[] => {
    const out = r.route(id, ev);
    for (const d of out) diario.push(`  panel → ${d.to}: ${JSON.stringify(d.cmd)}`);
    cola.push(...out);
    return out;
  };
  const cargar = (id: string, path: string, cargaMs = 50): void => {
    const c = cells.find((x) => x.id === id)!;
    const fin = servidor(c, path);
    real.set(id, fin);
    reloj.t += cargaMs;
    diario.push(`${id} carga ${path}${fin !== path ? ` → redirigida a ${fin}` : ''}`);
    emitir(id, { t: 'hello', url: U(c, fin) });
    emitir(id, { t: 'ready', url: U(c, fin), title: '', height: 1 });
    const luego = cliente(c, fin);
    if (luego !== undefined && luego !== fin) {
      reloj.t += 20;
      real.set(id, luego);
      diario.push(`${id}: la página se redirige sola a ${luego} (pushState/replaceState)`);
      emitir(id, { t: 'nav', url: U(c, luego) });
    }
  };
  const drenar = (max = 40): boolean => {
    while (cola.length) {
      if (ordenes >= max) return false;
      const d = cola.shift()!;
      ordenes++;
      if (d.cmd.t === 'nav' && d.cmd.path !== real.get(d.to)) cargar(d.to, d.cmd.path);
    }
    return true;
  };
  /** El usuario pulsa un enlace en la celda: gesto + carga de la página nueva. */
  const usuarioVa = (id: string, path: string, cargaMs = 50): void => {
    emitir(id, { t: 'gesture' });
    cargar(id, path, cargaMs);
  };
  return { r, real, diario, cargar, emitir, drenar, usuarioVa, reloj, ordenes: () => ordenes, saltos: () => saltos };
}

// ══════════ Los cinco casos de H-2, con el reparto nuevo
{
  const a = C('admin', 'admin');
  const b = C('invitado', 'invitado');
  const m = mundo([a, b], (c, p) => {
    if (c.session === 'invitado' && (p === '/admin' || p === '/panel')) return '/login';
    if (c.session === 'admin' && p === '/login') return '/panel';
    return p;
  });
  m.cargar('admin', '/');
  m.cargar('invitado', '/');
  m.usuarioVa('admin', '/admin');
  const converge = m.drenar(40);
  caso('NAV-1', '[H-2] dos sesiones con redirecciones distintas: bucle sin fin', !converge, `órdenes nav: ${m.ordenes()}; admin en ${m.real.get('admin')}, invitado en ${m.real.get('invitado')}`);
  caso('NAV-2', '[H-2] la seguidora redirigida arrastra al líder', m.real.get('admin') !== '/admin', `admin termina en ${m.real.get('admin')}`);
}
{
  const a = C('a');
  const b = C('b');
  const m = mundo([a, b], (_c, p) => (p === '/docs' ? '/docs/' : p));
  m.cargar('a', '/');
  m.cargar('b', '/');
  m.diario.length = 0;
  m.emitir('a', { t: 'gesture' });
  m.real.set('a', '/docs');
  m.emitir('a', { t: 'nav', url: U(a, '/docs') }); // pushState en el líder
  m.drenar();
  caso('NAV-3', '[H-2] pushState en el líder + redirección canónica en la seguidora recarga al líder', m.diario.some((l) => l.startsWith('a carga')), `diario: ${JSON.stringify(m.diario)}`);
  const d = m.emitir('a', { t: 'scroll', sel: '', rx: 0, ry: 0.5 });
  nota(`después, /docs (líder) y /docs/ (seguidora) cuentan como la misma página: scroll entregado a ${d.length} celda(s)`);
}
{
  const cells = [C('a'), C('b')];
  const r = new SyncRouter(cells, SYNC_ALL, () => 1);
  r.route('a', { t: 'hello', url: U(cells[0], '/') });
  r.route('a', { t: 'gesture' });
  const d1 = r.route('a', { t: 'hello', url: U(cells[0], '/x') });
  const d2 = r.route('b', { t: 'hello', url: U(cells[1], '/') });
  caso('NAV-4', '[H-2] a navega antes de que b cargue y el hello de b devuelve a a al inicio', d2.some((d) => d.to === 'a'), `al navegar a: ${JSON.stringify(d1)}; al llegar el hello de b: ${JSON.stringify(d2)}`);
}
{
  const cells = [C('a'), C('b')];
  const r = new SyncRouter(cells, SYNC_ALL, () => 1);
  for (const c of cells) {
    r.route(c.id, { t: 'hello', url: U(c, '/') });
    r.route(c.id, { t: 'ready', url: U(c, '/'), title: '', height: 1 });
  }
  r.route('a', { t: 'gesture' });
  r.route('a', { t: 'nav', url: U(cells[0], '/borrar-cuenta') }); // b no la cumple
  const d = r.route('a', { t: 'click', sel: 'body>button:nth-of-type(1)' });
  caso('NAV-5', '[H-2] se mandan clics a una celda que aún no llegó a la página nueva', d.length > 0, `currentPath(b)=${r.currentPath('b')}; clic entregado a ${d.length} celdas`);
}

// ══════════ Ataques al reparto nuevo
console.log('\n──────── nuevo ────────');

// N-a. El cortacircuitos salta con un usuario que simplemente navega deprisa, y «Reload» no lo rearma.
{
  const m = mundo([C('a'), C('b')], (_c, p) => p);
  m.cargar('a', '/');
  m.cargar('b', '/');
  let repartidas = 0;
  let i = 0;
  for (; i < 10 && m.saltos() === 0; i++) {
    m.reloj.t += 1200; // un clic en «Siguiente» cada 1,2 s (paginación, pestañas, galería)
    m.emitir('a', { t: 'gesture' });
    m.real.set('a', '/lista?pagina=' + i);
    repartidas += m.emitir('a', { t: 'nav', url: U(C('a'), '/lista?pagina=' + i) }).length;
    m.drenar(1000);
  }
  caso('COR-1', '[NUEVO] el cortacircuitos toma por bucle a un usuario que pasa páginas: un clic cada 1,2 s', m.saltos() > 0, `saltó en el clic n.º ${i} (límite: más de ${TRIP_COUNT} navegaciones en ${TRIP_MS / 1000} s); repartidas antes de saltar: ${repartidas}`);
  // ¿Qué lo rearma? panel.ts solo llama a router.update() al recibir un estado nuevo; el comando Reload manda {t:'reload'} a las celdas.
  m.reloj.t += 60_000;
  m.emitir('a', { t: 'gesture' });
  const tras = m.emitir('a', { t: 'nav', url: U(C('a'), '/otra') });
  caso('COR-2', '[NUEVO] una vez saltado no se rearma nunca por sí solo (ni pasado un minuto); el aviso dice «Reload to resume» pero recargar celdas no llama a update()', tras.length === 0 && m.r.isTripped(0), `un minuto después, navegación con gesto repartida a ${tras.length} celdas; isTripped=${m.r.isTripped(0)}`);
}

// N-b. Rutas con ancla (#/ruta): pageKey las iguala todas.
{
  const cells = [C('a'), C('b')];
  const m = mundo(cells, (_c, p) => p);
  m.cargar('a', '/#/inicio');
  m.cargar('b', '/#/inicio');
  m.emitir('a', { t: 'gesture' });
  m.real.set('a', '/#/usuarios');
  const d = m.emitir('a', { t: 'nav', url: U(cells[0], '/#/usuarios') }); // tecla, menú… algo que no es un clic repetible
  const clic = m.emitir('a', { t: 'click', sel: '#borrar', fp: 'button||||||Borrar' });
  caso('ANC-1', '[NUEVO, regresión] app con enrutado por ancla (HashRouter, Vue hash): la navegación no se reparte nunca', d.length === 0, `a pasa de /#/inicio a /#/usuarios con gesto → órdenes: ${d.length}; pageKey de las dos = ${JSON.stringify([pageKey('/#/inicio'), pageKey('/#/usuarios')])}`);
  caso('ANC-2', '[NUEVO, regresión] y como «son la misma página», los clics de a se mandan a b, que está en otra vista', clic.length === 1, `a en ${m.r.currentPath('a')}, b en ${m.r.currentPath('b')}; clic entregado a ${clic.length} celda(s) (solo lo frena la huella, si difiere)`);
}

// N-c. Orden pendiente que nadie consume: la primera navegación del usuario en esa celda se pierde.
{
  const cells = [C('a'), C('b')];
  const m = mundo(cells, (_c, p) => p);
  m.cargar('a', '/');
  m.cargar('b', '/');
  m.emitir('a', { t: 'gesture' });
  m.emitir('a', { t: 'nav', url: U(cells[0], '/x') }); // la orden a b se pierde (b enseña un PDF, una página de error sin agente…)
  m.reloj.t += PENDING_MS + 30_000; // medio minuto después de caducar; nadie ha tocado nada
  m.emitir('b', { t: 'gesture' });
  const d = m.emitir('b', { t: 'nav', url: U(cells[1], '/y') });
  caso('PEN-1', '[NUEVO] orden caducada sin consumir: la siguiente navegación del usuario en esa celda se traga', d.length === 0, `45 s después el usuario navega en b con gesto → órdenes: ${d.length} (a se queda en ${m.r.currentPath('a')}, b en ${m.r.currentPath('b')})`);
  m.emitir('b', { t: 'gesture' });
  const d2 = m.emitir('b', { t: 'nav', url: U(cells[1], '/z') });
  nota(`la segunda navegación ya sí se reparte: ${d2.length} orden(es)`);
}

// N-d. Mientras dura la orden (hasta 15 s) la celda está muda en los dos sentidos.
{
  const cells = [C('a'), C('b')];
  const m = mundo(cells, (_c, p) => p);
  m.cargar('a', '/');
  m.cargar('b', '/');
  m.emitir('a', { t: 'gesture' });
  m.emitir('a', { t: 'nav', url: U(cells[0], '/x') });
  m.emitir('a', { t: 'gesture' });
  m.emitir('a', { t: 'nav', url: U(cells[0], '/') }); // el usuario vuelve atrás enseguida: a y b están en la misma página
  // La segunda orden no se manda: el reparto compara con la posición CONFIRMADA de b («/»), no con la orden en curso (/x).
  m.drenar(); // ahora b cumple la única orden que recibió
  caso('PEN-2', '[NUEVO] ir y volver deprisa (enlace y «atrás» antes de que la seguidora cargue): la seguidora se queda en la página de la que el líder ya salió', m.real.get('a') !== m.real.get('b'), `a en ${m.real.get('a')}, b en ${m.real.get('b')}; órdenes enviadas: ${m.ordenes()}`);
  m.reloj.t += 5000;
  const d = m.emitir('a', { t: 'scroll', sel: '', rx: 0, ry: 0.5 });
  nota(`desde ahí el scroll de a llega a ${d.length} celdas`);
}

// N-e. Carga lenta: el gesto caduca antes de que la página nueva diga hello.
{
  const cells = [C('a'), C('b')];
  const m = mundo(cells, (_c, p) => p);
  m.cargar('a', '/');
  m.cargar('b', '/');
  const antes = m.ordenes();
  m.usuarioVa('a', '/informes', GESTURE_MS + 1500); // primera compilación de la ruta en el servidor de desarrollo: 9,5 s
  m.drenar();
  caso('GES-1', '[NUEVO] la ruta tarda más de 8 s en cargar (primera compilación): el gesto caduca y la navegación no se reparte', m.real.get('b') === '/', `a en ${m.real.get('a')}, b en ${m.real.get('b')}; órdenes: ${m.ordenes() - antes}. Desde ahí, scroll/clic/escritura tampoco: están en páginas distintas`);
}

// N-f. Gestos encadenados por teclado: el agente no manda «gesture» si el anterior fue hace menos de 400 ms.
{
  const cells = [C('a'), C('b')];
  const m = mundo(cells, (_c, p) => p);
  m.cargar('a', '/diapo/1');
  m.cargar('b', '/diapo/1');
  // Flecha derecha dos veces en 300 ms (galería, diapositivas, paginación por teclado). agent.js: gesture() solo envía
  // si pasaron más de 400 ms desde el último evento, así que el segundo keydown no produce mensaje.
  m.emitir('a', { t: 'gesture' });
  const d1 = m.emitir('a', { t: 'nav', url: U(cells[0], '/diapo/2') });
  m.reloj.t += 300;
  const d2 = m.emitir('a', { t: 'nav', url: U(cells[0], '/diapo/3') });
  caso('GES-2', '[NUEVO] dos navegaciones por teclado en menos de 400 ms: la segunda no lleva gesto y no se reparte', d1.length === 1 && d2.length === 0, `1.ª: ${d1.length} orden; 2.ª: ${d2.length} órdenes → a en /diapo/3, b en /diapo/2`);
}

// N-g. Gesto del usuario en la seguidora + redirección en JavaScript tras la carga: arrastra al líder (un paso).
{
  const a = C('admin', 'admin');
  const b = C('invitado', 'invitado');
  const m = mundo([a, b], (_c, p) => p, (c, p) => (c.session === 'invitado' && p === '/admin' ? '/login' : undefined)); // guardia de ruta en el cliente (SPA)
  m.cargar('admin', '/');
  m.cargar('invitado', '/');
  m.emitir('invitado', { t: 'gesture' }); // el usuario tocó la celda del invitado (un scroll con la rueda no; un clic o una tecla sí)
  m.reloj.t += 3000;
  m.usuarioVa('admin', '/admin');
  m.drenar();
  caso('GES-3', '[NUEVO] si el usuario tocó la seguidora en los últimos 8 s, su redirección de cliente se reparte y saca al líder', m.real.get('admin') !== '/admin', `admin termina en ${m.real.get('admin')}, invitado en ${m.real.get('invitado')} (órdenes: ${m.ordenes()})`);
}

// N-h. Una página puede fabricar gestos: postMessage({vk:1,t:'gesture'}) desde el propio documento de la celda.
{
  const cells = [C('inv', 'inv'), C('admin', 'admin')];
  const m = mundo(cells, (_c, p) => p);
  m.cargar('inv', '/');
  m.cargar('admin', '/');
  m.emitir('inv', { t: 'gesture' });
  const d = m.emitir('inv', { t: 'nav', url: U(cells[0], '/admin/usuarios/7/borrar?confirmar=1') });
  nota(`(límite conocido) el JavaScript de una celda puede mandar gesture+nav por su cuenta y llevar a las otras sesiones del grupo a cualquier ruta local: ${JSON.stringify(d.map((x) => `${x.to} → ${x.cmd.t === 'nav' ? x.cmd.path : ''}`))}. El cortacircuitos lo limita a ${TRIP_COUNT} cada ${TRIP_MS / 1000} s.`);
}
process.exit(resultado());
