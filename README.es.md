# ViewKeeper

**Tu servidor de desarrollo en varios dispositivos y rutas a la vez, dentro de VS Code. Lo que haces en una vista pasa en todas.**

Te desplazas en el móvil y la tableta y el portátil se desplazan con él. Escribes en un buscador y los otros dos se rellenan. Pulsas un enlace y todas las vistas te siguen. Funciona con la app que estás construyendo de verdad —Vite, Next.js, Astro, cualquier cosa en localhost—, con la recarga en caliente intacta, aunque tu app se niegue a dejarse incrustar y aunque haya que iniciar sesión. También abre una web publicada, en un modo más seguro de solo mirar.

[English](README.md)

## Instalar

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=argalla.viewkeeper) · [Open VSX](https://open-vsx.org/extension/argalla/viewkeeper) (Cursor, Windsurf, VSCodium) · o `code --install-extension argalla.viewkeeper`

Arranca tu servidor de desarrollo y pulsa **ViewKeeper** en la barra de estado. Lo encuentra solo.

![ViewKeeper: desplazamiento, escritura y un clic en el móvil, repetidos en la tableta y el portátil](https://raw.githubusercontent.com/TecniartGalicia/viewkeeper/HEAD/media/shots/demo.gif)

## Qué hace

Todo es **gratis**.

- **Varios dispositivos uno al lado de otro**, cada uno a su tamaño CSS real: iPhone, Pixel, Galaxy, iPad, portátil, escritorio, o los tamaños que tú definas. Cualquiera se puede girar.
- **Todo sincronizado**: desplazamiento, clics, escritura y navegación. Cada cosa se puede apagar.
- **Matriz de rutas × dispositivos**: portada, ficha de producto y carrito, cada una en tres dispositivos, cada fila sincronizada por su cuenta. Lee las rutas de tu proyecto en Next.js (app y pages), SvelteKit, Astro, Nuxt o HTML suelto.
- **Sesiones lado a lado**: la misma pantalla como administrador y como cliente a la vez. Cada sesión tiene sus propias cookies y almacenamiento.
- **Captura**: un PNG por vista y una hoja de contactos con el mosaico entero, con la sesión iniciada, usando el Chrome, Edge o Brave que ya tienes. No descarga nada.
- **Mosaicos guardados** en `.vscode/viewkeeper.json`, para que todo el equipo abra las mismas pantallas.
- **La recarga en caliente sigue en caliente.** Vite y Next.js actualizan cada vista sin recargarla.
- **También con una API en otro puerto o en otro servidor.** Si tu frontal llama a `localhost:3001` o a `https://api.ejemplo.com` y el navegador lo bloquea dentro del mosaico, ViewKeeper te ofrece pasarlo por él, solo si esa API ya admite el origen de tu app.
- **Errores de JavaScript por vista.** El rótulo de cada vista cuenta los errores de la página que enseña; pulsando el número se leen. «En el móvil falla y en el portátil no», de un vistazo.
- **Seguir al editor** (opcional): abres `app/precios/page.tsx` y el mosaico va a `/precios`. Next.js, SvelteKit, Astro, Nuxt y HTML suelto, también dentro de un monorepo.
- **Cambiar la ruta de una fila desde su rótulo**, añadir un dispositivo a una fila de la matriz y **ampliar una vista** a todo el panel (Esc para volver).
- **Reabre lo que tenías.** El botón de la barra de estado recupera el último mosaico del proyecto, con sus dispositivos y sus rutas, si su servidor de desarrollo está en marcha.
- **Ventanas remotas**: WSL, y SSH o contenedores mediante el reenvío de puertos de VS Code.

![La misma app en un móvil, una tableta y un portátil, dos rutas, cada fila sincronizada](https://raw.githubusercontent.com/TecniartGalicia/viewkeeper/HEAD/media/shots/mosaic.png)

## Por qué hace falta un proxy

Meter tu localhost en unos `<iframe>` es fácil. Que se sigan unos a otros no: eso necesita código corriendo dentro de tu página, y tu servidor de desarrollo no sirve el código de ViewKeeper. Y dentro de un panel del editor se rompen dos cosas más:

- **Las apps que no se dejan incrustar.** `X-Frame-Options` o `frame-ancestors` dejan el marco en blanco.
- **Iniciar sesión.** Dentro de un panel de VS Code tu página es un marco de terceros, y el navegador descarta toda cookie que no esté marcada `SameSite=None`. Lo medimos: sin ayuda no llega ni una cookie de sesión. Tu pantalla de entrada se queda en bucle.

Así que ViewKeeper pone un proxy pequeño en `127.0.0.1` entre las vistas y tu servidor. Añade un script corto a cada página, quita las cabeceras que impiden incrustar y reescribe las cookies para que sobrevivan. Ni tu servidor ni tu código se tocan; solo cambia lo que recibe la vista previa.

## Qué no es

- **No es un emulador.** Cada vista tiene el tamaño, el agente de usuario y el idioma del dispositivo tal como los ve JavaScript, y sin barra de desplazamiento en los móviles. No emula la densidad de píxeles ni los eventos táctiles, y tu servidor ve el agente de usuario del propio editor. Para emular un dispositivo exacto, el navegador integrado de VS Code lo hace bien.
- **Iniciar sesión a través de otro sitio** (redirecciones a Google, GitHub, Auth0) no cabe en una vista: el panel solo deja hablar a cada vista con tu propia app. La vista dice adónde quería ir la página en vez de quedarse en blanco. Usa una cuenta de pruebas.
- **VS Code en el navegador** (vscode.dev, Codespaces en una pestaña) no puede enseñar las vistas: necesitan `*.localhost`. ViewKeeper lo dice.
- **Durante la vista previa tu app corre algo distinta**: sin su Content-Security-Policy, con las cookies reescritas y desde otro origen. Para maquetar y probar comportamiento da igual; si estás depurando justo una de esas tres cosas, apaga `viewkeeper.relaxCsp` / `viewkeeper.fixCookies` o usa un navegador normal.
- **También sirve con una web publicada, en modo solo mirar**: ViewKeeper abre su dominio principal (`ejemplo.com` → `https://www.ejemplo.com`) con la sincronización de clics y de escritura **apagada**, porque si no cada clic y cada tecla pasarían una vez por vista sobre datos reales. El desplazamiento y la navegación siguen sincronizados. Si estás con datos de prueba, enciende las otras dos en la barra. Los enlaces, formularios y `location.href` escritos con el dominio completo de la web se quedan dentro de la vista; un `window.open` hacia él abre la web real fuera del mosaico.
- **La cuenta de errores es por documento**: en una app de una sola página no vuelve a cero al cambiar de pantalla sin recargar.
- **Seguir al editor** puede tomar por página un fichero de una carpeta llamada `pages/` que no lo sea. Por eso nace apagado.
- Cuando dos vistas tienen maquetaciones muy distintas, un clic solo se repite si el elemento es de verdad el mismo (misma etiqueta, rol, nombre, enlace). Si no, esa vista no te sigue, antes que pulsar otro botón.

## Comandos

| Comando | |
|---|---|
| **ViewKeeper: Abrir mosaico de tu servidor de desarrollo** | También el botón de la barra de estado |
| **ViewKeeper: Abrir mosaico de una dirección (local o publicada)…** | Cualquier dirección con su ruta, también una web publicada; sustituye el mosaico abierto. También el botón **Dirección** del panel |
| **ViewKeeper: Abrir matriz de rutas × dispositivos** | Eliges rutas y dispositivos |
| **ViewKeeper: Añadir una celda con otra sesión** | La misma pantalla, otro usuario |
| **ViewKeeper: Guardar este mosaico en el proyecto** / **Abrir un mosaico guardado** | `.vscode/viewkeeper.json` |
| **ViewKeeper: Capturar el mosaico** / **(páginas enteras)** | PNG y hoja de contactos |
| **ViewKeeper: Recargar todas las celdas** | |
| **ViewKeeper: Seguir al editor: encender / apagar** | También un botón de la barra |
| **ViewKeeper: Diagnosticar** | Lo que el proxy vio y no pudo hacer |

La barra del propio panel cambia la dirección, añade dispositivos, enciende o apaga cada tipo de sincronización y sigue al editor. Cada vista puede cambiar de dispositivo, girarse, ampliarse o cerrarse; su ruta abre una lista para llevar toda la fila a otra página; y su número en rojo enseña los errores de JavaScript de la página.

## Ajustes

| Ajuste | Por defecto | |
|---|---|---|
| `viewkeeper.defaultDevices` | `["iphone-15", "ipad-mini", "laptop"]` | Dispositivos de un mosaico nuevo |
| `viewkeeper.customDevices` | `[]` | Los tuyos: `{ "id", "name", "width", "height", "mobile" }` |
| `viewkeeper.apiOrigins` | `[]` | API que pasan por el proxy: en otros puertos locales, o servidores `https://`. Solo si ya admiten por CORS el origen de tu app |
| `viewkeeper.followEditor` | `false` | Abrir el fichero de una página lleva el mosaico a su ruta |
| `viewkeeper.relaxCsp` | `true` | Quitar la CSP de tu app durante la vista previa |
| `viewkeeper.fixCookies` | `true` | Reescribir las cookies para poder iniciar sesión dentro del panel |
| `viewkeeper.browserPath` | `""` | Navegador para las capturas; si está vacío, lo busca |

## Privacidad y seguridad

Sin telemetría y sin cuenta. Sus únicas peticiones de red propias: al abrir una web publicada, una para saber su dominio principal; y antes de pasar una API por el proxy, una pregunta CORS a esa API. El proxy solo escucha en `127.0.0.1`, solo sirve a las vistas del panel que lo abrió (un testigo aleatorio de 192 bits en una cookie), rechaza cualquier otro nombre de servidor y no admite peticiones lanzadas desde otras webs. Lo que escribes en una vista, y el texto de los errores de una página, se quedan dentro del panel y nunca llegan al host de la extensión. Una API de otro servidor que pases por el proxy no recibe la sesión de tu app: el proxy le guarda aparte sus propias cookies y solo le manda las que tu app puso para el dominio de esa API. Detalles en [PRIVACY.es.md](PRIVACY.es.md); para avisar de una vulnerabilidad, [SECURITY.md](SECURITY.md).

El proxy y el motor de sincronización pasan auditorías independientes antes de cada versión (tres antes de la primera, dos más antes de la 0.2.0), con un banco de casos de ataque y comportamiento (proxy, sincronización y el panel real en Chrome sin ventana) que corre en CI en Linux, Windows y macOS.

## Requisitos

VS Code 1.95 o posterior (también VSCodium y otros editores que instalan desde Open VSX). Un servidor de desarrollo en `localhost`, o una web publicada. Para las capturas, Chrome, Edge, Brave o Chromium en la máquina donde corre la extensión.

---

MIT · de [Argalla](https://github.com/TecniartGalicia) · Sin relación con Microsoft, Apple, Google ni Samsung; los nombres de dispositivos solo describen tamaños de pantalla.
