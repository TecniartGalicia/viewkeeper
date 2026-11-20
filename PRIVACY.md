# Privacy

ViewKeeper is local software. It does not collect telemetry and it has no account. The network requests it makes on its own are listed below; everything else is your own preview loading.

## What it talks to

- **The site you open in the mosaic**: your dev server (normally `http://localhost:<port>`) or a deployed site, through a proxy that listens only on `127.0.0.1`. When you open a deployed site, ViewKeeper first makes one `GET` request to its address to see whether it redirects to its main domain (`example.com` → `https://www.example.com`), so that the mosaic opens that one.
- **APIs listed in `viewkeeper.apiOrigins`**: on other ports of this computer, or `https://` servers. Before routing one, ViewKeeper asks it once whether it allows your app's origin by CORS (an `OPTIONS` request with your app's `Origin`). It only offers to route an API when your page's own call to it failed, and only if it answers with your app's exact origin.
- **Ports on this computer** when looking for your dev server: a `GET /` to a short list of common development ports, plus those named in your `package.json` scripts. When you click the status bar button, also one request to the dev server of the last mosaic of the project, to know whether it is still running.

Nothing goes anywhere else.

## What it reads and writes

- Reads your workspace's file names (not their contents) to list routes for the route matrix, to offer routes for a row, and, if you turn on **Follow the editor**, to know the route of the file you open. Reads `package.json` to find your dev server's port.
- Writes `.vscode/viewkeeper.json` when you save a mosaic. Saved routes are stored without their query string or fragment, because those can carry tokens or personal data and this file is meant for version control.
- Remembers the last mosaic of each project in VS Code's own workspace storage (not in your project), also without query strings or fragments.
- Writes PNG files where you choose when you capture. Captures use a temporary browser profile that is deleted afterwards.

## What the proxy sees

Everything your preview loads goes through the proxy in memory: it has to, to add the sync script and fix the cookies. It keeps only the last cookies each session sent, so that a capture can open the page signed in, and forgets each one when your server expires it. None of this is written to disk or sent anywhere.

When an API on **another server** is routed through the proxy, the calls go out from your computer with your app's origin. That API does not receive your app's cookies: the proxy keeps the cookies that API sets in memory, apart for each session of the mosaic, and sends it only those plus the cookies your app set with a `Domain` that covers that API (as a browser would). To remember which of your app's cookies those are, the proxy leaves a small marker cookie (`__vk_d_<name>`) in the preview; it never reaches your app.

## What you type in a view, and your page's errors

What you type is relayed to the other views inside the panel, in memory, so they show the same thing. The text of your page's JavaScript errors is shown in that view's label. Neither ever reaches the extension host, the log or the disk. The panel sends the extension only routes, page sizes, error counts and anonymous notices (such as the origin a page tried to leave to).
