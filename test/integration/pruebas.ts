// Suite de integración: corre DENTRO de VS Code (la carga sonda.ts con VK_SOLO=t). Cada prueba devuelve
// si pasó y por qué; el lanzador (run.ts) falla si alguna no pasa.
import * as vscode from 'vscode';
import * as net from 'node:net';
import * as http from 'node:http';
import type { SondaApi } from '../../src/extension.ts';
import { findDevice } from '../../src/core/devices.ts';
import { SYNC_ALL, addSession, applyEdit, type Mosaic } from '../../src/core/mosaic.ts';
import { deleteMosaic, loadMosaics, saveMosaic } from '../../src/vscode/store.ts';
import { captureMosaic } from '../../src/vscode/captureFlow.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { startApi, startUpstream } from '../fixtures/upstream.ts';
import { SONDA, cargadas, cell, estado, sintetico, sleep, until } from './sonda.ts';

export interface Resultado {
  id: string;
  ok: boolean;
  detalle: string;
}

const iguales = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function escucha(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });
}

export async function pruebas(api: SondaApi, ext: vscode.Extension<unknown>): Promise<Resultado[]> {
  const out: Resultado[] = [];
  const prueba = async (id: string, fn: () => Promise<[boolean, string]>): Promise<void> => {
    try {
      const [ok, detalle] = await fn();
      out.push({ id, ok, detalle });
    } catch (e) {
      out.push({ id, ok: false, detalle: String((e as Error).stack ?? e) });
    }
  };

  // I-1 · recién arrancada: activa, con todos sus comandos, y sin proxy escuchando hasta que se abre un mosaico.
  await prueba('I-1', async () => {
    const declarados = ((ext.packageJSON as { contributes: { commands: { command: string }[] } }).contributes.commands ?? []).map((c) => c.command);
    const todos = new Set(await vscode.commands.getCommands(true));
    const faltan = declarados.filter((c) => !todos.has(c));
    const up = await startUpstream();
    try {
      const { preferredPort } = await import('../../src/core/proxy.ts');
      const libre = !(await escucha(preferredPort(up.origin)));
      return [ext.isActive && faltan.length === 0 && libre, `activa=${ext.isActive}; comandos que faltan=${JSON.stringify(faltan)}; sin proxy antes de abrir=${libre}`];
    } finally {
      await up.close();
    }
  });

  // I-2 · un mosaico de verdad sobre el servidor sintético: carga, sincroniza, cookies, sesiones, WebSocket.
  await prueba('I-2', async () => {
    const r = await sintetico(api, true);
    const fallos: string[] = [];
    const exige = (nombre: string, ok: boolean): void => void (ok || fallos.push(nombre));
    exige('carga', r.carga === true);
    exige('anchos', iguales(r.anchos, [393, 768, 1366, 393]));
    exige('contexto seguro', iguales(r.contextoSeguro, [true, true, true, true]));
    exige('scroll', iguales(r.scrollRy, [0.5, 0.5, 0.5, 0]));
    exige('scroll sin eco', r.scrollEventos === 'a');
    exige('escritura', iguales(r.escritura, ['hola mundo', 'hola mundo', 'hola mundo', '']));
    exige('clic navega', r.clicNavega === true);
    exige('redirección', r.redireccion === true);
    exige('gzip', r.gzipTexto === true);
    exige('streaming', typeof r.streamMsEntreHolaYListo === 'number' && r.streamMsEntreHolaYListo > 500);
    exige('inicio de sesión', String(r.cookiesA).includes('sid=abc'));
    exige('misma sesión comparte', r.cookiesC_mismaSesion === r.cookiesA);
    exige('otra sesión aislada', r.cookiesD_otraSesion === '');
    exige('cookie de JavaScript', r.cookieJsLlega === true);
    exige('cookie de entrada oculta', r.cookieEntradaOculta === true);
    exige('WebSocket', String((r.ws as { eco?: string })?.eco ?? '').startsWith('eco:ping'));
    return [fallos.length === 0, fallos.length ? `falla: ${fallos.join(', ')} · ${JSON.stringify(r)}` : 'todo como en la Fase 0'];
  });

  // S-4 · informativo: si esta versión de VS Code ya deja pasar cookies Lax en el iframe, la reescritura sobra.
  await prueba('S-4 (informativo)', async () => {
    const r = await sintetico(api, false);
    return [true, `sin reescribir cookies, la celda manda: «${String(r.cookiesA)}» (vacío = la reescritura sigue haciendo falta)`];
  });

  // I-3 · cerrar el panel cierra el proxy.
  await prueba('I-3', async () => {
    const up = await startUpstream();
    try {
      const h = await api.open({ v: 1, name: 'i3', target: up.origin, sync: SYNC_ALL, cells: [cell('a', 'laptop')] }, { sonda: SONDA });
      const port = h.proxy.port;
      const antes = await escucha(port);
      h.panel.dispose();
      await sleep(400);
      const despues = await escucha(port);
      return [antes && !despues, `escuchaba=${antes}; tras cerrar el panel=${despues}`];
    } finally {
      await up.close();
    }
  });

  // I-5 · la barra del panel edita el mosaico en vivo: girar no recarga, cambiar de dispositivo recarga
  // esa celda en la misma página, añadir carga una celda ya sincronizada, quitar la quita.
  await prueba('I-5', async () => {
    const up = await startUpstream();
    const known = (id: string): boolean => findDevice(id) !== undefined;
    const m: Mosaic = { v: 1, name: 'i5', target: up.origin, sync: SYNC_ALL, cells: [cell('a', 'iphone-15'), cell('b', 'ipad-mini'), cell('c', 'laptop')] };
    const h = await api.open(m, { sonda: SONDA });
    try {
      if (!(await cargadas(h, ['a', 'b', 'c']))) return [false, 'no cargó'];
      // Las tres en /b, para comprobar que la celda recargada vuelve a /b y no al inicio.
      h.send('a', { t: 'nav', path: '/b' });
      h.send('b', { t: 'nav', path: '/b' });
      h.send('c', { t: 'nav', path: '/b' });
      await until(async () => (await Promise.all(['a', 'b', 'c'].map((id) => estado(h, id)))).every((e) => e.url?.endsWith('/b')), 8000);
      await sleep(400);
      const e0 = await Promise.all(['a', 'b', 'c'].map((id) => estado(h, id)));
      const f: string[] = [];
      // girar b
      h.apply(applyEdit(h.mosaic(), { op: 'rotate', cell: 'b' }, known));
      await sleep(800);
      const b1 = await estado(h, 'b');
      if (b1.boot !== e0[1].boot) f.push('girar recargó la celda');
      if (b1.width !== 1024) f.push(`girar: ancho ${b1.width}, se esperaba 1024`);
      // cambiar el dispositivo de c
      const n0 = h.events.length;
      h.apply(applyEdit(h.mosaic(), { op: 'device', cell: 'c', deviceId: 'pixel-8' }, known));
      const recargada = await until(() => h.events.slice(n0).some((e) => e.cell === 'c' && e.ev.t === 'ready'), 8000);
      await sleep(300);
      const c1 = await estado(h, 'c');
      if (!recargada || c1.boot === e0[2].boot) f.push('cambiar de dispositivo no recargó');
      if (c1.width !== 412) f.push(`dispositivo: ancho ${c1.width}, se esperaba 412`);
      if (!c1.url?.endsWith('/b')) f.push(`la celda recargada volvió a ${c1.url}, no a /b`);
      const a1 = await estado(h, 'a');
      if (a1.boot !== e0[0].boot) f.push('cambiar c recargó a');
      // añadir
      const n1 = h.events.length;
      h.apply(applyEdit(h.mosaic(), { op: 'add', deviceId: 'galaxy-s24' }, known));
      const nueva = h.mosaic().cells.at(-1)?.id ?? '';
      const llega = await until(() => h.events.slice(n1).some((e) => e.cell === nueva && e.ev.t === 'ready'), 8000);
      if (!llega) f.push('la celda añadida no cargó');
      const n2 = await estado(h, nueva);
      if (!n2.url?.endsWith('/b')) f.push(`la celda añadida abrió ${n2.url}, no la ruta de su fila`);
      // la añadida ya está sincronizada
      await h.ask('a', 'usuarioScroll', { ry: 0.5 });
      await sleep(900);
      const ry = Math.round((await estado(h, nueva)).ry * 10) / 10;
      if (ry !== 0.5) f.push(`la celda añadida no sigue el scroll (${ry})`);
      // quitar
      h.apply(applyEdit(h.mosaic(), { op: 'remove', cell: 'a' }, known));
      await sleep(300);
      if (h.mosaic().cells.some((c) => c.id === 'a')) f.push('quitar no quitó');
      return [f.length === 0, f.length ? f.join('; ') : 'girar, cambiar, añadir y quitar como se espera'];
    } finally {
      h.dispose();
      await up.close();
    }
  });

  // P-47 · una app que llama a su API en otro puerto. Sin pasarla por el proxy, el navegador la bloquea dentro
  // del mosaico y el agente avisa; pasándola, funciona y la API ve el origen de la app.
  await prueba('P-47', async () => {
    const up = await startUpstream();
    const apiSrv = await startApi(up.origin);
    const f: string[] = [];
    try {
      const avisos: string[] = [];
      const m = (): Mosaic => ({ v: 1, name: 'p47', target: up.origin, sync: SYNC_ALL, cells: [cell('a', 'laptop', 'main', { path: '/con-api?api=' + encodeURIComponent(apiSrv.origin) })] });
      const sin = await api.open(m(), { sonda: SONDA, onHint: (o) => avisos.push(o) });
      try {
        await cargadas(sin, ['a']);
        await until(async () => !(await estado(sin, 'a')).texto.includes('esperando'), 6000);
        const t = (await estado(sin, 'a')).texto;
        if (!t.includes('API-FALLA')) f.push(`sin paso, se esperaba el bloqueo: ${t.slice(0, 80)}`);
        await until(() => avisos.length > 0, 3000);
        if (!avisos.includes(apiSrv.origin)) f.push(`el agente no avisó del bloqueo (${JSON.stringify(avisos)})`);
      } finally {
        sin.dispose();
      }
      const con = await api.open(m(), { sonda: SONDA, proxy: { apiOrigins: [apiSrv.origin] } });
      try {
        await cargadas(con, ['a']);
        await until(async () => !(await estado(con, 'a')).texto.includes('esperando'), 6000);
        const t = (await estado(con, 'a')).texto;
        const esperado = `API-OK:${JSON.stringify({ origen: up.origin, cuerpo: 'hola' })}`;
        if (!t.includes(esperado)) f.push(`con paso: «${t.slice(0, 120)}», se esperaba «${esperado}»`);
      } finally {
        con.dispose();
      }
      return [f.length === 0, f.length ? f.join('; ') : 'sin paso se bloquea y avisa; con paso responde y ve el origen de la app'];
    } finally {
      await apiSrv.close();
      await up.close();
    }
  });

  // I-6 · mosaicos guardados en .vscode/viewkeeper.json: guardar, leer, sustituir por nombre, borrar, y un
  // fichero roto o editado a mano no rompe nada.
  await prueba('I-6', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return [false, 'la suite no abrió ninguna carpeta'];
    const f: string[] = [];
    const m: Mosaic = { v: 1, name: 'tienda', target: 'http://localhost:5173', sync: { ...SYNC_ALL, nav: false }, cells: [cell('a', 'iphone-15', 'main', { path: '/carrito' }), cell('b', 'laptop', 'admin', { group: 1 })] };
    await saveMosaic(folder, m);
    await saveMosaic(folder, { ...m, name: 'otro' });
    await saveMosaic(folder, { ...m, cells: [m.cells[0]] }); // mismo nombre: sustituye
    const l1 = await loadMosaics(folder);
    if (l1.length !== 2 || l1[0].name !== 'tienda' || l1[0].cells.length !== 1) f.push(`tras guardar: ${JSON.stringify(l1.map((x) => [x.name, x.cells.length]))}`);
    if (l1[1]?.sync.nav !== false || l1[1]?.cells[1]?.session !== 'admin') f.push('no conserva sesión ni interruptores');
    await deleteMosaic(folder, 'otro');
    if ((await loadMosaics(folder)).length !== 1) f.push('borrar no borró');
    const fichero = vscode.Uri.joinPath(folder.uri, '.vscode', 'viewkeeper.json');
    await vscode.workspace.fs.writeFile(fichero, Buffer.from('{ esto no es json'));
    if ((await loadMosaics(folder)).length !== 0) f.push('un fichero roto no da lista vacía');
    await vscode.workspace.fs.writeFile(fichero, Buffer.from(JSON.stringify({ v: 1, mosaics: [{ v: 1, name: 'x', target: 'file:///etc', cells: [] }, m, 7] })));
    const l2 = await loadMosaics(folder);
    if (l2.length !== 1 || l2[0].name !== 'tienda') f.push(`un fichero editado a mano: ${JSON.stringify(l2.map((x) => x.name))}`);
    const restos = fs.readdirSync(path.join(folder.uri.fsPath, '.vscode')).filter((x) => x.endsWith('.tmp'));
    if (restos.length) f.push(`quedan temporales: ${restos.join(', ')}`);
    return [f.length === 0, f.length ? f.join('; ') : 'guardar, sustituir, borrar y leer ficheros rotos, bien'];
  });

  // I-7 · añadir una sesión en vivo: la celda nueva tiene su propio bote de cookies; la política del webview se
  // reescribe para el origen nuevo; y la captura fotografía cada celda con SU sesión iniciada.
  await prueba('I-7', async () => {
    const up = await startUpstream();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-cap-'));
    const h = await api.open({ v: 1, name: 'sesiones', target: up.origin, sync: SYNC_ALL, cells: [cell('a', 'iphone-15')] }, { sonda: SONDA });
    const f: string[] = [];
    try {
      await cargadas(h, ['a']);
      h.send('a', { t: 'nav', path: '/login' });
      await until(async () => (await estado(h, 'a')).url?.endsWith('/login'), 8000);
      // Fuera de /login: la sesión nueva copia la ruta de la fila, y /login inicia sesión al cargarse.
      h.send('a', { t: 'nav', path: '/b' });
      await until(async () => (await estado(h, 'a')).url?.endsWith('/b'), 8000);
      const bootAntes = (await estado(h, 'a')).boot;
      const n0 = h.events.length;
      const next = addSession(h.mosaic(), 'admin');
      if (!next) return [false, 'addSession devolvió undefined'];
      h.apply(next);
      const nueva = next.cells.at(-1)!.id;
      const llega = await until(() => h.events.slice(n0).some((e) => e.cell === nueva && e.ev.t === 'ready'), 10000);
      if (!llega) f.push('la celda de la sesión nueva no cargó (¿la política del webview no admite su origen?)');
      // M1: añadir una sesión no vuelve a cargar las celdas que ya estaban.
      if ((await estado(h, 'a')).boot !== bootAntes) f.push('añadir la sesión recargó la celda que ya estaba');
      const quien = async (id: string): Promise<string> => {
        const x = (await h.ask(id, 'fetch', { path: '/whoami' })) as { body?: string } | undefined;
        try {
          return (JSON.parse(x?.body ?? '{}') as { cookie?: string }).cookie ?? '';
        } catch {
          return 'ERROR';
        }
      };
      const ca = await quien('a');
      const cb = await quien(nueva);
      if (!ca.includes('sid=abc')) f.push(`la sesión principal no tiene su cookie: «${ca}»`);
      if (cb !== '') f.push(`la sesión nueva hereda cookies: «${cb}»`);
      // Captura: necesita un navegador instalado (Chrome, Edge…). En una máquina sin ninguno, se dice y no falla.
      const saved = await captureMosaic(h, false, () => {}, vscode.Uri.file(dir));
      const pngs = saved.filter((s) => s.endsWith('.png'));
      if (pngs.length === 0) {
        f.push('la captura no guardó nada (¿hay Chrome o Edge instalado?)');
      } else {
        const hoja = pngs.find((s) => s.endsWith('-mosaico.png'));
        if (!hoja) f.push('falta la hoja de contactos');
        if (pngs.length !== h.mosaic().cells.length + 1) f.push(`capturas: ${pngs.length}, se esperaban ${h.mosaic().cells.length + 1}`);
        const b = fs.readFileSync(pngs[0]);
        if (b.readUInt32BE(16) !== 393 * 3) f.push(`ancho de la captura del iPhone: ${b.readUInt32BE(16)}, se esperaba 1179`);
      }
      return [f.length === 0, f.length ? f.join('; ') : `sesión nueva aislada y viva; ${pngs.length} capturas con la hoja`];
    } finally {
      h.dispose();
      await up.close();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* nada */
      }
    }
  });

  // I-8 · «Abrir una dirección»: lo que se escribe (con ruta) es lo que se abre, haya o no un servidor detectado,
  // y con un mosaico abierto lo sustituye en vez de solo traerlo al frente (lo que pasaba el 19-11 con una web
  // publicada: el botón abría el servidor local detectado y no había dónde escribir la dirección).
  await prueba('I-8', async () => {
    // Cada celda avisa al cargar con su ancho: se cuentan celdas distintas, no peticiones (una celda que recarga
    // tres veces no cuenta como tres).
    const vistas = new Map<string, Set<string>>();
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x');
      if (u.pathname === '/w') {
        const p = u.searchParams.get('p') ?? '';
        if (!vistas.has(p)) vistas.set(p, new Set());
        vistas.get(p)!.add(u.searchParams.get('w') ?? '');
        return void res.writeHead(204).end();
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>i8</title></head><body>${u.pathname}<script>navigator.sendBeacon('/w?p='+encodeURIComponent(location.pathname)+'&w='+innerWidth)</script></body></html>`);
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const origin = `http://localhost:${(srv.address() as net.AddressInfo).port}`;
    const w = vscode.window as unknown as { showInputBox: typeof vscode.window.showInputBox; createQuickPick: typeof vscode.window.createQuickPick; showQuickPick: typeof vscode.window.showQuickPick };
    const original = { showInputBox: w.showInputBox, createQuickPick: w.createQuickPick, showQuickPick: w.showQuickPick };
    const mosaicos = (): vscode.Tab[] => vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.includes('viewkeeper.mosaic'));
    const celdas = (p: string): number => vistas.get(p)?.size ?? 0;
    const esperadas = (vscode.workspace.getConfiguration('viewkeeper').get<string[]>('defaultDevices') ?? []).length || 3;
    const f: string[] = [];
    try {
      await vscode.window.tabGroups.close(mosaicos());
      // 1) El botón de la barra de estado: en su lista se escribe la dirección y se pulsa Intro. Si en esta máquina
      //    no hay servidor de desarrollo, la lista no sale y se pregunta con la casilla: las dos dan lo mismo.
      let lista = false;
      w.createQuickPick = (() => {
        lista = true;
        let cambio: (v: string) => void = () => {};
        let acepta: () => void = () => {};
        let oculta: () => void = () => {};
        const nada = { dispose() {} };
        const qp = {
          items: [] as vscode.QuickPickItem[],
          selectedItems: [] as vscode.QuickPickItem[],
          title: '',
          placeholder: '',
          onDidChangeValue: (cb: (v: string) => void) => ((cambio = cb), nada),
          onDidAccept: (cb: () => void) => ((acepta = cb), nada),
          onDidHide: (cb: () => void) => ((oculta = cb), nada),
          show: () =>
            void setTimeout(() => {
              cambio(`${origin}/pacientes`);
              qp.selectedItems = [qp.items[0]];
              acepta();
            }, 50),
          hide: () => oculta(),
          dispose: () => {},
        };
        return qp;
      }) as unknown as typeof vscode.window.createQuickPick;
      // Una lista que no deja escribir (la de antes) se cierra sin elegir: sin esto la prueba esperaría a una persona.
      w.showQuickPick = (async () => undefined) as unknown as typeof vscode.window.showQuickPick;
      w.showInputBox = async () => `${origin}/pacientes`;
      await vscode.commands.executeCommand('viewkeeper.open');
      if (!(await until(() => celdas('/pacientes') >= esperadas, 15000))) f.push(`botón de la barra (lista=${lista}): la ruta escrita no se abrió en ${esperadas} celdas: ${JSON.stringify([...vistas].map(([p, s]) => [p, [...s]]))}`);
      // 2) Con el mosaico abierto, «Dirección» lo cambia en vez de traerlo al frente.
      w.showInputBox = async () => `${origin}/agenda`;
      await vscode.commands.executeCommand('viewkeeper.openUrl');
      if (!(await until(() => celdas('/agenda') >= esperadas, 15000))) f.push(`con un mosaico abierto, la dirección nueva no se abrió en ${esperadas} celdas: ${JSON.stringify([...vistas].map(([p, s]) => [p, [...s]]))}`);
      if (mosaicos().length !== 1) f.push(`paneles de mosaico abiertos: ${mosaicos().length}, se esperaba 1`);
      return [f.length === 0, f.length ? f.join('; ') : `botón (lista=${lista}) y «Dirección»: ${JSON.stringify([...vistas].map(([p, s]) => [p, [...s]]))}`];
    } finally {
      w.showInputBox = original.showInputBox;
      w.createQuickPick = original.createQuickPick;
      w.showQuickPick = original.showQuickPick;
      await vscode.window.tabGroups.close(mosaicos());
      srv.closeAllConnections();
      srv.close();
    }
  });

  return out;
}
