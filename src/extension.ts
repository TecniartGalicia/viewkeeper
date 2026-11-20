// Punto de entrada. Al arrancar solo registra comandos y pone el botón de la barra de estado:
// ni red, ni disco, ni proxy hasta que el usuario abre un mosaico.
import * as vscode from 'vscode';
import type { Mosaic } from './core/mosaic.ts';
import { currentHost, registerCommands } from './vscode/commands.ts';
import { PanelHost, type HostOptions } from './vscode/panelHost.ts';

export interface SondaApi {
  open(mosaic: Mosaic, opts?: HostOptions): Promise<PanelHost>;
  /** El mosaico que la extensión tiene abierto por sus propios comandos. */
  current(): PanelHost | undefined;
}

export function activate(ctx: vscode.ExtensionContext): SondaApi | undefined {
  registerCommands(ctx);
  // La puerta de la sonda solo existe cuando VS Code corre pruebas; instalada, la extensión no exporta nada.
  if (ctx.extensionMode !== vscode.ExtensionMode.Test) return undefined;
  return { open: (mosaic, opts) => PanelHost.open(ctx, mosaic, opts), current: currentHost };
}

export function deactivate(): void {}
