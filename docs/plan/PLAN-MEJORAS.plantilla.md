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

{{commits:b3199bb..a8e5ee5}}

Qué consigue:

- **M1:** al abrir una web publicada, la sincronización de clics y de escritura empieza apagada, la barra lo dice («Web publicada») y sale un aviso una vez por web. El desplazamiento y la navegación siguen sincronizados.
- **M2:** `ejemplo.com` se abre ya como `https://www.ejemplo.com`. Una redirección a otra web dentro de la celda enseña una página que lo explica en vez de dejarla en blanco.
- **M14:** el arranque de Chrome del banco pasa a un módulo compartido (`test/browser/cdp.ts`) y cuatro casos más dejan de depender de una pausa fija (ENV-1, ENV-f4, COK-1b, HUE-1).

Criterio de salida: P-57 a P-61 en verde; el banco completo en verde tres pasadas seguidas en local y una en el CI (Ubuntu y Windows); M1-1 del banco r5.

Tareas que no son código:

- **A-1 · M16, dependabot.** Hay 5 actualizaciones abiertas. Cuatro tienen el CI en verde: #1 `actions/upload-artifact` 7.0.2, #2 `softprops/action-gh-release` 3.0.4, #4 `actions/setup-node` 7.1.0 y #5 `@vscode/vsce` 4.1.1. La #3 (`globals` 17.14.0) está en rojo por el banco intermitente, no por la dependencia. Orden: fusionar la fase A, pedir a dependabot que rehaga la #3 sobre ese `main`, y fusionar las cinco con el CI en verde. La #5 es un salto de versión mayor de la herramienta que empaqueta y publica: antes de fusionarla, `npx vsce package` en local y comparar el contenido del VSIX con el de la 0.1.1.

Código de la fase:

{{codigo:b3199bb..a8e5ee5}}

Pruebas nuevas de la fase: `test/unit/mejoras.test.ts` (P-57 web publicada o desarrollo, P-58 alias, P-59 dominio principal, P-60 redirección que sale, P-61 apertura) y `test/browser/cdp.ts`.

### 5.B · Fase B — uso diario (M6, M7, M8, M9, M10, M11)

Commits:

{{commits:a8e5ee5..678dcf2}}

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

{{codigo:a8e5ee5..678dcf2}}

Pruebas nuevas de la fase: `test/unit/mejoras.test.ts` (P-62 mandar una fila a una ruta, P-63 del fichero a su ruta, P-64 añadir a una fila, P-65 si un servidor contesta), `test/browser/r5-mejoras.ts` y `test/integration/pruebas-mejoras.ts` (I-9 seguir al editor, I-10 ruta de la fila, errores y «+», I-11 reabrir lo último).

### 5.C · Fase C — la app con su dominio completo y API en otro servidor (M3, M4)

Commits:

{{commits:678dcf2..ccea38c}}

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

{{codigo:678dcf2..ccea38c}}

Pruebas nuevas de la fase: `test/unit/mejoras.test.ts` (P-66 qué sabe el agente y qué API se descartan, P-67 la API de otro servidor y sus cookies, P-68 a quién se le ofrece) y los casos M3 de `test/browser/r5-mejoras.ts`.

### 5.D · Fase D — ventanas remotas, macOS y Cursor (M12, M13)

Commits:

{{commits:ccea38c..a9edd4e}}

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

{{codigo:ccea38c..a9edd4e}}

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
