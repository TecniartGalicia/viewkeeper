# Entrega — ViewKeeper 0.1.0

Plan: `Desktop/Apps/proyectos varios/ideasVs/15-PLAN-EJECUCION.md` · Registro: `docs/EJECUCION.md`
Fecha: 2026-11-19
Fases cerradas: 4 de 5 técnicas, más la 5 (borradores) escrita. Gratuita, por decisión tuya.

## Lo primero: qué tienes que hacer tú

### 1. Publicar el lanzamiento en redes — es lo único que queda

Los textos están en `docs/LANZAMIENTO.md`: Reddit (r/webdev primero), dev.to (esquema), un hilo de X de tres tuits y un post de LinkedIn bilingüe. Los publicas tú desde tus cuentas; yo no publico en redes con automatización (X suspendió una cuenta nuestra por eso). El GIF para subir como imagen está en `media/shots/demo.gif`.

Una cosa que **no** hay que decir todavía: que en las demás extensiones no se puede iniciar sesión. Es probable, pero no lo he comprobado instalándolas. Lo medido —y lo que dicen los textos— es que dentro de un panel de VS Code, sin ayuda, no llega ni una cookie.

### 2. Revisión a los 30 días: 19 de diciembre

La puerta de la ficha: ≥ 500 instalaciones, alguna reseña o issue real. Si no llega, lo que se revisa es la ficha y el GIF, no el código.

## Qué funciona ya

| Qué | Dónde | Cómo comprobarlo |
|---|---|---|
| Extensión en el Marketplace | https://marketplace.visualstudio.com/items?itemName=argalla.viewkeeper | `code --install-extension argalla.viewkeeper`, arrancar un servidor de desarrollo y pulsar **ViewKeeper** en la barra de estado |
| Extensión en Open VSX (VSCodium, Cursor, Windsurf) | https://open-vsx.org/extension/argalla/viewkeeper | Ver «Comprobación final» abajo |
| Descarga directa | https://github.com/TecniartGalicia/viewkeeper/releases/tag/v0.1.0 | `viewkeeper-v0.1.0.vsix`, 100 KB |
| Repositorio público, MIT | https://github.com/TecniartGalicia/viewkeeper | CI verde en Ubuntu y Windows |
| Pruebas | en el repo | `npm ci && npm run check` (41 unitarias, tipos, lint, traducciones); `npm run test:browser` (64 casos en Chrome sin ventana); `npm run test:integration` (8 pruebas dentro de un VS Code real) |
| Demo grabada con la extensión de verdad | `media/shots/` | `VK_CODE=<Code.exe> node test/integration/grabar.ts foto` (o `demo`) la vuelve a grabar |

Publicar una versión nueva: subir `version` en `package.json` y `CHANGELOG.md`, commit en `main`, `git tag -a vX.Y.Z` y `git push origin vX.Y.Z`. El flujo comprueba, crea la release de GitHub y publica en las dos tiendas, con reintentos y saltándose lo que ya esté publicado.

## Qué falta

| Qué | Por qué |
|---|---|
| Publicar en redes | Es tuyo (tarea 1) |
| Cursor | No probado; VSCodium sí, con la suite entera en verde |
| macOS y Linux reales | El CI corre en Ubuntu (banco e integración en verde); macOS sin probar |
| Ventanas remotas (WSL, SSH, Codespaces) | No funciona: el proxy queda en la otra máquina. La extensión lo dice en vez de abrir un panel en blanco, y el README también |
| Inicio de sesión con un proveedor externo (Google, Auth0) | No cabe en una celda; declarado en el README |

## Decisiones que tomé yo

- **Todo lo que era Pro, libre y sin código de licencia.** No hay interruptor dormido como en CostKeeper: si un día se cobra, se añade la capa de CostKeeper. Afecta a: nada visible.
- **Cada fila del mosaico a la misma altura**, en vez de el mismo ancho para cada celda: con el mismo ancho, un portátil junto a un móvil salía al 32 % e ilegible. Con un alto mínimo de 240 px; si no cabe, la fila se parte en líneas.
- **Elegir dispositivo con el selector rápido del editor**, no con un desplegable dentro del panel: el desplegable cambiaba de dispositivo (o añadía una celda) con una flecha del teclado.
- **Los registros de «Diagnose» en inglés**, para que se puedan pegar en un informe de fallos.
- **No pasé el escáner `claude-security` antes de entregar.** En su lugar hubo tres auditorías independientes con reproducción ejecutable (dos sobre el prototipo y una sobre las fases 2 y 3), cuyos guiones de ataque corren ahora en CI. Si lo quieres igualmente: `/claude-security scan codebase` en este repo.

## Lo que el plan no sabía

- **El banco de navegador encontró lo que las pruebas no veían**, otra vez: una carrera en las SPA que recargaba la página entera en las seguidoras (NAV-6), y que dos de sus tres partes no podían fallar nunca. Ahora las tres cuentan y son 64 casos.
- **La tercera auditoría encontró 19 defectos en código que tenía todas las pruebas en verde**, el peor en la colocación: con el editor partido en dos, las celdas bajaban al 5 % de alto. La lección se mantiene de las dos anteriores.
- **VSCodium se comporta igual que VS Code con las cookies**: sin reescribirlas no llega ninguna. La decisión D5 se confirma en los dos.
- La estimación del plan (3 semanas) era para una persona; aquí se hizo de una tirada porque el núcleo ya estaba escrito y auditado.

## Sugerencias fuera de alcance

- Contar en el rótulo de cada celda los errores de JavaScript de esa vista («en el móvil peta y en el escritorio no»).
- Que el mosaico siga al editor: abrir `app/precios/page.tsx` lleva las celdas a `/precios`.
- Comprobar P-56 (instalar las extensiones competidoras con una app que pida sesión) antes de usarlo como argumento de venta.
- Un botón «añadir a esta fila» en cada fila de una matriz; hoy «Añadir dispositivo» suma a la primera.
