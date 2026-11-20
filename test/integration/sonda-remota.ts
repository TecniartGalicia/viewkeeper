// Sonda de ventana remota (plan de mejoras, M12). La carga VS Code con --extensionTestsPath en una ventana WSL:
// este fichero corre en el host de extensiones REMOTO (Linux), junto a la extensión y al proxy; el panel y sus
// celdas se pintan en la máquina local. Abre un mosaico por el comando del usuario y cuenta qué celdas llegan
// al servidor de pruebas, que también está en la máquina remota. Deja el resultado en /tmp/vk-remoto.json.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type * as net from 'node:net';
import type { SondaApi } from '../../src/extension.ts';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(150);
  }
  return fn();
}

export async function run(): Promise<void> {
  const res: Record<string, unknown> = { vscode: vscode.version, remoteName: vscode.env.remoteName ?? null, plataformaDelHost: process.platform, fecha: new Date().toISOString() };
  const guardar = (): void => fs.writeFileSync('/tmp/vk-remoto.json', JSON.stringify(res, null, 2));
  const vistas = new Map<string, Set<string>>();
  const srv = http.createServer((req, res2) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname === '/w') {
      const p = u.searchParams.get('p') ?? '';
      if (!vistas.has(p)) vistas.set(p, new Set());
      vistas.get(p)!.add(u.searchParams.get('w') ?? '');
      return void res2.writeHead(204).end();
    }
    res2.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': ['sid=remota; Path=/; HttpOnly'] }).end(`<!doctype html><html><head><title>r</title></head><body>${u.pathname}<script>navigator.sendBeacon('/w?p='+encodeURIComponent(location.pathname)+'&w='+innerWidth)</script></body></html>`);
  });
  const anchos = (p: string): number => vistas.get(p)?.size ?? 0;
  try {
    const ext = vscode.extensions.getExtension<SondaApi | undefined>('argalla.viewkeeper');
    if (!ext) throw new Error('extensión no cargada');
    const api = await ext.activate();
    if (!api) throw new Error('la extensión no exporta la puerta de sonda (¿no está en modo prueba?)');
    res.extensionKind = ext.extensionKind === vscode.ExtensionKind.Workspace ? 'workspace (remoto)' : 'ui (local)';
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const origin = `http://localhost:${(srv.address() as net.AddressInfo).port}`;
    res.servidor = origin;
    (vscode.window as unknown as { showInputBox: unknown }).showInputBox = async () => `${origin}/`;
    await vscode.commands.executeCommand('viewkeeper.openUrl');
    const host = api.current();
    res.mosaicoAbierto = host !== undefined;
    if (host) {
      res.puertoDelProxy = host.proxy.port;
      res.puertoLocal = host.proxy.shownPort();
      res.origenDeLaCelda = host.proxy.originFor('main');
    }
    res.cargaTresCeldas = await until(() => anchos('/') >= 3, 30000);
    res.anchosEnLaPortada = [...(vistas.get('/') ?? [])];
    if (host && res.cargaTresCeldas) {
      host.drive(host.mosaic().cells[0].group, '/b');
      res.navegaLaFila = await until(() => anchos('/b') >= 3, 15000);
      res.diagnostico = host.diagnostics();
    }
  } catch (e) {
    res.error = String((e as Error).stack ?? e);
  } finally {
    guardar();
    srv.closeAllConnections();
    srv.close();
  }
}
