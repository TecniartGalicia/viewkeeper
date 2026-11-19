// Guion de la demo para la ficha. Lo carga sonda.ts con VK_SOLO=demo (para el GIF) o VK_SOLO=foto (para la
// captura fija). Usa la extensión de verdad: lo único simulado es la mano del usuario, que la sonda reproduce
// por el mismo camino que un evento real (el agente lo manda al panel y el panel lo reparte).
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { SondaApi } from '../../src/extension.ts';
import { SYNC_ALL, type Cell } from '../../src/core/mosaic.ts';
import { startDemoSite } from '../fixtures/demo-site.ts';
import { SONDA, cargadas, cell, sleep } from './sonda.ts';

async function limpiar(): Promise<void> {
  for (const c of ['workbench.action.closeSidebar', 'workbench.action.closeAuxiliaryBar', 'workbench.action.closePanel', 'notifications.clearAll', 'notifications.hideToasts']) {
    try {
      await vscode.commands.executeCommand(c);
    } catch {
      /* comando que no existe en esta versión */
    }
  }
}

export async function demo(api: SondaApi, modo: 'demo' | 'foto'): Promise<void> {
  const site = await startDemoSite();
  await limpiar();
  const cells: Cell[] =
    modo === 'foto'
      ? [
          ...['iphone-15', 'ipad-mini', 'laptop'].map((d, i) => cell(`r0c${i}`, d, 'main', { group: 0 })),
          ...['iphone-15', 'ipad-mini', 'laptop'].map((d, i) => cell(`r1c${i}`, d, 'main', { group: 1, path: '/product/tide' })),
        ]
      : ['iphone-15', 'ipad-mini', 'laptop'].map((d, i) => cell(`c${i}`, d));
  const h = await api.open({ v: 1, name: 'localhost:5173', target: site.origin, sync: SYNC_ALL, cells }, { sonda: SONDA });
  try {
    await cargadas(h, cells.map((c) => c.id));
    await limpiar();
    await sleep(1500);
    if (modo === 'foto') {
      await sleep(Number(process.env.VK_PAUSA ?? 8000));
      return;
    }
    const lider = 'c0';
    // 1. desplazamiento suave en el móvil
    for (let i = 1; i <= 12; i++) {
      await h.ask(lider, 'usuarioScroll', { ry: i * 0.035 });
      await sleep(140);
    }
    await sleep(900);
    for (let i = 12; i >= 0; i--) {
      await h.ask(lider, 'usuarioScroll', { ry: i * 0.035 });
      await sleep(70);
    }
    await sleep(700);
    // 2. escribir en el buscador, letra a letra
    const texto = 'lamp';
    for (let i = 1; i <= texto.length; i++) {
      await h.ask(lider, 'usuarioEscribe', { sel: '#buscar', value: texto.slice(0, i) });
      await sleep(220);
    }
    await sleep(1200);
    // 3. pulsar el botón de la portada: las tres vistas van a la ficha
    await h.ask(lider, 'usuarioClic', { sel: 'section.hero>a.btn' });
    await sleep(3200);
    // 4. bajar un poco en la ficha
    for (let i = 1; i <= 8; i++) {
      await h.ask(lider, 'usuarioScroll', { ry: i * 0.06 });
      await sleep(150);
    }
    await sleep(2200);
  } finally {
    if (process.env.VK_FIN) fs.writeFileSync(process.env.VK_FIN, 'fin');
    h.dispose();
    await site.close();
  }
}
