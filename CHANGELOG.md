# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-11-20

### Added

- **Deployed sites in look-only mode.** Opening a site that is not on this computer or your local network starts with click and typing sync off, so nothing is done once per view on real data; the toolbar says "Deployed site". The mosaic opens the site's main domain (`example.com` → `https://www.example.com`).
- **Links, forms, `fetch` and `location.href` written with your app's full domain stay inside the view**, also with a `<base href>`. A jump to another site no longer turns the view blank: it stays where it was and its label says where the page wanted to go. A document redirect out of the mosaic shows a page that explains it.
- **APIs on another server** (`https://api.example.com`) can be routed through the proxy, like APIs on another local port, if they already allow your app's origin by CORS. They never receive your app's session: the proxy keeps their cookies apart, per session.
- **JavaScript errors per view**, counted in each label; click to read them.
- **Follow the editor** (off by default): opening the file of a page sends the mosaic to its route. Next.js, SvelteKit, Astro, Nuxt and plain HTML, also in monorepos, and only when the project's `package.json` uses that framework.
- **Change a row's route from its label**, a **+** at the end of each row of a matrix, and **enlarge a view** to the whole panel (Esc to go back).
- **The status bar button reopens the last mosaic** of the project when its dev server is running.
- **Remote windows**: the extension no longer refuses them; the proxy's port is forwarded by VS Code. Tested in WSL.
- The proxy's own pages follow the editor's language.

### Fixed

- A view that loaded a route returning plain text or JSON could no longer be sent anywhere; now it re-enters through its entry address.
- Sending a row back while it was still loading another route did nothing.
- A view could start its page at 300 px wide (the default size of a frame) on a slow machine, before getting its device size; page scripts that read the width at start-up saw the wrong device.

### Security

- Two independent audits of everything above (32 defects found and fixed, each with a test that fails if it comes back) and a security scan of the whole extension (6 findings, all fixed):
  - The capture's one-time ticket no longer appears on the browser's command line, where other users of a shared machine could read it.
  - Device ids from a saved mosaic are validated, and nothing that comes from a repository reaches a VS Code notification as a link.
  - Each target's origin label is now 128 bits instead of 32, so a site cannot be crafted to share a local app's origin. **Views open on new origins once**: cookies and storage kept by 0.1.x previews are not carried over.
  - The proxy claims its port on both `127.0.0.1` and `::1`.
  - Captures keep each cookie's HttpOnly flag.
  - A deployed site typed without a scheme opens over https, and a redirect from https to http is never followed.
- An API response routed through the proxy is served with `Content-Security-Policy: sandbox` and `nosniff`.

## [0.1.1] — 2026-11-19

### Added

- **Open mosaic for a URL…** command and an **Address** button in the panel: type any address with its path, local or deployed, also when a mosaic is already open.

### Fixed

- With a dev server detected, the status bar button opened it straight away and there was no way to type another address. It now shows the servers found plus **Another address…**, and an address typed in the list can be opened with Enter.

## [0.1.0] — 2026-11-19

First public release. Free.

### Added

- Mosaic of your dev server on several devices at once, each at its real CSS size, with rotation and custom devices.
- Sync of scroll, clicks, typing and navigation across views, each switchable from the panel toolbar.
- Route × device matrix with routes read from Next.js, SvelteKit, Astro, Nuxt and plain HTML projects.
- Sessions side by side, each with its own cookies and storage.
- Capture of every view plus a contact sheet, signed in, using the installed Chrome, Edge, Brave or Chromium.
- Saved mosaics in `.vscode/viewkeeper.json`.
- Local proxy that keeps hot reload working, removes framing headers and rewrites cookies so sign-in works inside the panel.
- Routing of APIs on other local ports that already allow the app by CORS.
- Dev server detection, including servers listening only on IPv6.
- English and Spanish.
