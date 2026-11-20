<!-- Generado por docs/plan/montar.mjs a partir de PLAN-MEJORAS.plantilla.md. No editar a mano: se pisa. -->
# Plan de mejoras de ViewKeeper

Fecha: 2026-11-19 · Parte de: ViewKeeper 0.1.1 (`main`, commit `b3199bb`) · Registro de la versión actual: `docs/EJECUCION.md`

Este plan cubre las quince mejoras del análisis del 19-11 (todas menos el inicio de sesión con Google, Microsoft o Auth0, que se dejó fuera).

**Estado (20-11):** ejecutado entero y publicado como **0.2.0** en una sola versión, por decisión del titular («ejecuta y despliega todo después de la auditoría completa»). Antes de publicar pasó dos auditorías independientes y el escáner de seguridad; los resultados están en el apartado 6. El código que aparece aquí lo copia `docs/plan/montar.mjs` desde la historia de la rama `plan/mejoras`, no se ha pegado a mano.

## 1. Qué tienes que decidir

1. **Una versión o dos.** Decidido: una sola, la 0.2.0, con todo.
2. **«Seguir al editor» nace apagado.** Así se publicó: se enciende con un botón de la barra del panel.

## 2. Las mejoras, de un vistazo

| # | Mejora | Fase | Versión | Cómo está comprobada |
|---|---|---|---|---|
| M1 | Web publicada en modo «solo mirar»: clics y escritura nacen apagados | A | 0.2.0 | Unitarias, banco de navegador |
| M2 | Abrir ya el dominio principal (`ejemplo.com` → `https://www.ejemplo.com`) y explicar una redirección que saca a la celda del mosaico | A | 0.2.0 | Unitarias; sonda contra 6 webs reales |
| M14 | Banco de navegador sin pausas fijas en los casos que fallaban por lentitud | A | 0.2.0 | El propio banco, entero, en verde |
| M16 | Las 5 actualizaciones de dependabot | A | 0.2.0 | Pendiente: son pasos de GitHub (apartado 5.A) |
| M6 | Errores de JavaScript contados en el rótulo de cada celda | B | 0.2.0 | Banco de navegador, dentro de VS Code |
| M7 | El mosaico sigue al editor | B | 0.2.0 | Unitarias, dentro de VS Code |
| M8 | La ruta del rótulo se puede cambiar (toda la fila va a ella) | B | 0.2.0 | Unitarias, banco, dentro de VS Code |
| M9 | «Añadir dispositivo» en cada fila de una matriz | B | 0.2.0 | Unitarias, banco, dentro de VS Code |
| M10 | El botón reabre el último mosaico del proyecto | B | 0.2.0 | Dentro de VS Code |
| M11 | Ampliar una celda a todo el panel y volver | B | 0.2.0 | Banco de navegador |
| M3 | Enlaces, formularios y saltos por código escritos con el dominio completo se quedan en la celda | C | 0.3.0 | Unitarias, banco de navegador |
| M4 | API en otro servidor (`api.tudominio.com`, o un entorno de pruebas llamado desde localhost) | C | 0.3.0 | Unitarias con dos servidores locales. **Sin probar contra una API de fuera real** |
| M12 | Ventanas remotas (WSL, SSH, contenedores) | D | 0.3.0 | Unitarias; sonda en una ventana WSL real. **SSH y contenedores sin probar** |
| M13 | macOS en el CI y prueba en Cursor | D | 0.3.0 | Pendiente: el cambio del CI está escrito y sin ejecutar; Cursor no está instalado en este PC |
| M15 | Escáner de seguridad sobre todo el código | E | antes de la 0.3.0 | Pendiente: se pasa con el código ya fusionado |

## 3. Qué está comprobado y qué no

Comprobado, sobre la rama `plan/mejoras`:

- **73 pruebas unitarias** (`npm run check`: tipos, lint, traducciones y pruebas).
- **100 casos del banco de navegador** en Chrome sin ventana (`npm run test:browser`): el panel, el agente y el proxy de verdad. Los 36 nuevos (`test/browser/r5-mejoras.ts`) montan el panel con el mismo HTML y CSS que el producto.
- **12 pruebas de integración** dentro de un VS Code 1.147 real (`npm run test:integration`).
- **Ventana remota:** `test/integration/run-remoto.ts` abrió una ventana WSL (Ubuntu) de un VS Code de pruebas, con la extensión corriendo dentro de Linux; el mosaico cargó las tres celdas y navegó la fila.
- **Dominio principal:** `resolveTarget` contra `argalla.com`, `github.com`, `wikipedia.org`, `estoxo.gal` y `neurosinais.argalla.com` (solo un GET a la portada). Siguió `http`→`https` y `wikipedia.org`→`www.wikipedia.org`, y no tocó las que ya estaban en su dominio.
- **Dos auditorías independientes y el escáner de seguridad** sobre la rama: apartado 6.

No comprobado, y por qué:

- **M12 en SSH y en contenedores.** En WSL la prueba de control mostró que el mosaico carga también sin pedir a VS Code que reenvíe el puerto: Windows ya llega al `localhost` de WSL. La sonda no demuestra el reenvío (`asExternalUri`), que es lo que hace falta en SSH y en contenedores. Se intentó en un contenedor de Docker (D-2): la extensión Dev Containers no resuelve la conexión cuando VS Code arranca en modo prueba («Reconnect attempt without old result»), antes de cargar ViewKeeper. El README lo declara: probado en WSL, SSH y contenedores sin probar.
- ~~**M4 contra una API de fuera real.**~~ Hecho (C-2): httpbin.org por https a través del proxy; la API vio el origen de la app, no recibió su sesión, y su cookie se quedó en el bote del proxy.
- **macOS.** Se ejecutó por primera vez en el PR #6 de la 0.2.0.
- **Cursor.** No está instalado en este PC.
- **M1 dentro de VS Code.** La decisión (publicada o no, qué se apaga) está probada como función y el aviso de la barra en el navegador; abrir una web publicada de verdad dentro de la suite exigiría red en el CI, y no se ha hecho.

## 4. Decisiones de diseño

Las que cambian lo que el usuario ve, o que alguien podría discutir.

- **M1 · Qué es «publicada».** Todo lo que no sea esta máquina o la red local: `localhost`, IP privadas, nombres sin punto y los dominios reservados (`.local`, `.test`, `.internal`, `.lan`…). No hay lista de sufijos públicos. Un dominio interno con punto (`intranet.miempresa.com`) cuenta como publicado; el coste del error es bajo: dos interruptores apagados que se encienden con un clic.
- **M1 · Se apaga en cada apertura.** Si enciendes los clics en una web publicada y la vuelves a abrir, vuelven apagados. Recordar la elección sería más cómodo y menos seguro.
- **M2 · Solo se sigue la redirección al dominio principal.** Una redirección a otro dominio (un inicio de sesión externo, un acortador) no se sigue: el mosaico acabaría enseñando otra web. En su lugar la celda enseña una página que dice adónde iba, con solo el origen (la dirección entera puede llevar un testigo).
- **M2 · Las páginas del proxy se traducen.** Estaban escritas en castellano dentro del núcleo, también para quien usa VS Code en inglés. Ahora las da la extensión en el idioma del editor.
- **M3 · El enlace se corrige en el momento del clic, no al servir la página.** Reescribir el HTML en el proxy rompería el streaming y no vería lo que pinta JavaScript. El agente le pone la ruta local al enlace justo antes de que actúe; los saltos por código se cazan con la API de navegación del navegador.
- **M3 · Un salto a otra web se cancela y se explica.** El panel no deja a una celda ir a otro origen: se quedaba en blanco. Ahora la celda sigue donde estaba y su rótulo dice a qué web quería ir.
- **M4 · A una API de fuera no se le manda la sesión de la app.** El proxy le guarda un bote de cookies aparte por sesión del mosaico, como haría el navegador con otro servidor, y de las cookies de la app solo viajan las que la app puso con un `Domain` que cubre a esa API. Sin esto, pasar una API de terceros por el proxy le entregaría la cookie de sesión de la app.
- **M4 · Solo se ofrece si la API nombra a la app.** A una API de fuera se le pregunta por CORS con el origen de la app y tiene que contestar con ese origen exacto; `*` no vale (esa API ya funciona sin el proxy). Solo por https.
- **M6 · El texto del error no sale del panel.** Puede llevar datos de la página. A la extensión solo le llega la cuenta por celda, que es lo que enseña «Diagnose».
- **M6 · También cuenta `console.error`.** Los avisos de hidratación de React, que suelen depender del ancho, solo salen por ahí.
- **M7 · Solo mosaicos de una fila y rutas sin segmentos dinámicos.** En una matriz cada fila es una ruta fija; y sin un valor para `[id]` no hay adónde ir.
- **M10 · Solo se reabre sin preguntar un servidor de desarrollo que contesta.** Una web publicada, o un servidor parado, se ofrece la primera de la lista. Lo recordado no guarda la consulta ni el ancla de las direcciones.
- **M11 · Las celdas ocultas siguen vivas y con su tamaño.** Esconderlas con `display:none` les cambiaría el ancho a 0 y las páginas se recolocarían; quitarlas del documento las recargaría.
- **M12 · La captura en una ventana remota usa un navegador de la máquina remota.** Si allí no hay ninguno, la captura lo dice, como ya hace hoy en una máquina sin Chrome.

## 5. Fases

Cada fase tiene su criterio de salida. El código de cada una es el diff de su tramo de la rama; las correcciones de la auditoría van aparte, en el apartado 6, porque se hicieron sobre el conjunto.

### 5.A · Fase A — web publicada y banco fiable (M1, M2, M14, M16)

Commits:

- `bb23f8b` M14 banco: Chrome compartido (cdp.ts) y esperas al evento en ENV-1, ENV-f4, COK-1b y HUE-1
- `a8e5ee5` Fase A: web publicada en modo solo mirar (M1), dominio principal y aviso de salida (M2)

Qué consigue:

- **M1:** al abrir una web publicada, la sincronización de clics y de escritura empieza apagada, la barra lo dice («Web publicada») y sale un aviso una vez por web. El desplazamiento y la navegación siguen sincronizados.
- **M2:** `ejemplo.com` se abre ya como `https://www.ejemplo.com`. Una redirección a otra web dentro de la celda enseña una página que lo explica en vez de dejarla en blanco.
- **M14:** el arranque de Chrome del banco pasa a un módulo compartido (`test/browser/cdp.ts`) y cuatro casos más dejan de depender de una pausa fija (ENV-1, ENV-f4, COK-1b, HUE-1).

Criterio de salida: P-57 a P-61 en verde; el banco completo en verde tres pasadas seguidas en local y una en el CI (Ubuntu y Windows); M1-1 del banco r5.

Tareas que no son código:

- **A-1 · M16, dependabot.** Hay 5 actualizaciones abiertas. Cuatro tienen el CI en verde: #1 `actions/upload-artifact` 7.0.2, #2 `softprops/action-gh-release` 3.0.4, #4 `actions/setup-node` 7.1.0 y #5 `@vscode/vsce` 4.1.1. La #3 (`globals` 17.14.0) está en rojo por el banco intermitente, no por la dependencia. Orden: fusionar la fase A, pedir a dependabot que rehaga la #3 sobre ese `main`, y fusionar las cinco con el CI en verde. La #5 es un salto de versión mayor de la herramienta que empaqueta y publica: antes de fusionarla, `npx vsce package` en local y comparar el contenido del VSIX con el de la 0.1.1.

Código de la fase:

**`src/core/alias.ts`** (nuevo)

```diff
--- /dev/null
+++ b/src/core/alias.ts
@@ -0,0 +1,42 @@
+// Qué direcciones son «la misma web» que el destino del mosaico. Puro.
+// Una web publicada suele contestar en cuatro orígenes (http y https, con y sin «www») y quedarse con uno;
+// un servidor de desarrollo, en localhost y en 127.0.0.1. Tratar esos alias como el propio destino es lo que
+// permite seguir la redirección al dominio principal y que un enlace escrito con el dominio completo no saque
+// a la celda del mosaico. Nunca se considera alias otro dominio, ni otro subdominio que no sea «www».
+
+const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
+
+function bare(hostname: string): string {
+  return hostname.toLowerCase().replace(/^www\./, '');
+}
+function web(u: URL): boolean {
+  return u.protocol === 'http:' || u.protocol === 'https:';
+}
+
+/** ¿`a` y `b` son la misma web? Mismo origen; o mismo nombre (salvo «www») en los puertos por defecto; o la propia máquina en el mismo puerto. */
+export function isAlias(a: URL, b: URL): boolean {
+  if (!web(a) || !web(b)) return false;
+  if (a.origin === b.origin) return true;
+  if (LOOPBACK.test(a.hostname) && LOOPBACK.test(b.hostname)) return a.protocol === b.protocol && a.port === b.port && a.port !== '';
+  // URL deja el puerto vacío cuando es el del protocolo: http y https «en su puerto» son alias entre sí.
+  return a.port === '' && b.port === '' && bare(a.hostname) === bare(b.hostname) && a.hostname.includes('.');
+}
+
+/** Todos los orígenes alias del destino, él incluido. Como mucho cuatro. */
+export function aliasOrigins(target: string): string[] {
+  let t: URL;
+  try {
+    t = new URL(target);
+  } catch {
+    return [];
+  }
+  if (!web(t)) return [];
+  const out = new Set<string>([t.origin]);
+  if (LOOPBACK.test(t.hostname)) {
+    if (t.port !== '') for (const h of ['localhost', '127.0.0.1', '[::1]']) out.add(`${t.protocol}//${h}:${t.port}`);
+  } else if (t.port === '' && t.hostname.includes('.') && !/^[\d.]+$/.test(t.hostname) && !t.hostname.startsWith('[')) {
+    const b = bare(t.hostname);
+    for (const proto of ['https:', 'http:']) for (const h of [b, `www.${b}`]) out.add(`${proto}//${h}`);
+  }
+  return [...out];
+}
```

**`src/core/mosaic.ts`**

```diff
--- a/src/core/mosaic.ts
+++ b/src/core/mosaic.ts
@@ -60,6 +60,38 @@ export function isLoopback(origin: string): boolean {
   }
 }
 
