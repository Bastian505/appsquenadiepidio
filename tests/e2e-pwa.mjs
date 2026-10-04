#!/usr/bin/env node
// La app es instalable: manifiesto con íconos que existen, service worker activo y se abre sin conexión.
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PWLIB || 'playwright');
const ROOT = process.cwd();
let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.html': 'text/html' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }
  else { r.writeHead(404); r.end(); }
}).listen(0);
const BASE = `http://localhost:${srv.address().port}`;

const manifest = JSON.parse(fs.readFileSync('v2/manifest.webmanifest', 'utf8'));
ok(manifest.display === 'standalone' && manifest.start_url === '/v2/' && manifest.scope === '/v2/', 'el manifiesto abre en pantalla completa dentro de /v2/');
ok(manifest.icons.some(i => i.sizes === '192x192' && i.type === 'image/png') && manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), 'tiene íconos PNG de 192 y 512 (uno maskable)');
ok(manifest.icons.every(i => fs.existsSync(path.join(ROOT, i.src))), 'todos los íconos del manifiesto existen');
ok(/apple-touch-icon/.test(fs.readFileSync('v2/index.html', 'utf8')) && fs.existsSync('v2/apple-touch-icon.png'), 'hay ícono para la pantalla de inicio del iPhone');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {} });
await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
await page.goto(BASE + '/v2/');
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
const controlled = await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).then(() => true, () => false);
ok(controlled, 'el service worker queda activo y controla la página');
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#app', { timeout: 8000 });
const body = await page.innerText('body');
ok(/DiviCuenta|boleta|Fotografía|Sacar|cuenta/i.test(body), 'sin conexión la app igual se abre');
await ctx.setOffline(false);
await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} comprobaciones de app instalable OK`);
process.exit(fails ? 1 : 0);
