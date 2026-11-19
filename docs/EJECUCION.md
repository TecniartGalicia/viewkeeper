# Ejecución de ViewKeeper

Plan: `Desktop/Apps/proyectos varios/ideasVs/15-PLAN-EJECUCION.md` (ficha `15-viewkeeper.md`, prototipo `prototipos/15-mosaico/`)
Arrancado: 2026-11-19 · Última actualización: 2026-11-19
Repositorios: `Desktop/Apps/viewkeeper` → `TecniartGalicia/viewkeeper` (nuevo, público, MIT) · Solo lectura: el resto de extensiones de la familia (de ahí solo se copia andamio)

**Cambio del titular sobre el plan (19-11):** «de momento gratuita». No hay Pro, ni Polar, ni licencia, ni límites: lo que el plan marcaba Pro (matriz de rutas, sesiones, más de 3 celdas, mosaicos guardados, captura) queda libre. `pricing: "Free"`. La fase 3 del plan deja de ser «Pro» y pasa a ser «funciones avanzadas».

## Estado

| Fase | Qué consigue | Estado | Bloqueada por |
|---|---|---|---|
| 0 | Sondas y prototipo | Cerrada (en el plan) | — |
| 1 | Repo con núcleo, agente y banco de navegador | Cerrada | — |
| 2 | Extensión: panel con barra de herramientas, detección, API en otro puerto, ES/EN, diagnóstico | Cerrada | — |
| 3 | Funciones avanzadas, gratis: matriz, sesiones, mosaicos guardados, captura | Cerrada | — |
| 4 | Publicación en Marketplace, Open VSX y GitHub Release | En curso | — |
| 5 | Borradores de lanzamiento | Libre | Publicar en redes es del titular |

Ninguna tarea humana bloquea: los tokens de publicación existen (`Documents/handsfree-secrets.txt`, compartidos por la familia; `VSCE_PAT` de organización, caduca 2027-08-13) y el repo se crea por API con el token de `git credential`.

## Criterios de salida

Copiados del plan (§15), con lo que cambia por ser gratuita marcado.

- **Fase 1:** «P-01 a P-34 y P-44 a P-53 en verde».
- **Fase 2:** «I-1 a I-3, P-43, P-46, P-47, P-51». El plan añade: «Si F2 descubre que el remoto no funciona (P-46), no se retrasa la publicación: se declara "solo ventanas locales" en el README».
- **Fase 3:** el plan decía «P-55 y la compra de punta a punta de la guía §6»; **no aplica** (sin licencia). Sustituido por (añadido, no estaba en el plan): P-22 a P-30 en verde y cada comando de la fase recorrido en un VS Code real con la sonda.
- **Fase 4:** «P-40, P-41, P-42, I-4, checklist §10 de la guía», y «En Marketplace y Open VSX el mismo día, con GIF».
- **Fase 5:** «Borradores para Reddit, dev.to, X y LinkedIn. Los publica una persona».

## Tareas humanas y qué desbloquean

| # | Tarea | Desbloquea | Cuándo muerde |
|---|---|---|---|
| 1 | Publicar en redes los borradores de `docs/LANZAMIENTO.md` | Lanzamiento | Al final; nada técnico depende de ella |

## Decisiones abiertas

| # | Decisión | Estado | Qué hace falta |
|---|---|---|---|
| 1 | Cobrar más adelante | Aparcada por el titular | Nada ahora: el código no lleva capa de licencia; si se decide, se añade la de CostKeeper |

## Decisiones que tomé yo

- **Las pruebas corren con `node --test` sobre TypeScript directo (Node 24) y la extensión se empaqueta con esbuild**, no mocha sobre `out/` como el resto de la familia. Es lo que ya funciona en el prototipo y evita reescribir todos los imports. CI con Node 24. Fase 1.
- **El banco de navegador es el del auditor** (`test/browser/`), con una salida que falla si reaparece un defecto cerrado, en vez de reescribirlo. Fase 1.

