// Las rutas de la app del proyecto abierto, leídas de sus ficheros. Lo usan la matriz y el cambio de ruta de una fila.
import * as vscode from 'vscode';
import { detectRoutes, type Route } from '../core/routes.ts';

const PAGES = '**/*.{tsx,jsx,ts,js,mdx,md,svelte,astro,vue,html}';
const SKIP = '**/{node_modules,dist,build,out,.next,.svelte-kit,.astro,.nuxt,.output,coverage}/**';

export async function projectRoutes(folder: vscode.WorkspaceFolder | undefined): Promise<Route[]> {
  if (!folder) return [];
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, PAGES), SKIP, 4000);
  return detectRoutes(files.map((f) => vscode.workspace.asRelativePath(f, false)));
}
