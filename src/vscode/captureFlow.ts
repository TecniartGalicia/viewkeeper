// Captura: fotografía cada celda con el navegador instalado y monta la hoja.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { capture, contactSheet, findBrowser, redirectPage, type CaptureIo, type Shot } from '../core/capture.ts';
import { findDevice, rotate } from '../core/devices.ts';
import type { PanelHost } from './panelHost.ts';

const io: CaptureIo = {
  exists: async (p) => fs.existsSync(p),
  // execFile, nunca exec: los argumentos no pasan por un intérprete de órdenes.
  run: (exe, args, timeoutMs) => new Promise((resolve) => execFile(exe, args, { timeout: timeoutMs, windowsHide: true }, (err) => resolve(err ? (typeof err.code === 'number' ? err.code : -1) : 0))),
  // En la carpeta temporal de la captura (mkdtemp: solo para este usuario), con permisos solo para él y un nombre que nadie adivina.
  stash: async (url, profileDir) => {
    const file = path.join(path.dirname(profileDir), `entrada-${randomBytes(12).toString('hex')}.html`);
    fs.writeFileSync(file, redirectPage(url), { mode: 0o600, flag: 'wx' });
    return {
      href: pathToFileURL(file).href,
      drop: () => {
        try {
          fs.rmSync(file, { force: true });
        } catch {
          /* se va con la carpeta temporal */
        }
      },
    };
  },
};

export function slug(s: string): string {
  const out = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return out === '' ? 'inicio' : out;
}

/** `to`: carpeta de destino ya elegida (las pruebas); si no, se pregunta. Devuelve los ficheros guardados. */
export async function captureMosaic(host: PanelHost, fullPage: boolean, log: (line: string) => void, to?: vscode.Uri): Promise<string[]> {
  const saved: string[] = [];
  if (host.mosaic().cells.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('Add a device first.'));
    return saved;
  }
  const cfg = vscode.workspace.getConfiguration('viewkeeper');
  const exe = await findBrowser(io, process.platform, process.env, cfg.get<string>('browserPath') || undefined);
  if (!exe) {
    void vscode.window.showErrorMessage(vscode.l10n.t('ViewKeeper needs Chrome, Edge, Brave or Chromium to capture. Install one or set "viewkeeper.browserPath".'));
    return saved;
  }
  const dest = to ? [to] : await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: vscode.l10n.t('Save captures here') });
  if (!dest?.[0]) return saved;
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
          // Sin la consulta ni el ancla de la ruta: pueden llevar un testigo o un dato personal (como al guardar).
          out: path.join(tmp, `${slug(mosaic.name)}-${slug(d.name)}-${d.width}x${d.height}-${slug(c.path.split(/[?#]/)[0])}-${c.id}.png`),
          width: d.width,
          height: m?.pageHeight ?? d.height,
          dpr: d.dpr,
          userAgent: d.userAgent,
          group: c.group,
          route: c.path,
        });
      }
      const res = await capture(io, exe, shots, path.join(tmp, 'perfil'));
      // El panel se cerró mientras se capturaba: el proxy ya no existe y lo que falte no es un fallo que diagnosticar.
      if (host.isDisposed) {
        void vscode.window.showInformationMessage(vscode.l10n.t('The mosaic was closed during the capture.'));
        return;
      }
      if (res.ok.length === 0) {
        for (const s of res.failed) log(`capture failed: ${s.label} (${s.width}×${s.height})`);
        void vscode.window.showWarningMessage(vscode.l10n.t('{0} capture(s) failed. Run "ViewKeeper: Diagnose" for details.', res.failed.length));
        return;
      }
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
        const target = vscode.Uri.joinPath(dest[0], path.basename(s.out));
        await vscode.workspace.fs.copy(vscode.Uri.file(s.out), target, { overwrite: true });
        saved.push(target.fsPath);
      }
      const failed = res.failed.length + sheetRes.failed.length;
      for (const s of [...res.failed, ...sheetRes.failed]) log(`capture failed: ${s.label} (${s.width}×${s.height})`);
      const open = vscode.l10n.t('Open folder');
      if (to) return;
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
  return saved;
}
