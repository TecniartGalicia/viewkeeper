import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const tests = process.argv.includes('--tests');

/** La extensión (Node, host de extensiones) y el panel (navegador, dentro del webview) se empaquetan aparte. */
const builds = tests
  ? [
      // La sonda que VS Code carga con --extensionTestsPath. Nunca entra en el paquete (out/ está en .vscodeignore).
      { entryPoints: ['test/integration/sonda.ts'], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: 'out/sonda.js', external: ['vscode'], logLevel: 'info' },
    ]
  : [
      { entryPoints: ['src/extension.ts'], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: 'dist/extension.js', external: ['vscode'], sourcemap: !production, minify: production, logLevel: 'info' },
      { entryPoints: ['src/webview/panel.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: 'dist/panel.js', sourcemap: !production, minify: production, logLevel: 'info' },
    ];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
