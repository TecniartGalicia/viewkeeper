// Sonda de Fase 0. La carga VS Code con --extensionTestsPath: abre mosaicos de verdad en un webview
// de verdad y pregunta a los agentes qué ven. Escribe el resultado en VK_OUT.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SondaApi } from '../../src/extension.ts';
import type { Cell, Mosaic } from '../../src/core/mosaic.ts';
import { SYNC_ALL } from '../../src/core/mosaic.ts';
import type { PanelHost } from '../../src/vscode/panelHost.ts';
import { startUpstream } from '../fixtures/upstream.ts';
import { pruebas } from './pruebas.ts';

export let SONDA = { inicio: '', pregunta: '' };
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export type Estado = { boot: string; url: string; width: number; util: number; estrecho: boolean; ua: string; lang: string; touch: number; scrollY: number; maxY: number; ry: number; valor: string | null; texto: string; cookieJs: string; ws: string[]; seguro: boolean; timeout?: boolean };

export const cell = (id: string, deviceId: string, session = 'main', extra: Partial<Cell> = {}): Cell => ({ id, deviceId, landscape: false, path: '/', session, group: 0, ...extra });

export async function until(fn: () => boolean | Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
}

export async function estado(h: PanelHost, id: string, sel?: string): Promise<Estado> {
  // Una pregunta hecha a una celda que está navegando se pierde: se devuelve un estado vacío, no una excepción.
  return ((await h.ask(id, 'estado', { sel })) ?? { timeout: true, texto: '', url: '', ws: [] }) as Estado;
}

/** Espera a que la celda anuncie un documento nuevo (hello) cuya URL cumpla la condición. */
async function navegar(h: PanelHost, id: string, path: string, ok: (url: string) => boolean, ms = 8000): Promise<boolean> {
  const desde = h.events.length;
  h.send(id, { t: 'nav', path });
  return until(() => h.events.slice(desde).some((e) => e.cell === id && e.ev.t === 'ready' && ok(e.ev.url)), ms);
}

export async function cargadas(h: PanelHost, ids: string[], ms = 20000): Promise<boolean> {
  return until(() => ids.every((id) => h.events.some((e) => e.cell === id && e.ev.t === 'ready')), ms);
}

