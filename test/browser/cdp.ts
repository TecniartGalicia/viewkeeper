// Chrome sin ventana manejado por CDP, para los guiones del banco (r4, r5). Perfil temporal, sin internet
// (resolución de nombres anulada salvo localhost) y eventos de ratón y teclado de verdad (isTrusted).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { WebSocket } from 'ws';
import { espera } from './util.ts';

const CHROME = process.env.AUD_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export interface Navegador {
  cdp(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
  /** Pestaña nueva de 1600×1000 en esa dirección. Devuelve su sesión de CDP. */
  pestana(url: string): Promise<string>;
  evalua<T>(s: string, expr: string): Promise<T>;
  /** Clic de ratón en el punto (x, y) de la página de la celda n (coordenadas de la página, no de la pantalla). */
  clic(s: string, n: number, x: number, y: number): Promise<void>;
  /** Clic de ratón en un punto del propio panel. */
  clicPanel(s: string, selector: string): Promise<boolean>;
  teclea(s: string, texto: string): Promise<void>;
  intro(s: string): Promise<void>;
  cierra(): Promise<void>;
}

function lanza(): { chrome: ChildProcess; perfil: string } {
  const perfil = fs.mkdtempSync(path.join(process.env.AUD_TMP ?? os.tmpdir(), 'vk-aud-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--metrics-recording-only', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE *.localhost , EXCLUDE 127.0.0.1', '--window-size=1600,1000', 'about:blank'],
    { stdio: 'ignore' },
  );
  return { chrome, perfil };
}

/**
 * Arranca Chrome y se conecta. En un runner de CI recién arrancado Chrome puede tardar más de 10 s en abrir el
 * puerto de depuración (pasó 3 veces el 19-11): hasta 30 s por intento y un segundo intento con perfil nuevo.
 * Devuelve undefined si no arranca: quien llama decide (un banco que no arranca no ha comprobado nada).
 */
export async function abreChrome(): Promise<Navegador | undefined> {
  let { chrome, perfil } = lanza();
  let wsUrl = '';
  for (let intento = 1; intento <= 2 && !wsUrl; intento++) {
    if (intento === 2) {
      console.log('Chrome no abrió el puerto de depuración en 30 s; segundo intento con un perfil nuevo.');
      chrome.kill();
      ({ chrome, perfil } = lanza());
    }
    for (let i = 0; i < 300 && !wsUrl; i++) {
      await espera(100);
      try {
        const [p, ruta] = fs.readFileSync(path.join(perfil, 'DevToolsActivePort'), 'utf8').trim().split('\n');
        wsUrl = `ws://127.0.0.1:${p.trim()}${ruta.trim()}`;
      } catch {
        /* aún no */
      }
    }
  }
  if (!wsUrl) {
    chrome.kill();
    return undefined;
  }
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  await new Promise<void>((r, j) => {
    ws.once('open', () => r());
    ws.once('error', j);
  });
  let seq = 0;
  const pend = new Map<number, (v: { result?: Record<string, unknown>; error?: { message: string } }) => void>();
  ws.on('message', (d) => {
    const m = JSON.parse(String(d)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
    if (m.id !== undefined) {
      pend.get(m.id)?.(m);
      pend.delete(m.id);
    }
  });
  const cdp: Navegador['cdp'] = (method, params = {}, sessionId) => {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pend.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result ?? {})));
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  };
  const evalua = async <T>(s: string, expr: string): Promise<T> => {
    const r = (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }, s)) as { result: { value: T } };
    return r.result.value;
  };
  const raton = async (s: string, X: number, Y: number): Promise<void> => {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X, y: Y }, s);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: X, y: Y, button: 'left', clickCount: 1 }, s);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X, y: Y, button: 'left', clickCount: 1 }, s);
  };
  return {
    cdp,
    evalua,
    async pestana(url) {
      const { targetId } = (await cdp('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await cdp('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      await cdp('Page.enable', {}, sessionId);
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
      await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
      await espera(150);
      await cdp('Page.navigate', { url }, sessionId);
      return sessionId;
    },
    async clic(s, n, x, y) {
      const r = await evalua<{ l: number; t: number; w: number; cw: number }>(s, `(function(){var f=document.querySelectorAll('iframe')[${n}];var b=f.getBoundingClientRect();return {l:b.left,t:b.top,w:b.width,cw:f.clientWidth};})()`);
      const k = r.w / r.cw;
      await raton(s, r.l + x * k, r.t + y * k);
    },
    async clicPanel(s, selector) {
      const r = await evalua<{ x: number; y: number } | null>(s, `(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()`);
      if (!r) return false;
      await raton(s, r.x, r.y);
      return true;
    },
    async teclea(s, texto) {
      for (const ch of texto) {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }, s);
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }, s);
        await espera(80);
      }
    },
    async intro(s) {
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' }, s);
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, s);
    },
    async cierra() {
      try {
        await Promise.race([cdp('Browser.close'), espera(2000)]);
      } catch {
        /* ya cerrado */
      }
      await espera(500);
      if (chrome.exitCode === null) chrome.kill(); // por PID, solo el proceso que lanzó este guion
      ws.terminate();
      await espera(500);
      try {
        fs.rmSync(perfil, { recursive: true, force: true });
      } catch {
        /* Windows suelta los ficheros con retraso */
      }
    },
  };
}

/** Espera a que se cumpla la condición, mirando cada 100 ms. Devuelve si se cumplió dentro del plazo. */
export async function hasta(cond: () => boolean, ms = 6000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await espera(100);
  }
  return cond();
}
