// Mosaicos guardados del proyecto: .vscode/viewkeeper.json, pensado para ir a git y compartirse.
import * as vscode from 'vscode';
import { parseMosaic, type Mosaic } from '../core/mosaic.ts';

const FILE = ['.vscode', 'viewkeeper.json'] as const;
const MAX_SAVED = 30;

function fileUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, ...FILE);
}

/** Nunca lanza: un fichero ausente, roto o editado a mano da una lista vacía o parcial. */
export async function loadMosaics(folder: vscode.WorkspaceFolder): Promise<Mosaic[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(fileUri(folder))).toString('utf8'));
  } catch {
    return [];
  }
  const list = (raw as { mosaics?: unknown })?.mosaics;
  if (!Array.isArray(list)) return [];
  const out: Mosaic[] = [];
  for (const item of list) {
    const m = parseMosaic(item);
    if (m && !out.some((x) => x.name === m.name)) out.push(m);
    if (out.length === MAX_SAVED) break;
  }
  return out;
}

/** Guarda o sustituye por nombre. Escribe en un temporal y renombra: un corte no deja medio fichero. */
export async function saveMosaic(folder: vscode.WorkspaceFolder, mosaic: Mosaic): Promise<void> {
  const clean = parseMosaic(mosaic);
  if (!clean) throw new Error('mosaico no válido');
  const all = (await loadMosaics(folder)).filter((m) => m.name !== clean.name);
  all.unshift(clean);
  await write(folder, all.slice(0, MAX_SAVED));
}

export async function deleteMosaic(folder: vscode.WorkspaceFolder, name: string): Promise<void> {
  await write(folder, (await loadMosaics(folder)).filter((m) => m.name !== name));
}

async function write(folder: vscode.WorkspaceFolder, mosaics: Mosaic[]): Promise<void> {
  const target = fileUri(folder);
  const tmp = vscode.Uri.joinPath(folder.uri, FILE[0], `.viewkeeper.${process.pid}.tmp`);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, FILE[0]));
  const text = JSON.stringify({ v: 1, mosaics }, null, 2) + '\n';
  await vscode.workspace.fs.writeFile(tmp, Buffer.from(text, 'utf8'));
  await vscode.workspace.fs.rename(tmp, target, { overwrite: true });
}