export async function sintetico(api: SondaApi, fixCookies: boolean): Promise<Record<string, unknown>> {
  const up = await startUpstream();
  const r: Record<string, unknown> = { upstream: up.origin, fixCookies };
  const mosaic: Mosaic = {
    v: 1,
    name: 'sintetico',
    target: up.origin,
    sync: SYNC_ALL,
    cells: [cell('a', 'iphone-15', 'main', { locale: 'gl' }), cell('b', 'ipad-mini'), cell('c', 'laptop'), cell("d", "iphone-15", "otra", { group: 1 })],
  };
  const h = await api.open(mosaic, { sonda: SONDA, proxy: { fixCookies } });
  try {
    const ids = ['a', 'b', 'c', 'd'];
    r.carga = await cargadas(h, ids);
    if (!r.carga) {
      r.eventos = h.events.slice(0, 20);
      return r;
    }
    const e0 = await Promise.all(ids.map((id) => estado(h, id)));
    r.origenCelda = e0[0].url;
    r.contextoSeguro = e0.map((e) => e.seguro);
    r.anchos = e0.map((e) => e.width);
    r.anchoUtil = e0.map((e) => e.util);
    r.mediaEstrecha = e0.map((e) => e.estrecho);
    r.uaCliente = [e0[0].ua.includes('iPhone'), e0[2].ua.includes('iPhone')];
    r.idiomaCliente = [e0[0].lang, e0[1].lang];
    r.tactil = [e0[0].touch, e0[2].touch];

    // scroll: la celda a baja a la mitad; b y c deben seguirla, d (misma página, mismo grupo) también
    const n0 = h.events.length;
    await h.ask('a', 'usuarioScroll', { ry: 0.5 });
    await sleep(900);
    const e1 = await Promise.all(ids.map((id) => estado(h, id)));
    r.scrollRy = e1.map((e) => Math.round(e.ry * 1000) / 1000);
    await sleep(700);
    r.scrollEventos = h.events.slice(n0).filter((e) => e.ev.t === 'scroll').map((e) => e.cell).join('');

    // escritura
    await h.ask('a', 'usuarioEscribe', { sel: '#q', value: 'hola mundo' });
    await sleep(400);
    r.escritura = (await Promise.all(ids.map((id) => estado(h, id, '#q')))).map((e) => e.valor);

    // clic en un enlace: todas las celdas del grupo acaban en /b
    const nClic = h.events.length;
    await h.ask('a', 'usuarioClic', { sel: '#lnk' });
    // Se mira en los eventos, no preguntando: una pregunta hecha a una celda que está navegando se pierde.
    r.clicNavega = await until(() => ['a', 'b', 'c'].every((id) => h.events.slice(nClic).some((e) => e.cell === id && e.ev.t === 'ready' && e.ev.url.endsWith('/b'))), 8000);
    await sleep(300);
    r.trasClic = (await Promise.all(ids.map((id) => estado(h, id)))).map((e) => e.url);

    // navegación empujada desde el panel + redirección absoluta del servidor
    r.redireccion = await navegar(h, 'a', '/redir', (u) => u.startsWith(h.proxy.originFor('main')) && u.endsWith('/b'));
    // HTML comprimido a la fuerza
    r.gzip = await navegar(h, 'a', '/gz', (u) => u.endsWith('/gz'));
    r.gzipTexto = (await estado(h, 'a')).texto.includes('PAGINA-GZ');
    // HTML en streaming: ¿el agente saluda antes de que acabe el documento?
    const n1 = h.events.length;
    await navegar(h, 'a', '/stream', (u) => u.endsWith('/stream'));
    const ev = h.events.slice(n1).filter((e) => e.cell === 'a');
    const hola = ev.find((e) => e.ev.t === 'hello' && e.ev.url.endsWith('/stream'));
    const listo = ev.find((e) => e.ev.t === 'ready' && e.ev.url.endsWith('/stream'));
    r.streamMsEntreHolaYListo = hola && listo ? listo.at - hola.at : null;

    // cookies: a inicia sesión; c comparte sesión; d tiene otra
    await sleep(600);
    r.login = await navegar(h, 'a', '/login', (u) => u.endsWith('/login'));
    const quien = async (id: string): Promise<{ cookie: string; host: string; origin: string | null; referer: string | null; ua: string }> => {
      const x = (await h.ask(id, 'fetch', { path: '/whoami' })) as { body?: string };
      try {
        return JSON.parse(x.body ?? '{}');
      } catch {
        return { cookie: 'ERROR ' + JSON.stringify(x), host: '', origin: null, referer: null, ua: '' };
      }
    };
    const wa = await quien('a');
    r.cookiesA = wa.cookie;
    r.hostVisto = wa.host;
    r.refererVisto = wa.referer;
    r.cookiesC_mismaSesion = (await quien('c')).cookie;
    r.cookiesD_otraSesion = (await quien('d')).cookie;
    r.cookieJs = await h.ask('a', 'ponCookieJs', { cookie: 'desdejs=1; path=/' });
    r.cookieJsLlega = (await quien('a')).cookie.includes('desdejs=1');
    r.cookieEntradaOculta = !wa.cookie.includes('__vk');

    // WebSocket a través del túnel
    r.ws = await h.ask('a', 'ws', { path: '/ws' });
  } finally {
    h.dispose();
    await up.close();
  }
  return r;
}

