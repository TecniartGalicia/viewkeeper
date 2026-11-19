# Privacy

ViewKeeper is local software. It does not collect telemetry, it has no account, and it makes no network request of its own.

## What it talks to

- **Your dev server**, at the address you choose (normally `http://localhost:<port>`), through a proxy that listens only on `127.0.0.1`.
- **APIs on other local ports** listed in `viewkeeper.apiOrigins`. Before routing one, ViewKeeper asks it once whether it allows your app's origin by CORS (an `OPTIONS` request with your app's `Origin`). Addresses that are not this computer are never contacted.
- **Ports on this computer** when looking for your dev server: a `GET /` to a short list of common development ports, plus those named in your `package.json` scripts.

Nothing goes anywhere else.

## What it reads and writes

- Reads your workspace's file names (not their contents) to list routes for the route matrix, and `package.json` to find your dev server's port.
- Writes `.vscode/viewkeeper.json` when you save a mosaic. Saved routes are stored without their query string or fragment, because those can carry tokens or personal data and this file is meant for version control.
- Writes PNG files where you choose when you capture. Captures use a temporary browser profile that is deleted afterwards.

## What the proxy sees

Everything your preview loads goes through the proxy in memory: it has to, to add the sync script and fix the cookies. It keeps only the last cookies each session sent, so that a capture can open the page signed in, and forgets each one when your server expires it. None of this is written to disk or sent anywhere.

## What you type in a view

It is relayed to the other views inside the panel, in memory, so they show the same thing. It never reaches the extension host, the log or the disk. The panel sends the extension only routes, page sizes and anonymous notices.
