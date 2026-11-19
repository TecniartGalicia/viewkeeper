# Security policy

## Reporting a vulnerability

Write to **info@tecniartgalicia.com** with "ViewKeeper" in the subject, or open a [private security advisory](https://github.com/TecniartGalicia/viewkeeper/security/advisories/new). Please do not open a public issue for a vulnerability.

We aim to answer within 72 hours and to ship a fix in the next patch release.

## What ViewKeeper exposes, and how it is closed

ViewKeeper runs an HTTP proxy on your machine while a mosaic is open. Because it removes framing headers and relaxes cookies for the preview, it is built so that nothing but the panel that opened it can use it:

- It listens on `127.0.0.1` only, and stops when the panel closes.
- Every request must carry a cookie with a random 192-bit token, given only to the panel's own frames.
- Only the exact host names `s-<session>-<tag>.localhost:<port>` are served; anything else gets a 421 (DNS rebinding).
- Requests launched from another website or another session are refused, except a frame navigation; WebSockets must come from the view itself.
- The script injected into your page talks only to the panel's origin, fixed by the proxy, and ignores messages from anything else.
- APIs on other ports are routed only if they are on this computer, listed in your settings, and already allow your app's origin by CORS.

The proxy and the sync engine went through two independent audits before the first release. The browser bench in `test/browser/` reproduces every finding and fails CI if one comes back.
