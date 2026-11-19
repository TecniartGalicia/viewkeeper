// Auditoría F2-F3: escenarios de comandos dentro de un VS Code de verdad (perfil temporal).
// Lo carga lanzar.ts como --extensionTestsPath. Sustituye solo los diálogos (showInputBox, avisos, withProgress,
// showOpenDialog) y espía createWebviewPanel para poder hablar con el host como lo haría el panel.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SondaApi } from '../src/extension.ts';
import { SYNC_ALL, addSession, type Cell, type Mosaic } from '../src/core/mosaic.ts';
import type { PanelHost } from '../src/vscode/panelHost.ts';
import { startApi, startUpstream } from '../test/fixtures/upstream.ts';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean | Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
}
const cell = (id: string, deviceId: string, session = 'main', extra: Partial<Cell> = {}): Cell => ({ id, deviceId, landscape: false, path: '/', session, group: 0, ...extra });

interface Rec {
  n: number;
  panel: vscode.WebviewPanel;
  listeners: ((m: unknown) => void)[];
  htmlSets: number;
  disposed: boolean;
}
const panels: Rec[] = [];
const msgs: { kind: string; text: string }[] = [];
const W = vscode.window as unknown as Record<string, unknown>;
const orig: Record<string, unknown> = {};
function stub(name: string, fn: unknown): void {
  if (!(name in orig)) orig[name] = W[name];
  try {
    W[name] = fn;
  } catch {
    Object.defineProperty(W, name, { value: fn, configurable: true, writable: true });
  }
}
function restore(name: string): void {
  if (name in orig) {
    try {
      W[name] = orig[name];
    } catch {
      Object.defineProperty(W, name, { value: orig[name], configurable: true, writable: true });
    }
  }
}

