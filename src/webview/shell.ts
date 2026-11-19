// El documento del panel: su política, su HTML y sus estilos. Sin 'vscode', para que el banco de navegador
// monte exactamente lo mismo que el producto.

/** Solo se puede incrustar `frameSource` (el proxy de este panel) y ejecutar el script con este nonce. */
export function panelCsp(frameSource: string, nonce: string, extra = ''): string {
  return `default-src 'none'; frame-src ${frameSource}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:${extra}`;
}

/** `before` es solo para el banco: el doble de acquireVsCodeApi, que tiene que existir antes que el panel. */
export function panelHtml(o: { csp: string; nonce: string; script: string; before?: string }): string {
  const before = o.before ? `<script nonce="${o.nonce}">${o.before}</script>` : '';
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${o.csp}">
<style nonce="${o.nonce}">${PANEL_CSS}</style></head>
<body><div id="barra"></div><div id="mosaico"></div>${before}<script nonce="${o.nonce}" src="${o.script}"></script></body></html>`;
}

export const PANEL_CSS = `
  body { margin: 0; padding: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: 12px var(--vscode-font-family); }
  #barra { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-panel-border); }
  #barra .sep { width: 1px; height: 20px; background: var(--vscode-panel-border); margin: 0 4px; }
  #barra .etq { opacity: .75; margin-right: 2px; }
  #barra .vivo { margin-left: auto; padding: 1px 8px; border-radius: 9px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
  button, select { font: inherit; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 4px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible, select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button.ico { padding: 3px 5px; background: transparent; color: var(--vscode-foreground); }
  button.ico:hover { background: var(--vscode-toolbar-hoverBackground); }
  svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  #mosaico { padding: 12px; box-sizing: border-box; position: relative; }
  /* Celda ampliada: las demás siguen vivas y con su tamaño (la página no se entera), fuera del flujo y sin verse. */
  figure.oculta { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
  #mosaico.ampliado .mas { display: none; }
  #mosaico.ampliado .fila { margin-bottom: 0; }
  button.mas { align-self: center; }
  .fila { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
  .aviso { flex-basis: 100%; margin: 0; padding: 6px 10px; border-radius: 4px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
  .vacio { padding: 40px 12px; text-align: center; opacity: .8; }
  figure { margin: 0; flex: none; }
  figcaption { display: flex; align-items: center; gap: 4px; padding: 0 0 6px; white-space: nowrap; min-height: 26px; }
  button.disp { padding: 2px 6px; max-width: 150px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
  figure.estrecha .dim { display: none; }
  figure.estrecha button.disp { max-width: 112px; }
  figcaption .acc { margin-left: auto; display: inline-flex; }
  figcaption .dim { opacity: .7; }
  figcaption .ruta { opacity: .85; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; max-width: 220px; display: block; padding: 2px 4px; background: transparent; color: var(--vscode-foreground); font-family: var(--vscode-editor-font-family, monospace); }
  figcaption .ruta:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
  figcaption .err { flex: none; padding: 0 6px; min-width: 18px; justify-content: center; border-radius: 9px; font-weight: 600; color: var(--vscode-inputValidation-errorForeground, #fff); background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border-color: var(--vscode-inputValidation-errorBorder, #be1100); }
  figcaption .err[hidden] { display: none; }
  .errs { margin: 0 0 6px; padding: 6px 8px 6px 22px; max-height: 120px; overflow: auto; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100); }
  .errs li { white-space: pre-wrap; overflow-wrap: anywhere; }
  figcaption .ses { font-size: 11px; padding: 0 5px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .escena { overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: #fff; }
  iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
`;
