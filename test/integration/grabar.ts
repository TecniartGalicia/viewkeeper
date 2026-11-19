// Graba la ficha: `node test/integration/grabar.ts foto` (media/shots/mosaic.png) o `… demo` (media/shots/demo.gif).
// Abre un VS Code aparte con un perfil limpio, ejecuta el guion de demo.ts, graba SOLO esa ventana y monta el resultado.
// Necesita ffmpeg en el PATH y VK_CODE apuntando a un Code.exe (no el instalado, que puede estar actualizándose).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

delete process.env.ELECTRON_RUN_AS_NODE;
const modo = process.argv[2] === 'foto' ? 'foto' : 'demo';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-grabar-'));
const frames = path.join(tmp, 'frames');
const bandera = path.join(tmp, 'fin');
const ud = path.join(tmp, 'ud');
fs.mkdirSync(path.join(ud, 'User'), { recursive: true });
// Un perfil limpio: sin bienvenida, sin chat ni botones de cuenta en el título, fuente legible.
fs.writeFileSync(
  path.join(ud, 'User', 'settings.json'),
  JSON.stringify({
    'workbench.startupEditor': 'none',
    'window.commandCenter': false,
    'workbench.layoutControl.enabled': false,
    'chat.commandCenter.enabled': false,
    'chat.disableAIFeatures': true,
    'workbench.tips.enabled': false,
    'window.title': 'ViewKeeper',
    'editor.minimap.enabled': false,
    'window.zoomLevel': 0,
  }),
);
fs.mkdirSync(path.join(raiz, 'media', 'shots'), { recursive: true });

const rec = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(raiz, 'scripts', 'grabar-ventana.ps1'), '-Carpeta', frames, '-Bandera', bandera], { stdio: 'inherit' });
const grabado = new Promise<void>((r) => rec.on('exit', () => r()));
try {
  await runTests({
    vscodeExecutablePath: process.env.VK_CODE,
    extensionDevelopmentPath: raiz,
    extensionTestsPath: path.join(raiz, 'out', 'sonda.js'),
    launchArgs: [`--user-data-dir=${ud}`, `--extensions-dir=${path.join(tmp, 'ext')}`, '--skip-welcome', '--skip-release-notes'],
    extensionTestsEnv: { VK_SOLO: modo, VK_FIN: bandera, VK_PAUSA: '6000', VK_OUT: path.join(tmp, 'r.json') },
  });
} finally {
  fs.writeFileSync(bandera, 'fin');
  await grabado;
}

// Fotogramas negros o a medio pintar (PrintWindow a veces devuelve uno vacío) fuera: menos del 30 % de la mediana.
const todos = fs.readdirSync(frames).filter((f) => f.endsWith('.png')).sort();
const tam = todos.map((f) => fs.statSync(path.join(frames, f)).size);
const mediana = [...tam].sort((a, b) => a - b)[Math.floor(tam.length / 2)] ?? 0;
const buenos = todos.filter((_f, i) => tam[i] > mediana * 0.3);
console.log(`fotogramas: ${todos.length}, buenos: ${buenos.length}`);
const lista = path.join(tmp, 'lista');
fs.mkdirSync(lista);
buenos.forEach((f, i) => fs.copyFileSync(path.join(frames, f), path.join(lista, `f${String(i).padStart(5, '0')}.png`)));
// Se recorta la barra de título del sistema (34 px): lleva «Extension Development Host».
const recorte = 'crop=in_w:in_h-34:0:34';
if (modo === 'foto') {
  const ultimo = path.join(lista, `f${String(buenos.length - 3).padStart(5, '0')}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', ultimo, '-vf', recorte, path.join(raiz, 'media', 'shots', 'mosaic.png')]);
  console.log('media/shots/mosaic.png');
} else {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '5', '-i', path.join(lista, 'f%05d.png'), '-vf', `${recorte},scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=bayer`, path.join(raiz, 'media', 'shots', 'demo.gif')]);
  console.log('media/shots/demo.gif');
}
try {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
} catch {
  /* Windows suelta los ficheros con retraso */
}
