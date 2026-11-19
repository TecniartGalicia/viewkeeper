# Contributing

Issues and pull requests are welcome.

## Getting started

Node 24 (the tests run TypeScript directly with `node --test`).

```sh
npm ci
npm run check            # typecheck, agent syntax, lint, l10n, unit tests
npm run test:browser     # panel, agent and proxy in headless Chrome (needs Chrome)
npm run test:integration # inside a real VS Code
npm run build
```

`VIEWKEEPER_VSCODE_EXE=<path>` runs the integration suite in another VS Code-compatible editor.

## Layout

- `src/core` never imports `vscode`: proxy, sync router, mosaic model, routes, ports, capture. Tested in Node.
- `media/agent.js` runs **inside the user's page**: plain ES2017, no dependencies, no build step. `npm run check` runs `node --check` and ESLint on it, because the compiler never sees it.
- `src/webview/panel.ts` is bundled separately for the webview.
- `test/browser` is a bench built during the security audits. Each case prints `REPRODUCIDO` or `no reproducido`; a reproduced case that is not on the accepted list fails the run.

## House rules

- No emoji in the UI. Inline SVG icons drawn in `panel.ts`.
- Nothing typed in a view may reach the extension host. The panel forwards only routes, numbers and contentless notices.
- Any new user-visible string goes through `vscode.l10n.t()` and needs a Spanish translation: `npm run l10n` fails otherwise.
- Cookie tests start from a host name that was never used before: cookies do not care about ports, and a leftover cookie once made a measurement look right when it was not.
