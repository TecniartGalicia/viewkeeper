// Captura: fotografía cada celda con el navegador instalado y monta la hoja.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { capture, contactSheet, findBrowser, type CaptureIo, type Shot } from '../core/capture.ts';
import { findDevice, rotate } from '../core/devices.ts';
import type { PanelHost } from './panelHost.ts';

const io: CaptureIo = {
  exists: async (p) => fs.existsSync(p),
  // execFile, nunca exec: los argumentos no pasan por un intérprete de órdenes.
  run: (exe, args, timeoutMs) => new Promise((resolve) => execFile(exe, args, { timeout: timeoutMs, windowsHide: true }, (err) => resolve(err ? (typeof err.code === 'number' ? err.code : -1) : 0))),
};

export function slug(s: string): string {
  const out = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return out === '' ? 'inicio' : out;
}

export async function captureMosaic(host: PanelHost, fullPage: boolean, log: (line: string) => void): Promise<void> {
  if (host.mosaic().cells.length === 0) return;
  const cfg = vscode.workspace.getConfiguration('viewkeeper');
  const exe = await findBrowser(io, process.platform, process.env, cfg.get<string>('browserPath') || undefined);
  if (!exe) {
    void vscode.window.showErrorMessage(vscode.l10n.t('ViewKeeper needs Chrome, Edge, Brave or Chromium to capture. Install one or set "viewkeeper.browserPath".'));
    return;
  }
  const dest = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: vscode.l10n.t('Save captures here') });
  if (!dest?.[0]) return;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viewkeeper-'));
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('ViewKeeper: capturing…') }, async () => {
      const mosaic = host.mosaic();
      const shots: (Shot & { group: number; route: string })[] = [];
      for (const c of mosaic.cells) {
        const base = findDevice(c.deviceId, host.customDevices) ?? findDevice('laptop')!;
        const d = c.landscape ? rotate(base) : base;
        // La altura de la página la da la celda viva: así «página entera» no necesita un segundo pase.
        const m = fullPage ? await host.metrics(c.id) : undefined;
        shots.push({
          label: d.name,
          // Tique de un solo uso: el testigo del proxy no aparece en la línea de órdenes del navegador.
          url: () => host.proxy.captureUrl(c.session, c.path),
          out: path.join(tmp, `${slug(mosaic.name)}-${slug(d.name)}-${d.width}x${d.height}-${slug(c.path)}-${c.id}.png`),
          width: d.width,
          height: m?.pageHeight ?? d.height,
          dpr: d.dpr,
          userAgent: d.userAgent,
          group: c.group,
          route: c.path,
        });
      }
      const res = await capture(io, exe, shots, path.join(tmp, 'perfil'));
      const groups = [...new Set(shots.map((s) => s.group))];
      const sheet = contactSheet(
        mosaic.name,
        groups.map((g) => ({
          label: shots.find((s) => s.group === g)?.route ?? '/',
          shots: res.ok.filter((s) => (s as (typeof shots)[number]).group === g).map((s) => ({ label: s.label, file: path.basename(s.out), width: s.width, height: s.height })),
        })),
      );
      const sheetHtml = path.join(tmp, 'hoja.html');
      fs.writeFileSync(sheetHtml, sheet.html);
      const sheetShot: Shot = { label: 'hoja', url: vscode.Uri.file(sheetHtml).toString(), out: path.join(tmp, `${slug(mosaic.name)}-mosaico.png`), width: sheet.width, height: sheet.height, dpr: 1 };
      const sheetRes = await capture(io, exe, [sheetShot], path.join(tmp, 'perfil-hoja'));
      for (const s of [...res.ok, ...sheetRes.ok]) {
        await vscode.workspace.fs.copy(vscode.Uri.file(s.out), vscode.Uri.joinPath(dest[0], path.basename(s.out)), { overwrite: true });
      }
      const failed = res.failed.length + sheetRes.failed.length;
      for (const s of [...res.failed, ...sheetRes.failed]) log(`captura fallida: ${s.label} (${s.width}×${s.height})`);
      const open = vscode.l10n.t('Open folder');
      const msg = failed ? vscode.window.showWarningMessage(vscode.l10n.t('{0} capture(s) failed. Run "ViewKeeper: Diagnose" for details.', failed), open) : vscode.window.showInformationMessage(vscode.l10n.t('{0} captures saved.', res.ok.length + sheetRes.ok.length), open);
      void msg.then((a) => {
        if (a === open) void vscode.env.openExternal(dest[0]);
      });
    });
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      /* el navegador puede tardar en soltar su perfil; el sistema limpia el temporal */
    }
  }
}
