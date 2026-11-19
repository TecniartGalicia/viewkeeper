# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
