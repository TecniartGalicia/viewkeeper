// Auditoría F2-F3: comprobaciones puras (sin VS Code, sin navegador).
// Ejecutar desde la raíz del repo:  node --no-warnings auditoria-f23/puras.ts
import * as fs from 'node:fs';
import { SyncRouter, TRIP_COUNT } from '../src/core/sync.ts';
import { SYNC_ALL, applyEdit, parseMosaic, matrix, type Mosaic } from '../src/core/mosaic.ts';
import { parseCustomDevice, findDevice } from '../src/core/devices.ts';

const out = (id: string, ok: boolean, msg: string): void => console.log(`${ok ? 'DEFECTO ' : 'sin def.'} ${id}: ${msg}`);

// A-1 · patrón de apiOrigins en el manifiesto
{
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const pat: string = pkg.contributes.configuration.properties['viewkeeper.apiOrigins'].items.pattern;
  const re = new RegExp(pat);
  const casos = ['http://localhost:3001', 'http://127.0.0.1:8080', 'http://[::1]:3001', 'http://localhost', 'http://:d', 'http://1:dd', 'http://127a0b0c1'];
  const r = casos.map((c) => `${c} -> ${re.test(c)}`);
  out('A-1 patrón apiOrigins', !re.test('http://localhost:3001'), `patrón=${JSON.stringify(pat)} · ${r.join(' · ')}`);
}

// A-2 · cualquier render (update) rearma el cortacircuitos aunque el aviso diga 30 s
{
  let t = 1000;
  const cells = [
    { id: 'a', deviceId: 'laptop', landscape: false, path: '/', session: 'main', group: 0 },
    { id: 'b', deviceId: 'laptop', landscape: false, path: '/', session: 'main', group: 0 },
  ];
  const r = new SyncRouter(cells, SYNC_ALL, () => t);
  let trips = 0;
  r.onTrip = () => trips++;
  r.route('a', { t: 'hello', url: 'http://x/p0' });
  r.route('b', { t: 'hello', url: 'http://x/p0' });
  for (let i = 1; i <= TRIP_COUNT + 1; i++) {
    t += 50;
    r.route('a', { t: 'gesture' });
    r.route('a', { t: 'nav', url: `http://x/p${i}` });
    t += 50;
    r.route('b', { t: 'ready', url: `http://x/p${i}`, title: '', height: 1 });
  }
  const antes = r.isTripped(0);
  r.update(cells, { ...SYNC_ALL, scroll: false }); // lo que hace el panel en cada estado (p. ej. pulsar «Desplazamiento»)
  const despues = r.isTripped(0);
  out('A-2 update() rearma', trips === 1 && antes && !despues, `trips=${trips}, en pausa antes=${antes}, tras un render cualquiera=${despues}`);
}

// A-3 · ids de dispositivos propios que chocan
{
  const a = parseCustomDevice({ name: 'Móvil', width: 400, height: 800 });
  const b = parseCustomDevice({ name: 'M vil', width: 500, height: 900 });
  const c = parseCustomDevice({ name: '手机', width: 360, height: 780 });
  const d = parseCustomDevice({ name: 'タブレット', width: 800, height: 1200 });
  const choque = a?.id === b?.id || c?.id === d?.id;
  out('A-3 ids propios', choque, `Móvil→${a?.id}, «M vil»→${b?.id}, 手机→${c?.id}, タブレット→${d?.id}; findDevice(${c?.id}) devuelve ${findDevice(c!.id, [c!, d!])?.name} también para la tableta`);
}

// A-4 · guardar un mosaico vacío: parseMosaic lo rechaza → saveMosaic lanza 'mosaico no válido' (texto sin traducir al usuario)
{
  const m: Mosaic = { v: 1, name: 'x', target: 'http://localhost:5173', sync: SYNC_ALL, cells: [] };
  out('A-4 guardar vacío', parseMosaic(m) === undefined, `parseMosaic(0 celdas)=${JSON.stringify(parseMosaic(m))} → store.saveMosaic lanza Error('mosaico no válido')`);
}

// A-5 · añadir un dispositivo a una matriz cuya fila 0 se quitó entera
{
  const known = (id: string): boolean => findDevice(id) !== undefined;
  let m: Mosaic = { v: 1, name: 'x', target: 'http://localhost:5173', sync: SYNC_ALL, cells: matrix(['/', '/precios'], ['iphone-15', 'laptop']) };
  for (const id of ['r0c0', 'r0c1']) m = applyEdit(m, { op: 'remove', cell: id }, known);
  m = applyEdit(m, { op: 'add', deviceId: 'ipad-mini' }, known);
  const nueva = m.cells.at(-1)!;
  out('A-5 añadir tras quitar la fila 0', nueva.group !== 1, `celda nueva: grupo ${nueva.group}, ruta ${nueva.path}; las demás están en el grupo ${m.cells[0].group} → fila nueva, sola, con la ruta de otra fila`);
  m = applyEdit(m, { op: 'add', deviceId: 'pixel-8' }, known);
  out('A-5b en una matriz se añade siempre a la fila 0', true, `grupos tras añadir: ${m.cells.map((c) => c.id + ':' + c.group).join(' ')}`);
}

// A-7 · rowScales (panel.ts usa GAP=14, MIN_CELL=230): si n·MIN_CELL no cabe, todo cae a 40 px de alto
{
  const { rowScales } = await import('../src/core/devices.ts');
  const tres = ['iphone-15', 'ipad-mini', 'laptop'].map((id) => findDevice(id)!);
  for (const ancho of [760, 718, 700]) {
    const availW = ancho - 26; // como layout(): rootEl.clientWidth - 26
    const sc = rowScales(tres, availW, 800, 14, 230);
    out(`A-7 rowScales 3 dispositivos, panel ${ancho}px`, sc.some((x, i) => x * tres[i].height < 60), `escalas ${JSON.stringify(sc)} → alto ${sc.map((x, i) => Math.round(x * tres[i].height))} px`);
  }
}

// A-6 · mosaico guardado con un dispositivo que este equipo no conoce (dispositivo propio de un compañero)
{
  const m = parseMosaic({ v: 1, name: 'equipo', target: 'http://localhost:5173', cells: [{ id: 'a', deviceId: 'custom-movil-de-ana', path: '/' }] });
  out('A-6 dispositivo desconocido', m !== undefined && findDevice(m.cells[0].deviceId) === undefined, `parseMosaic lo acepta (deviceId=${m?.cells[0].deviceId}); panelHost.views() lo pinta como Laptop y el <select> de la celda no tiene esa opción: enseña la primera (iPhone SE)`);
}
