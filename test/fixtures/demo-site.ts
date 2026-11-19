// Web de demostración para la ficha: una tienda ficticia («Lumen») con portada y ficha de producto,
// adaptable de verdad (una columna en el móvil, dos en la tableta, cuatro en el escritorio).
// Sin imágenes ni marcas reales: formas y degradados en CSS.
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

const PRODUCTS = [
  { id: 'aurora', name: 'Aurora lamp', price: '89', a: '#f59e0b', b: '#ef4444' },
  { id: 'tide', name: 'Tide speaker', price: '129', a: '#06b6d4', b: '#3b82f6' },
  { id: 'moss', name: 'Moss planter', price: '39', a: '#22c55e', b: '#14b8a6' },
  { id: 'dusk', name: 'Dusk clock', price: '59', a: '#a855f7', b: '#ec4899' },
  { id: 'ember', name: 'Ember mug', price: '24', a: '#f97316', b: '#eab308' },
  { id: 'glacier', name: 'Glacier bottle', price: '32', a: '#38bdf8', b: '#818cf8' },
  { id: 'fern', name: 'Fern notebook', price: '18', a: '#84cc16', b: '#10b981' },
  { id: 'coral', name: 'Coral cushion', price: '45', a: '#fb7185', b: '#f472b6' },
];

const CSS = `
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#f8fafc}
a{color:inherit;text-decoration:none}
header{display:flex;align-items:center;gap:16px;padding:14px 20px;background:#fff;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:2}
.logo{font-weight:800;font-size:20px;letter-spacing:-.02em;display:flex;align-items:center;gap:8px}
.logo i{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#2dd4bf,#3b82f6);display:inline-block}
nav{display:none;gap:18px;color:#475569;font-size:15px}
.search{flex:1;max-width:340px;margin-left:auto}
.search input{width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:15px;background:#f8fafc}
.cart{width:38px;height:38px;border-radius:10px;background:#0f172a;color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px}
.hero{margin:20px;padding:34px 24px;border-radius:22px;color:#fff;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#0d9488 100%)}
.hero h1{margin:0 0 10px;font-size:32px;line-height:1.1;letter-spacing:-.03em}
.hero p{margin:0 0 20px;opacity:.85;max-width:520px}
.btn{display:inline-block;padding:12px 20px;border-radius:12px;background:#2dd4bf;color:#0f172a;font-weight:700}
h2{margin:28px 20px 12px;font-size:20px}
.grid{display:grid;grid-template-columns:1fr;gap:16px;padding:0 20px 40px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;display:block}
.card .art{height:170px}
.card .info{padding:14px 16px;display:flex;justify-content:space-between;align-items:center}
.card b{font-size:16px}.card span{color:#0d9488;font-weight:700}
.promo{margin:0 20px 40px;padding:22px;border-radius:18px;background:#fef3c7;color:#78350f;font-weight:600}
footer{padding:30px 20px;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0}
.ficha{display:grid;grid-template-columns:1fr;gap:24px;padding:20px}
.ficha .art{height:300px;border-radius:22px}
.ficha h1{margin:0;font-size:30px;letter-spacing:-.02em}
.ficha .precio{font-size:26px;font-weight:800;color:#0d9488;margin:8px 0 16px}
.ficha ul{padding-left:20px;color:#475569}
.cant{display:flex;gap:10px;align-items:center;margin:16px 0}
.cant input{width:70px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}
@media(min-width:600px){.grid{grid-template-columns:1fr 1fr}.hero h1{font-size:40px}.ficha{grid-template-columns:1fr 1fr;align-items:start}}
@media(min-width:1000px){nav{display:flex}.grid{grid-template-columns:repeat(4,1fr)}.hero{padding:56px 48px}.hero h1{font-size:52px}}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body>
<header><a class="logo" href="/"><i></i>Lumen</a><nav><a href="/">New</a><a href="/">Living</a><a href="/">Desk</a><a href="/">Gifts</a></nav>
<form class="search" onsubmit="return false"><input id="buscar" name="q" placeholder="Search products" autocomplete="off"></form><a class="cart" href="/">2</a></header>
${body}<footer>Lumen is a demo store made up for this preview. Free shipping over 50.</footer></body></html>`;
}

function home(): string {
  const cards = PRODUCTS.map((p) => `<a class="card" href="/product/${p.id}"><div class="art" style="background:linear-gradient(135deg,${p.a},${p.b})"></div><div class="info"><b>${p.name}</b><span>${p.price} €</span></div></a>`).join('');
  return page(
    'Lumen',
    `<section class="hero"><h1>Small things that light up a room</h1><p>Hand-finished objects for the desk, the shelf and the kitchen table. New colours every season.</p><a class="btn" href="/product/aurora">Shop the Aurora lamp</a></section>
<h2>New this week</h2><div class="grid">${cards}</div><div class="promo">Two items or more: the second one at half price until Sunday.</div>`,
  );
}

function product(id: string): string {
  const p = PRODUCTS.find((x) => x.id === id) ?? PRODUCTS[0];
  return page(
    `${p.name} · Lumen`,
    `<div class="ficha"><div class="art" style="background:linear-gradient(135deg,${p.a},${p.b})"></div><div><h1>${p.name}</h1><div class="precio">${p.price} €</div>
<p>Made in small batches, finished by hand and packed without plastic. Each one is slightly different.</p><ul><li>Ships in 2 days</li><li>Free returns for 30 days</li><li>Two-year warranty</li></ul>
<div class="cant"><label for="n">Qty</label><input id="n" type="number" value="1" min="1"></div><a class="btn" href="/">Add to cart</a></div></div>
<h2>You may also like</h2><div class="grid">${PRODUCTS.filter((x) => x.id !== p.id)
      .slice(0, 4)
      .map((x) => `<a class="card" href="/product/${x.id}"><div class="art" style="background:linear-gradient(135deg,${x.a},${x.b})"></div><div class="info"><b>${x.name}</b><span>${x.price} €</span></div></a>`)
      .join('')}</div>`,
  );
}

export function startDemoSite(): Promise<{ origin: string; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const m = /^\/product\/([a-z]+)$/.exec(url);
    const html = url === '/' ? home() : m ? product(m[1]) : null;
    if (html === null) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        origin: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
