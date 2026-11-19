# Ejecución de ViewKeeper

Plan: `Desktop/Apps/proyectos varios/ideasVs/15-PLAN-EJECUCION.md` (ficha `15-viewkeeper.md`, prototipo `prototipos/15-mosaico/`)
Arrancado: 2026-11-19 · Última actualización: 2026-11-19
Repositorios: `Desktop/Apps/viewkeeper` → `TecniartGalicia/viewkeeper` (nuevo, público, MIT) · Solo lectura: el resto de extensiones de la familia (de ahí solo se copia andamio)

**Cambio del titular sobre el plan (19-11):** «de momento gratuita». No hay Pro, ni Polar, ni licencia, ni límites: lo que el plan marcaba Pro (matriz de rutas, sesiones, más de 3 celdas, mosaicos guardados, captura) queda libre. `pricing: "Free"`. La fase 3 del plan deja de ser «Pro» y pasa a ser «funciones avanzadas».

## Estado

| Fase | Qué consigue | Estado | Bloqueada por |
|---|---|---|---|
| 0 | Sondas y prototipo | Cerrada (en el plan) | — |
| 1 | Repo con núcleo, agente y banco de navegador | Libre | — |
| 2 | Extensión: panel con barra de herramientas, detección, API en otro puerto, ES/EN, diagnóstico | Libre (tras 1) | — |
| 3 | Funciones avanzadas, gratis: matriz, sesiones, mosaicos guardados, captura | Libre (tras 2) | — |
| 4 | Publicación en Marketplace, Open VSX y GitHub Release | Libre (tras 3) | — |
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

## Diario

## Si esto se retoma en otra sesión

Mirar la tabla de estado y el último `docs/PLAN-FASE-<n>.md`.
