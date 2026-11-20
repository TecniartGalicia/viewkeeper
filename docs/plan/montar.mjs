// Monta docs/PLAN-MEJORAS.md a partir de docs/plan/PLAN-MEJORAS.plantilla.md, metiendo el código tal como está
// en las ramas del plan. Así el plan no puede llevar un código distinto del que se probó.
//   node docs/plan/montar.mjs
// Marcas de la plantilla:
//   {{codigo:<desde>..<hasta>}}            el diff de producto entre dos commits, fichero a fichero
//   {{codigo:<desde>..<hasta>:<ruta>}}     el diff de un solo fichero (también de pruebas)
//   {{commits:<desde>..<hasta>}}           la lista de commits de ese tramo
//   {{cuenta:<desde>..<hasta>}}            ficheros y líneas del tramo
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Lo que es producto (va en el paquete o lo construye). Las pruebas se citan por su nombre, no se copian enteras.
const PRODUCTO = ['src/', 'media/agent.js', 'package.json', 'package.nls.json', 'package.nls.es.json', 'l10n/', 'eslint.config.mjs', 'esbuild.mjs', '.github/'];
const esProducto = (f) => PRODUCTO.some((p) => f === p || f.startsWith(p));
const ORDEN = ['src/core/', 'media/', 'src/webview/', 'src/vscode/', 'src/extension.ts', 'package', 'l10n/', 'eslint', 'esbuild', '.github/'];
const peso = (f) => {
  const i = ORDEN.findIndex((p) => f.startsWith(p));
  return i < 0 ? ORDEN.length : i;
};

function diffDe(rango, fichero) {
  const d = git('diff', '--no-color', '-U3', rango, '--', fichero).replace(/\r\n/g, '\n').trimEnd();
  if (!d) return '';
  // Sin las dos primeras líneas de cabecera de git (diff --git, index): el nombre va en el título.
  const cuerpo = d.split('\n').filter((l, i) => !(i < 6 && (l.startsWith('diff --git') || l.startsWith('index ') || l.startsWith('new file mode') || l.startsWith('deleted file mode') || l.startsWith('similarity') || l.startsWith('rename ')))).join('\n');
  const nuevo = /^--- \/dev\/null/m.test(d);
  return `**\`${fichero}\`**${nuevo ? ' (nuevo)' : ''}\n\n\`\`\`diff\n${cuerpo}\n\`\`\`\n`;
}

function codigo(rango, solo) {
  if (solo) return diffDe(rango, solo) || `_(sin cambios en \`${solo}\` en ${rango})_\n`;
  const ficheros = git('diff', '--name-only', rango).split('\n').map((s) => s.trim()).filter(Boolean).filter(esProducto);
  ficheros.sort((a, b) => peso(a) - peso(b) || a.localeCompare(b));
  if (!ficheros.length) return `_(sin cambios de producto en ${rango})_\n`;
  return ficheros.map((f) => diffDe(rango, f)).filter(Boolean).join('\n');
}

const plantilla = fs.readFileSync(path.join(aqui, 'PLAN-MEJORAS.plantilla.md'), 'utf8').replace(/\r\n/g, '\n');
let usados = 0;
const salida = plantilla.replace(/\{\{(codigo|commits|cuenta):([^}:]+)(?::([^}]+))?\}\}/g, (_todo, tipo, rango, extra) => {
  usados++;
  if (tipo === 'codigo') return codigo(rango, extra);
  if (tipo === 'commits') return git('log', '--reverse', '--format=- `%h` %s', rango).trimEnd();
  const st = git('diff', '--shortstat', rango).trim();
  return st || 'sin cambios';
});
if (/\{\{/.test(salida)) throw new Error('quedan marcas sin resolver: ' + salida.match(/\{\{[^}]*\}\}/g).slice(0, 5).join(' '));
const destino = path.join(raiz, 'docs', 'PLAN-MEJORAS.md');
fs.writeFileSync(destino, `<!-- Generado por docs/plan/montar.mjs a partir de PLAN-MEJORAS.plantilla.md. No editar a mano: se pisa. -->\n${salida}`);
console.log(`${destino}: ${salida.split('\n').length} líneas, ${usados} marcas resueltas`);