- **Sin `docs/PLAN-FASE-<n>.md`.** Las fases eran pasar a limpio un prototipo ya auditado, con el código escrito en el plan; las tareas viven en el diario y en los commits. Todas.
- **La rejilla de sesiones de agentes y el guardado de disposiciones** (las otras lecturas de «varias pantallas») siguen fuera, como decía el plan.
- **Altura común por fila** (`rowScales`), en vez del mismo ancho para cada celda que traía el prototipo: con el mismo ancho, un portátil al lado de un móvil salía al 32 % e ilegible. Se vio al grabar la demo. Fase 4.
- **Ventanas remotas: aviso en vez de panel en blanco.** El plan permitía declararlo; además se dice en la propia extensión. Fase 2.
- **Auditoría independiente una vez para las fases 2 y 3 juntas**, antes de publicar, en lugar de una por fase: las dos tocan los mismos ficheros. Fase 4.

## Diario

### Fase 1 — cerrada el 2026-11-19
- Criterio cumplido: P-01 a P-36 en verde (`npm run check`), y el banco de navegador (P-44 a P-53 y los casos de las dos auditorías) 27 casos, ninguno inesperado, tres pasadas seguidas.
- Commits: `b87c613`.
- **Lo que cambia para las siguientes:** el banco destapó una regresión que nadie esperaba (NAV-6): en una SPA, la seguidora recargaba la página entera porque la orden de navegar llegaba antes que su propio `pushState`. Se resolvió con un margen (`GRACE_MS`, P-36). Y el banco salía «en verde» cuando no conseguía montar el panel: ahora un montaje fallido es un fallo.

### Fase 2 — cerrada el 2026-11-19
- Criterio cumplido: I-1, I-2, I-3 (y I-5, edición en vivo) dentro de VS Code 1.147, 8 de 8; P-43 (servidor solo en `::1`) y P-47 (API en otro puerto, de punta a punta en VS Code) en verde; P-51 a mano con la ventana minimizada: desplazamiento, escritura y clic sincronizados; P-46 declarado (aviso en ventanas remotas, como permite el plan).
- Commits: `4f65a35`, `ea2708f`.
- **Lo que cambia:** I-1 cazó un comando de licencia que se había quedado en el manifiesto. Lección de proceso: una cadena `a && b | grep` no para en el error de `a`; un commit entró con un error de tipos y hubo que corregirlo en el siguiente.

### Fase 3 — cerrada el 2026-11-19
- Criterio cumplido (sustituto del de Pro): P-22 a P-30 en verde; I-6 (mosaicos guardados, también rotos o editados a mano) e I-7 (sesión nueva aislada y viva, captura con sesión y hoja) en VS Code. La matriz se probó por su núcleo (`matrix`, `detectRoutes`); el diálogo de elegir rutas y dispositivos no está automatizado.
- Commits: `c8f8f42`.

### Fase 4 — en curso
- Documentación, icono (Codex), captura y GIF grabados con la extensión de verdad sobre una tienda de demostración, CI y publicación con reintentos y la release de GitHub antes que las tiendas. Repo `TecniartGalicia/viewkeeper` creado, con `VSCE_PAT` y `OVSX_PAT`.
- Commits: `24de59e`.
- I-4 y P-42: la suite entera en **VSCodium 1.143** (descargado portátil), 8 de 8; sin reescribir cookies no llega ninguna, igual que en VS Code. Cursor no se ha probado.
- Borradores de lanzamiento en `docs/LANZAMIENTO.md` (fase 5).
- **Auditoría independiente de las fases 2 y 3: 19 hallazgos** (1 alto, 7 medios, 11 bajos; 15 reproducidos ejecutando). El alto: con el editor partido en dos, las celdas bajaban al 5 % de alto. Todos corregidos en `c7fb4af` y comprobados con los guiones del propio auditor: su banco del panel sin un solo defecto y su sonda de comandos dentro de VS Code con todos los casos resueltos. Quedan, aceptados: el botón «Añadir dispositivo» añade a la primera fila (no sabe de qué fila hablas), y `localhost` y `127.0.0.1` son dos orígenes distintos para el aviso de API.
- Al pasarlo todo se vio que dos de las tres partes del banco de navegador terminaban con `process.exit(0)` antes de mirar su resultado: no podían fallar. Corregido; el banco son **64 casos**, no 27.
- Repo subido a `TecniartGalicia/viewkeeper` (`71a80a8`).

## Si esto se retoma en otra sesión

Mirar la tabla de estado y el diario. Fase 4: CI en GitHub, después etiqueta `v0.1.0` y comprobar en las tres tiendas. `scripts/gh-runs.mjs ci|release --esperar` sigue una ejecución.
