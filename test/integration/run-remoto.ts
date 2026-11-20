// Lanzador de la sonda de ventana remota (M12): abre una ventana WSL de un VS Code de pruebas, con la extensión
// en desarrollo corriendo dentro de WSL, y lee lo que la sonda dejó escrito allí. Solo Windows con WSL.
//   VIEWKEEPER_VSCODE_EXE=<Code.exe de una copia de VS Code>  node test/integration/run-remoto.ts [distro]
// La primera vez VS Code instala su servidor en la distro (~/.vscode-server): tarda uno o dos minutos.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

delete process.env.ELECTRON_RUN_AS_NODE;
const exe = process.env.VIEWKEEPER_VSCODE_EXE;
if (process.platform !== 'win32' || !exe) {
  console.log('Hace falta Windows con WSL y VIEWKEEPER_VSCODE_EXE apuntando a un Code.exe.');
  process.exit(2);
}
const distro = process.argv[2] ?? 'Ubuntu';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** C:\Users\x → /mnt/c/Users/x */
const enWsl = (p: string): string => '/mnt/' + p[0].toLowerCase() + p.slice(2).replace(/\\/g, '/');
const remoto = (p: string): string => `vscode-remote://wsl+${distro}${p}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viewkeeper-wsl-'));
const userData = path.join(tmp, 'user-data');
const extensiones = path.join(tmp, 'extensions');
const wsl = (cmd: string): string => execFileSync('wsl.exe', ['-d', distro, '--', 'bash', '-lc', cmd], { encoding: 'utf8' }).replace(/\0/g, '');

let codigo = 1;
try {
  // La ventana remota la abre la extensión de WSL: se instala en el perfil temporal de esta copia.
  const cli = path.join(path.dirname(exe), 'bin', 'code.cmd');
  execFileSync(cli, ['--user-data-dir', userData, '--extensions-dir', extensiones, '--install-extension', 'ms-vscode-remote.remote-wsl', '--force'], { stdio: 'inherit', shell: true });
  wsl('rm -f /tmp/vk-remoto.json; mkdir -p /tmp/vk-carpeta');
  await runTests({
    vscodeExecutablePath: exe,
    extensionDevelopmentPath: remoto(enWsl(raiz)),
    extensionTestsPath: remoto(`${enWsl(raiz)}/out/sonda-remota.js`),
    launchArgs: [`--folder-uri=${remoto('/tmp/vk-carpeta')}`, `--user-data-dir=${userData}`, `--extensions-dir=${extensiones}`, '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust'],
  });
  const r = JSON.parse(wsl('cat /tmp/vk-remoto.json')) as Record<string, unknown>;
  console.log(JSON.stringify(r, null, 2));
  codigo = r.remoteName === 'wsl' && r.cargaTresCeldas === true && r.navegaLaFila === true && !r.error ? 0 : 1;
  console.log(codigo === 0 ? '\nVentana remota: el mosaico carga y navega.' : '\nVentana remota: FALLA.');
} catch (e) {
  console.error('No se pudo ejecutar la sonda remota', e);
  try {
    console.log(wsl('cat /tmp/vk-remoto.json 2>/dev/null || echo "(la sonda no dejó resultado)"'));
  } catch {
    /* sin WSL */
  }
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    /* Windows suelta los ficheros con retraso */
  }
}
process.exit(codigo);
