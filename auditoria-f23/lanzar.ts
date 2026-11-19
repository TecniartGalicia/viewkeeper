// Lanza sonda-audit.ts dentro de un VS Code aparte, sobre una copia de HEAD (no toca dist/ ni out/ del repo).
// Uso (desde la raíz del repo):
//   node --no-warnings auditoria-f23/lanzar.ts <carpeta-con-copia-de-HEAD>
// La carpeta se prepara antes con:  git archive HEAD | tar -x -C <carpeta>
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';

delete process.env.ELECTRON_RUN_AS_NODE;
const copia = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(path.join(copia, 'package.json'))) throw new Error('falta la copia de HEAD');
const repo = process.cwd();
const nodePaths = [path.join(repo, 'node_modules')];
await build({ entryPoints: [path.join(copia, 'src/extension.ts')], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: path.join(copia, 'dist/extension.js'), external: ['vscode'], nodePaths, logLevel: 'warning' });
await build({ entryPoints: [path.join(copia, 'src/webview/panel.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(copia, 'dist/panel.js'), nodePaths, logLevel: 'warning' });
// La sonda de la auditoría, compilada contra los fuentes de la COPIA (mismo código que la extensión cargada).
fs.mkdirSync(path.join(copia, 'auditoria-f23'), { recursive: true });
fs.copyFileSync(path.join(repo, 'auditoria-f23', 'sonda-audit.ts'), path.join(copia, 'auditoria-f23', 'sonda-audit.ts'));
await build({ entryPoints: [path.join(copia, 'auditoria-f23/sonda-audit.ts')], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: path.join(copia, 'out/audit.js'), external: ['vscode'], nodePaths, logLevel: 'warning' });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-aud-it-'));
const salida = path.join(tmp, 'resultado.json');
fs.mkdirSync(path.join(tmp, 'workspace'), { recursive: true });
const exe = process.env.VIEWKEEPER_VSCODE_EXE;
try {
  await runTests({
    ...(exe ? { vscodeExecutablePath: exe } : {}),
    extensionDevelopmentPath: copia,
    extensionTestsPath: path.join(copia, 'out', 'audit.js'),
    launchArgs: [path.join(tmp, 'workspace'), `--user-data-dir=${path.join(tmp, 'user-data')}`, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
    extensionTestsEnv: { VK_OUT: salida },
  });
} catch (e) {
  console.error('fallo al lanzar', e);
}
console.log(fs.existsSync(salida) ? fs.readFileSync(salida, 'utf8') : 'sin resultado');
