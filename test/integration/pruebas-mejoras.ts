// Suite de integración de las mejoras (docs/PLAN-MEJORAS.md). Corre DENTRO de VS Code, después de pruebas.ts.
// Lo que el usuario haría con el ratón en un cuadro de VS Code se sustituye por una respuesta fija; lo que haría
// dentro del panel (pulsar la ruta, el «+» de una fila) se entrega al host como el mensaje que el panel manda,
// que es justo lo que el banco de navegador (r5) comprueba que el panel envía.
import * as vscode from 'vscode';
import * as http from 'node:http';
import type * as net from 'node:net';
import type { SondaApi } from '../../src/extension.ts';
import type { Resultado } from './pruebas.ts';
import { sleep, until } from './sonda.ts';

type Ventana = { showInputBox: typeof vscode.window.showInputBox; createQuickPick: typeof vscode.window.createQuickPick; showQuickPick: typeof vscode.window.showQuickPick };
type Elemento = vscode.QuickPickItem & Record<string, unknown>;

/** Servidor de pruebas: cualquier ruta contesta una página que avisa de su ruta y de su ancho; «/falla» además lanza un error. */
async function servidor(): Promise<{ origin: string; anchos(p: string): number; rutas(): string[]; olvida(): void; close(): void }> {
  const vistas = new Map<string, Set<string>>();
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname === '/w') {
      const p = u.searchParams.get('p') ?? '';
      if (!vistas.has(p)) vistas.set(p, new Set());
      vistas.get(p)!.add(u.searchParams.get('w') ?? '');
      return void res.writeHead(204).end();
    }
    const falla = u.pathname === '/falla' ? `<script>setTimeout(function () { throw new Error('fallo-de-prueba'); }, 20);</script>` : '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>m</title></head><body>${u.pathname}<script>navigator.sendBeacon('/w?p='+encodeURIComponent(location.pathname)+'&w='+innerWidth)</script>${falla}</body></html>`);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  return {
    origin: `http://localhost:${(srv.address() as net.AddressInfo).port}`,
    anchos: (p) => vistas.get(p)?.size ?? 0,
    rutas: () => [...vistas.keys()],
    olvida: () => vistas.clear(),
    close: () => {
      srv.closeAllConnections();
      srv.close();
    },
  };
}

/**
 * Una lista de VS Code sin persona: al mostrarse, «escribe» el texto, elige lo que diga `elige` (por defecto, el
 * primer elemento) y acepta. Apunta los elementos que la lista ofrecía. Con `elige` devolviendo undefined, se cierra sin elegir.
 */
function listaFalsa(visto: { items: Elemento[]; veces: number }, escribe?: string, elige: (items: Elemento[]) => Elemento | undefined = (i) => i[0]): typeof vscode.window.createQuickPick {
  return (() => {
    visto.veces++;
    let cambio: (v: string) => void = () => {};
    let acepta: () => void = () => {};
    let oculta: () => void = () => {};
    const nada = { dispose() {} };
    const qp = {
      items: [] as Elemento[],
      selectedItems: [] as Elemento[],
      title: '',
      placeholder: '',
      value: '',
      onDidChangeValue: (cb: (v: string) => void) => ((cambio = cb), nada),
      onDidAccept: (cb: () => void) => ((acepta = cb), nada),
      onDidHide: (cb: () => void) => ((oculta = cb), nada),
      onDidTriggerItemButton: () => nada,
      show: () =>
        void setTimeout(() => {
          if (escribe !== undefined) {
            qp.value = escribe;
            cambio(escribe);
          }
          visto.items = [...qp.items];
          const e = elige(qp.items);
          if (!e) return oculta();
          qp.selectedItems = [e];
          acepta();
        }, 50),
      hide: () => oculta(),
      dispose: () => {},
    };
    return qp;
  }) as unknown as typeof vscode.window.createQuickPick;
}

const mosaicos = (): vscode.Tab[] => vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.includes('viewkeeper.mosaic'));