async function real(api: SondaApi, nombre: string, target: string, fichero: string, buscar: string): Promise<Record<string, unknown>> {
  const r: Record<string, unknown> = { target };
  const mosaic: Mosaic = { v: 1, name: nombre, target, sync: SYNC_ALL, cells: [cell('a', 'iphone-15'), cell('b', 'ipad-mini'), cell('c', 'laptop')] };
  const h = await api.open(mosaic, { sonda: SONDA });
  const original = fs.readFileSync(fichero, 'utf8');
  try {
    const ids = ['a', 'b', 'c'];
    r.carga = await cargadas(h, ids, 60000);
    if (!r.carga) {
      r.eventos = h.events.slice(0, 20);
      return r;
    }
    // Hidratación y canal de recarga: se espera a que el WebSocket de cada celda esté ABIERTO.
    // Si el fichero cambia antes, el cliente del framework recarga el documento entero al conectar.
    r.canalAbierto = await until(async () => (await Promise.all(ids.map((id) => estado(h, id)))).every((e) => e.ws?.some((l) => l.includes(' open '))), 15000);
    await sleep(500);
    const e0 = await Promise.all(ids.map((id) => estado(h, id)));
    r.anchos = e0.map((e) => e.width);
    r.textoInicial = e0[0].texto.slice(0, 80).replace(/\s+/g, ' ');
    // recarga en caliente: se cambia un texto del código y se mira si llega SIN recargar el documento.
    // De paso el cambio alarga la página, porque las plantillas caben en pantalla y no tienen recorrido.
    const marca = 'VK' + Date.now();
    if (!original.includes(buscar)) {
      r.hmr = `no se encontró «${buscar}» en ${fichero}`;
      return r;
    }
    const t0 = Date.now();
    fs.writeFileSync(fichero, original.replace(buscar, marca + '<span style={{ display: "block", height: 3000 }} />'));
    r.hmrLlega = await until(async () => (await Promise.all(ids.map((id) => estado(h, id)))).every((e) => e.texto?.includes(marca)), 30000);
    r.hmrMs = Date.now() - t0;
    const e1 = await Promise.all(ids.map((id) => estado(h, id)));
    r.hmrSinRecargar = e1.map((e, i) => e.boot === e0[i].boot);
    r.recorridoMaximo = e1.map((e) => e.maxY);
    r.wsDiario = e1.map((e) => e.ws);
    r.wsAntes = e0.map((e) => e.ws);
    const n0 = h.events.length;
    await h.ask('a', 'usuarioScroll', { ry: 0.5 });
    await sleep(900);
    const e2 = await Promise.all(ids.map((id) => estado(h, id)));
    r.scrollRy = e2.map((e) => Math.round(e.ry * 1000) / 1000);
    r.scrollY = e2.map((e) => e.scrollY);
    await sleep(600);
    r.scrollEventos = h.events.slice(n0).filter((e) => e.ev.t === 'scroll').map((e) => e.cell).join('');
  } finally {
    fs.writeFileSync(fichero, original);
    h.dispose();
  }
  return r;
}

export async function run(): Promise<void> {
  const out = process.env.VK_OUT ?? 'resultado.json';
  const res: Record<string, unknown> = { vscode: vscode.version, fecha: new Date().toISOString() };
  const guardar = (): void => fs.writeFileSync(out, JSON.stringify(res, null, 2));
  try {
    const ext = vscode.extensions.getExtension<SondaApi | undefined>('argalla.viewkeeper');
    if (!ext) throw new Error('extensión de la sonda no cargada');
    const api = await ext.activate();
    if (!api) throw new Error('la extensión no exporta la puerta de sonda (¿no está en modo prueba?)');
    const dir = path.join(ext.extensionPath, 'test', 'sonda');
    SONDA = { inicio: fs.readFileSync(path.join(dir, 'inicio.js'), 'utf8'), pregunta: fs.readFileSync(path.join(dir, 'pregunta.js'), 'utf8') };
    const solo = process.env.VK_SOLO ?? '';
    if (solo === 't') {
      // Suite de integración: afirmaciones, no medidas. El lanzador (run.ts) lee el resultado y decide.
      res.pruebas = await pruebas(api, ext);
      guardar();
      return;
    }
    if (solo === 'p') {
      // Modo pausa: deja abierta una matriz 2 rutas × 3 dispositivos para mirarla (y capturar la pantalla).
      const up = await startUpstream();
      for (const c of ['workbench.action.closeSidebar', 'workbench.action.closeAuxiliaryBar', 'workbench.action.closePanel']) await vscode.commands.executeCommand(c);
      const cells: Cell[] = ['/', '/b'].flatMap((path, g) => ['iphone-15', 'ipad-mini', 'laptop'].map((d, i) => cell(`r${g}c${i}`, d, 'main', { path, group: g })));
      const h = await api.open({ v: 1, name: 'matriz', target: up.origin, sync: SYNC_ALL, cells }, { sonda: SONDA });
      await sleep(4000);
      await h.ask('r0c0', 'usuarioScroll', { ry: 0.5 });
      await sleep(Number(process.env.VK_PAUSA ?? 15000));
      h.dispose();
      await up.close();
      return;
    }
    if (!solo || solo.includes('s')) {
      res.sintetico = await sintetico(api, true);
      guardar();
      res.sinteticoSinArreglarCookies = await sintetico(api, false);
      guardar();
    }
    if (process.env.VK_VITE && (!solo || solo.includes('v'))) {
      res.vite = await real(api, 'vite', process.env.VK_VITE, process.env.VK_VITE_FILE ?? '', process.env.VK_VITE_FIND ?? '');
      guardar();
    }
    if (process.env.VK_NEXT && (!solo || solo.includes('n'))) {
      res.next = await real(api, 'next', process.env.VK_NEXT, process.env.VK_NEXT_FILE ?? '', process.env.VK_NEXT_FIND ?? '');
      guardar();
    }
  } catch (e) {
    res.error = String((e as Error).stack ?? e);
  }
  guardar();
}
