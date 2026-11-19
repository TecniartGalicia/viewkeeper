// Adaptador de red para core/ports.ts: busca el servidor de desarrollo del proyecto.
import * as vscode from 'vscode';
import { CANDIDATE_PORTS, detect, portsFromScripts, type Found } from '../core/ports.ts';
import { probePort } from '../core/probe.ts';

export { apiTrustsApp } from '../core/probe.ts';

export async function findDevServers(folder: vscode.WorkspaceFolder | undefined): Promise<Found[]> {
  let declared: number[] = [];
  if (folder) {
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, 'package.json'));
      declared = portsFromScripts(Buffer.from(raw).toString('utf8'));
    } catch {
      /* sin package.json: se prueban solo los puertos habituales */
    }
  }
  return detect([...declared, ...CANDIDATE_PORTS], (p) => probePort(p));
}
