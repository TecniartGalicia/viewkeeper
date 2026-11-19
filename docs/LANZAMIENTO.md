# Lanzamiento de ViewKeeper — borradores

Los publica una persona desde su cuenta. Nada de esto se publica con automatización (X suspende cuentas por ello y Reddit filtra cuentas nuevas).

Enlaces que usan todos:

- Marketplace: https://marketplace.visualstudio.com/items?itemName=argalla.viewkeeper
- Open VSX: https://open-vsx.org/extension/argalla/viewkeeper
- Repo: https://github.com/TecniartGalicia/viewkeeper
- GIF: https://raw.githubusercontent.com/TecniartGalicia/viewkeeper/HEAD/media/shots/demo.gif

Ángulo, en una frase: **varias vistas de tu localhost que se siguen unas a otras, y por qué hace falta un proxy para conseguirlo** (dentro de un panel de VS Code no llega ni una cookie de sesión).

Lo que **no** se dice: que en las demás extensiones no se pueda iniciar sesión. Es probable, pero no está comprobado instalándolas (P-56 del plan). Se dice lo medido: dentro de un panel, sin ayuda, no llega ninguna cookie.

---

## Reddit · r/webdev (y r/Frontend una semana después)

Desde una cuenta con antigüedad. El GIF va subido como imagen, no como enlace. Flair: «Resource» o «Showoff Saturday» (en sábado).

**Título:** I made a VS Code extension that shows your localhost on a phone, tablet and laptop at once — and keeps them in sync

**Cuerpo:**

> Scroll the phone view and the tablet and laptop scroll with it. Type in one search box, the others fill in. Click a link, all of them follow. It runs on your real dev server (Vite, Next.js, whatever is on localhost) and hot reload keeps working.
>
> The part that took the longest: you can't sync iframes without running code inside the page, and your dev server doesn't serve my code. Inside a VS Code panel there's a second problem — the page is a third-party frame, so the browser drops every cookie that isn't `SameSite=None`. I measured it: without help, not a single session cookie arrives, so any app with a login just loops.
>
> So it runs a tiny proxy on 127.0.0.1 that injects a sync script, strips `X-Frame-Options`, and rewrites cookies. It only serves the panel that opened it (random token, strict host check, cross-site requests refused). It went through two independent security reviews before release.
>
> Also: a route × device matrix (home, product, cart, each on three devices), the same screen as two different users side by side, and a capture of the whole mosaic signed in.
>
> Free, MIT, no telemetry. Not an emulator: it gives you the real CSS sizes and user agent, not pixel density or touch. Local windows only for now.
>
> [Marketplace] · [Open VSX] · [GitHub]
>
> Happy to hear what breaks with your setup — especially auth flows.

---

## dev.to

**Título:** Syncing three iframes of your localhost turned out to need a proxy

**Etiquetas:** vscode, webdev, frontend, testing

**Esquema** (unas 1.000 palabras; el artículo se escribe sobre esto con los datos del plan, §1 y §17):

1. El problema: comprobar una pantalla en móvil, tableta y escritorio a la vez, sin salir del editor. Lo que ya existe hace una vista, o varias que no se siguen.
2. Por qué sincronizar exige código dentro de la página, y por qué eso exige un proxy delante de un servidor de desarrollo ajeno.
3. Lo que se rompe dentro de un webview: `X-Frame-Options`, la CSP, y las cookies. La medida: con la reescritura apagada, cero cookies; con ella, todas. Cómo una medida anterior dijo lo contrario porque las cookies no distinguen puerto.
4. Un origen por sesión con `s-<sesión>-<etiqueta>.localhost`: aislamiento gratis, contexto seguro, sin tocar el fichero de hosts.
5. Lo que encontraron las dos auditorías: un iframe de terceros que se hacía pasar por el panel, dos sesiones que se mandaban a navegar en bucle (473 peticiones en 4 segundos), y una carrera en las SPA que recargaba la página entera.
6. Qué no es: un emulador. Y cuándo usar el navegador integrado de VS Code en su lugar.

---

## X (hilo de 3)

Cada tuit ≤ 280 caracteres; las URL cuentan 23.

1. Your localhost on a phone, a tablet and a laptop at once, inside VS Code. Scroll one, they all scroll. Type, click, navigate: same. Works with your real dev server, hot reload included. Free. [GIF]
2. The catch: inside a VS Code panel your page is a third-party frame, and the browser drops every cookie that isn't SameSite=None. Without help, not one session cookie arrives. So ViewKeeper runs a tiny local proxy that fixes cookies and injects the sync.
3. Also a route × device matrix and the same screen as two users side by side. MIT, no telemetry. https://marketplace.visualstudio.com/items?itemName=argalla.viewkeeper

---

## LinkedIn (EN + ES, un solo post)

> New free VS Code extension from Argalla: ViewKeeper shows the app you're building on a phone, a tablet and a laptop at the same time, and keeps them in sync — scroll, typing, clicks and navigation. It works on your real dev server with hot reload, and it can show the same screen as two different users side by side.
>
> Nueva extensión gratuita de Argalla para VS Code: ViewKeeper enseña la app que estás construyendo en un móvil, una tableta y un portátil a la vez, y los mantiene sincronizados. Funciona sobre tu servidor de desarrollo con recarga en caliente, y puede enseñar la misma pantalla con dos usuarios distintos a la vez.
>
> https://marketplace.visualstudio.com/items?itemName=argalla.viewkeeper

---

## Registro de lo publicado

| Canal | Fecha | URL | Notas |
|---|---|---|---|
| | | | |
