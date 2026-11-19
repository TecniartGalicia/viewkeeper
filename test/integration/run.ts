// Lanzador de la suite de integración: abre un VS Code aparte (perfil temporal, sin otras extensiones),
// carga la extensión en modo prueba y lee lo que la suite dejó escrito.
// VIEWKEEPER_VSCODE_EXE=<ruta> la corre en otro VS Code compatible (VSCodium, Cursor, una copia local).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

// Lanzado desde un terminal de VS Code, esta variable hace que el VS Code de pruebas arranque como Node pelado.
delete process.env.ELECTRON_RUN_AS_NODE;

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viewkeeper-it-'));
const salida = path.join(tmp, 'resultado.json');
fs.mkdirSync(path.join(tmp, 'workspace'), { recursive: true });
const exe = process.env.VIEWKEEPER_VSCODE_EXE || undefined;
if (exe) console.log(`Suite de integración en: ${exe}`);

let codigo = 1;
try {
  await runTests({
    ...(exe ? { vscodeExecutablePath: exe } : {}),
    extensionDevelopmentPath: raiz,
    extensionTestsPath: path.join(raiz, 'out', 'sonda.js'),
    launchArgs: [path.join(tmp, 'workspace'), `--user-data-dir=${path.join(tmp, 'user-data')}`, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
    extensionTestsEnv: { VK_SOLO: 't', VK_OUT: salida },
  });
  const r = JSON.parse(fs.readFileSync(salida, 'utf8')) as { vscode: string; error?: string; pruebas?: { id: string; ok: boolean; detalle: string }[] };
  console.log(`\nVS Code ${r.vscode}`);
  if (r.error) console.log(`ERROR: ${r.error}`);
  for (const p of r.pruebas ?? []) console.log(`${p.ok ? 'ok  ' : 'FALLA'} ${p.id} — ${p.detalle}`);
  const total = r.pruebas?.length ?? 0;
  const ok = (r.pruebas ?? []).filter((p) => p.ok).length;
  console.log(`\n${ok} de ${total} en verde`);
  codigo = !r.error && total >= 8 && ok === total ? 0 : 1;
} catch (e) {
  console.error('No se pudo ejecutar la suite de integración', e);
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    /* Windows suelta los ficheros con retraso */
  }
}
process.exit(codigo);
