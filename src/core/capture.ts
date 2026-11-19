// Captura del mosaico. No embarca navegador: usa el Chrome, Edge, Brave o Chromium ya instalado,
// en modo sin ventana. Puro salvo `capture`, que recibe por parámetro cómo ejecutar y cómo mirar el disco.

export interface Shot {
  label: string;
  /** URL de entrada. Si es una función se pide justo antes de fotografiar: los tiques de captura caducan. */
  url: string | (() => string);
  out: string;
  width: number;
  height: number;
  dpr: number;
  userAgent?: string;
}

export const MAX_SHOT_HEIGHT = 12000;

export function browserCandidates(platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>): string[] {
  if (platform === 'win32') {
    const roots = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']].filter((r): r is string => !!r);
    const rel = ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe', 'Chromium\\Application\\chrome.exe'];
    return rel.flatMap((x) => roots.map((r) => `${r}\\${x}`));
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
}

export function captureArgs(s: Shot, profileDir: string): string[] {
  const h = Math.min(Math.max(200, Math.round(s.height)), MAX_SHOT_HEIGHT);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profileDir}`,
    `--window-size=${Math.round(s.width)},${h}`,
    `--force-device-scale-factor=${s.dpr}`,
    '--virtual-time-budget=5000',
    `--screenshot=${s.out}`,
  ];
  if (s.userAgent) args.push(`--user-agent=${s.userAgent}`);
  // La URL va la última y nunca se interpreta como opción: siempre empieza por http://s-…localhost
  args.push(typeof s.url === 'function' ? s.url() : s.url);
  return args;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Hoja de contactos: una página HTML con todas las capturas, que el mismo navegador fotografía después. */
export function contactSheet(title: string, rows: { label: string; shots: { label: string; file: string; width: number; height: number }[] }[], thumbHeight = 640): { html: string; width: number; height: number } {
  let width = 0;
  let height = 64;
  let body = '';
  for (const row of rows) {
    let w = 24;
    body += `<h2>${esc(row.label)}</h2><div class="fila">`;
    for (const s of row.shots) {
      const tw = Math.round((s.width / s.height) * thumbHeight);
      w += tw + 24;
      body += `<figure><img src="${esc(s.file)}" width="${tw}" height="${thumbHeight}"><figcaption>${esc(s.label)} · ${s.width}×${s.height}</figcaption></figure>`;
    }
    body += '</div>';
    width = Math.max(width, w);
    height += thumbHeight + 96;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px 24px;font:14px system-ui;background:#f4f4f5;color:#18181b}h1{font-size:18px;margin:0 0 8px}h2{font:600 13px ui-monospace,monospace;margin:16px 0 8px}.fila{display:flex;gap:24px}figure{margin:0}img{display:block;border:1px solid #d4d4d8;border-radius:8px;background:#fff}figcaption{padding-top:6px;color:#52525b}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
  return { html, width: Math.max(480, width + 24), height };
}

export interface CaptureIo {
  exists(path: string): Promise<boolean>;
  /** Ejecuta sin shell (execFile). Resuelve el código de salida. */
  run(exe: string, args: string[], timeoutMs: number): Promise<number>;
}

export async function findBrowser(io: CaptureIo, platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>, configured?: string): Promise<string | undefined> {
  if (configured && (await io.exists(configured))) return configured;
  for (const c of browserCandidates(platform, env)) if (await io.exists(c)) return c;
  return undefined;
}

/** Una captura por celda, de una en una: varias instancias a la vez sobre el mismo perfil se pisan. */
export async function capture(io: CaptureIo, exe: string, shots: readonly Shot[], profileDir: string): Promise<{ ok: Shot[]; failed: Shot[] }> {
  const ok: Shot[] = [];
  const failed: Shot[] = [];
  for (const s of shots) {
    const code = await io.run(exe, captureArgs(s, profileDir), 30000).catch(() => -1);
    if (code === 0 && (await io.exists(s.out))) ok.push(s);
    else failed.push(s);
  }
  return { ok, failed };
}
