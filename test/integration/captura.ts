// Sonda S-7: ¿se puede fotografiar una celda con el navegador ya instalado, sin embarcar ninguno,
// y con la sesión iniciada? Uso: node src/sonda/captura.ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { execFile } from 'node:child_process';
import { capture, contactSheet, findBrowser, type CaptureIo, type Shot } from '../../src/core/capture.ts';
import { GATE_PREFIX, startProxy } from '../../src/core/proxy.ts';
import { startUpstream } from '../fixtures/upstream.ts';

const io: CaptureIo = {
  exists: async (p) => fs.existsSync(p),
  run: (exe, args, timeoutMs) => new Promise((resolve) => execFile(exe, args, { timeout: timeoutMs, windowsHide: true }, (err) => resolve(err ? (typeof err.code === 'number' ? err.code : -1) : 0))),
};
const pngSize = (f: string): [number, number] => {
  const b = fs.readFileSync(f);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

const up = await startUpstream();
const px = await startProxy({ target: up.origin, agentSource: '/* agente */' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-captura-'));
const res: Record<string, unknown> = {};
try {
  // Una "celda" que ya inició sesión: el proxy recuerda su cabecera Cookie.
  await new Promise<void>((done) =>
    http.get({ host: '127.0.0.1', port: px.port, path: '/b', headers: { host: new URL(px.originFor('main')).host, cookie: `${px.gateCookie}=${px.token}; sid=abc; rol=admin` } }, (r) => r.resume().on('end', done)),
  );
  const exe = await findBrowser(io, process.platform, process.env);
  res.navegador = exe ?? null;
  if (exe) {
    const entry = (p: string): string => px.captureUrl('main', p);
    const shots: Shot[] = [
      { label: 'iPhone 15', url: entry('/'), out: path.join(tmp, 'iphone.png'), width: 393, height: 852, dpr: 3 },
      { label: 'Laptop', url: entry('/'), out: path.join(tmp, 'laptop.png'), width: 1366, height: 768, dpr: 1 },
      { label: 'Página entera', url: entry('/'), out: path.join(tmp, 'entera.png'), width: 393, height: 4200, dpr: 1 },
    ];
    const t0 = Date.now();
    const r = await capture(io, exe, shots, path.join(tmp, 'perfil'));
    res.ms = Date.now() - t0;
    res.fallidas = r.failed.map((s) => s.label);
    res.tamanos = Object.fromEntries(r.ok.map((s) => [s.label, pngSize(s.out)]));
    // ¿Llega la sesión? Se vuelca el DOM de /whoami con el mismo perfil y la misma entrada.
    const dom = await new Promise<string>((resolve) =>
      execFile(exe, ['--headless=new', '--disable-gpu', `--user-data-dir=${path.join(tmp, 'perfil2')}`, '--virtual-time-budget=3000', '--dump-dom', entry('/whoami')], { timeout: 30000, windowsHide: true }, (_e, out) => resolve(String(out))),
    );
    res.sesionReproducida = dom.includes('sid=abc') && dom.includes('rol=admin');
    res.cookieEntradaOculta = !dom.includes(GATE_PREFIX);
    res.testigoEnLaOrden = shots.some((s) => typeof s.url === "string" && s.url.includes(px.token));
    // Hoja de contactos fotografiada con el mismo navegador
    const sheet = contactSheet('Sonda S-7', [{ label: '/', shots: r.ok.slice(0, 2).map((s) => ({ label: s.label, file: path.basename(s.out), width: s.width, height: s.height })) }]);
    fs.writeFileSync(path.join(tmp, 'hoja.html'), sheet.html);
    const hoja: Shot = { label: 'hoja', url: 'file:///' + path.join(tmp, 'hoja.html').replace(/\\/g, '/'), out: path.join(tmp, 'hoja.png'), width: sheet.width, height: sheet.height, dpr: 1 };
    const h = await capture(io, exe, [hoja], path.join(tmp, 'perfil3'));
    res.hoja = h.ok.length ? { esperado: [sheet.width, sheet.height], real: pngSize(hoja.out), bytes: fs.statSync(hoja.out).size } : 'falló';
    if (process.argv[2]) fs.copyFileSync(hoja.out, process.argv[2]);
  }
} finally {
  await px.close();
  await up.close();
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    /* el navegador puede tardar en soltar el perfil */
  }
}
console.log(JSON.stringify(res, null, 2));