+/**
+ * ¿Es un servidor de desarrollo (esta máquina o la red local)? Lo demás se trata como una web publicada,
+ * con datos de verdad. Sin lista de sufijos públicos: IP privadas, nombres sin punto y los dominios reservados
+ * para redes locales y pruebas.
+ */
+export function isDevHost(origin: string): boolean {
+  let h: string;
+  try {
+    h = new URL(origin).hostname.toLowerCase();
+  } catch {
+    return false;
+  }
+  if (h === 'localhost' || h.endsWith('.localhost')) return true;
+  if (h.startsWith('[')) return h === '[::1]' || /^\[(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(h);
+  const ip = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
+  if (ip) {
+    const a = Number(ip[1]);
+    const b = Number(ip[2]);
+    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
+  }
+  if (!h.includes('.')) return true; // «mipc», «intranet»: un nombre de la red local
+  return /\.(local|test|internal|lan|home\.arpa|example|invalid)$/.test(h);
+}
+
+/**
+ * En una web publicada, cada clic y cada tecla se repetirían una vez por celda sobre datos reales («Guardar»
+ * pulsado tres veces). Ahí esas dos sincronizaciones nacen apagadas; el usuario las enciende si quiere.
+ */
+export function syncForTarget(target: string, sync: SyncOptions): SyncOptions {
+  return isDevHost(target) ? sync : { ...sync, click: false, input: false };
+}
+
 /** Ruta local y codificada. Se resuelve como el navegador (que ignora tabuladores): si cambia de origen, se descarta. */
 export function normalizePath(p: string): string {
   const s = p.trim();
```

**`src/core/open.ts`** (nuevo)

```diff
--- /dev/null
+++ b/src/core/open.ts
@@ -0,0 +1,38 @@
+// Lo que se decide al abrir un mosaico que el usuario acaba de pedir. Puro: la red se inyecta.
+import { isDevHost, syncForTarget, type Mosaic } from './mosaic.ts';
+import type { Resolved } from './probe.ts';
+
+export interface Prepared {
+  mosaic: Mosaic;
+  /** El destino es una web publicada: clics y escritura han quedado apagados. */
+  deployed: boolean;
+  /** El origen que se pidió, si el servidor mandó a su dominio principal y se abre ese. */
+  redirectedFrom?: string;
+}
+
+/**
+ * Un servidor de desarrollo se abre tal cual. Una web publicada: se sigue la redirección a su dominio principal
+ * (una redirección a otro origen dejaría las celdas fuera del mosaico) y la sincronización de clics y de
+ * escritura empieza apagada.
+ */
+export async function prepareOpen(m: Mosaic, resolve: (origin: string, path: string) => Promise<Resolved>): Promise<Prepared> {
+  if (isDevHost(m.target)) return { mosaic: m, deployed: false };
+  let next = m;
+  let redirectedFrom: string | undefined;
+  const r = await resolve(m.target, m.cells[0]?.path ?? '/');
+  // Solo se acepta lo que sigue siendo una web publicada: nunca acabar, por una redirección, en esta máquina.
+  if (r.origin !== m.target && !isDevHost(r.origin)) {
+    redirectedFrom = m.target;
+    // El nombre por defecto es el servidor: si era ese, sigue al nuevo.
+    next = { ...m, target: r.origin, name: m.name === hostOf(m.target) ? hostOf(r.origin) : m.name };
+  }
+  return { mosaic: { ...next, sync: syncForTarget(next.target, next.sync) }, deployed: true, redirectedFrom };
+}
+
+function hostOf(origin: string): string {
+  try {
+    return new URL(origin).host;
+  } catch {
+    return origin;
+  }
+}
```

**`src/core/probe.ts`**

```diff
--- a/src/core/probe.ts
+++ b/src/core/probe.ts
@@ -1,7 +1,70 @@
 // Preguntas de red a servidores de esta máquina. Node puro, sin 'vscode': se prueba en test/unit/probe.test.ts.
 import * as http from 'node:http';
+import * as https from 'node:https';
+import { isAlias } from './alias.ts';
 import type { Probe } from './ports.ts';
 
+export interface Resolved {
+  origin: string;
+  path: string;
+  /** Orígenes por los que pasó, en orden, sin el de partida. Vacío si no hubo redirección de dominio. */
+  hops: string[];
+}
+
+/**
+ * Sigue la redirección al dominio principal: «ejemplo.com» → «https://www.ejemplo.com». Solo entre alias de la
+ * misma web (isAlias): una redirección a otro dominio —un inicio de sesión externo, un acortador— no se sigue,
+ * porque el mosaico acabaría enseñando otra web. Nunca lanza: ante un fallo devuelve lo que se le dio.
+ */
+export async function resolveTarget(origin: string, path: string, timeoutMs = 2500, maxHops = 5): Promise<Resolved> {
+  const start = { origin, path, hops: [] as string[] };
+  let at: URL;
+  try {
+    at = new URL(path, origin);
+  } catch {
+    return start;
+  }
+  const hops: string[] = [];
+  for (let i = 0; i < maxHops; i++) {
+    const loc = await redirectOf(at, timeoutMs);
+    if (loc === undefined) break;
+    let next: URL;
+    try {
+      next = new URL(loc, at);
+    } catch {
+      break;
+    }
+    // Dentro del mismo origen lo resuelve la propia celda; a otra web, no se va.
+    if (next.origin === at.origin || !isAlias(next, at) || next.username !== '' || next.password !== '') break;
+    hops.push(next.origin);
+    at = next;
+  }
+  if (hops.length === 0) return start;
+  return { origin: at.origin, path: at.pathname + at.search + at.hash, hops };
+}
+
+/** El Location de una respuesta 3xx, o undefined si no redirige o no contesta. No lee el cuerpo. */
+function redirectOf(u: URL, timeoutMs: number): Promise<string | undefined> {
+  return new Promise((resolve) => {
+    const secure = u.protocol === 'https:';
+    const req = (secure ? https : http).request(
+      { protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (secure ? 443 : 80), path: u.pathname + u.search, method: 'GET', timeout: timeoutMs, headers: { accept: 'text/html', 'user-agent': 'ViewKeeper' } },
+      (res) => {
+        const s = res.statusCode ?? 0;
+        const loc = res.headers.location;
+        res.destroy();
+        resolve(s >= 300 && s < 400 && typeof loc === 'string' ? loc : undefined);
+      },
+    );
+    req.on('timeout', () => {
+      req.destroy();
+      resolve(undefined);
+    });
+    req.on('error', () => resolve(undefined));
+    req.end();
+  });
+}
+
 /**
  * Siempre por NOMBRE («localhost»), nunca 127.0.0.1: Vite escucha solo en ::1 (sonda S-8)
  * y Node prueba las dos familias por su cuenta.
```

**`src/core/proxy.ts`**

```diff
--- a/src/core/proxy.ts
+++ b/src/core/proxy.ts
@@ -10,6 +10,7 @@ import * as zlib from 'node:zlib';
 import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
 import { Transform, type TransformCallback } from 'node:stream';
 import type { Duplex } from 'node:stream';
+import { isAlias } from './alias.ts';
 
 export const PREFIX = '/__viewkeeper';
 /** Las cookies no distinguen puerto: el nombre lleva el del proxy para que dos mosaicos no se pisen (H-3). */
@@ -33,8 +34,28 @@ export interface ProxyOptions {
   now?: () => number;
   /** Puerto fijo. Solo para pruebas: por defecto, el preferido del destino y, si está ocupado, uno libre. */
   port?: number;
+  /** Textos de las páginas que el proxy pone en una celda. Los traduce quien lo arranca; por defecto, inglés. */
+  pages?: Partial<ProxyPages>;
 }
 
+/** `{0}` es el servidor (host o origen) del que se habla. */
+export interface ProxyPages {
+  denied: string;
+  downTitle: string;
+  downBody: string;
+  leftTitle: string;
+  leftBody: string;
+  back: string;
+}
+export const PAGES_EN: ProxyPages = {
+  denied: 'This address only serves the cells of the ViewKeeper panel.',
+  downTitle: 'Nothing is listening on {0}',
+  downBody: 'Start your dev server. This cell retries by itself every two seconds.',
+  leftTitle: 'This page redirects outside the mosaic',
+  leftBody: 'It goes to {0}. A cell only shows the site the mosaic was opened for, so the redirect was not followed. Signing in through another site cannot happen inside a cell.',
+  back: 'Back',
+};
+
 export interface RunningProxy {
   port: number;
   /** Dirección en la que escucha. Siempre la interfaz local. */
@@ -182,13 +203,32 @@ export function rewriteLocation(loc: string, ctx: Ctx): string {
     return loc;
   }
   const t = ctx.target;
-  const same = u.origin === t.origin || (u.protocol === t.protocol && u.port === t.port && isLoopbackHost(u.hostname) && isLoopbackHost(t.hostname));
+  // También los alias de la misma web (http/https, con y sin «www»): el destino ya es el dominio principal.
+  const same = u.origin === t.origin || (u.protocol === t.protocol && u.port === t.port && isLoopbackHost(u.hostname) && isLoopbackHost(t.hostname)) || isAlias(u, t);
   if (!same) return loc;
   // Una ruta relativa ya vale tal cual; solo se toca lo que nombraba al servidor.
   if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(loc.trim())) return loc;
   return ctx.proxyOrigin + u.pathname + u.search + u.hash;
 }
 
+/**
+ * ¿Esta redirección saca a la celda del mosaico? Devuelve el origen al que iría, o undefined si se queda.
+ * Se queda si va al propio destino o a un alias suyo; pero un alias que redirige a la MISMA ruta es el servidor
+ * mandando a su dominio principal: reescribirla sería un bucle, así que también cuenta como salida.
+ */
+export function leavesTo(loc: string, ctx: Ctx, requestPath: string): string | undefined {
+  let u: URL;
+  try {
+    u = new URL(loc, ctx.target.origin + requestPath);
+  } catch {
+    return undefined;
+  }
+  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
+  if (rewriteLocation(u.href, ctx) === u.href) return u.origin; // no es el destino ni un alias
+  if (u.origin !== ctx.target.origin && u.pathname + u.search === requestPath) return u.origin;
+  return undefined;
+}
+
 export function rewriteResponseHeaders(h: http.IncomingHttpHeaders, ctx: Ctx, p: HeaderPolicy): http.OutgoingHttpHeaders {
   const out: http.OutgoingHttpHeaders = {};
   for (const [k, v] of Object.entries(h)) {
@@ -303,11 +343,15 @@ function decoder(encoding: string | undefined): Transform | null {
   return null;
 }
 
-function page(status: number, title: string, body: string, refresh: boolean): { status: number; html: string } {
+const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
+
+/** Página propia del proxy. Los textos se escapan aquí: pueden llevar un nombre de servidor que viene de fuera. */
+function page(status: number, title: string, body: string, refresh: boolean, back?: string): { status: number; html: string } {
   const meta = refresh ? '<meta http-equiv="refresh" content="2">' : '';
+  const link = back ? `<p><a href="#" onclick="history.back();return false">&larr; ${esc(back)}</a></p>` : '';
   return {
     status,
-    html: `<!doctype html><html><head><meta charset="utf-8">${meta}<title>${title}</title></head><body style="font:14px system-ui;padding:24px;color:#555"><h3>${title}</h3><p>${body}</p></body></html>`,
+    html: `<!doctype html><html><head><meta charset="utf-8">${meta}<title>${esc(title)}</title></head><body style="font:14px system-ui;padding:24px;color:#555"><h3>${esc(title)}</h3><p>${esc(body)}</p>${link}</body></html>`,
   };
 }
 
@@ -321,6 +365,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
   const fixCookies = opts.fixCookies !== false;
   const log = opts.log ?? ((): void => {});
   const now = opts.now ?? Date.now;
+  const pages: ProxyPages = { ...PAGES_EN, ...opts.pages };
   // Solo orígenes de esta máquina: el proxy no es una pasarela hacia la red.
   const apis = (opts.apiOrigins ?? []).map((o) => new URL(o)).filter((u) => isLoopbackHost(u.hostname) && (u.protocol === 'http:' || u.protocol === 'https:'));
   const seenCookies = new Map<string, Map<string, string>>();
@@ -355,7 +400,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
   };
 
   const deny = (res: http.ServerResponse, status: number): void => {
-    const p = page(status, 'ViewKeeper', 'Esta dirección solo sirve a las celdas del panel de ViewKeeper.', false);
+    const p = page(status, 'ViewKeeper', pages.denied, false);
     res.writeHead(p.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(p.html);
   };
 
@@ -414,6 +459,21 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
           }
         }
         if (jar) for (const c of ur.headers['set-cookie'] ?? []) if (expiresCookie(c)) jar.delete(c.split('=')[0].trim());
+        // Un documento que redirige a otra web: el panel no deja a la celda ir allí y se quedaría en blanco.
+        // Se le dice adónde iba (solo el origen: la dirección entera puede llevar un testigo). Las cookies que
+        // traía la redirección se conservan.
+        if (apiPrefix === undefined && html && status >= 300 && status < 400 && typeof ur.headers.location === 'string') {
+          const out = leavesTo(ur.headers.location, ctx, path);
+          if (out !== undefined) {
+            ur.resume();
+            note(`redirect out of the mosaic: ${path.split('?')[0]} -> ${out}`);
+            const p = page(200, pages.leftTitle, pages.leftBody.replace('{0}', out), false, pages.back);
+            const h: http.OutgoingHttpHeaders = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
+            if (outHeaders['set-cookie']) h['set-cookie'] = outHeaders['set-cookie'];
+            res.writeHead(p.status, h).end(p.html);
+            return;
+          }
+        }
         res.writeHead(status, outHeaders);
         // Si el servidor corta a media respuesta, la celda tiene que enterarse (un EventSource debe reconectar). (H-9)
         ur.on('aborted', () => res.destroy());
@@ -438,7 +498,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
         res.destroy();
         return;
       }
-      const p = page(502, 'Nada escuchando en ' + dest.host, 'Arranca tu servidor de desarrollo. Esta celda lo reintenta sola cada dos segundos.', true);
+      const p = page(502, pages.downTitle.replace('{0}', dest.host), pages.downBody, true);
       res.writeHead(p.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(p.html);
     });
     req.pipe(up);
```

**`src/webview/panel.ts`**

```diff
--- a/src/webview/panel.ts
+++ b/src/webview/panel.ts
@@ -40,6 +40,8 @@ export interface PanelText {
   remove: string;
   empty: string;
   session1: string;
+  deployed: string;
+  deployedHint: string;
 }
 export interface PanelState {
   name: string;
@@ -49,6 +51,8 @@ export interface PanelState {
   /** Solo en la sonda: reenvía al host todo lo que dicen los agentes. El producto no lo activa nunca. */
   sonda: boolean;
   text: PanelText;
+  /** El destino no es un servidor de desarrollo: se avisa en la barra. */
+  deployed?: boolean;
 }
 
 const vscode = acquireVsCodeApi();
@@ -161,6 +165,13 @@ function renderBar(s: PanelState): void {
     withKey(button(s.text.session, 'user', () => command('addSession')), 'bar:addSession'),
     withKey(button(s.text.matrix, 'grid', () => command('openMatrix')), 'bar:openMatrix'),
   );
+  if (s.deployed) {
+    const live = document.createElement('span');
+    live.className = 'vivo';
+    live.textContent = s.text.deployed;
+    live.title = s.text.deployedHint;
+    barEl.append(live);
+  }
 }
 
 // ───────────────────────── celdas
```

**`src/vscode/commands.ts`**

```diff
--- a/src/vscode/commands.ts
+++ b/src/vscode/commands.ts
@@ -1,7 +1,9 @@
 // Casos de uso de la extensión. Cada comando envuelto en `wrap`: un fallo se enseña, no se traga.
 import * as vscode from 'vscode';
 import { DEVICES, parseCustomDevice, type Device } from '../core/devices.ts';
-import { MAX_CELLS, SYNC_ALL, addSession, capCells, isLoopback, isValidSession, matrix, normalizeTarget, type Mosaic } from '../core/mosaic.ts';
+import { MAX_CELLS, SYNC_ALL, addSession, capCells, isDevHost, isLoopback, isValidSession, matrix, normalizeTarget, type Mosaic } from '../core/mosaic.ts';
+import { prepareOpen } from '../core/open.ts';
+import { resolveTarget } from '../core/probe.ts';
 import { detectRoutes, fillRoute } from '../core/routes.ts';
 import { captureMosaic } from './captureFlow.ts';
 import { apiTrustsApp, findDevServers } from './detect.ts';
@@ -99,7 +101,9 @@ async function openUrl(ctx: vscode.ExtensionContext): Promise<void> {
   // cada fila conserva su ruta; con una ruta escrita, todas las filas van a ella.
   const keepRows = rows.length > 1 && path === '/';
   const cells = now && now.cells.length > 0 ? now.cells.map((c) => (keepRows ? c : { ...c, path })) : matrix([target.path], defaultDevices());
-  await show(ctx, { v: 1, name: new URL(target.origin).host, target: target.origin, cells, sync: now?.sync ?? SYNC_ALL });
+  // De una web publicada (clics y escritura apagados por seguridad) a un servidor de desarrollo: vuelven encendidos.
+  const sync = now && isDevHost(now.target) === isDevHost(target.origin) ? now.sync : SYNC_ALL;
+  await show(ctx, { v: 1, name: new URL(target.origin).host, target: target.origin, cells, sync });
 }
 
 /** En una ventana remota dice por qué no y devuelve true. Se mira al empezar cada comando, antes de preguntar nada. */
@@ -109,13 +113,28 @@ function remote(): boolean {
   return true;
 }
 
-async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic): Promise<void> {
+const warned = new Set<string>();
+
+/**
+ * Abre el mosaico. `fresh` es una apertura pedida por el usuario (no un volver a abrir el mismo tras un ajuste):
+ * ahí se sigue la redirección al dominio principal y, si es una web publicada, los clics y la escritura nacen apagados.
+ */
+async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic, fresh = true): Promise<void> {
   // En una ventana remota (WSL, SSH, contenedor, Codespaces) el proxy corre en la otra máquina y las celdas,
   // que se pintan en esta, no lo alcanzan: mejor decirlo que abrir un panel en blanco (P-46).
   if (remote()) return;
   const capped = capCells(mosaic.cells);
   if (capped.dropped > 0) void vscode.window.showWarningMessage(t('A mosaic holds up to {0} cells; the rest were left out.', MAX_CELLS));
-  const next: Mosaic = { ...mosaic, cells: capped.cells };
+  let next: Mosaic = { ...mosaic, cells: capped.cells };
+  if (fresh) {
+    const p = await prepareOpen(next, resolveTarget);
+    next = p.mosaic;
+    if (p.redirectedFrom) out.info(`${p.redirectedFrom} redirects to ${next.target}: opening that one`);
+    if (p.deployed && !warned.has(next.target)) {
+      warned.add(next.target);
+      void vscode.window.showInformationMessage(t('{0} is a deployed site, so click and typing sync start switched off: otherwise every click and keystroke would be repeated once per device on real data. You can switch them on in the toolbar.', new URL(next.target).host));
+    }
+  }
   if (current) current.dispose();
   const cfg = vscode.workspace.getConfiguration('viewkeeper');
   // La lista puede venir escrita en los ajustes del repositorio: cada origen se comprueba antes de usarlo (N-6).
@@ -160,7 +179,7 @@ async function offerApi(ctx: vscode.ExtensionContext, raw: string): Promise<void
   const cfg = vscode.workspace.getConfiguration('viewkeeper');
   const list = [...new Set([...(cfg.get<string[]>('apiOrigins') ?? []), origin])];
   await cfg.update('apiOrigins', list, folder() ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);
-  await show(ctx, current.mosaic());
+  await show(ctx, current.mosaic(), false);
 }
 
 async function openDefault(ctx: vscode.ExtensionContext): Promise<void> {
```

**`src/vscode/panelHost.ts`**

```diff
--- a/src/vscode/panelHost.ts
+++ b/src/vscode/panelHost.ts
@@ -4,8 +4,8 @@ import * as fs from 'node:fs';
 import * as path from 'node:path';
 import { randomBytes } from 'node:crypto';
 import { DEVICES, findDevice, rotate, type Device } from '../core/devices.ts';
-import { applyEdit, parseMosaic, type Mosaic } from '../core/mosaic.ts';
-import { startProxy, type ProxyOptions, type RunningProxy } from '../core/proxy.ts';
+import { applyEdit, isDevHost, parseMosaic, type Mosaic } from '../core/mosaic.ts';
+import { startProxy, type ProxyOptions, type ProxyPages, type RunningProxy } from '../core/proxy.ts';
 import type { AgentCommand, AgentEvent } from '../core/sync.ts';
 import type { CellView, PanelState, PanelText } from '../webview/panel.ts';
 
@@ -40,7 +40,7 @@ interface FromPanel {
 }
 
 /** Botones de la barra que lanzan un comando de la extensión. Lo demás que pida el panel se ignora. */
-const PANEL_COMMANDS = new Set(['openUrl', 'reload','capture', 'captureFullPage', 'save', 'addSession', 'openMatrix', 'doctor']);
+const PANEL_COMMANDS = new Set(['openUrl', 'reload', 'capture', 'captureFullPage', 'save', 'addSession', 'openMatrix', 'doctor']);
 
 function texts(): PanelText {
   const t = vscode.l10n.t;
@@ -62,6 +62,21 @@ function texts(): PanelText {
     remove: t('Remove'),
     empty: t('No cells. Add a device to start.'),
     session1: t('session'),
+    deployed: t('Deployed site'),
+    deployedHint: t('Click and typing sync start switched off on a deployed site, so nothing is done once per device on real data.'),
+  };
+}
+
+/** Las páginas que el proxy pone en una celda cuando no puede enseñar la app. */
+function proxyPages(): ProxyPages {
+  const t = vscode.l10n.t;
+  return {
+    denied: t('This address only serves the cells of the ViewKeeper panel.'),
+    downTitle: t('Nothing is listening on {0}'),
+    downBody: t('Start your dev server. This cell retries by itself every two seconds.'),
+    leftTitle: t('This page redirects outside the mosaic'),
+    leftBody: t('It goes to {0}. A cell only shows the site the mosaic was opened for, so the redirect was not followed. Signing in through another site cannot happen inside a cell.'),
+    back: t('Back'),
   };
 }
 
@@ -103,7 +118,7 @@ export class PanelHost implements vscode.Disposable {
     if (unknown.length) void vscode.window.showWarningMessage(vscode.l10n.t('This mosaic uses devices this computer does not have ({0}); they are shown as Laptop. Add them to "viewkeeper.customDevices".', unknown.join(', ')));
     let agentSource = fs.readFileSync(path.join(ctx.extensionPath, 'media', 'agent.js'), 'utf8');
     if (opts.sonda) agentSource = agentSource.replace('/*SONDA-INICIO*/', opts.sonda.inicio).replace('/*SONDA*/', opts.sonda.pregunta);
-    const proxy = await startProxy({ target: mosaic.target, agentSource, log: opts.log, ...opts.proxy });
+    const proxy = await startProxy({ target: mosaic.target, agentSource, log: opts.log, pages: proxyPages(), ...opts.proxy });
     const panel = vscode.window.createWebviewPanel('viewkeeper.mosaic', `ViewKeeper · ${mosaic.name}`, vscode.ViewColumn.Active, {
       enableScripts: true,
       retainContextWhenHidden: true,
@@ -167,7 +182,7 @@ export class PanelHost implements vscode.Disposable {
 
   private state(): PanelState {
     const devices = [...DEVICES, ...this.customDevices].map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height }));
-    return { cells: this.views(), sync: this.model.sync, sonda: this.sonda, text: texts(), devices, name: this.model.name };
+    return { cells: this.views(), sync: this.model.sync, sonda: this.sonda, text: texts(), devices, name: this.model.name, deployed: !isDevHost(this.model.target) };
   }
 
   private postState(): void {
@@ -279,6 +294,7 @@ const CSS = `
   #barra { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-panel-border); }
   #barra .sep { width: 1px; height: 20px; background: var(--vscode-panel-border); margin: 0 4px; }
   #barra .etq { opacity: .75; margin-right: 2px; }
+  #barra .vivo { margin-left: auto; padding: 1px 8px; border-radius: 9px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
   button, select { font: inherit; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 4px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
   select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
   button:hover { background: var(--vscode-button-secondaryHoverBackground); }
```

**`l10n/bundle.l10n.es.json`**

```diff
--- a/l10n/bundle.l10n.es.json
+++ b/l10n/bundle.l10n.es.json
@@ -63,5 +63,14 @@
   "Open in ViewKeeper": "Abrir en ViewKeeper",
   "Pick your dev server or type an address (https://example.com/path)": "Elige tu servidor de desarrollo o escribe una dirección (https://ejemplo.com/ruta)",
   "Open this address": "Abrir esta dirección",
-  "Address": "Dirección"
+  "Address": "Dirección",
+  "{0} is a deployed site, so click and typing sync start switched off: otherwise every click and keystroke would be repeated once per device on real data. You can switch them on in the toolbar.": "{0} es una web publicada, así que la sincronización de clics y de escritura empieza apagada: si no, cada clic y cada tecla se repetirían una vez por dispositivo sobre datos reales. Puedes encenderlas en la barra del panel.",
+  "Deployed site": "Web publicada",
+  "Click and typing sync start switched off on a deployed site, so nothing is done once per device on real data.": "En una web publicada la sincronización de clics y de escritura empieza apagada, para que nada se haga una vez por dispositivo sobre datos reales.",
+  "This address only serves the cells of the ViewKeeper panel.": "Esta dirección solo sirve a las celdas del panel de ViewKeeper.",
+  "Nothing is listening on {0}": "Nada escuchando en {0}",
+  "Start your dev server. This cell retries by itself every two seconds.": "Arranca tu servidor de desarrollo. Esta celda lo reintenta sola cada dos segundos.",
+  "This page redirects outside the mosaic": "Esta página redirige fuera del mosaico",
+  "It goes to {0}. A cell only shows the site the mosaic was opened for, so the redirect was not followed. Signing in through another site cannot happen inside a cell.": "Va a {0}. Una celda solo enseña la web para la que se abrió el mosaico, así que la redirección no se ha seguido. Iniciar sesión a través de otro sitio no cabe dentro de una celda.",
+  "Back": "Volver"
 }
```


Pruebas nuevas de la fase: `test/unit/mejoras.test.ts` (P-57 web publicada o desarrollo, P-58 alias, P-59 dominio principal, P-60 redirección que sale, P-61 apertura) y `test/browser/cdp.ts`.

### 5.B · Fase B — uso diario (M6, M7, M8, M9, M10, M11)

Commits:

- `678dcf2` Fase B: errores por celda (M6), seguir al editor (M7), ruta de la fila (M8), + por fila (M9), recordar el último (M10), ampliar celda (M11)

Qué consigue:

- **M6:** el rótulo de cada celda enseña cuántos errores de JavaScript ha tenido la página que muestra ahora. Al pulsar el número se despliega la lista. Se pone a cero al cargar otro documento.
- **M7:** con «Seguir al editor» encendido, abrir `app/precios/page.tsx` lleva el mosaico a `/precios`. Reconoce Next (app y pages), SvelteKit, Astro, Nuxt y HTML suelto, también dentro de un monorepo.
- **M8:** la ruta del rótulo es un botón: abre una lista con las rutas del proyecto y deja escribir otra; toda la fila va a ella.
- **M9:** en una matriz cada fila tiene su «+» al final.
- **M10:** el botón de la barra de estado reabre lo último que hubo en el proyecto, con sus dispositivos y sus rutas, si su servidor de desarrollo sigue en marcha.
- **M11:** un botón del rótulo amplía la celda a todo el panel; Esc vuelve.

Para M7 y M8 hay una pieza nueva en el reparto, `SyncRouter.drive`: una navegación pedida desde fuera de las celdas, que apunta la orden en cada una para que su llegada no rebote. Y el HTML y el CSS del panel salen a `src/webview/shell.ts`, sin dependencia de VS Code, para que el banco monte el mismo documento que el producto.

Criterio de salida: P-62 a P-65 en verde; M6-1 a M6-3, M8-1 a M8-3, M9-1, M9-2, M11-1 y M11-2 del banco r5; I-9, I-10 e I-11 dentro de VS Code.

Límites que se declaran en el README:

- «Seguir al editor» puede tomar por página un fichero de una carpeta llamada `pages/` que no lo sea. Por eso nace apagado.
- La cuenta de errores es del documento cargado: en una SPA no vuelve a cero al cambiar de pantalla sin recargar.

Código de la fase:

**`src/core/mosaic.ts`**

```diff
--- a/src/core/mosaic.ts
+++ b/src/core/mosaic.ts
@@ -194,7 +194,8 @@ export function applyEdit(m: Mosaic, raw: unknown, known: (deviceId: string) =>
       return cell ? { ...m, cells: m.cells.filter((c) => c !== cell) } : m;
     case 'add': {
       if (typeof e.deviceId !== 'string' || !known(e.deviceId) || m.cells.length >= MAX_CELLS) return m;
-      const group = Number.isInteger(e.group) && (e.group as number) >= 0 && (e.group as number) < MAX_CELLS ? (e.group as number) : (m.cells[0]?.group ?? 0);
+      // Solo a una fila que existe (el «+» de cada fila); cualquier otra cosa, a la primera.
+      const group = Number.isInteger(e.group) && m.cells.some((c) => c.group === e.group) ? (e.group as number) : (m.cells[0]?.group ?? 0);
       // La celda nueva copia ruta y sesión de la fila a la que se suma, para entrar ya sincronizada.
       const like = m.cells.find((c) => c.group === group) ?? m.cells[0];
       const added: Cell = { id: nextId(m.cells), deviceId: e.deviceId, landscape: false, path: like?.path ?? '/', session: like?.session ?? 'main', group: like ? group : 0, locale: like?.locale };
```

**`src/core/probe.ts`**

```diff
--- a/src/core/probe.ts
+++ b/src/core/probe.ts
@@ -43,17 +43,34 @@ export async function resolveTarget(origin: string, path: string, timeoutMs = 25
   return { origin: at.origin, path: at.pathname + at.search + at.hash, hops };
 }
 
-/** El Location de una respuesta 3xx, o undefined si no redirige o no contesta. No lee el cuerpo. */
-function redirectOf(u: URL, timeoutMs: number): Promise<string | undefined> {
+/** ¿Contesta algo por HTTP en ese origen? Cualquier respuesta vale (también un 404 o un 500): hay servidor. */
+export async function answers(origin: string, timeoutMs = 700): Promise<boolean> {
+  let u: URL;
+  try {
+    u = new URL(origin);
+  } catch {
+    return false;
+  }
+  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
+  return (await ask(u, timeoutMs)) !== undefined;
+}
+
+/** El Location de una respuesta 3xx, o undefined si no redirige o no contesta. */
+async function redirectOf(u: URL, timeoutMs: number): Promise<string | undefined> {
+  const r = await ask(u, timeoutMs);
+  return r && r.status >= 300 && r.status < 400 ? r.location : undefined;
+}
+
+/** GET sin leer el cuerpo. Un certificado autofirmado solo se tolera contra la propia máquina. */
+function ask(u: URL, timeoutMs: number): Promise<{ status: number; location: string | undefined } | undefined> {
   return new Promise((resolve) => {
     const secure = u.protocol === 'https:';
     const req = (secure ? https : http).request(
-      { protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (secure ? 443 : 80), path: u.pathname + u.search, method: 'GET', timeout: timeoutMs, headers: { accept: 'text/html', 'user-agent': 'ViewKeeper' } },
+      { protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (secure ? 443 : 80), path: u.pathname + u.search, method: 'GET', timeout: timeoutMs, headers: { accept: 'text/html', 'user-agent': 'ViewKeeper' }, rejectUnauthorized: !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) },
       (res) => {
-        const s = res.statusCode ?? 0;
         const loc = res.headers.location;
         res.destroy();
-        resolve(s >= 300 && s < 400 && typeof loc === 'string' ? loc : undefined);
+        resolve({ status: res.statusCode ?? 0, location: typeof loc === 'string' ? loc : undefined });
       },
     );
     req.on('timeout', () => {
```

**`src/core/routes.ts`**

```diff
--- a/src/core/routes.ts
+++ b/src/core/routes.ts
@@ -56,6 +56,38 @@ export function detectRoutes(files: readonly string[]): Route[] {
     .slice(0, 200);
 }
 
+/**
+ * La ruta que sirve un fichero del proyecto, si es una página. En un monorepo la app no está en la raíz
+ * («apps/web/app/precios/page.tsx»): se van quitando carpetas por delante hasta que el resto se reconoce.
+ */
+export function routeForFile(file: string): Route | undefined {
+  const segs = file.replace(/\\/g, '/').replace(/^\.\//, '').split('/');
+  // Dependencias y carpetas ocultas (.next, .svelte-kit…) no son páginas del proyecto, estén a la altura que estén.
+  if (segs.some((s) => s === 'node_modules' || s.startsWith('.'))) return undefined;
+  for (let i = 0; i < segs.length && i < 6; i++) {
+    const r = detectRoutes([segs.slice(i).join('/')])[0];
+    // Un HTML suelto solo cuenta en la raíz o en public/ del proyecto, no en cualquier subcarpeta.
+    if (r && (i === 0 || !/\.html$/.test(r.source) || segs[i] === 'public')) return { ...r, source: file };
+  }
+  return undefined;
+}
+
+/** ¿Esta ruta concreta es una instancia de la ruta con segmentos dinámicos? «/blog/hola» lo es de «/blog/[slug]». */
+export function matchesRoute(pattern: string, path: string): boolean {
+  const clean = (path.split(/[?#]/)[0] || '/').replace(/(.)\/$/, '$1');
+  const want = pattern.split('/').filter(Boolean);
+  const have = clean.split('/').filter(Boolean);
+  for (let i = 0; i < want.length; i++) {
+    const w = want[i];
+    if (/^\[\[\.\.\..+\]\]$/.test(w)) return true; // [[...resto]]: cero o más
+    if (/^\[\.\.\..+\]$/.test(w)) return have.length > i; // [...resto]: uno o más
+    if (have[i] === undefined) return false;
+    if (/^\[.+\]$/.test(w) || w.startsWith(':')) continue;
+    if (w !== have[i]) return false;
+  }
+  return have.length === want.length;
+}
+
 /** Sustituye los segmentos dinámicos por los valores que dio el usuario: /blog/[slug] + {slug:'hola'} → /blog/hola */
 export function fillRoute(path: string, values: Readonly<Record<string, string>>): string | undefined {
   let ok = true;
```

**`src/core/sync.ts`**

```diff
--- a/src/core/sync.ts
+++ b/src/core/sync.ts
@@ -13,6 +13,7 @@ export type AgentEvent =
   | { t: 'nav'; url: string }
   | { t: 'miss'; kind: string }
   | { t: 'hint'; kind: string; origin: string }
+  | { t: 'error'; kind: string; msg: string }
   | { t: 'answer'; id: number; data: unknown };
 
 /** Lo que el panel manda a un agente. */
@@ -154,6 +155,31 @@ export class SyncRouter {
     return out;
   }
 
+  /**
+   * Navegación pedida desde fuera de las celdas (el rótulo de la fila, el editor): toda la fila va a esa ruta.
+   * Cada celda queda con la orden pendiente, así que su llegada no se toma por una decisión suya ni rebota;
+   * y la fila recuerda la ruta, para que una celda que se añada después entre ya en ella.
+   * No mira `nav` ni el cortacircuitos: no es una celda arrastrando a otra, es el usuario mandando.
+   */
+  drive(group: number, path: string): Delivery[] {
+    const t = this.now();
+    const out: Delivery[] = [];
+    if (!this.cells.some((c) => c.group === group)) return out;
+    const prev = this.groupPath.get(group);
+    if (prev === undefined || pageKey(prev) !== pageKey(path)) this.groupPath.set(group, path);
+    for (const c of this.cells) {
+      if (c.group !== group) continue;
+      this.expect.delete(c.id);
+      this.gestureAt.delete(c.id);
+      const at = this.where.get(c.id);
+      // Una celda que aún no cargó se pondrá al día sola con su primer aviso (groupPath).
+      if (at === undefined || pageKey(at) === pageKey(path)) continue;
+      this.pending.set(c.id, { since: t, path });
+      out.push({ to: c.id, cmd: { t: 'nav', path } });
+    }
+    return out;
+  }
+
   /** ¿Sigue esta celda a medio cumplir una orden de navegación? Una orden que no se cumple caduca. */
   private busy(id: string, t: number): boolean {
     const p = this.pending.get(id);
```

**`media/agent.js`**

```diff
--- a/media/agent.js
+++ b/media/agent.js
@@ -1,7 +1,7 @@
 // Agente de ViewKeeper. Lo inyecta el proxy en cada documento HTML y corre DENTRO de la página del usuario.
 // Reglas: ES2017 sin dependencias; no toca nada si no está en una celda; solo habla con el origen del panel,
-// que el proxy le da incrustado (__VK_PANEL) y que la página no puede cambiar; y nunca envía contenido de la
-// página: solo eventos de interacción y métricas.
+// que el proxy le da incrustado (__VK_PANEL) y que la página no puede cambiar; y al panel solo le manda eventos
+// de interacción, métricas y el mensaje de los errores de JavaScript (que el panel no pasa al host).
 (function () {
   'use strict';
   var PANEL = typeof __VK_PANEL === 'string' ? __VK_PANEL : '';
@@ -81,6 +81,39 @@
     try { var o = new URL(String(u), location.href).origin; if (!hinted[o]) { hinted[o] = true; send({ t: 'hint', kind: 'api', origin: o }); } } catch (e) { /* nada */ }
   };
 
+  // ── errores de la página: para ver de un vistazo que «en el móvil falla y en el escritorio no».
+  // El agente se carga antes que los scripts de la página, así que oye también los de arranque. El texto
+  // se queda en el panel, que lo enseña en el rótulo de la celda; al host solo llega la cuenta.
+  var errs = 0;
+  function report(kind, msg) {
+    if (errs >= 50) return; // una página en bucle de errores no inunda el panel
+    errs++;
+    var text = '';
+    try { text = String(msg == null ? '' : msg).slice(0, 300); } catch (e) { text = '?'; }
+    send({ t: 'error', kind: kind, msg: text });
+  }
+  window.addEventListener('error', function (ev) {
+    // Solo errores de JavaScript: una imagen que no carga llega con otro destino y sin mensaje.
+    if (ev.target !== window || typeof ev.message !== 'string') return;
+    var where = ev.filename ? ' (' + String(ev.filename).split('/').pop().split('?')[0] + ':' + ev.lineno + ')' : '';
+    report('error', ev.message + where);
+  });
+  window.addEventListener('unhandledrejection', function (ev) {
+    var r = ev.reason;
+    report('rejection', r && r.message ? r.message : r);
+  });
+  if (window.console && typeof console.error === 'function') {
+    var realConsoleError = console.error;
+    console.error = function () {
+      try {
+        report('console', Array.prototype.map.call(arguments, function (a) {
+          return typeof a === 'string' ? a : a && a.message ? a.message : Object.prototype.toString.call(a);
+        }).join(' '));
+      } catch (e) { /* un argumento que no se deja leer */ }
+      return realConsoleError.apply(console, arguments);
+    };
+  }
+
   // ── emulación por celda, del lado del cliente (lo que un iframe sí permite)
   function define(obj, prop, value) {
     try { Object.defineProperty(obj, prop, { get: function () { return value; }, configurable: true }); } catch (e) { /* sin permiso */ }
```

**`src/webview/panel.ts`**

```diff
--- a/src/webview/panel.ts
+++ b/src/webview/panel.ts
@@ -7,7 +7,7 @@ import { rowScales } from '../core/devices.ts';
 /** Separación entre celdas y ancho mínimo de una celda (su rótulo tiene que caber): los mismos que en el CSS. */
 const GAP = 14;
 const MIN_CELL = 230;
-import type { Cell, Edit, SyncOptions } from '../core/mosaic.ts';
+import { MAX_CELLS, type Cell, type Edit, type SyncOptions } from '../core/mosaic.ts';
 import { REARM_MS, SyncRouter, pathOf, type AgentCommand, type AgentEvent } from '../core/sync.ts';
 
 declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
@@ -42,6 +42,11 @@ export interface PanelText {
   session1: string;
   deployed: string;
   deployedHint: string;
+  route: string;
+  addToRow: string;
+  zoom: string;
+  follow: string;
+  errors: string;
 }
 export interface PanelState {
   name: string;
@@ -53,6 +58,8 @@ export interface PanelState {
   text: PanelText;
   /** El destino no es un servidor de desarrollo: se avisa en la barra. */
   deployed?: boolean;
+  /** El mosaico sigue al editor: abrir el fichero de una página lleva la fila a su ruta. */
+  follow?: boolean;
 }
 
 const vscode = acquireVsCodeApi();
@@ -65,7 +72,14 @@ interface Live {
   frame: HTMLIFrameElement;
   /** Lo que, si cambia, obliga a volver a cargar la celda (otra sesión, otro agente de usuario…). */
   key: string;
+  /** Errores de JavaScript del documento que la celda enseña ahora. El texto no sale de este panel. */
+  errors: { kind: string; msg: string }[];
+  errorCount: number;
+  errorsOpen: boolean;
 }
+const MAX_ERRORS_KEPT = 20;
+/** Celda ampliada a todo el panel (las demás siguen vivas y sincronizadas, sin verse). No es parte del mosaico. */
+let zoomed: string | undefined;
 const live = new Map<string, Live>();
 let state: PanelState | undefined;
 const router = new SyncRouter([], { scroll: true, click: true, input: true, nav: true });
@@ -94,6 +108,8 @@ const ICONS: Record<string, string> = {
   rotate: '<path d="M2.8 7.2A5.2 5.2 0 0 1 12 4.3"/><path d="M12.4 1.8v2.8H9.6"/><path d="M13.2 8.8A5.2 5.2 0 0 1 4 11.7"/><path d="M3.6 14.2v-2.8h2.8"/>',
   close: '<path d="M4 4l8 8M12 4l-8 8"/>',
   chevron: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
+  expand: '<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/>',
+  file: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
   globe: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11"/><path d="M8 2.5c1.6 1.6 2.3 3.5 2.3 5.5S9.6 11.9 8 13.5C6.4 11.9 5.7 10 5.7 8S6.4 4.1 8 2.5z"/>',
 };
 function icon(name: string): SVGSVGElement {
@@ -124,7 +140,7 @@ function withKey<T extends HTMLElement>(el: T, k: string): T {
 }
 const command = (c: string): void => vscode.postMessage({ t: 'command', command: c });
 
-const pick = (cell?: string): void => vscode.postMessage({ t: 'pick', cell });
+const pick = (cell?: string, group?: number): void => vscode.postMessage({ t: 'pick', cell, group });
 
 function deviceButton(c: CellView): HTMLButtonElement {
   const b = document.createElement('button');
@@ -164,6 +180,7 @@ function renderBar(s: PanelState): void {
     withKey(button(s.text.save, 'save', () => command('save')), 'bar:save'),
     withKey(button(s.text.session, 'user', () => command('addSession')), 'bar:addSession'),
     withKey(button(s.text.matrix, 'grid', () => command('openMatrix')), 'bar:openMatrix'),
+    withKey(button(s.text.follow, 'file', () => command('toggleFollowEditor'), { pressed: s.follow === true }), 'bar:follow'),
   );
   if (s.deployed) {
     const live = document.createElement('span');
@@ -195,9 +212,14 @@ function caption(c: CellView, fig: HTMLElement): void {
   dim.textContent = `${c.width}×${c.height}`;
   const pct = document.createElement('span');
   pct.className = 'dim pct';
-  const where = document.createElement('code');
+  // La ruta es un botón: lleva toda la fila a otra página (el host pregunta cuál).
+  const where = document.createElement('button');
+  where.type = 'button';
   where.className = 'ruta';
+  where.dataset.k = `${c.id}:ruta`;
+  where.title = s.text.route;
   where.textContent = live.get(c.id)?.fig.querySelector('.ruta')?.textContent ?? c.path;
+  where.addEventListener('click', () => vscode.postMessage({ t: 'route', cell: c.id }));
   cap.append(sel, dim, pct);
   if (c.session !== 'main') {
     const ses = document.createElement('span');
@@ -208,10 +230,63 @@ function caption(c: CellView, fig: HTMLElement): void {
   // Girar y quitar, juntos y a la derecha.
   const acc = document.createElement('span');
   acc.className = 'acc';
-  acc.append(withKey(button(s.text.rotate, 'rotate', () => edit({ op: 'rotate', cell: c.id }), { iconOnly: true }), `${c.id}:rot`), withKey(button(s.text.remove, 'close', () => edit({ op: 'remove', cell: c.id }), { iconOnly: true }), `${c.id}:del`));
-  cap.append(where, acc);
+  acc.append(
+    withKey(button(s.text.zoom, 'expand', () => toggleZoom(c.id), { iconOnly: true, pressed: zoomed === c.id }), `${c.id}:zoom`),
+    withKey(button(s.text.rotate, 'rotate', () => edit({ op: 'rotate', cell: c.id }), { iconOnly: true }), `${c.id}:rot`),
+    withKey(button(s.text.remove, 'close', () => edit({ op: 'remove', cell: c.id }), { iconOnly: true }), `${c.id}:del`),
+  );
+  cap.append(where, errorBadge(c.id), acc);
   fig.querySelector('figcaption')?.remove();
   fig.prepend(cap);
+  paintErrors(c.id);
+}
+
+// ───────────────────────── errores de la página, por celda
+
+/** El contador del rótulo. Oculto mientras no haya errores; al pulsarlo se despliega la lista. */
+function errorBadge(id: string): HTMLButtonElement {
+  const b = document.createElement('button');
+  b.type = 'button';
+  b.className = 'err';
+  b.dataset.k = `${id}:err`;
+  b.hidden = true;
+  b.addEventListener('click', () => {
+    const l = live.get(id);
+    if (!l) return;
+    l.errorsOpen = !l.errorsOpen;
+    paintErrors(id);
+  });
+  return b;
+}
+
+function paintErrors(id: string): void {
+  const l = live.get(id);
+  if (!l || !state) return;
+  const b = l.fig.querySelector<HTMLButtonElement>('button.err');
+  if (b) {
+    b.hidden = l.errorCount === 0;
+    b.textContent = String(l.errorCount);
+    b.title = `${l.errorCount} ${state.text.errors}`;
+    b.setAttribute('aria-label', b.title);
+    b.setAttribute('aria-expanded', String(l.errorsOpen));
+  }
+  l.fig.querySelector('.errs')?.remove();
+  if (!l.errorsOpen || l.errorCount === 0) return;
+  const list = document.createElement('ul');
+  list.className = 'errs';
+  for (const e of l.errors) {
+    const li = document.createElement('li');
+    li.textContent = e.msg; // texto de la página: siempre como texto, nunca como HTML
+    li.dataset.kind = e.kind;
+    list.append(li);
+  }
+  l.fig.querySelector('figcaption')?.after(list);
+}
+
+function toggleZoom(id: string): void {
+  zoomed = zoomed === id ? undefined : id;
+  if (state) for (const c of state.cells) if (live.has(c.id)) caption(c, (live.get(c.id) as Live).fig);
+  layout();
 }
 
 function newCell(c: CellView): Live {
@@ -227,7 +302,7 @@ function newCell(c: CellView): Live {
   f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads');
   stage.append(f);
   fig.append(stage);
-  return { view: c, fig, frame: f, key: cellKey(c) };
+  return { view: c, fig, frame: f, key: cellKey(c), errors: [], errorCount: 0, errorsOpen: false };
 }
 
 function layout(): void {
@@ -237,28 +312,44 @@ function layout(): void {
   const top = barEl.getBoundingClientRect().height;
   // Alto de cada fila: el de la ventana repartido entre filas, menos el rótulo de las celdas.
   const availH = Math.max(160, (window.innerHeight - top - 24) / Math.max(1, rows.size) - 56);
-  const availW = Math.max(200, rootEl.clientWidth - 26);
+  // Con varias filas cada una lleva al final su botón «+»: se le reserva sitio.
+  const availW = Math.max(200, rootEl.clientWidth - 26 - (rows.size > 1 ? 34 : 0));
+  if (zoomed && !state.cells.some((c) => c.id === zoomed)) zoomed = undefined;
+  rootEl.classList.toggle('ampliado', zoomed !== undefined);
+  for (const c of state.cells) live.get(c.id)?.fig.classList.toggle('oculta', zoomed !== undefined && c.id !== zoomed);
+  if (zoomed) {
+    const c = state.cells.find((x) => x.id === zoomed) as CellView;
+    const l = live.get(c.id);
+    if (l) {
+      const s = rowScales([c], Math.max(200, rootEl.clientWidth - 26), Math.max(160, window.innerHeight - top - 24 - 56), GAP, MIN_CELL)[0];
+      size(l, c, s);
+    }
+    return;
+  }
   for (const row of rows.values()) {
     const scales = rowScales(row, availW, availH, GAP, MIN_CELL);
     row.forEach((c, i) => {
       const l = live.get(c.id);
-      if (!l) return;
-      const stage = l.frame.parentElement as HTMLElement;
-      const s = scales[i];
-      l.frame.width = String(c.width);
-      l.frame.height = String(c.height);
-      l.frame.style.transform = `scale(${s})`;
-      stage.style.width = `${Math.round(c.width * s)}px`;
-      stage.style.height = `${Math.round(c.height * s)}px`;
-      // En una celda estrecha el rótulo se compacta (sin medidas) para no partirse en dos líneas.
-      l.fig.classList.toggle('estrecha', c.width * s < 320);
-      l.fig.style.width = `${Math.max(MIN_CELL, Math.round(c.width * s))}px`;
-      const pct = l.fig.querySelector('.pct');
-      if (pct) pct.textContent = `${Math.round(s * 100)} %`;
+      if (l) size(l, c, scales[i]);
     });
   }
 }
 
+/** Pone una celda a una escala. El iframe conserva siempre el tamaño del dispositivo: la página no se entera. */
+function size(l: Live, c: CellView, s: number): void {
+  const stage = l.frame.parentElement as HTMLElement;
+  l.frame.width = String(c.width);
+  l.frame.height = String(c.height);
+  l.frame.style.transform = `scale(${s})`;
+  stage.style.width = `${Math.round(c.width * s)}px`;
+  stage.style.height = `${Math.round(c.height * s)}px`;
+  // En una celda estrecha el rótulo se compacta (sin medidas) para no partirse en dos líneas.
+  l.fig.classList.toggle('estrecha', c.width * s < 320);
+  l.fig.style.width = `${Math.max(MIN_CELL, Math.round(c.width * s))}px`;
+  const pct = l.fig.querySelector('.pct');
+  if (pct) pct.textContent = `${Math.round(s * 100)} %`;
+}
+
 /**
  * Pinta el estado nuevo tocando lo mínimo: sacar un iframe del documento lo recarga, así que las celdas
  * que siguen se dejan donde están y solo se añaden, quitan o redimensionan las que cambian.
@@ -307,6 +398,15 @@ function render(next: PanelState): void {
       l.view = c;
       caption(c, l.fig);
     }
+    // En una matriz, «Añadir dispositivo» de la barra no sabe de qué fila hablas: cada fila tiene el suyo, al final.
+    let more = row.querySelector<HTMLButtonElement>(':scope > .mas');
+    if (groups.length > 1 && next.cells.length < MAX_CELLS) {
+      if (!more) {
+        more = withKey(button(next.text.addToRow, 'plus', () => pick(undefined, g), { iconOnly: true }), `fila${g}:add`);
+        more.classList.add('mas');
+      }
+      row.append(more); // siempre el último, también tras añadir una celda
+    } else more?.remove();
   }
   for (const r of Array.from(rootEl.querySelectorAll<HTMLElement>('.fila'))) if (!r.querySelector('figure')) r.remove();
   layout();
@@ -324,6 +424,23 @@ window.addEventListener('message', (ev: MessageEvent) => {
     const m = ev.data as (AgentEvent & { vk?: number }) | undefined;
     if (ev.origin !== l.view.origin || !m || m.vk !== 1 || typeof m.t !== 'string') return;
     for (const d of router.route(id, m)) toCell(d.to, d.cmd);
+    if (m.t === 'hello' && (l.errorCount > 0 || l.errorsOpen)) {
+      l.errors = [];
+      l.errorCount = 0;
+      l.errorsOpen = false;
+      paintErrors(id);
+      vscode.postMessage({ t: 'errors', cell: id, n: 0 });
+    }
+    if (m.t === 'error') {
+      if (typeof m.msg !== 'string' || typeof m.kind !== 'string') return;
+      l.errorCount++;
+      if (l.errors.length < MAX_ERRORS_KEPT) l.errors.push({ kind: m.kind.slice(0, 12), msg: m.msg.slice(0, 300) });
+      paintErrors(id);
+      // Al host, solo el número: el mensaje de un error puede llevar datos de la página.
+      vscode.postMessage({ t: 'errors', cell: id, n: l.errorCount });
+      if (state?.sonda) vscode.postMessage({ t: 'fromCell', cell: id, ev: m });
+      return;
+    }
     if (m.t === 'hello' || m.t === 'ready' || m.t === 'nav') {
       if (typeof m.url !== 'string') return;
       const cap = l.fig.querySelector('.ruta');
@@ -344,10 +461,15 @@ window.addEventListener('message', (ev: MessageEvent) => {
   }
   // 2) Si no, solo se atiende al host de la extensión, que llega con el origen del propio webview.
   if (ev.origin !== window.origin) return;
-  const m = ev.data as { t?: string; state?: PanelState; cell?: string; cmd?: AgentCommand } | undefined;
+  const m = ev.data as { t?: string; state?: PanelState; cell?: string; cmd?: AgentCommand; group?: number; path?: string } | undefined;
   if (!m) return;
   if (m.t === 'state' && m.state) render(m.state);
   else if (m.t === 'toCell' && m.cell && m.cmd) toCell(m.cell, m.cmd);
+  else if (m.t === 'drive' && typeof m.group === 'number' && typeof m.path === 'string' && m.path.startsWith('/')) {
+    // El usuario manda la fila a otra página (desde el rótulo o desde el editor): pasa por el reparto, que
+    // apunta la orden en cada celda para que su llegada no rebote.
+    for (const d of router.drive(m.group, m.path)) toCell(d.to, d.cmd);
+  }
   else if (m.t === 'reload') {
     // Recargar rearma el cortacircuitos y retira su aviso (N-2).
     router.rearm();
@@ -359,6 +481,10 @@ window.addEventListener('message', (ev: MessageEvent) => {
 new ResizeObserver(layout).observe(rootEl);
 // El observador solo ve el ancho del mosaico; si la ventana crece solo en alto, las celdas también deben crecer.
 window.addEventListener('resize', layout);
+// Esc deshace la ampliación (el foco está en el panel; dentro de una celda, la tecla es de la página).
+window.addEventListener('keydown', (ev) => {
+  if (ev.key === 'Escape' && zoomed) toggleZoom(zoomed);
+});
 // Navegaciones en espera (GRACE_MS): las celdas que no llegaron solas reciben la orden.
 setInterval(() => {
   for (const d of router.due()) toCell(d.to, d.cmd);
```

**`src/webview/shell.ts`** (nuevo)

```diff
--- /dev/null
+++ b/src/webview/shell.ts
@@ -0,0 +1,58 @@
+// El documento del panel: su política, su HTML y sus estilos. Sin 'vscode', para que el banco de navegador
+// monte exactamente lo mismo que el producto.
+
+/** Solo se puede incrustar `frameSource` (el proxy de este panel) y ejecutar el script con este nonce. */
+export function panelCsp(frameSource: string, nonce: string, extra = ''): string {
+  return `default-src 'none'; frame-src ${frameSource}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:${extra}`;
+}
+
+/** `before` es solo para el banco: el doble de acquireVsCodeApi, que tiene que existir antes que el panel. */
+export function panelHtml(o: { csp: string; nonce: string; script: string; before?: string }): string {
+  const before = o.before ? `<script nonce="${o.nonce}">${o.before}</script>` : '';
+  return `<!doctype html>
+<html><head><meta charset="utf-8">
+<meta http-equiv="Content-Security-Policy" content="${o.csp}">
+<style nonce="${o.nonce}">${PANEL_CSS}</style></head>
+<body><div id="barra"></div><div id="mosaico"></div>${before}<script nonce="${o.nonce}" src="${o.script}"></script></body></html>`;
+}
+
+export const PANEL_CSS = `
+  body { margin: 0; padding: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: 12px var(--vscode-font-family); }
+  #barra { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-panel-border); }
+  #barra .sep { width: 1px; height: 20px; background: var(--vscode-panel-border); margin: 0 4px; }
+  #barra .etq { opacity: .75; margin-right: 2px; }
+  #barra .vivo { margin-left: auto; padding: 1px 8px; border-radius: 9px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
+  button, select { font: inherit; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 4px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
+  select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
+  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
+  button:focus-visible, select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
+  button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
+  button.ico { padding: 3px 5px; background: transparent; color: var(--vscode-foreground); }
+  button.ico:hover { background: var(--vscode-toolbar-hoverBackground); }
+  svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }
+  #mosaico { padding: 12px; box-sizing: border-box; position: relative; }
+  /* Celda ampliada: las demás siguen vivas y con su tamaño (la página no se entera), fuera del flujo y sin verse. */
+  figure.oculta { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
+  #mosaico.ampliado .mas { display: none; }
+  #mosaico.ampliado .fila { margin-bottom: 0; }
+  button.mas { align-self: center; }
+  .fila { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
+  .aviso { flex-basis: 100%; margin: 0; padding: 6px 10px; border-radius: 4px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
+  .vacio { padding: 40px 12px; text-align: center; opacity: .8; }
+  figure { margin: 0; flex: none; }
+  figcaption { display: flex; align-items: center; gap: 4px; padding: 0 0 6px; white-space: nowrap; min-height: 26px; }
+  button.disp { padding: 2px 6px; max-width: 150px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
+  figure.estrecha .dim { display: none; }
+  figure.estrecha button.disp { max-width: 112px; }
+  figcaption .acc { margin-left: auto; display: inline-flex; }
+  figcaption .dim { opacity: .7; }
+  figcaption .ruta { opacity: .85; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; max-width: 220px; display: block; padding: 2px 4px; background: transparent; color: var(--vscode-foreground); font-family: var(--vscode-editor-font-family, monospace); }
+  figcaption .ruta:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
+  figcaption .err { flex: none; padding: 0 6px; min-width: 18px; justify-content: center; border-radius: 9px; font-weight: 600; color: var(--vscode-inputValidation-errorForeground, #fff); background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border-color: var(--vscode-inputValidation-errorBorder, #be1100); }
+  figcaption .err[hidden] { display: none; }
+  .errs { margin: 0 0 6px; padding: 6px 8px 6px 22px; max-height: 120px; overflow: auto; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100); }
+  .errs li { white-space: pre-wrap; overflow-wrap: anywhere; }
+  figcaption .ses { font-size: 11px; padding: 0 5px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
+  .escena { overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: #fff; }
+  iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
+`;
```

**`src/vscode/commands.ts`**

```diff
--- a/src/vscode/commands.ts
+++ b/src/vscode/commands.ts
@@ -1,10 +1,12 @@
 // Casos de uso de la extensión. Cada comando envuelto en `wrap`: un fallo se enseña, no se traga.
 import * as vscode from 'vscode';
 import { DEVICES, parseCustomDevice, type Device } from '../core/devices.ts';
-import { MAX_CELLS, SYNC_ALL, addSession, capCells, isDevHost, isLoopback, isValidSession, matrix, normalizeTarget, type Mosaic } from '../core/mosaic.ts';
+import { MAX_CELLS, SYNC_ALL, addSession, capCells, isDevHost, isLoopback, isValidSession, matrix, normalizeTarget, parseMosaic, type Mosaic } from '../core/mosaic.ts';
 import { prepareOpen } from '../core/open.ts';
-import { resolveTarget } from '../core/probe.ts';
-import { detectRoutes, fillRoute } from '../core/routes.ts';
+import { answers, resolveTarget } from '../core/probe.ts';
+import { fillRoute, matchesRoute, routeForFile } from '../core/routes.ts';
+import { pageKey } from '../core/sync.ts';
+import { projectRoutes } from './projectRoutes.ts';
 import { captureMosaic } from './captureFlow.ts';
 import { apiTrustsApp, findDevServers } from './detect.ts';
 import { PanelHost } from './panelHost.ts';
@@ -36,6 +38,44 @@ function defaultDevices(): string[] {
 
 type Target = { origin: string; path: string };
 
+/** El último mosaico de este proyecto, tal como quedó. Vive en el almacén del área de trabajo, no en git. */
+const LAST_KEY = 'viewkeeper.lastMosaic';
+
+function remember(ctx: vscode.ExtensionContext, host: PanelHost): void {
+  const m = host.mosaic();
+  if (m.cells.length === 0) return;
+  // Sin consulta ni ancla, como al guardar: pueden llevar un testigo o un dato personal.
+  void ctx.workspaceState.update(LAST_KEY, { ...m, cells: m.cells.map((c) => ({ ...c, path: c.path.split(/[?#]/)[0] || '/' })) });
+}
+
+function lastMosaic(ctx: vscode.ExtensionContext): Mosaic | undefined {
+  return parseMosaic(ctx.workspaceState.get(LAST_KEY));
+}
+
+function followOn(): boolean {
+  return vscode.workspace.getConfiguration('viewkeeper').get<boolean>('followEditor') === true;
+}
+
+/**
+ * El mosaico sigue al editor: al abrir el fichero de una página, la fila va a su ruta. Solo con una fila
+ * (en una matriz cada fila es una ruta fija) y solo a rutas sin segmentos dinámicos: sin un valor para
+ * «[id]» no hay adónde ir, y si la fila ya enseña una página de esa ruta se queda donde está.
+ */
+function followEditor(ed: vscode.TextEditor | undefined): void {
+  const host = current;
+  if (!host || !ed || !followOn() || !vscode.workspace.getWorkspaceFolder(ed.document.uri)) return;
+  const rows = host.groups();
+  if (rows.length !== 1) return;
+  const route = routeForFile(vscode.workspace.asRelativePath(ed.document.uri, false));
+  if (!route) return;
+  const now = host.pathOfGroup(rows[0]) ?? '/';
+  if (route.dynamic || pageKey(route.path) === pageKey(now.split(/[?#]/)[0] || '/')) {
+    if (route.dynamic && !matchesRoute(route.path, now)) out.info(`follow editor: ${route.path} needs a value, staying on ${now.split(/[?#]/)[0]}`);
+    return;
+  }
+  host.drive(rows[0], route.path);
+}
+
 /** Pide una dirección escrita a mano (también de producción): https://app.ejemplo.com/ruta, localhost:3000 o 3000. */
 async function askAddress(title: string, value?: string): Promise<Target | undefined> {
   const raw = await vscode.window.showInputBox({
@@ -52,11 +92,15 @@ async function askAddress(title: string, value?: string): Promise<Target | undef
  * Lo que se abre al pulsar el botón: los servidores encontrados y, siempre, la opción de escribir otra dirección.
  * Lo que se escribe en la lista, si es una dirección, aparece arriba para abrirla con Intro.
  */
-async function pickTarget(): Promise<Target | undefined> {
+async function pickTarget(): Promise<Target | undefined>;
+async function pickTarget(reopen: Mosaic | undefined): Promise<Target | Mosaic | undefined>;
+async function pickTarget(reopen?: Mosaic): Promise<Target | Mosaic | undefined> {
   const found = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: t('ViewKeeper: looking for your dev server…') }, () => findDevServers(folder()));
-  if (found.length === 0) return askAddress(t('No dev server found'));
-  type Item = vscode.QuickPickItem & { target?: Target; other?: true };
+  if (found.length === 0 && !reopen) return askAddress(t('No dev server found'));
+  type Item = vscode.QuickPickItem & { target?: Target; other?: true; mosaic?: Mosaic };
   const base: Item[] = [
+    // Lo último que hubo abierto en este proyecto, con sus dispositivos y sus rutas.
+    ...(reopen ? [{ label: t('Reopen {0}', reopen.name), description: `${reopen.cells.length} · ${reopen.target}`, mosaic: reopen }] : []),
     ...found.map((f) => ({ label: f.origin, description: f.framework, target: { origin: f.origin, path: '/' } })),
     { label: t('Another address…'), description: t('URL or port, also a deployed site'), other: true, alwaysShow: true },
   ];
@@ -84,7 +128,7 @@ async function pickTarget(): Promise<Target | undefined> {
   qp.dispose();
   if (!chosen) return undefined;
   if (chosen.other) return askAddress(t('Open in ViewKeeper'));
-  return chosen.target;
+  return chosen.mosaic ?? chosen.target;
 }
 
 /** Abrir una dirección cualquiera, haya o no un mosaico abierto (lo sustituye, con sus dispositivos). */
@@ -146,10 +190,22 @@ async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic, fresh = true):
     log: (l) => out.info(l),
     proxy: { relaxCsp: cfg.get<boolean>('relaxCsp') !== false, fixCookies: cfg.get<boolean>('fixCookies') !== false, apiOrigins: trusted },
     onHint: (origin) => void offerApi(ctx, origin),
+    routes: () => projectRoutes(folder()),
+    follow: followOn,
   });
   const host = current;
+  // Se recuerda cómo queda: al abrirlo, cada vez que cambia de forma y, con un respiro, cuando una celda navega.
+  remember(ctx, host);
+  let moving: ReturnType<typeof setTimeout> | undefined;
+  host.onDidChange(() => remember(ctx, host));
+  host.onDidMove(() => {
+    clearTimeout(moving);
+    moving = setTimeout(() => remember(ctx, host), 1000);
+  });
   out.info(`mosaic open: ${next.target}, ${next.cells.length} cells, proxy on port ${host.proxy.port}`);
   host.panel.onDidDispose(() => {
+    clearTimeout(moving);
+    remember(ctx, host);
     if (current === host) current = undefined;
     void vscode.commands.executeCommand('setContext', 'viewkeeper.open', current !== undefined);
   });
@@ -189,9 +245,14 @@ async function openDefault(ctx: vscode.ExtensionContext): Promise<void> {
     current.panel.reveal();
     return;
   }
-  const target = await pickTarget();
-  if (!target) return;
-  await show(ctx, { v: 1, name: new URL(target.origin).host, target: target.origin, cells: matrix([target.path], defaultDevices()), sync: SYNC_ALL });
+  // Lo último que tenías en este proyecto, si su servidor de desarrollo sigue en marcha: se reabre sin preguntar.
+  // Una web publicada, o un servidor que ya no contesta, se ofrece en la lista en vez de abrirse sola.
+  const last = lastMosaic(ctx);
+  if (last && isDevHost(last.target) && (await answers(last.target))) return show(ctx, last);
+  const picked = await pickTarget(last);
+  if (!picked) return;
+  if ('cells' in picked) return show(ctx, picked);
+  await show(ctx, { v: 1, name: new URL(picked.origin).host, target: picked.origin, cells: matrix([picked.path], defaultDevices()), sync: SYNC_ALL });
 }
 
 /** Elegir rutas del proyecto y dispositivos, y abrir la matriz: una fila por ruta, una columna por dispositivo. */
@@ -199,12 +260,7 @@ async function openMatrix(ctx: vscode.ExtensionContext): Promise<void> {
   if (remote()) return;
   const target = current ? { origin: current.mosaic().target, path: '/' } : await pickTarget();
   if (!target) return;
-  const base = folder();
-  let routes: ReturnType<typeof detectRoutes> = [];
-  if (base) {
-    const files = await vscode.workspace.findFiles('**/*.{tsx,jsx,ts,js,mdx,md,svelte,astro,vue,html}', '**/{node_modules,dist,build,out,.next,.svelte-kit,.astro,.nuxt,.output,coverage}/**', 4000);
-    routes = detectRoutes(files.map((f) => vscode.workspace.asRelativePath(f, false)));
-  }
+  const routes = await projectRoutes(folder());
   const other = t('Type a route…');
   const picked = await vscode.window.showQuickPick(
     [
@@ -361,6 +417,23 @@ export function registerCommands(ctx: vscode.ExtensionContext): void {
     if (current) await captureMosaic(current, true, (l) => out.info(l));
   });
   reg('viewkeeper.doctor', doctor);
+  reg('viewkeeper.toggleFollowEditor', async () => {
+    await vscode.workspace.getConfiguration('viewkeeper').update('followEditor', !followOn(), vscode.ConfigurationTarget.Global);
+    // Recién encendido: el fichero que ya está abierto cuenta.
+    followEditor(vscode.window.activeTextEditor);
+  });
+  let following: ReturnType<typeof setTimeout> | undefined;
+  ctx.subscriptions.push(
+    // Con un respiro: al pasar por varias pestañas seguidas solo cuenta en la que te quedas.
+    vscode.window.onDidChangeActiveTextEditor((ed) => {
+      clearTimeout(following);
+      following = setTimeout(() => followEditor(ed), 250);
+    }),
+    vscode.workspace.onDidChangeConfiguration((e) => {
+      if (e.affectsConfiguration('viewkeeper.followEditor')) current?.refresh();
+    }),
+    { dispose: () => clearTimeout(following) },
+  );
   ctx.subscriptions.push(out, { dispose: () => current?.dispose() });
 
   // Visible desde el primer arranque: sin esto, instalar la extensión no cambia nada en pantalla.
```

**`src/vscode/panelHost.ts`**

```diff
--- a/src/vscode/panelHost.ts
+++ b/src/vscode/panelHost.ts
@@ -4,10 +4,12 @@ import * as fs from 'node:fs';
 import * as path from 'node:path';
 import { randomBytes } from 'node:crypto';
 import { DEVICES, findDevice, rotate, type Device } from '../core/devices.ts';
-import { applyEdit, isDevHost, parseMosaic, type Mosaic } from '../core/mosaic.ts';
+import { applyEdit, isDevHost, normalizePath, parseMosaic, type Mosaic } from '../core/mosaic.ts';
+import type { Route } from '../core/routes.ts';
 import { startProxy, type ProxyOptions, type ProxyPages, type RunningProxy } from '../core/proxy.ts';
 import type { AgentCommand, AgentEvent } from '../core/sync.ts';
 import type { CellView, PanelState, PanelText } from '../webview/panel.ts';
+import { panelCsp, panelHtml } from '../webview/shell.ts';
 
 export interface HostOptions {
   proxy?: Partial<Pick<ProxyOptions, 'relaxCsp' | 'fixCookies' | 'apiOrigins'>>;
@@ -17,6 +19,10 @@ export interface HostOptions {
   onHint?: (origin: string) => void;
   /** Solo la sonda: instrumentos que se insertan en el agente. El producto no los lleva en el paquete. */
   sonda?: { inicio: string; pregunta: string };
+  /** Las rutas del proyecto, para ofrecerlas al cambiar la de una fila. */
+  routes?: () => Promise<Route[]>;
+  /** ¿Está encendido «seguir al editor»? Se pregunta cada vez que se pinta la barra. */
+  follow?: () => boolean;
 }
 
 export interface Metrics {
@@ -34,13 +40,14 @@ interface FromPanel {
   id?: number;
   data?: Metrics;
   group?: number;
+  n?: number;
   edit?: unknown;
   command?: string;
   ev?: AgentEvent & { boot?: string };
 }
 
 /** Botones de la barra que lanzan un comando de la extensión. Lo demás que pida el panel se ignora. */
-const PANEL_COMMANDS = new Set(['openUrl', 'reload', 'capture', 'captureFullPage', 'save', 'addSession', 'openMatrix', 'doctor']);
+const PANEL_COMMANDS = new Set(['openUrl', 'reload', 'capture', 'captureFullPage', 'save', 'addSession', 'openMatrix', 'doctor', 'toggleFollowEditor']);
 
 function texts(): PanelText {
   const t = vscode.l10n.t;
@@ -64,6 +71,11 @@ function texts(): PanelText {
     session1: t('session'),
     deployed: t('Deployed site'),
     deployedHint: t('Click and typing sync start switched off on a deployed site, so nothing is done once per device on real data.'),
+    route: t('Change the route of this row'),
+    addToRow: t('Add a device to this row'),
+    zoom: t('Enlarge this cell (Esc to go back)'),
+    follow: t('Follow editor'),
+    errors: t('JavaScript errors on this page'),
   };
 }
 
@@ -92,6 +104,12 @@ export class PanelHost implements vscode.Disposable {
   private readonly extensionUri: vscode.Uri;
   private readonly paths = new Map<string, string>();
   private readonly misses = new Map<string, number>();
+  private readonly errorCounts = new Map<string, number>();
+  private readonly routes: (() => Promise<Route[]>) | undefined;
+  private readonly follow: (() => boolean) | undefined;
+  private readonly moved = new vscode.EventEmitter<void>();
+  /** Una celda ha cambiado de página: lo usa la extensión para recordar el mosaico tal como quedó. */
+  readonly onDidMove = this.moved.event;
   private readonly waiters = new Map<number, (data: unknown) => void>();
   private readonly changed = new vscode.EventEmitter<Mosaic>();
   /** Cada vez que el mosaico cambia de forma (no al navegar): lo usa la extensión para saber qué hay abierto. */
@@ -107,6 +125,8 @@ export class PanelHost implements vscode.Disposable {
     this.fixCookies = opts.proxy?.fixCookies !== false;
     this.sonda = opts.sonda !== undefined;
     this.extensionUri = extensionUri;
+    this.routes = opts.routes;
+    this.follow = opts.follow;
   }
 
   static async open(ctx: vscode.ExtensionContext, input: Mosaic, opts: HostOptions = {}): Promise<PanelHost> {
@@ -138,9 +158,16 @@ export class PanelHost implements vscode.Disposable {
       if (typeof m.origin === 'string' && /^vscode-webview:\/\/[a-z0-9-]+$/i.test(m.origin)) this.proxy.setPanelOrigin(m.origin);
       this.postState();
     } else if (m.t === 'where' && typeof m.cell === 'string' && typeof m.path === 'string') {
-      this.paths.set(m.cell, m.path);
+      if (this.paths.get(m.cell) !== m.path) {
+        this.paths.set(m.cell, m.path);
+        this.moved.fire();
+      }
     } else if (m.t === 'pick') {
-      void this.pickDevice(typeof m.cell === 'string' ? m.cell : undefined);
+      void this.pickDevice(typeof m.cell === 'string' ? m.cell : undefined, Number.isInteger(m.group) ? m.group : undefined);
+    } else if (m.t === 'route' && typeof m.cell === 'string') {
+      void this.pickRoute(m.cell);
+    } else if (m.t === 'errors' && typeof m.cell === 'string' && typeof m.n === 'number' && Number.isFinite(m.n)) {
+      this.errorCounts.set(m.cell, Math.max(0, Math.floor(m.n)));
     } else if (m.t === 'edit') {
       this.apply(applyEdit(this.mosaic(), m.edit, (id) => findDevice(id, this.customDevices) !== undefined));
     } else if (m.t === 'command' && typeof m.command === 'string' && PANEL_COMMANDS.has(m.command)) {
@@ -182,13 +209,67 @@ export class PanelHost implements vscode.Disposable {
 
   private state(): PanelState {
     const devices = [...DEVICES, ...this.customDevices].map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height }));
-    return { cells: this.views(), sync: this.model.sync, sonda: this.sonda, text: texts(), devices, name: this.model.name, deployed: !isDevHost(this.model.target) };
+    return { cells: this.views(), sync: this.model.sync, sonda: this.sonda, text: texts(), devices, name: this.model.name, deployed: !isDevHost(this.model.target), follow: this.follow?.() === true };
   }
 
   private postState(): void {
     void this.panel.webview.postMessage({ t: 'state', state: this.state() });
   }
 
+  /** Vuelve a pintar la barra: un ajuste que el panel enseña (seguir al editor) ha cambiado. */
+  refresh(): void {
+    if (!this.disposed) this.postState();
+  }
+
+  /** Lleva una fila entera a otra ruta. El reparto lo hace el panel, que sabe dónde está cada celda. */
+  drive(group: number, path: string): void {
+    if (this.disposed || !this.model.cells.some((c) => c.group === group)) return;
+    void this.panel.webview.postMessage({ t: 'drive', group, path: normalizePath(path) });
+  }
+
+  /** Las filas del mosaico, de arriba abajo. */
+  groups(): number[] {
+    return [...new Set(this.model.cells.map((c) => c.group))].sort((a, b) => a - b);
+  }
+
+  /** Dónde está ahora la primera celda de una fila. */
+  pathOfGroup(group: number): string | undefined {
+    const c = this.model.cells.find((x) => x.group === group);
+    return c ? (this.paths.get(c.id) ?? c.path) : undefined;
+  }
+
+  /** Cambiar la ruta de la fila de una celda: las rutas del proyecto, o la que se escriba. */
+  private async pickRoute(cell: string): Promise<void> {
+    const c = this.model.cells.find((x) => x.id === cell);
+    if (!c) return;
+    const now = this.paths.get(c.id) ?? c.path;
+    const known = (this.routes ? await this.routes() : []).filter((r) => !r.dynamic);
+    if (this.disposed) return;
+    type Item = vscode.QuickPickItem & { path: string };
+    const base: Item[] = [{ path: '/', source: '' }, ...known.filter((r) => r.path !== '/')].map((r) => ({ label: r.path, description: r.source, path: r.path }));
+    const qp = vscode.window.createQuickPick<Item>();
+    qp.title = vscode.l10n.t('Route for this row');
+    qp.placeholder = vscode.l10n.t('Pick a route or type one (/pricing)');
+    qp.value = now;
+    const offer = (v: string): void => {
+      const typed = v.trim();
+      // Lo escrito siempre se puede abrir, aunque no coincida con ninguna ruta detectada.
+      qp.items = typed === '' || base.some((b) => b.path === normalizePath(typed)) ? base : [{ label: normalizePath(typed), description: vscode.l10n.t('Go to this route'), path: normalizePath(typed), alwaysShow: true }, ...base];
+    };
+    offer(now);
+    qp.onDidChangeValue(offer);
+    const chosen = await new Promise<Item | undefined>((resolve) => {
+      qp.onDidAccept(() => {
+        resolve(qp.selectedItems[0]);
+        qp.hide();
+      });
+      qp.onDidHide(() => resolve(undefined));
+      qp.show();
+    });
+    qp.dispose();
+    if (chosen) this.drive(c.group, chosen.path);
+  }
+
   /** Se escribe una vez: la política admite cualquier sesión de ESTE proxy (http://*.localhost:<su puerto>). */
   private writeHtml(): void {
     this.panel.webview.html = html(this.panel.webview, this.extensionUri, `http://*.localhost:${this.proxy.port}`);
@@ -200,6 +281,7 @@ export class PanelHost implements vscode.Disposable {
     if (!valid || valid.target !== this.model.target) return;
     // Lo que cambie de forma se recuerda; la ruta de cada celda la sigue dando la propia celda.
     for (const id of [...this.paths.keys()]) if (!valid.cells.some((c) => c.id === id)) this.paths.delete(id);
+    for (const id of [...this.errorCounts.keys()]) if (!valid.cells.some((c) => c.id === id)) this.errorCounts.delete(id);
     this.model = valid;
     this.panel.title = `ViewKeeper · ${valid.name}`;
     this.postState();
@@ -207,14 +289,14 @@ export class PanelHost implements vscode.Disposable {
   }
 
   /** Selector de dispositivo: para cambiar el de una celda o, sin celda, para añadir una. */
-  private async pickDevice(cell: string | undefined): Promise<void> {
+  private async pickDevice(cell: string | undefined, group?: number): Promise<void> {
     const current = cell ? this.model.cells.find((c) => c.id === cell) : undefined;
     if (cell && !current) return;
     const items = [...DEVICES, ...this.customDevices].map((d) => ({ label: d.name, description: `${d.width}×${d.height}`, id: d.id, picked: d.id === current?.deviceId }));
     const choice = await vscode.window.showQuickPick(items, { title: cell ? vscode.l10n.t('Device for this cell') : vscode.l10n.t('Add device') });
     if (!choice || this.disposed) return;
     const known = (id: string): boolean => findDevice(id, this.customDevices) !== undefined;
-    this.apply(applyEdit(this.mosaic(), cell ? { op: 'device', cell, deviceId: choice.id } : { op: 'add', deviceId: choice.id }, known));
+    this.apply(applyEdit(this.mosaic(), cell ? { op: 'device', cell, deviceId: choice.id } : { op: 'add', deviceId: choice.id, group }, known));
   }
 
   get isDisposed(): boolean {
@@ -258,13 +340,15 @@ export class PanelHost implements vscode.Disposable {
 
   diagnostics(): string[] {
     const miss = [...this.misses].map(([cell, n]) => `cell ${cell}: ${n} actions not replayed (the element was not the same at that width)`);
-    return [...this.proxy.diagnostics(), ...miss];
+    const errors = [...this.errorCounts].filter(([, n]) => n > 0).map(([cell, n]) => `cell ${cell}: ${n} JavaScript errors on the page it shows now`);
+    return [...this.proxy.diagnostics(), ...miss, ...errors];
   }
 
   dispose(): void {
     if (this.disposed) return;
     this.disposed = true;
     this.changed.dispose();
+    this.moved.dispose();
     void this.proxy.close();
     this.panel.dispose();
   }
@@ -281,41 +365,5 @@ function html(webview: vscode.Webview, extensionUri: vscode.Uri, frameSource: st
   const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'panel.js'));
   // La política solo deja incrustar el proxy de ESTE panel (su puerto, cualquier sesión), y ejecutar NUESTRO script.
   // El puerto es un número que da el sistema: no puede colar directivas.
-  const csp = `default-src 'none'; frame-src ${frameSource}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:`;
-  return `<!doctype html>
-<html><head><meta charset="utf-8">
-<meta http-equiv="Content-Security-Policy" content="${csp}">
-<style nonce="${nonce}">${CSS}</style></head>
-<body><div id="barra"></div><div id="mosaico"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
+  return panelHtml({ csp: panelCsp(frameSource, nonce), nonce, script: String(script) });
 }
-
-const CSS = `
-  body { margin: 0; padding: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: 12px var(--vscode-font-family); }
-  #barra { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-panel-border); }
-  #barra .sep { width: 1px; height: 20px; background: var(--vscode-panel-border); margin: 0 4px; }
-  #barra .etq { opacity: .75; margin-right: 2px; }
-  #barra .vivo { margin-left: auto; padding: 1px 8px; border-radius: 9px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
-  button, select { font: inherit; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 4px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
-  select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
-  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
-  button:focus-visible, select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
-  button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
-  button.ico { padding: 3px 5px; background: transparent; color: var(--vscode-foreground); }
-  button.ico:hover { background: var(--vscode-toolbar-hoverBackground); }
-  svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }
-  #mosaico { padding: 12px; box-sizing: border-box; }
-  .fila { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
-  .aviso { flex-basis: 100%; margin: 0; padding: 6px 10px; border-radius: 4px; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
-  .vacio { padding: 40px 12px; text-align: center; opacity: .8; }
-  figure { margin: 0; flex: none; }
-  figcaption { display: flex; align-items: center; gap: 4px; padding: 0 0 6px; white-space: nowrap; min-height: 26px; }
-  button.disp { padding: 2px 6px; max-width: 150px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border-color: var(--vscode-dropdown-border, transparent); }
-  figure.estrecha .dim { display: none; }
-  figure.estrecha button.disp { max-width: 112px; }
-  figcaption .acc { margin-left: auto; display: inline-flex; }
-  figcaption .dim { opacity: .7; }
-  figcaption .ruta { opacity: .85; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; max-width: 220px; }
-  figcaption .ses { font-size: 11px; padding: 0 5px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
-  .escena { overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: #fff; }
-  iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
-`;
```

**`src/vscode/projectRoutes.ts`** (nuevo)

```diff
--- /dev/null
+++ b/src/vscode/projectRoutes.ts
@@ -0,0 +1,12 @@
+// Las rutas de la app del proyecto abierto, leídas de sus ficheros. Lo usan la matriz y el cambio de ruta de una fila.
+import * as vscode from 'vscode';
+import { detectRoutes, type Route } from '../core/routes.ts';
+
+const PAGES = '**/*.{tsx,jsx,ts,js,mdx,md,svelte,astro,vue,html}';
+const SKIP = '**/{node_modules,dist,build,out,.next,.svelte-kit,.astro,.nuxt,.output,coverage}/**';
+
+export async function projectRoutes(folder: vscode.WorkspaceFolder | undefined): Promise<Route[]> {
+  if (!folder) return [];
+  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, PAGES), SKIP, 4000);
+  return detectRoutes(files.map((f) => vscode.workspace.asRelativePath(f, false)));
+}
```

**`src/extension.ts`**

```diff
--- a/src/extension.ts
+++ b/src/extension.ts
@@ -2,18 +2,20 @@
 // ni red, ni disco, ni proxy hasta que el usuario abre un mosaico.
 import * as vscode from 'vscode';
 import type { Mosaic } from './core/mosaic.ts';
-import { registerCommands } from './vscode/commands.ts';
+import { currentHost, registerCommands } from './vscode/commands.ts';
 import { PanelHost, type HostOptions } from './vscode/panelHost.ts';
 
 export interface SondaApi {
   open(mosaic: Mosaic, opts?: HostOptions): Promise<PanelHost>;
+  /** El mosaico que la extensión tiene abierto por sus propios comandos. */
+  current(): PanelHost | undefined;
 }
 
 export function activate(ctx: vscode.ExtensionContext): SondaApi | undefined {
   registerCommands(ctx);
   // La puerta de la sonda solo existe cuando VS Code corre pruebas; instalada, la extensión no exporta nada.
   if (ctx.extensionMode !== vscode.ExtensionMode.Test) return undefined;
-  return { open: (mosaic, opts) => PanelHost.open(ctx, mosaic, opts) };
+  return { open: (mosaic, opts) => PanelHost.open(ctx, mosaic, opts), current: currentHost };
 }
 
 export function deactivate(): void {}
```

**`package.json`**

```diff
--- a/package.json
+++ b/package.json
@@ -72,7 +72,7 @@
     "lint": "eslint src test media/agent.js",
     "l10n": "node scripts/l10n-sync.mjs",
     "test": "node --no-warnings --test \"test/unit/*.test.ts\"",
-    "test:browser": "node --no-warnings test/browser/r1-proxy.ts && node --no-warnings test/browser/r2-sync.ts && node --no-warnings test/browser/r4-navegador.ts",
+    "test:browser": "node --no-warnings test/browser/r1-proxy.ts && node --no-warnings test/browser/r2-sync.ts && node --no-warnings test/browser/r4-navegador.ts && node --no-warnings test/browser/r5-mejoras.ts",
     "test:integration": "npm run build && node esbuild.mjs --tests && node --no-warnings test/integration/run.ts",
     "package": "vsce package --no-dependencies",
     "check": "npm run typecheck && npm run check:agent && npm run lint && npm run l10n && npm test"
@@ -132,6 +132,11 @@
         "command": "viewkeeper.doctor",
         "title": "%cmd.doctor%",
         "category": "ViewKeeper"
+      },
+      {
+        "command": "viewkeeper.toggleFollowEditor",
+        "title": "%cmd.toggleFollowEditor%",
+        "category": "ViewKeeper"
       }
     ],
     "menus": {
@@ -230,6 +235,11 @@
           "scope": "resource",
           "markdownDescription": "%cfg.apiOrigins%"
         },
+        "viewkeeper.followEditor": {
+          "type": "boolean",
+          "default": false,
+          "markdownDescription": "%cfg.followEditor%"
+        },
         "viewkeeper.relaxCsp": {
           "type": "boolean",
           "default": true,
```

**`package.nls.es.json`**

```diff
--- a/package.nls.es.json
+++ b/package.nls.es.json
@@ -9,8 +9,10 @@
   "cmd.capture": "Capturar el mosaico",
   "cmd.captureFullPage": "Capturar el mosaico (páginas enteras)",
   "cmd.doctor": "Diagnosticar",
+  "cmd.toggleFollowEditor": "Seguir al editor: encender / apagar",
   "cfg.defaultDevices": "Dispositivos que se muestran al abrir un mosaico por primera vez. Identificadores del catálogo o de `viewkeeper.customDevices`.",
   "cfg.customDevices": "Tus propios dispositivos: `{ \"id\", \"name\", \"width\", \"height\", \"mobile\" }`. El `id` es lo que pones en `viewkeeper.defaultDevices`; si no lo pones, se forma con el nombre (`custom-<nombre>`).",
+  "cfg.followEditor": "Al abrir el fichero de una página (`app/precios/page.tsx`, `src/routes/about/+page.svelte`…), el mosaico va a su ruta. Solo en mosaicos de una fila y en rutas sin segmentos dinámicos.",
   "cfg.relaxCsp": "Quita la cabecera `Content-Security-Policy` de las páginas en vista previa. Hace falta en apps con una política estricta; apágalo para previsualizar con tu política real (la sincronización puede dejar de funcionar).",
   "cfg.fixCookies": "Reescribe las cookies de tu servidor de desarrollo a `SameSite=None; Secure` para que el inicio de sesión siga funcionando dentro del mosaico. Solo afecta a la vista previa, nunca a tu servidor.",
   "cfg.browserPath": "Ruta de Chrome, Edge, Brave o Chromium, usada solo para las capturas. Déjalo vacío para buscar uno automáticamente.",
```

**`package.nls.json`**

```diff
--- a/package.nls.json
+++ b/package.nls.json
@@ -9,8 +9,10 @@
   "cmd.capture": "Capture the mosaic",
   "cmd.captureFullPage": "Capture the mosaic (full pages)",
   "cmd.doctor": "Diagnose",
+  "cmd.toggleFollowEditor": "Follow the editor: on / off",
   "cfg.defaultDevices": "Devices shown when a mosaic is opened for the first time. Ids from the built-in catalogue or from `viewkeeper.customDevices`.",
   "cfg.customDevices": "Your own devices: `{ \"id\", \"name\", \"width\", \"height\", \"mobile\" }`. The `id` is what you put in `viewkeeper.defaultDevices`; if you leave it out it is made from the name (`custom-<name>`).",
+  "cfg.followEditor": "When you open the file of a page (`app/pricing/page.tsx`, `src/routes/about/+page.svelte`…), the mosaic goes to its route. Only for mosaics with a single row and routes without dynamic segments.",
   "cfg.relaxCsp": "Remove the `Content-Security-Policy` header from previewed pages. Needed for apps with a strict policy; turn it off to preview with your real policy (sync may stop working).",
   "cfg.fixCookies": "Rewrite your dev server's cookies to `SameSite=None; Secure` so that sign-in keeps working inside the mosaic. Only affects the preview, never your server.",
   "cfg.browserPath": "Path to Chrome, Edge, Brave or Chromium, used only for captures. Leave empty to find one automatically.",
```

**`l10n/bundle.l10n.es.json`**

```diff
--- a/l10n/bundle.l10n.es.json
+++ b/l10n/bundle.l10n.es.json
@@ -72,5 +72,14 @@
   "Start your dev server. This cell retries by itself every two seconds.": "Arranca tu servidor de desarrollo. Esta celda lo reintenta sola cada dos segundos.",
   "This page redirects outside the mosaic": "Esta página redirige fuera del mosaico",
   "It goes to {0}. A cell only shows the site the mosaic was opened for, so the redirect was not followed. Signing in through another site cannot happen inside a cell.": "Va a {0}. Una celda solo enseña la web para la que se abrió el mosaico, así que la redirección no se ha seguido. Iniciar sesión a través de otro sitio no cabe dentro de una celda.",
-  "Back": "Volver"
+  "Back": "Volver",
+  "Change the route of this row": "Cambiar la ruta de esta fila",
+  "Add a device to this row": "Añadir un dispositivo a esta fila",
+  "Enlarge this cell (Esc to go back)": "Ampliar esta celda (Esc para volver)",
+  "Follow editor": "Seguir al editor",
+  "JavaScript errors on this page": "errores de JavaScript en esta página",
+  "Route for this row": "Ruta de esta fila",
+  "Pick a route or type one (/pricing)": "Elige una ruta o escribe una (/precios)",
+  "Go to this route": "Ir a esta ruta",
+  "Reopen {0}": "Reabrir {0}"
 }
```


Pruebas nuevas de la fase: `test/unit/mejoras.test.ts` (P-62 mandar una fila a una ruta, P-63 del fichero a su ruta, P-64 añadir a una fila, P-65 si un servidor contesta), `test/browser/r5-mejoras.ts` y `test/integration/pruebas-mejoras.ts` (I-9 seguir al editor, I-10 ruta de la fila, errores y «+», I-11 reabrir lo último).

### 5.C · Fase C — la app con su dominio completo y API en otro servidor (M3, M4)

Commits:

- `ccea38c` Fase C: la app con su dominio completo se queda en la celda (M3) y API de otro servidor con su propio bote de cookies (M4)

Qué consigue:

- **M3:** un enlace, un formulario, un `fetch` o un `location.href` que nombran a la propia app con su dominio completo se quedan dentro de la celda. Un salto por código a otra web se cancela y el rótulo lo dice.
- **M4:** una API en otro servidor que solo admite el origen de la app puede pasar por el proxy. La extensión lo ofrece cuando ve que la llamada falla y la API nombra a la app por CORS, igual que ya hacía con las API de otro puerto.

Criterio de salida: P-66 a P-68 en verde; M3-1 a M3-5 del banco r5; y la tarea C-2.

Tareas que no son código:

- **C-1 · README y aviso de privacidad.** Decir qué viaja cuando una API de fuera pasa por el proxy: las llamadas salen de este ordenador con el origen de la app, con las cookies que esa API ponga y las que la app puso para su dominio.
- **C-2 · Probar M4 contra una API de fuera de verdad.** Un frontend en `localhost` que llame a una API propia publicada con CORS restringido a ese `localhost`. Sirve cualquiera de las que ya tienes desplegadas con esa configuración; si no hay ninguna, se monta una mínima en la zona de pruebas.

Límites que se declaran en el README:

- Un WebSocket hacia una API de otro origen no pasa por el proxy.
- `window.open` hacia el dominio completo de la app abre la web real en el navegador, fuera del mosaico.
- A una API de fuera las cookies de su bote se le mandan en todas las llamadas, sin mirar si la página pidió `credentials: 'include'`.

Código de la fase:

**`src/core/probe.ts`**

```diff
--- a/src/core/probe.ts
+++ b/src/core/probe.ts
@@ -109,6 +109,15 @@ export function probePort(port: number, timeoutMs = 700): Promise<Probe | undefi
   });
 }
 
+/**
+ * ¿La respuesta CORS de la API nombra a la app? En esta máquina vale también «*». Fuera, tiene que nombrarla
+ * tal cual: una API que admite a cualquiera ya funciona sin el proxy, y «*» no distingue a esta app de otra.
+ */
+export function corsAllows(allowOrigin: string | string[] | undefined, appOrigin: string, local: boolean): boolean {
+  const allow = String(Array.isArray(allowOrigin) ? allowOrigin[0] : (allowOrigin ?? '')).trim();
+  return allow === appOrigin || (local && allow === '*');
+}
+
 /**
  * ¿Esta API ya se fía del origen de la app? Se le pregunta desde aquí, con el Origin de la app, y se mira su
  * respuesta CORS. Es lo que impide que una página fabrique un aviso para que el proxy le abra un servicio
@@ -122,13 +131,15 @@ export function apiTrustsApp(apiOrigin: string, appOrigin: string, timeoutMs = 1
     } catch {
       return resolve(false);
     }
-    if (u.protocol !== 'http:' || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return resolve(false);
-    const req = http.request(
-      { host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || 80, path: '/', method: 'OPTIONS', timeout: timeoutMs, headers: { origin: appOrigin, 'access-control-request-method': 'GET' } },
+    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
+    // De esta máquina, por http (como hasta ahora). De fuera, solo https.
+    if (!(local ? u.protocol === 'http:' : u.protocol === 'https:') || u.username !== '' || u.password !== '') return resolve(false);
+    const secure = u.protocol === 'https:';
+    const req = (secure ? https : http).request(
+      { protocol: u.protocol, host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (secure ? 443 : 80), path: '/', method: 'OPTIONS', timeout: local ? timeoutMs : Math.max(timeoutMs, 4000), headers: { origin: appOrigin, 'access-control-request-method': 'GET' } },
       (res) => {
         res.resume();
-        const allow = String(res.headers['access-control-allow-origin'] ?? '');
-        resolve(allow === appOrigin || allow === '*');
+        resolve(corsAllows(res.headers['access-control-allow-origin'], appOrigin, local));
       },
     );
     req.on('timeout', () => {
```

**`src/core/proxy.ts`**

```diff
--- a/src/core/proxy.ts
+++ b/src/core/proxy.ts
@@ -10,7 +10,7 @@ import * as zlib from 'node:zlib';
 import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
 import { Transform, type TransformCallback } from 'node:stream';
 import type { Duplex } from 'node:stream';
-import { isAlias } from './alias.ts';
+import { aliasOrigins, isAlias } from './alias.ts';
 
 export const PREFIX = '/__viewkeeper';
 /** Las cookies no distinguen puerto: el nombre lleva el del proxy para que dos mosaicos no se pisen (H-3). */
@@ -28,8 +28,11 @@ export interface ProxyOptions {
   relaxCsp?: boolean;
   /** Reescribir Set-Cookie a SameSite=None; Secure. */
   fixCookies?: boolean;
-  /** Otros orígenes de esta máquina (la API en otro puerto) que la página puede llamar a través del proxy. */
-  apiOrigins?: readonly string[];
+  /**
+   * Otros orígenes que la página llama y que solo admiten por CORS el origen de la app: pasan por el proxy, que
+   * los reenvía con ese origen. De esta máquina (la API en otro puerto) o de fuera (solo https).
+   */
+  apiOrigins?: readonly (string | ApiSpec)[];
   log?: (line: string) => void;
   now?: () => number;
   /** Puerto fijo. Solo para pruebas: por defecto, el preferido del destino y, si está ocupado, uno libre. */
@@ -38,6 +41,51 @@ export interface ProxyOptions {
   pages?: Partial<ProxyPages>;
 }
 
+/**
+ * Qué cookies viajan a una API que pasa por el proxy.
+ *  - 'app': las de la celda. Es lo que hace el navegador con otro puerto de la misma máquina (las cookies no
+ *    distinguen puerto), y es el modo de las API locales.
+ *  - 'own': un bote aparte por sesión, guardado en el proxy, con lo que esa API vaya poniendo; de las cookies de la
+ *    app solo viajan las que la app puso con un Domain que cubre a la API. Es lo que haría el navegador con otro
+ *    servidor, y evita mandar la sesión de la app a un tercero. Es el modo de las API de fuera.
+ */
+export interface ApiSpec {
+  origin: string;
+  cookies?: 'app' | 'own';
+}
+
+/** Lee la lista de API: descarta lo ilegible y, de fuera de esta máquina, lo que no vaya por https. */
+export function parseApis(list: readonly (string | ApiSpec)[] | undefined): { url: URL; cookies: 'app' | 'own' }[] {
+  const out: { url: URL; cookies: 'app' | 'own' }[] = [];
+  for (const raw of list ?? []) {
+    const spec: ApiSpec = typeof raw === 'string' ? { origin: raw } : raw;
+    let url: URL;
+    try {
+      url = new URL(spec.origin);
+    } catch {
+      continue;
+    }
+    const local = isLoopbackHost(url.hostname);
+    if (url.username !== '' || url.password !== '') continue;
+    if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) continue;
+    if (out.some((a) => a.url.origin === url.origin)) continue;
+    out.push({ url, cookies: spec.cookies === 'app' || spec.cookies === 'own' ? (local ? spec.cookies : 'own') : local ? 'app' : 'own' });
+  }
+  return out;
+}
+
+/** El Domain de un Set-Cookie, en minúsculas y sin el punto inicial; undefined si no lo lleva. */
+export function cookieDomain(c: string): string | undefined {
+  const m = /;\s*domain=\.?([^;\s]+)/i.exec(c);
+  return m ? m[1].toLowerCase() : undefined;
+}
+
+/** ¿Una cookie con ese Domain se le manda a ese servidor? El propio dominio o un subdominio suyo. */
+export function domainCovers(domain: string, hostname: string): boolean {
+  const h = hostname.toLowerCase();
+  return h === domain || h.endsWith('.' + domain);
+}
+
 /** `{0}` es el servidor (host o origen) del que se habla. */
 export interface ProxyPages {
   denied: string;
@@ -366,9 +414,14 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
   const log = opts.log ?? ((): void => {});
   const now = opts.now ?? Date.now;
   const pages: ProxyPages = { ...PAGES_EN, ...opts.pages };
-  // Solo orígenes de esta máquina: el proxy no es una pasarela hacia la red.
-  const apis = (opts.apiOrigins ?? []).map((o) => new URL(o)).filter((u) => isLoopbackHost(u.hostname) && (u.protocol === 'http:' || u.protocol === 'https:'));
+  // Una lista cerrada que da quien arranca el proxy: no es una pasarela hacia cualquier sitio.
+  const apis = parseApis(opts.apiOrigins);
+  const targets = aliasOrigins(opts.target);
   const seenCookies = new Map<string, Map<string, string>>();
+  /** Bote de cada API en modo 'own', por sesión: «sesión|índice» → nombre → valor. */
+  const apiJars = new Map<string, Map<string, string>>();
+  /** Cookies que la app puso con Domain, por sesión: nombre → dominio. Son las únicas suyas que viajan a una API 'own'. */
+  const domainCookies = new Map<string, Map<string, string>>();
   const tickets = new Map<string, { session: string; expires: number }>();
   const notes: string[] = [];
   const note = (line: string): void => {
@@ -421,10 +474,26 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
     res.end();
   };
 
-  const forward = (req: http.IncomingMessage, res: http.ServerResponse, dest: URL, path: string, ctx: Ctx, mayInject: boolean, apiPrefix?: string, jar?: Map<string, string>): void => {
+  const forward = (req: http.IncomingMessage, res: http.ServerResponse, dest: URL, path: string, ctx: Ctx, mayInject: boolean, apiPrefix?: string, jar?: Map<string, string>, own?: { session: string; index: number }, session?: string): void => {
     const html = mayInject && wantsHtml(req);
     const headers = rewriteRequestHeaders(req.headers, ctx, html);
     headers.host = dest.host; // la API ve su propio Host y, como Origin, el de la app
+    const ownJar = own ? (apiJars.get(`${own.session}|${own.index}`) ?? new Map<string, string>()) : undefined;
+    if (own && ownJar) {
+      apiJars.set(`${own.session}|${own.index}`, ownJar);
+      // A otro servidor no va la sesión de la app: solo su propio bote y lo que la app puso con un Domain que lo cubre.
+      const send = new Map<string, string>();
+      const withDomain = domainCookies.get(own.session);
+      for (const pair of (stripGateCookies(req.headers.cookie) ?? '').split(';')) {
+        const i = pair.indexOf('=');
+        const name = i > 0 ? pair.slice(0, i).trim() : '';
+        const d = withDomain?.get(name);
+        if (d !== undefined && domainCovers(d, dest.hostname)) send.set(name, pair.slice(i + 1).trim());
+      }
+      for (const [k, v] of ownJar) send.set(k, v);
+      if (send.size) headers.cookie = [...send].map(([k, v]) => `${k}=${v}`).join('; ');
+      else delete headers.cookie;
+    }
     const secure = dest.protocol === 'https:';
     const up = (secure ? https : http).request(
       {
@@ -459,6 +528,27 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
           }
         }
         if (jar) for (const c of ur.headers['set-cookie'] ?? []) if (expiresCookie(c)) jar.delete(c.split('=')[0].trim());
+        if (ownJar) {
+          // Lo que esa API pone se guarda aquí y no llega a la celda: no se mezcla con las cookies de la app.
+          for (const c of ur.headers['set-cookie'] ?? []) {
+            const first = c.split(';')[0];
+            const i = first.indexOf('=');
+            if (i <= 0 || /[\r\n]/.test(first)) continue;
+            const name = first.slice(0, i).trim();
+            if (expiresCookie(c)) ownJar.delete(name);
+            else if (ownJar.size < 50 || ownJar.has(name)) ownJar.set(name, first.slice(i + 1).trim());
+          }
+          delete outHeaders['set-cookie'];
+        } else if (apiPrefix === undefined && session !== undefined) {
+          const dom = domainCookies.get(session) ?? new Map<string, string>();
+          for (const c of ur.headers['set-cookie'] ?? []) {
+            const name = c.split('=')[0].trim();
+            const d = cookieDomain(c);
+            if (d === undefined || expiresCookie(c)) dom.delete(name);
+            else if (dom.size < 50 || dom.has(name)) dom.set(name, d);
+          }
+          domainCookies.set(session, dom);
+        }
         // Un documento que redirige a otra web: el panel no deja a la celda ir allí y se quedaría en blanco.
         // Se le dice adónde iba (solo el origen: la dirección entera puede llevar un testigo). Las cookies que
         // traía la redirección se conservan.
@@ -517,7 +607,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
     const ctx: Ctx = { target, proxyOrigin: originFor(auth.session) };
     if (url === PREFIX + '/agent.js') {
       // El agente nace sabiendo con quién puede hablar: el origen del panel va incrustado, no se lee de la página. (H-1)
-      const body = `var __VK_PANEL=${JSON.stringify(panelOrigin)},__VK_APIS=${JSON.stringify(apis.map((a) => a.origin))};\n${opts.agentSource}`;
+      const body = `var __VK_PANEL=${JSON.stringify(panelOrigin)},__VK_APIS=${JSON.stringify(apis.map((a) => a.url.origin))},__VK_TARGETS=${JSON.stringify(targets)};\n${opts.agentSource}`;
       res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }).end(body);
       return;
     }
@@ -526,7 +616,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
       const m = /^\/(\d+)(\/.*)$/.exec(url.slice(PREFIX.length + 4));
       const api = m ? apis[Number(m[1])] : undefined;
       if (!m || !api) return deny(res, 404);
-      return forward(req, res, api, m[2], ctx, false, `${PREFIX}/api/${m[1]}`);
+      return forward(req, res, api.url, m[2], ctx, false, `${PREFIX}/api/${m[1]}`, undefined, api.cookies === 'own' ? { session: auth.session, index: Number(m[1]) } : undefined);
     }
     if (url.startsWith(PREFIX + '/')) return deny(res, 404);
     // Lo que la sesión manda se recuerda por nombre, para la captura. Una petición sin cookies no borra nada
@@ -537,7 +627,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
       if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
     }
     seenCookies.set(auth.session, jar);
-    forward(req, res, target, url, ctx, true, undefined, jar);
+    forward(req, res, target, url, ctx, true, undefined, jar, undefined, auth.session);
   };
 
   const server = http.createServer((req, res) => {
```

**`src/core/sync.ts`**

```diff
--- a/src/core/sync.ts
+++ b/src/core/sync.ts
@@ -14,6 +14,7 @@ export type AgentEvent =
   | { t: 'miss'; kind: string }
   | { t: 'hint'; kind: string; origin: string }
   | { t: 'error'; kind: string; msg: string }
+  | { t: 'left'; origin: string }
   | { t: 'answer'; id: number; data: unknown };
 
 /** Lo que el panel manda a un agente. */
```

**`media/agent.js`**

```diff
--- a/media/agent.js
+++ b/media/agent.js
@@ -6,6 +6,16 @@
   'use strict';
   var PANEL = typeof __VK_PANEL === 'string' ? __VK_PANEL : '';
   var APIS = typeof __VK_APIS === 'object' && __VK_APIS ? __VK_APIS : [];
+  // Los orígenes de la propia app (su dominio con y sin «www», por http y https). Dentro de la celda la app
+  // vive en el origen del proxy: lo que la nombre con su dominio completo se convierte en una ruta local.
+  var TARGETS = typeof __VK_TARGETS === 'object' && __VK_TARGETS ? __VK_TARGETS : [];
+  function localPath(u) {
+    try {
+      var url = new URL(String(u), location.href);
+      if (url.origin === location.origin || TARGETS.indexOf(url.origin) < 0) return null;
+      return url.pathname + url.search + url.hash;
+    } catch (e) { return null; }
+  }
   var name = String(window.name || '');
   // Una celda: incrustada, con panel conocido y con el nombre que pone el panel.
   var inCell = window.top !== window && !!PANEL && name.indexOf('vk:') === 0;
@@ -14,16 +24,22 @@
   // ── API en otro puerto: la página la llama por el proxy, que la reenvía con el origen de la app.
   // Se instala también fuera de una celda (la captura abre la página en primer nivel) (N-5).
   function viaProxy(u) {
+    // La propia app llamada con su dominio completo: es una petición local, no una API aparte.
+    var own = localPath(u);
+    if (own !== null) return own;
     try {
       var url = new URL(String(u), location.href);
       var i = APIS.indexOf(url.origin);
       return i < 0 ? null : '/__viewkeeper/api/' + i + url.pathname + url.search;
     } catch (e) { return null; }
   }
+  // Una llamada a otro origen que falla suele ser CORS: la API admite el origen de la app y no el de la celda.
+  // De esta máquina, por http o https; de fuera, solo https (lo único que el proxy acepta reenviar).
   function isLocalOther(u) {
     try {
       var url = new URL(String(u), location.href);
-      return url.origin !== location.origin && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
+      if (url.origin === location.origin) return false;
+      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) ? /^https?:$/.test(url.protocol) : url.protocol === 'https:';
     } catch (e) { return false; }
   }
   if ((APIS.length || inCell) && !window.__vkApi) {
@@ -81,6 +97,46 @@
     try { var o = new URL(String(u), location.href).origin; if (!hinted[o]) { hinted[o] = true; send({ t: 'hint', kind: 'api', origin: o }); } } catch (e) { /* nada */ }
   };
 
+  // ── la app nombrada con su dominio completo, y las salidas del mosaico.
+  // Un enlace o un formulario que apunta al dominio real sacaría a la celda del proxy (y el panel no deja:
+  // se quedaría en blanco). Justo antes de que actúe se le pone la ruta local, y el clic sigue su curso
+  // normal: el enrutador de una SPA, el menú contextual, todo ve un enlace de la propia página.
+  function attr(el, name) { try { return el.getAttribute(name); } catch (e) { return null; } }
+  function fixLink(ev) {
+    var t = ev.target;
+    var a = t && t.closest ? t.closest('a[href],area[href]') : null;
+    if (!a) return;
+    var p = localPath(attr(a, 'href'));
+    if (p !== null) a.setAttribute('href', p);
+  }
+  ['pointerdown', 'click', 'auxclick', 'keydown'].forEach(function (k) { document.addEventListener(k, fixLink, true); });
+  document.addEventListener('submit', function (ev) {
+    var f = ev.target;
+    var by = ev.submitter;
+    if (by && attr(by, 'formaction')) { var q = localPath(attr(by, 'formaction')); if (q !== null) by.setAttribute('formaction', q); }
+    if (f && attr(f, 'action')) { var p = localPath(attr(f, 'action')); if (p !== null) f.setAttribute('action', p); }
+  }, true);
+  // Lo que navega por código (location.href = …) no pasa por un enlace: se caza con la API de navegación.
+  // A la propia app, se va a la ruta local; a otra web, no se va (la celda quedaría en blanco) y se avisa
+  // al panel con el origen, para que diga qué ha pasado.
+  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
+    window.navigation.addEventListener('navigate', function (ev) {
+      if (!ev.cancelable || ev.hashChange || ev.downloadRequest) return;
+      var dest;
+      try { dest = new URL(ev.destination.url); } catch (e) { return; }
+      if (dest.origin === location.origin || !/^https?:$/.test(dest.protocol)) return;
+      var p = localPath(dest.href);
+      if (p !== null) {
+        if (ev.formData) return; // un formulario con cuerpo: ya se corrigió en «submit»; si no, se deja estar
+        ev.preventDefault();
+        if (ev.navigationType === 'replace') location.replace(p); else location.assign(p);
+        return;
+      }
+      ev.preventDefault();
+      send({ t: 'left', origin: dest.origin });
+    });
+  }
+
   // ── errores de la página: para ver de un vistazo que «en el móvil falla y en el escritorio no».
   // El agente se carga antes que los scripts de la página, así que oye también los de arranque. El texto
   // se queda en el panel, que lo enseña en el rótulo de la celda; al host solo llega la cuenta.
```

**`src/webview/panel.ts`**

```diff
--- a/src/webview/panel.ts
+++ b/src/webview/panel.ts
@@ -47,6 +47,7 @@ export interface PanelText {
   zoom: string;
   follow: string;
   errors: string;
+  left: string;
 }
 export interface PanelState {
   name: string;
@@ -441,6 +442,24 @@ window.addEventListener('message', (ev: MessageEvent) => {
       if (state?.sonda) vscode.postMessage({ t: 'fromCell', cell: id, ev: m });
       return;
     }
+    if (m.t === 'left') {
+      // La página quiso irse a otra web: no cabe en la celda (se quedaría en blanco). Se dice un momento en su rótulo.
+      if (typeof m.origin !== 'string' || !state) return;
+      let host = '';
+      try {
+        host = new URL(m.origin).host;
+      } catch {
+        return;
+      }
+      l.fig.querySelector('.fuera')?.remove();
+      const p = document.createElement('p');
+      p.className = 'fuera';
+      p.textContent = `${state.text.left}: ${host}`;
+      l.fig.querySelector('figcaption')?.after(p);
+      setTimeout(() => p.remove(), 6000);
+      vscode.postMessage({ t: 'left', cell: id, origin: m.origin.slice(0, 80) });
+      return;
+    }
     if (m.t === 'hello' || m.t === 'ready' || m.t === 'nav') {
       if (typeof m.url !== 'string') return;
       const cap = l.fig.querySelector('.ruta');
```

**`src/webview/shell.ts`**

```diff
--- a/src/webview/shell.ts
+++ b/src/webview/shell.ts
@@ -52,6 +52,7 @@ export const PANEL_CSS = `
   figcaption .err[hidden] { display: none; }
   .errs { margin: 0 0 6px; padding: 6px 8px 6px 22px; max-height: 120px; overflow: auto; border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100); }
   .errs li { white-space: pre-wrap; overflow-wrap: anywhere; }
+  .fuera { margin: 0 0 6px; padding: 4px 8px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); }
   figcaption .ses { font-size: 11px; padding: 0 5px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
   .escena { overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: #fff; }
   iframe { border: 0; transform-origin: 0 0; display: block; background: #fff; }
```

**`src/vscode/commands.ts`**

```diff
--- a/src/vscode/commands.ts
+++ b/src/vscode/commands.ts
@@ -182,7 +182,8 @@ async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic, fresh = true):
   if (current) current.dispose();
   const cfg = vscode.workspace.getConfiguration('viewkeeper');
   // La lista puede venir escrita en los ajustes del repositorio: cada origen se comprueba antes de usarlo (N-6).
-  const declared = (cfg.get<string[]>('apiOrigins') ?? []).filter((o) => typeof o === 'string' && isLoopback(o)).slice(0, 8);
+  // De esta máquina o, por https, de fuera. El proxy vuelve a filtrarla (parseApis); aquí se comprueba CORS.
+  const declared = (cfg.get<string[]>('apiOrigins') ?? []).filter((o) => typeof o === 'string' && (isLoopback(o) || /^https:\/\//i.test(o))).slice(0, 8);
   const trusted = (await Promise.all(declared.map(async (o) => ((await apiTrustsApp(o, next.target)) ? o : undefined)))).filter((o): o is string => o !== undefined);
   for (const o of declared) if (!trusted.includes(o)) out.warn(`apiOrigins: ${o} does not allow ${next.target} by CORS; not routed through the proxy`);
   current = await PanelHost.open(ctx, next, {
@@ -221,7 +222,9 @@ async function offerApi(ctx: vscode.ExtensionContext, raw: string): Promise<void
   } catch {
     return;
   }
-  if (offered.has(origin) || !isLoopback(origin) || !current) return;
+  // Cada origen se mira una vez, y como mucho doce por sesión: el aviso viene de la página.
+  if (offered.has(origin) || offered.size >= 12 || !current) return;
+  if (!isLoopback(origin) && !origin.startsWith('https://')) return;
   offered.add(origin);
   // El aviso viene de la página, y una página puede fabricarlo: solo se ofrece si la API ya se fía de esta app.
   if (!(await apiTrustsApp(origin, current.mosaic().target))) {
@@ -230,7 +233,10 @@ async function offerApi(ctx: vscode.ExtensionContext, raw: string): Promise<void
   }
   const yes = t('Yes');
   const where = folder() ? t('this workspace') : t('your user settings');
-  const pick = await vscode.window.showInformationMessage(t('Your app calls {0} and the browser is blocking it inside the mosaic. Route it through ViewKeeper? It will be saved in "viewkeeper.apiOrigins" of {1}.', origin, where), yes, t('No'));
+  const ask = t('Your app calls {0} and the browser is blocking it inside the mosaic. Route it through ViewKeeper? It will be saved in "viewkeeper.apiOrigins" of {1}.', origin, where);
+  // De fuera de esta máquina: se dice qué viaja.
+  const far = isLoopback(origin) ? '' : ' ' + t('It is on another server: those calls will go out from this computer with the origin of your app, with the cookies that server sets and the ones your app set for its domain.');
+  const pick = await vscode.window.showInformationMessage(ask + far, yes, t('No'));
   if (pick !== yes || !current) return;
   const cfg = vscode.workspace.getConfiguration('viewkeeper');
   const list = [...new Set([...(cfg.get<string[]>('apiOrigins') ?? []), origin])];
```

**`src/vscode/panelHost.ts`**

```diff
--- a/src/vscode/panelHost.ts
+++ b/src/vscode/panelHost.ts
@@ -76,6 +76,7 @@ function texts(): PanelText {
     zoom: t('Enlarge this cell (Esc to go back)'),
     follow: t('Follow editor'),
     errors: t('JavaScript errors on this page'),
+    left: t('Outside the mosaic, not opened'),
   };
 }
 
@@ -179,6 +180,13 @@ export class PanelHost implements vscode.Disposable {
       opts.onHint?.(m.origin);
     } else if (m.t === 'miss' && typeof m.cell === 'string') {
       this.misses.set(m.cell, (this.misses.get(m.cell) ?? 0) + 1);
+    } else if (m.t === 'left' && typeof m.cell === 'string' && typeof m.origin === 'string') {
+      // Solo el origen, y solo si lo es: el texto viene de la página.
+      try {
+        opts.log?.(`cell ${m.cell}: the page tried to go to ${new URL(m.origin).origin}, outside the mosaic; not followed`);
+      } catch {
+        /* no era un origen */
+      }
     } else if (m.t === 'trip') {
       opts.log?.(`row ${m.group}: cells kept navigating each other, navigation sync paused`);
     } else if (m.t === 'fromCell' && m.cell && m.ev && this.sonda) {
```

**`l10n/bundle.l10n.es.json`**

```diff
--- a/l10n/bundle.l10n.es.json
+++ b/l10n/bundle.l10n.es.json
@@ -81,5 +81,7 @@
   "Route for this row": "Ruta de esta fila",
   "Pick a route or type one (/pricing)": "Elige una ruta o escribe una (/precios)",
   "Go to this route": "Ir a esta ruta",
-  "Reopen {0}": "Reabrir {0}"
+  "Reopen {0}": "Reabrir {0}",
+  "Outside the mosaic, not opened": "Fuera del mosaico, no se ha abierto",
+  "It is on another server: those calls will go out from this computer with the origin of your app, with the cookies that server sets and the ones your app set for its domain.": "Está en otro servidor: esas llamadas saldrán de este ordenador con el origen de tu app, con las cookies que ponga ese servidor y las que tu app haya puesto para su dominio."
 }
```

**`eslint.config.mjs`**

```diff
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -19,7 +19,7 @@ export default [
   {
     // El agente corre dentro de la página del usuario: ES2017, script clásico, sin dependencias.
     files: ['media/agent.js'],
-    languageOptions: { ecmaVersion: 2017, sourceType: 'script', globals: { ...globals.browser, __VK_PANEL: 'readonly', __VK_APIS: 'readonly' } },
+    languageOptions: { ecmaVersion: 2017, sourceType: 'script', globals: { ...globals.browser, __VK_PANEL: 'readonly', __VK_APIS: 'readonly', __VK_TARGETS: 'readonly' } },
     rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], eqeqeq: ['error', 'smart'], 'no-redeclare': 'error' },
   },
 ];
```


Pruebas nuevas de la fase: `test/unit/mejoras.test.ts` (P-66 qué sabe el agente y qué API se descartan, P-67 la API de otro servidor y sus cookies, P-68 a quién se le ofrece) y los casos M3 de `test/browser/r5-mejoras.ts`.

### 5.D · Fase D — ventanas remotas, macOS y Cursor (M12, M13)

Commits:

- `0e59fbe` Fase D: ventanas remotas por el puerto reenviado (M12), con sonda en una ventana WSL real
- `a9edd4e` Fase D: macOS en la matriz del CI (M13)

Qué consigue:

- **M12:** en una ventana remota la extensión ya no se niega. El proxy corre en la máquina remota junto al servidor de desarrollo; VS Code trae su puerto a esta máquina y las celdas entran por él. El proxy acepta ese puerto y el suyo, y ningún otro. Donde eso no es posible (VS Code en el navegador, que saca los puertos por otro dominio) lo dice con un mensaje en vez de abrir un panel en blanco.
- **M13:** macOS entra en la matriz del CI.

Criterio de salida: P-69 en verde; `test/integration/run-remoto.ts` en verde en WSL; la tarea D-2; el CI en verde en los tres sistemas.

Tareas que no son código:

- **D-1 · Quitar del README «solo ventanas locales»** y poner lo que se haya comprobado de verdad (WSL, y SSH o contenedores si D-2 sale bien).
- **D-2 · Probar M12 en un contenedor o por SSH.** Con Docker Desktop, que está instalado: una ventana «Dev Containers» sobre una carpeta con un servidor mínimo, adaptando `run-remoto.ts` (cambia el nombre de la autoridad remota). Si no carga, M12 se publica como «WSL» y se declara el resto.
- **D-3 · Cursor.** Instalarlo y pasar `VIEWKEEPER_VSCODE_EXE=<Cursor.exe> npm run test:integration`. Es la misma suite que ya pasó en VSCodium.
- **D-4 · macOS.** Se comprueba solo al abrir el PR de la fase: el CI lo ejecuta. Si el banco no encuentra Chrome en esa ruta, se corrige `AUD_CHROME`.

Código de la fase:

**`src/core/proxy.ts`**

```diff
--- a/src/core/proxy.ts
+++ b/src/core/proxy.ts
@@ -114,6 +114,13 @@ export interface RunningProxy {
   gateCookie: string;
   /** Origen que ve la celda: http://s-<sesion>-<etiqueta>.localhost:<puerto> */
   originFor(session: string): string;
+  /**
+   * En una ventana remota las celdas no llegan a `port` (está en la otra máquina) sino al puerto local por el que
+   * VS Code lo reenvía. Hay que darlo antes de cargar ninguna celda: cambia el origen que ven.
+   */
+  setPublicPort(port: number): void;
+  /** El puerto por el que entran las celdas: el reenviado si lo hay, o el propio. */
+  shownPort(): number;
   /** URL con la que una celda entra por primera vez: deja la cookie de entrada y redirige. */
   entryUrl(session: string, path: string): string;
   /** URL de un solo uso para la captura: entra y reproduce las cookies de la sesión. No lleva el testigo. */
@@ -434,14 +441,22 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
   const agentHttp = new http.Agent({ keepAlive: true });
   const agentHttps = new https.Agent({ keepAlive: true });
   let port = 0;
+  let publicPort = 0;
   let panelOrigin = '';
   let gateCookie = '';
 
-  const originFor = (session: string): string => `http://s-${session}-${tag}.localhost:${port}`;
+  const shownPort = (): number => publicPort || port;
+  const originFor = (session: string): string => `http://s-${session}-${tag}.localhost:${shownPort()}`;
+  /** El origen por el propio puerto del proxy: para quien corre en la misma máquina que él (la captura). */
+  const innerOrigin = (session: string): string => `http://s-${session}-${tag}.localhost:${port}`;
+  /** La sesión de un Host, entre por el puerto propio o por el reenviado. Cualquier otro Host se rechaza. */
+  const sessionOf = (host: string | undefined): string | null => sessionFromHost(host, port, tag) ?? (publicPort ? sessionFromHost(host, publicPort, tag) : null);
+  /** El origen por el que llegó esta petición (ya validado por sessionOf): es el que la página tiene por suyo. */
+  const cameBy = (req: http.IncomingMessage): string => `http://${String(req.headers.host).toLowerCase()}`;
   const scriptTag = `<script src="${PREFIX}/agent.js"></script>`;
 
   const authorize = (req: http.IncomingMessage): { session: string } | { status: number } => {
-    const session = sessionFromHost(req.headers.host, port, tag);
+    const session = sessionOf(req.headers.host);
     if (session === null) return { status: 421 };
     if (!crossSiteAllowed(req)) return { status: 403 };
     // Sin cookie solo pasa lo que el navegador marca como lanzado por una página de ESTE origen, que para
@@ -596,7 +611,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
 
   const handle = (req: http.IncomingMessage, res: http.ServerResponse): void => {
     const url = req.url ?? '/';
-    const session0 = sessionFromHost(req.headers.host, port, tag);
+    const session0 = sessionOf(req.headers.host);
     if (session0 === null) {
       res.writeHead(421, { 'content-type': 'text/plain' }).end('Host no admitido');
       return;
@@ -604,7 +619,7 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
     if (url.startsWith(PREFIX + '/enter?')) return enter(url, session0, res);
     const auth = authorize(req);
     if ('status' in auth) return deny(res, auth.status);
-    const ctx: Ctx = { target, proxyOrigin: originFor(auth.session) };
+    const ctx: Ctx = { target, proxyOrigin: cameBy(req) };
     if (url === PREFIX + '/agent.js') {
       // El agente nace sabiendo con quién puede hablar: el origen del panel va incrustado, no se lee de la página. (H-1)
       const body = `var __VK_PANEL=${JSON.stringify(panelOrigin)},__VK_APIS=${JSON.stringify(apis.map((a) => a.url.origin))},__VK_TARGETS=${JSON.stringify(targets)};\n${opts.agentSource}`;
@@ -644,13 +659,12 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
   // WebSocket (recarga en caliente): túnel TCP con la petición reescrita.
   server.on('upgrade', (req, socket: Duplex, head: Buffer) => {
     const auth = authorize(req);
-    const session = 'session' in auth ? auth.session : '';
-    // Un WebSocket no pasa por CORS: se exige que lo abra la propia celda.
-    if ('status' in auth || req.headers.origin !== originFor(session)) {
+    // Un WebSocket no pasa por CORS: se exige que lo abra la propia celda (el origen por el que ella entró).
+    if ('status' in auth || req.headers.origin !== cameBy(req)) {
       socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
       return;
     }
-    const ctx: Ctx = { target, proxyOrigin: originFor(session) };
+    const ctx: Ctx = { target, proxyOrigin: cameBy(req) };
     const headers = rewriteRequestHeaders(req.headers, ctx, false);
     headers.connection = 'Upgrade';
     headers.upgrade = req.headers.upgrade ?? 'websocket';
@@ -712,8 +726,13 @@ export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
         captureUrl: (session, path) => {
           const k = randomBytes(18).toString('hex');
           tickets.set(k, { session, expires: now() + TICKET_MS });
-          return `${originFor(session)}${PREFIX}/enter?k=${k}&to=${encodeURIComponent(safeLocalPath(path))}`;
+          // La captura la hace un navegador de la máquina del proxy: entra por su puerto, no por el reenviado.
+          return `${innerOrigin(session)}${PREFIX}/enter?k=${k}&to=${encodeURIComponent(safeLocalPath(path))}`;
+        },
+        setPublicPort: (p) => {
+          publicPort = Number.isInteger(p) && p > 0 && p < 65536 && p !== port ? p : 0;
         },
+        shownPort,
         setPanelOrigin: (o) => {
           panelOrigin = o;
         },
```

**`src/vscode/commands.ts`**

```diff
--- a/src/vscode/commands.ts
+++ b/src/vscode/commands.ts
@@ -133,7 +133,6 @@ async function pickTarget(reopen?: Mosaic): Promise<Target | Mosaic | undefined>
 
 /** Abrir una dirección cualquiera, haya o no un mosaico abierto (lo sustituye, con sus dispositivos). */
 async function openUrl(ctx: vscode.ExtensionContext): Promise<void> {
-  if (remote()) return;
   const now = current?.mosaic();
   const rows = now ? [...new Set(now.cells.map((c) => c.group))].sort((a, b) => a - b) : [];
   // Una fila: se propone la dirección con la ruta que enseña. Una matriz: solo el origen (cada fila tiene la suya).
@@ -150,11 +149,19 @@ async function openUrl(ctx: vscode.ExtensionContext): Promise<void> {
   await show(ctx, { v: 1, name: new URL(target.origin).host, target: target.origin, cells, sync });
 }
 
-/** En una ventana remota dice por qué no y devuelve true. Se mira al empezar cada comando, antes de preguntar nada. */
-function remote(): boolean {
-  if (!vscode.env.remoteName) return false;
-  void vscode.window.showWarningMessage(t('ViewKeeper works in local windows for now. In a remote window ({0}) the cells cannot reach your dev server.', vscode.env.remoteName));
-  return true;
+/**
+ * En una ventana remota (WSL, SSH, contenedor) la extensión, el proxy y el servidor de desarrollo corren en la
+ * otra máquina, y las celdas se pintan en esta. VS Code trae el puerto del proxy a un puerto local: las celdas
+ * entran por él. Si lo que devuelve no es un puerto de esta máquina (VS Code en el navegador: sale por otro
+ * dominio), no hay «*.localhost» que valga y se dice.
+ */
+async function expose(port: number): Promise<number | undefined> {
+  if (!vscode.env.remoteName) return port;
+  const ext = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${port}`));
+  const m = /^(?:localhost|127\.0\.0\.1)(?::(\d+))?$/.exec(ext.authority);
+  if (ext.scheme !== 'http' || !m) return undefined;
+  out.info(`remote window (${vscode.env.remoteName}): proxy port ${port} forwarded to local port ${m[1] ?? '80'}`);
+  return Number(m[1] ?? 80);
 }
 
 const warned = new Set<string>();
@@ -164,9 +171,6 @@ const warned = new Set<string>();
  * ahí se sigue la redirección al dominio principal y, si es una web publicada, los clics y la escritura nacen apagados.
  */
 async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic, fresh = true): Promise<void> {
-  // En una ventana remota (WSL, SSH, contenedor, Codespaces) el proxy corre en la otra máquina y las celdas,
-  // que se pintan en esta, no lo alcanzan: mejor decirlo que abrir un panel en blanco (P-46).
-  if (remote()) return;
   const capped = capCells(mosaic.cells);
   if (capped.dropped > 0) void vscode.window.showWarningMessage(t('A mosaic holds up to {0} cells; the rest were left out.', MAX_CELLS));
   let next: Mosaic = { ...mosaic, cells: capped.cells };
@@ -193,6 +197,7 @@ async function show(ctx: vscode.ExtensionContext, mosaic: Mosaic, fresh = true):
     onHint: (origin) => void offerApi(ctx, origin),
     routes: () => projectRoutes(folder()),
     follow: followOn,
+    expose,
   });
   const host = current;
   // Se recuerda cómo queda: al abrirlo, cada vez que cambia de forma y, con un respiro, cuando una celda navega.
@@ -245,7 +250,6 @@ async function offerApi(ctx: vscode.ExtensionContext, raw: string): Promise<void
 }
 
 async function openDefault(ctx: vscode.ExtensionContext): Promise<void> {
-  if (remote()) return;
   // Con un mosaico abierto, el botón de la barra de estado lo trae al frente en vez de abrir otro.
   if (current) {
     current.panel.reveal();
@@ -263,7 +267,6 @@ async function openDefault(ctx: vscode.ExtensionContext): Promise<void> {
 
 /** Elegir rutas del proyecto y dispositivos, y abrir la matriz: una fila por ruta, una columna por dispositivo. */
 async function openMatrix(ctx: vscode.ExtensionContext): Promise<void> {
-  if (remote()) return;
   const target = current ? { origin: current.mosaic().target, path: '/' } : await pickTarget();
   if (!target) return;
   const routes = await projectRoutes(folder());
@@ -357,7 +360,6 @@ async function save(): Promise<void> {
 }
 
 async function openSaved(ctx: vscode.ExtensionContext): Promise<void> {
-  if (remote()) return;
   const f = folder();
   if (!f) {
     void vscode.window.showInformationMessage(t('Open a folder to save mosaics with your project.'));
```

**`src/vscode/panelHost.ts`**

```diff
--- a/src/vscode/panelHost.ts
+++ b/src/vscode/panelHost.ts
@@ -23,6 +23,11 @@ export interface HostOptions {
   routes?: () => Promise<Route[]>;
   /** ¿Está encendido «seguir al editor»? Se pregunta cada vez que se pinta la barra. */
   follow?: () => boolean;
+  /**
+   * En una ventana remota: trae el puerto del proxy a esta máquina y devuelve el puerto local, o undefined si
+   * desde aquí solo se llega por otro dominio (VS Code en el navegador), donde las celdas no pueden funcionar.
+   */
+  expose?: (port: number) => Promise<number | undefined>;
 }
 
 export interface Metrics {
@@ -140,6 +145,14 @@ export class PanelHost implements vscode.Disposable {
     let agentSource = fs.readFileSync(path.join(ctx.extensionPath, 'media', 'agent.js'), 'utf8');
     if (opts.sonda) agentSource = agentSource.replace('/*SONDA-INICIO*/', opts.sonda.inicio).replace('/*SONDA*/', opts.sonda.pregunta);
     const proxy = await startProxy({ target: mosaic.target, agentSource, log: opts.log, pages: proxyPages(), ...opts.proxy });
+    if (opts.expose) {
+      const shown = await opts.expose(proxy.port).catch(() => undefined);
+      if (shown === undefined) {
+        await proxy.close();
+        throw new Error(vscode.l10n.t('ViewKeeper cannot open a mosaic in this window: its cells need the preview on a local port, and from here it is only reachable through another domain.'));
+      }
+      proxy.setPublicPort(shown);
+    }
     const panel = vscode.window.createWebviewPanel('viewkeeper.mosaic', `ViewKeeper · ${mosaic.name}`, vscode.ViewColumn.Active, {
       enableScripts: true,
       retainContextWhenHidden: true,
@@ -280,7 +293,7 @@ export class PanelHost implements vscode.Disposable {
 
   /** Se escribe una vez: la política admite cualquier sesión de ESTE proxy (http://*.localhost:<su puerto>). */
   private writeHtml(): void {
-    this.panel.webview.html = html(this.panel.webview, this.extensionUri, `http://*.localhost:${this.proxy.port}`);
+    this.panel.webview.html = html(this.panel.webview, this.extensionUri, `http://*.localhost:${this.proxy.shownPort()}`);
   }
 
   /** Sustituye el mosaico del panel. Las celdas que siguen igual no se recargan. */
```

**`l10n/bundle.l10n.es.json`**

```diff
--- a/l10n/bundle.l10n.es.json
+++ b/l10n/bundle.l10n.es.json
@@ -48,7 +48,6 @@
   "Remove": "Quitar",
   "No cells. Add a device to start.": "No hay celdas. Añade un dispositivo para empezar.",
   "session": "sesión",
-  "ViewKeeper works in local windows for now. In a remote window ({0}) the cells cannot reach your dev server.": "Por ahora ViewKeeper funciona en ventanas locales. En una ventana remota ({0}) las celdas no llegan a tu servidor de desarrollo.",
   "This mosaic is not valid.": "Este mosaico no es válido.",
   "This mosaic uses devices this computer does not have ({0}); they are shown as Laptop. Add them to \"viewkeeper.customDevices\".": "Este mosaico usa dispositivos que este equipo no tiene ({0}); se muestran como Laptop. Añádelos en \"viewkeeper.customDevices\".",
   "Device for this cell": "Dispositivo de esta celda",
@@ -83,5 +82,6 @@
   "Go to this route": "Ir a esta ruta",
   "Reopen {0}": "Reabrir {0}",
   "Outside the mosaic, not opened": "Fuera del mosaico, no se ha abierto",
-  "It is on another server: those calls will go out from this computer with the origin of your app, with the cookies that server sets and the ones your app set for its domain.": "Está en otro servidor: esas llamadas saldrán de este ordenador con el origen de tu app, con las cookies que ponga ese servidor y las que tu app haya puesto para su dominio."
+  "It is on another server: those calls will go out from this computer with the origin of your app, with the cookies that server sets and the ones your app set for its domain.": "Está en otro servidor: esas llamadas saldrán de este ordenador con el origen de tu app, con las cookies que ponga ese servidor y las que tu app haya puesto para su dominio.",
+  "ViewKeeper cannot open a mosaic in this window: its cells need the preview on a local port, and from here it is only reachable through another domain.": "ViewKeeper no puede abrir un mosaico en esta ventana: sus celdas necesitan la vista previa en un puerto de este ordenador, y desde aquí solo se llega a ella por otro dominio."
 }
```

**`esbuild.mjs`**

```diff
--- a/esbuild.mjs
+++ b/esbuild.mjs
@@ -9,6 +9,8 @@ const builds = tests
   ? [
       // La sonda que VS Code carga con --extensionTestsPath. Nunca entra en el paquete (out/ está en .vscodeignore).
       { entryPoints: ['test/integration/sonda.ts'], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: 'out/sonda.js', external: ['vscode'], logLevel: 'info' },
+      // La sonda de ventana remota (test/integration/run-remoto.ts): corre en el host de extensiones de WSL.
+      { entryPoints: ['test/integration/sonda-remota.ts'], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: 'out/sonda-remota.js', external: ['vscode'], logLevel: 'info' },
     ]
   : [
       { entryPoints: ['src/extension.ts'], bundle: true, format: 'cjs', platform: 'node', target: 'node20', outfile: 'dist/extension.js', external: ['vscode'], sourcemap: !production, minify: production, logLevel: 'info' },
```

**`.github/workflows/ci.yml`**

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -16,7 +16,7 @@ jobs:
     strategy:
       fail-fast: false
       matrix:
-        os: [ubuntu-latest, windows-latest]
+        os: [ubuntu-latest, windows-latest, macos-latest]
     steps:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
       - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
@@ -34,11 +34,16 @@ jobs:
       - name: Browser bench (panel, agent and proxy in headless Chrome)
         if: runner.os == 'Windows'
         run: npm run test:browser
+      - name: Browser bench (panel, agent and proxy in headless Chrome)
+        if: runner.os == 'macOS'
+        env:
+          AUD_CHROME: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
+        run: npm run test:browser
       - name: Integration tests inside VS Code (Linux needs a display)
         if: runner.os == 'Linux'
         run: xvfb-run -a npm run test:integration
       - name: Integration tests inside VS Code
-        if: runner.os == 'Windows'
+        if: runner.os != 'Linux'
         run: npm run test:integration
       - name: Package
         run: npx vsce package --no-dependencies -o viewkeeper.vsix
```


Pruebas nuevas de la fase: `test/unit/mejoras.test.ts` (P-69), `test/integration/sonda-remota.ts` y `test/integration/run-remoto.ts`.

### 5.E · Fase E — escáner de seguridad (M15)

No tiene código propio. Con la fase C fusionada en una rama (es la que más toca la red), pasar `/claude-security scan` sobre el repositorio entero. Criterio de salida: ningún hallazgo de gravedad alta sin resolver; los medios, resueltos o aceptados por escrito en `docs/EJECUCION.md`. Lo que salga se corrige antes de publicar la 0.3.0.

## 6. Auditoría

Tres revisiones, en este orden, todas antes de publicar.

**Auditoría A — proxy, agente y sondas de red.** 16 defectos reproducidos ejecutando (2 de gravedad media-alta, 5 medios, 9 bajos) y 30 mutantes que ninguna prueba detectaba. Los dos más serios: un `fetch` de la página a la propia app con una ruta «//host» salía a otro servidor con sus cabeceras de autorización (A-1), y un proceso local podía usar el bote de cookies de una API de fuera falsificando `Sec-Fetch-Site` (A-2). Los demás: `<base href>` al dominio real, `form.submit()`, las marcas de Domain solo en memoria (ahora viven en el navegador como cookies `__vk_d_*`), el `Referer` completo hacia una API, el nombre de la cookie de entrada con dos máquinas remotas, la caducidad del bote, un `$` en el aviso de salida, formas crudas de `Location`, sondas sin plazo total, `0.0.0.0` tomado por web publicada y casos sueltos. Todos corregidos en `f364e3c`; cada arreglo tiene una prueba que falla si se deshace (comprobado con 13 mutantes, todos mueren).

**Auditoría B — panel, host, comandos y reparto.** 16 defectos (ninguno alto) y 27 mutantes supervivientes. Los principales: una orden en vuelo no se podía deshacer (B-1); «seguir al editor» devolvía la fila al volver al mismo fichero (B-2) y tomaba por páginas pruebas, historias y componentes (B-3: ahora exige el framework en el `package.json` del proyecto); una ruta sin HTML dejaba la fila muerta (B-10); y varios de colocación y foco. Todos corregidos en `a245abf` y `0bca2db`, con 16 mutantes comprobados (todos mueren).

**Escáner de seguridad** (`CLAUDE-SECURITY-20261120-071139/`, estado `verified`): 6 hallazgos, 3 medios y 3 bajos, todos 3/3 en el panel. F1 el tique de captura en la línea de órdenes del navegador; F2 identificadores de dispositivo de un mosaico del repositorio en un aviso de VS Code, que pinta enlaces `command:`; F3 la etiqueta de 32 bits por destino; F4 el proxy solo en IPv4 mientras el navegador prueba antes `::1`; F5 la captura reponía las cookies sin HttpOnly; F6 una web publicada escrita sin esquema se abría por http. Todos corregidos en `a4cc227`, con una prueba cada uno; F1 comprobado además con Chrome de verdad.

## 7. Publicación

| Versión | Lleva | Rama | Estado |
|---|---|---|---|
| 0.2.0 | Las fases A a E | `plan/mejoras` (PR #6) | Publicada el 20-11 |

Pasos de cada versión, los mismos que la 0.1.1: fusionar la rama en `main` por PR (el CI pasa en los tres sistemas), `README.md` y `README.es.md` con lo nuevo y sus límites, `CHANGELOG.md`, subir `version`, etiqueta `vX.Y.Z` y `node scripts/gh-runs.mjs release --esperar`. La publicación en las tiendas la hace el flujo.

Lo que hay que escribir en el README que hoy no está: los comandos y botones nuevos (Dirección ya está; faltan «Seguir al editor», la ruta del rótulo, el «+» de fila, ampliar, el contador de errores), el comportamiento en webs publicadas, y los límites de los apartados 5.B y 5.C.

## 8. Fuera de este plan

- **Inicio de sesión con Google, Microsoft o Auth0.** Sigue sin caber en una celda. Con M2 y M3, al menos, la celda ya dice por qué en vez de quedarse en blanco.
- **Emular densidad de píxeles, eventos táctiles o el modo oscuro del sistema por celda.** Un iframe no lo permite.
- **VS Code en el navegador** (vscode.dev, Codespaces en una pestaña). Las celdas necesitan `*.localhost`.

## 9. Si esto se retoma en otra sesión

- El código está en `main` desde el PR #6; la rama `plan/mejoras` guarda la historia fase a fase.
- Para regenerar este documento tras tocar una rama: `node docs/plan/montar.mjs`.
- Los guiones de los auditores estaban en copias de trabajo aparte (`viewkeeper-aud-a`, `viewkeeper-aud-b`); se retiraron al publicar. Los de comprobación propios, en `auditoria-plan/` (sin versionar).
- Para comprobarlo todo de nuevo: `npm run check`, `npm run test:browser`, `VIEWKEEPER_VSCODE_EXE=<Code.exe> npm run test:integration` y, para la ventana remota, `VIEWKEEPER_VSCODE_EXE=<Code.exe> node test/integration/run-remoto.ts Ubuntu` (instala el servidor de VS Code en la distro, unos 700 MB en `~/.vscode-server`; la sonda de este plan lo retiró al terminar).