export async function pruebasMejoras(api: SondaApi): Promise<Resultado[]> {
  const out: Resultado[] = [];
  const prueba = async (id: string, fn: () => Promise<[boolean, string]>): Promise<void> => {
    try {
      const [ok, detalle] = await fn();
      out.push({ id, ok, detalle });
    } catch (e) {
      out.push({ id, ok: false, detalle: String((e as Error).stack ?? e) });
    }
  };
  const w = vscode.window as unknown as Ventana;
  const original: Ventana = { showInputBox: w.showInputBox, createQuickPick: w.createQuickPick, showQuickPick: w.showQuickPick };
  const restaura = (): void => void Object.assign(w, original);
  const cfg = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('viewkeeper');
  const raizUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  const escribe = async (rel: string): Promise<vscode.Uri> => {
    const uri = vscode.Uri.joinPath(raizUri as vscode.Uri, ...rel.split('/'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from('export default function Pagina() { return null; }\n'));
    return uri;
  };
  /** Entrega al host del mosaico abierto un mensaje como los que manda el panel. */
  const delPanel = (m: Record<string, unknown>): void => (api.current() as unknown as { onMessage(m: unknown, o: unknown): void }).onMessage(m, {});

  // I-9 · el mosaico sigue al editor: abrir el fichero de una página lleva la fila a su ruta; lo demás, no.
  await prueba('I-9', async () => {
    if (!raizUri) return [false, 'la suite necesita una carpeta abierta'];
    const s = await servidor();
    const f: string[] = [];
    try {
      await vscode.window.tabGroups.close(mosaicos());
      const precios = await escribe('app/precios/page.tsx');
      const dinamica = await escribe('app/blog/[slug]/page.tsx');
      const suelto = await escribe('src/util.ts');
      const contacto = await escribe('apps/web/app/contacto/page.tsx');
      w.showInputBox = async () => `${s.origin}/`;
      await vscode.commands.executeCommand('viewkeeper.openUrl');
      if (!(await until(() => s.anchos('/') >= 3, 15000))) return [false, `el mosaico no abrió: ${JSON.stringify(s.rutas())}`];
      // Apagado (como viene): abrir una página no mueve nada.
      await vscode.window.showTextDocument(precios, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      await sleep(1200);
      if (s.anchos('/precios') !== 0) f.push('con el ajuste apagado, abrir una página movió el mosaico');
      // Al encenderlo, el fichero que ya está delante cuenta.
      await vscode.commands.executeCommand('viewkeeper.toggleFollowEditor');
      if (cfg().get('followEditor') !== true) f.push('el comando no encendió el ajuste');
      if (!(await until(() => s.anchos('/precios') >= 3, 10000))) f.push(`al encenderlo no fue a /precios en las tres celdas: ${JSON.stringify(s.rutas())}`);
      // Un fichero que no es una página, y una ruta con segmento dinámico: se queda donde está.
      await vscode.window.showTextDocument(suelto, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      await vscode.window.showTextDocument(dinamica, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      await sleep(1500);
      const extra = s.rutas().filter((p) => p !== '/' && p !== '/precios');
      if (extra.length) f.push(`un fichero que no lleva a ninguna ruta movió el mosaico a ${JSON.stringify(extra)}`);
      // En un monorepo, la app está dentro de otra carpeta.
      await vscode.window.showTextDocument(contacto, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      if (!(await until(() => s.anchos('/contacto') >= 3, 10000))) f.push(`no fue a /contacto (apps/web/app/contacto/page.tsx): ${JSON.stringify(s.rutas())}`);
      // Apagado otra vez: deja de seguir.
      await vscode.commands.executeCommand('viewkeeper.toggleFollowEditor');
      s.olvida();
      await vscode.window.showTextDocument(precios, { viewColumn: vscode.ViewColumn.Beside, preview: false });
      await sleep(1200);
      if (s.anchos('/precios') !== 0) f.push('tras apagarlo sigue al editor');
      return [f.length === 0, f.length ? f.join('; ') : 'sigue a las páginas (también en un monorepo), ignora lo demás y se apaga'];
    } finally {
      restaura();
      await cfg().update('followEditor', undefined, vscode.ConfigurationTarget.Global);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      s.close();
    }
  });

  // I-10 · desde el rótulo: cambiar la ruta de la fila y añadir un dispositivo a una fila concreta. Y los errores
  // de la página llegan al diagnóstico como una cuenta.
  await prueba('I-10', async () => {
    const s = await servidor();
    const f: string[] = [];
    const visto = { items: [] as Elemento[], veces: 0 };
    try {
      await vscode.window.tabGroups.close(mosaicos());
      await sleep(300);
      w.showInputBox = async () => `${s.origin}/`;
      await vscode.commands.executeCommand('viewkeeper.openUrl');
      if (!(await until(() => s.anchos('/') >= 3, 15000))) return [false, `el mosaico no abrió: ${JSON.stringify(s.rutas())}`];
      const host = api.current();
      if (!host) return [false, 'no hay mosaico abierto que la extensión conozca'];
      const primera = host.mosaic().cells[0];
      // La ruta: en la lista se escribe una que el proyecto no tiene, y se acepta.
      w.createQuickPick = listaFalsa(visto, '/falla');
      delPanel({ t: 'route', cell: primera.id });
      if (!(await until(() => s.anchos('/falla') >= 3, 10000))) f.push(`cambiar la ruta no llevó a las tres celdas a /falla: ${JSON.stringify(s.rutas())}`);
      if (visto.items[0]?.label !== '/falla') f.push(`lo escrito no era el primer elemento de la lista: ${JSON.stringify(visto.items.map((i) => i.label))}`);
      if (!(await until(() => host.mosaic().cells.every((c) => c.path === '/falla'), 5000))) f.push(`el mosaico no anota la ruta nueva: ${JSON.stringify(host.mosaic().cells.map((c) => c.path))}`);
      // /falla lanza un error en cada celda: al diagnóstico llega la cuenta, nunca el texto.
      const hayErrores = await until(() => host.diagnostics().filter((l) => /JavaScript errors/.test(l)).length >= 3, 6000);
      if (!hayErrores) f.push(`el diagnóstico no cuenta los errores de las celdas: ${JSON.stringify(host.diagnostics())}`);
      if (host.diagnostics().join('\n').includes('fallo-de-prueba')) f.push('el texto del error llegó al host');
      // Añadir a una fila: el «+» manda la fila; el selector de dispositivo se contesta solo.
      w.showQuickPick = (async (items: Elemento[]) => items.find((i) => i.id === 'desktop') ?? items[0]) as unknown as typeof vscode.window.showQuickPick;
      delPanel({ t: 'pick', group: primera.group });
      if (!(await until(() => host.mosaic().cells.length === 4, 5000))) f.push(`añadir a la fila no añadió: ${host.mosaic().cells.length} celdas`);
      const nueva = host.mosaic().cells.at(-1);
      if (nueva?.group !== primera.group || nueva?.deviceId !== 'desktop') f.push(`la celda nueva no es la pedida: ${JSON.stringify(nueva)}`);
      if (!(await until(() => s.anchos('/falla') >= 4, 10000))) f.push('la celda nueva no cargó la ruta de su fila');
      return [f.length === 0, f.length ? f.join('; ') : `ruta de la fila cambiada, errores contados y celda añadida a su fila: ${JSON.stringify(host.diagnostics().filter((l) => /JavaScript/.test(l)))}`];
    } finally {
      restaura();
      s.close();
    }
  });

  // I-11 · el botón reabre lo último de este proyecto si su servidor sigue en marcha; si no, lo ofrece en la lista.
  await prueba('I-11', async () => {
    const s = await servidor();
    const f: string[] = [];
    const visto = { items: [] as Elemento[], veces: 0 };
    let preguntas = 0;
    try {
      await vscode.window.tabGroups.close(mosaicos());
      await sleep(300);
      w.showInputBox = async () => `${s.origin}/agenda`;
      await vscode.commands.executeCommand('viewkeeper.openUrl');
      if (!(await until(() => s.anchos('/agenda') >= 3, 15000))) return [false, `el mosaico no abrió: ${JSON.stringify(s.rutas())}`];
      // Se deja con dos celdas y en otra ruta, y se cierra el panel.
      const host = api.current();
      if (!host) return [false, 'no hay mosaico abierto que la extensión conozca'];
      delPanel({ t: 'edit', edit: { op: 'remove', cell: host.mosaic().cells[2].id } });
      host.drive(host.mosaic().cells[0].group, '/citas?token=SECRETO');
      if (!(await until(() => s.anchos('/citas') >= 2, 10000))) f.push('no fue a /citas antes de cerrar');
      await sleep(1300); // el respiro con el que se recuerda una navegación
      await vscode.window.tabGroups.close(mosaicos());
      await sleep(500);
      s.olvida();
      // 1) El servidor sigue en marcha: el botón reabre sin preguntar nada.
      w.createQuickPick = listaFalsa(visto);
      w.showInputBox = async () => (preguntas++, undefined);
      await vscode.commands.executeCommand('viewkeeper.open');
      if (!(await until(() => s.anchos('/citas') >= 2, 15000))) f.push(`no reabrió lo último (dos celdas en /citas): ${JSON.stringify(s.rutas())}`);
      await sleep(600);
      if (s.anchos('/citas') !== 2) f.push(`reabrió con ${s.anchos('/citas')} celdas, se esperaban 2`);
      if (visto.veces + preguntas !== 0) f.push(`preguntó antes de reabrir (listas: ${visto.veces}, casillas: ${preguntas})`);
      const reabierto = api.current()?.mosaic();
      if (reabierto?.cells.some((c) => c.path.includes('SECRETO'))) f.push('lo recordado conserva la consulta de la dirección');
      // 2) Con el servidor parado: no se abre solo; se ofrece el primero de la lista.
      await vscode.window.tabGroups.close(mosaicos());
      await sleep(500);
      s.close();
      w.createQuickPick = listaFalsa(visto, undefined, () => undefined);
      await vscode.commands.executeCommand('viewkeeper.open');
      await sleep(300);
      if (mosaicos().length !== 0) f.push('con el servidor parado abrió el mosaico sin preguntar');
      if (visto.veces !== 1 || !visto.items[0]?.mosaic) f.push(`con el servidor parado no ofreció reabrir lo último como primera opción: ${JSON.stringify(visto.items.map((i) => i.label))}`);
      return [f.length === 0, f.length ? f.join('; ') : `reabre lo último sin preguntar; con el servidor parado lo ofrece: ${JSON.stringify(visto.items.map((i) => i.label))}`];
    } finally {
      restaura();
      await vscode.window.tabGroups.close(mosaicos());
      s.close();
    }
  });

  return out;
}
