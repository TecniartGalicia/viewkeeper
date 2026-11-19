// Suite de integración: corre DENTRO de VS Code (la carga sonda.ts con VK_SOLO=t). Cada prueba devuelve
// si pasó y por qué; el lanzador (run.ts) falla si alguna no pasa.
import * as vscode from 'vscode';
import * as net from 'node:net';
import type { SondaApi } from '../../src/extension.ts';
import { findDevice } from '../../src/core/devices.ts';
import { SYNC_ALL, applyEdit, type Mosaic } from '../../src/core/mosaic.ts';
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

  return out;
}