function bindAll<T extends object>(t: T, over: Record<string | symbol, unknown> = {}): T {
  return new Proxy(t, {
    get(target, k) {
      if (k in over) return over[k as string];
      const v = Reflect.get(target, k);
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(target, k, v) {
      return Reflect.set(target, k, v);
    },
  });
}

export async function run(): Promise<void> {
  const out = process.env.VK_OUT ?? 'resultado-auditoria.json';
  const res: Record<string, unknown> = { vscode: vscode.version };
  const guardar = (): void => fs.writeFileSync(out, JSON.stringify(res, null, 2));
  try {
    const ext = vscode.extensions.getExtension<SondaApi | undefined>('argalla.viewkeeper');
    if (!ext) throw new Error('extensión no cargada');
    const api = await ext.activate();
    if (!api) throw new Error('sin puerta de sonda');
    const dir = path.join(ext.extensionPath, 'test', 'sonda');
    const SONDA = { inicio: fs.readFileSync(path.join(dir, 'inicio.js'), 'utf8'), pregunta: fs.readFileSync(path.join(dir, 'pregunta.js'), 'utf8') };

    // Espía de paneles
    const create = W.createWebviewPanel as (...a: unknown[]) => vscode.WebviewPanel;
    stub('createWebviewPanel', (...a: unknown[]) => {
      const p = create.apply(vscode.window, a);
      const rec: Rec = { n: panels.length, panel: p, listeners: [], htmlSets: 0, disposed: false };
      p.onDidDispose(() => (rec.disposed = true));
      const wv = p.webview;
      const wvProxy = new Proxy(wv, {
        get(target, k) {
          if (k === 'onDidReceiveMessage')
            return (l: (m: unknown) => void, thisArg?: unknown, d?: vscode.Disposable[]) => {
              rec.listeners.push(l);
              return target.onDidReceiveMessage(l, thisArg, d);
            };
          const v = Reflect.get(target, k);
          return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(target) : v;
        },
        set(target, k, v) {
          if (k === 'html') rec.htmlSets++;
          return Reflect.set(target, k, v);
        },
      });
      const px = bindAll(p, { webview: wvProxy });
      rec.panel = px;
      panels.push(rec);
      return px;
    });
    const alive = (): Rec[] => panels.filter((r) => !r.disposed);
    const toHost = (r: Rec, m: unknown): void => r.listeners.forEach((l) => l(m));
    const closeAll = async (): Promise<void> => {
      for (const r of alive()) r.panel.dispose();
      await sleep(300);
    };

    stub('showErrorMessage', (t: string) => (msgs.push({ kind: 'error', text: t }), Promise.resolve(undefined)));
    stub('showWarningMessage', (t: string) => (msgs.push({ kind: 'warn', text: t }), Promise.resolve(undefined)));
    stub('showInformationMessage', (t: string) => (msgs.push({ kind: 'info', text: t }), Promise.resolve(undefined)));

    const up = await startUpstream();
    // pickTarget: findDevServers va dentro de withProgress (ventana). Se sustituye por «encontré uno», con retraso.
    const progress = orig.withProgress ?? W.withProgress;
    let onNotification: (() => void) | undefined;
    stub('withProgress', async (o: vscode.ProgressOptions, task: (p: unknown, t: unknown) => Promise<unknown>) => {
      if (o.location === vscode.ProgressLocation.Window) {
        await sleep(400);
        return [{ port: Number(new URL(up.origin).port), origin: up.origin }];
      }
      onNotification?.();
      return (progress as typeof vscode.window.withProgress).call(vscode.window, o, task as never);
    });
    if (!('withProgress' in orig)) orig.withProgress = progress;

    // ── V-1 · dos «Abrir mosaico» seguidos (doble clic en la barra de estado)
    try {
      await Promise.all([vscode.commands.executeCommand('viewkeeper.open'), vscode.commands.executeCommand('viewkeeper.open')]);
      await sleep(800);
      const vivos = alive();
      const r: Record<string, unknown> = { panelesCreados: panels.length, panelesVivos: vivos.length };
      if (vivos.length === 2) {
        // El panel huérfano manda «Añadir sesión» desde su barra: ¿a quién se le añade?
        stub('showInputBox', async () => 'otra');
        const h0 = vivos.map((x) => x.htmlSets);
        toHost(vivos[0], { t: 'command', command: 'addSession' });
        await sleep(1500);
        r.htmlReescritos = vivos.map((x, i) => x.htmlSets - h0[i]);
        r.nota = 'htmlReescritos[i] > 0 = a ese panel se le añadió la sesión (reescribe su CSP)';
        restore('showInputBox');
      }
      res.V1 = r;
    } catch (e) {
      res.V1 = { error: String(e) };
    }
    await closeAll();
    guardar();

    // ── V-2 · quitar todas las celdas y guardar
    try {
      msgs.length = 0;
      await vscode.commands.executeCommand('viewkeeper.open');
      await sleep(800);
      const p = alive()[0];
      for (const id of ['r0c0', 'r0c1', 'r0c2']) toHost(p, { t: 'edit', edit: { op: 'remove', cell: id } });
      await sleep(300);
      stub('showInputBox', async () => 'vacio');
      await vscode.commands.executeCommand('viewkeeper.save');
      restore('showInputBox');
      // Captura con 0 celdas: ¿dice algo?
      const n0 = msgs.length;
      stub('showOpenDialog', async () => [vscode.Uri.file(os.tmpdir())]);
      await vscode.commands.executeCommand('viewkeeper.capture');
      restore('showOpenDialog');
      res.V2 = { mensajesAlGuardar: msgs.slice(0, n0), mensajesAlCapturarVacio: msgs.slice(n0) };
    } catch (e) {
      res.V2 = { error: String(e) };
    }
    await closeAll();
    guardar();

    // ── V-3 · cerrar el panel mientras se escribe el nombre (guardar) y el de la sesión (añadir sesión)
    try {
      msgs.length = 0;
      await vscode.commands.executeCommand('viewkeeper.open');
      await sleep(800);
      stub('showInputBox', async () => {
        alive()[0]?.panel.dispose();
        await sleep(200);
        return 'nombre';
      });
      await vscode.commands.executeCommand('viewkeeper.save');
      const trasGuardar = [...msgs];
      msgs.length = 0;
      await vscode.commands.executeCommand('viewkeeper.open');
      await sleep(800);
      await vscode.commands.executeCommand('viewkeeper.addSession');
      restore('showInputBox');
      const folder = vscode.workspace.workspaceFolders?.[0];
      const fichero = folder ? path.join(folder.uri.fsPath, '.vscode', 'viewkeeper.json') : '';
      res.V3 = { guardar: trasGuardar, anadirSesion: [...msgs], ficheroEscrito: fichero !== '' && fs.existsSync(fichero) };
    } catch (e) {
      res.V3 = { error: String(e) };
    }
    await closeAll();
    guardar();

    // ── V-4 · cerrar el panel a mitad de una captura
    try {
      msgs.length = 0;
      await vscode.commands.executeCommand('viewkeeper.open');
      await sleep(1500);
      const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-aud-cap-'));
      stub('showOpenDialog', async () => [vscode.Uri.file(destino)]);
      onNotification = () => alive()[0]?.panel.dispose();
      const t0 = Date.now();
      await vscode.commands.executeCommand('viewkeeper.capture');
      onNotification = undefined;
      restore('showOpenDialog');
      const ficheros = fs.readdirSync(destino).map((f) => `${f} (${fs.statSync(path.join(destino, f)).size} B)`);
      res.V4 = { ms: Date.now() - t0, mensajes: [...msgs], ficheros, destino };
    } catch (e) {
      res.V4 = { error: String(e) };
    }
    await closeAll();
    guardar();

    // ── V-5 · avisos de API con grafías distintas del mismo origen (los fabrica la página)
    try {
      msgs.length = 0;
      const apiSrv = await startApi(up.origin);
      await vscode.commands.executeCommand('viewkeeper.open');
      await sleep(800);
      const p = alive()[0];
      const port = new URL(apiSrv.origin).port;
      for (const o of [apiSrv.origin, apiSrv.origin + '/', apiSrv.origin + '/x', `http://LOCALHOST:${port}`, `http://127.0.0.1:${port}`]) toHost(p, { t: 'hint', origin: o });
      await sleep(3000);
      res.V5 = { preguntas: msgs.filter((m) => m.kind === 'info').map((m) => m.text) };
      await apiSrv.close();
    } catch (e) {
      res.V5 = { error: String(e) };
    }
    await closeAll();
    guardar();

    // ── V-6 · añadir una sesión: ¿se recargan las celdas que ya estaban?
    try {
      const h: PanelHost = await api.open({ v: 1, name: 'v6', target: up.origin, sync: SYNC_ALL, cells: [cell('a', 'iphone-15'), cell('b', 'laptop')] }, { sonda: SONDA });
      const estado = async (id: string): Promise<{ boot?: string; url?: string }> => ((await h.ask(id, 'estado', {})) ?? {}) as { boot?: string; url?: string };
      await until(() => ['a', 'b'].every((id) => h.events.some((e) => e.cell === id && e.ev.t === 'ready')), 20000);
      await sleep(500);
      const antes = await Promise.all(['a', 'b'].map(estado));
      const next = addSession(h.mosaic(), 'admin');
      h.apply(next!);
      await sleep(4000);
      const despues = await Promise.all(['a', 'b'].map(estado));
      // Y en contraste: girar (sin origen nuevo)
      res.V6 = { recargadas: antes.map((x, i) => x.boot !== despues[i].boot), antes: antes.map((x) => x.boot), despues: despues.map((x) => x.boot) };
      h.dispose();
    } catch (e) {
      res.V6 = { error: String(e) };
    }
    guardar();

    // ── V-7 · ediciones malformadas y avalancha desde el webview (no deben romper el host)
    try {
      msgs.length = 0;
      await vscode.commands.executeCommand('viewkeeper.open');
      await sleep(800);
      const p = alive()[0];
      const basura: unknown[] = [null, 7, 'x', {}, { op: 'device' }, { op: 'device', cell: 'r0c0', deviceId: 'no-existe' }, { op: 'add', deviceId: 'laptop', group: -1 }, { op: 'add', deviceId: 'laptop', group: 1e9 }, { op: 'sync', key: '__proto__', value: true }, { op: 'sync', key: 'scroll', value: 'no' }, { op: 'rotate', cell: { toString: () => 'r0c0' } }, { op: 'remove', cell: 'nadie' }];
      for (const e of basura) toHost(p, { t: 'edit', edit: e });
      for (let i = 0; i < 300; i++) toHost(p, { t: 'edit', edit: { op: i % 2 ? 'remove' : 'add', deviceId: 'laptop', cell: 'c0' } });
      toHost(p, { t: 'command', command: 'open' });
      toHost(p, { t: 'command', command: 'workbench.action.closeWindow' });
      toHost(p, { t: 'where', cell: 'r0c0', path: 'javascript:alert(1)' });
      await sleep(1000);
      res.V7 = { panelVivo: !panels[p.n].disposed, mensajes: [...msgs] };
    } catch (e) {
      res.V7 = { error: String(e) };
    }
    await closeAll();
    await up.close();
  } catch (e) {
    res.error = String((e as Error).stack ?? e);
  }
  guardar();
}
