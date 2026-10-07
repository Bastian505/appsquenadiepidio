#!/usr/bin/env node
// Accesibilidad de la app v2 con axe-core (WCAG 2.0/2.1/2.2 A y AA + buenas prácticas), en tema claro y oscuro, en las pantallas principales.
// Cero violaciones: contraste, nombres de botones, etiquetas de campos, roles ARIA y tamaño mínimo de los objetivos táctiles.
// Uso: npm i --no-save playwright axe-core && node tests/a11y-v2.mjs
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PWLIB || 'playwright');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js', { paths: [process.env.AXELIB || process.cwd(), ...(process.env.AXELIB ? [process.env.AXELIB] : [])] }), 'utf8');
const ROOT = process.cwd(), IMG = 'services/ocr/evals/fixtures/MY/khan-jee-kl.jpg';
const OK = { ok: true, restaurante: 'Pub KL', moneda: 'MYR', pais: 'MY', pais_nombre: 'Malasia', items: [
  { nombre: 'Heineken', precio_unitario: 18.2, cantidad: 5, confianza: 0.95 }, { nombre: 'Biryani', precio_unitario: 54, cantidad: 1, confianza: 0.62 },
  { nombre: 'Burger', precio_unitario: 52, cantidad: 1 }, { nombre: 'Service Charge', precio_unitario: 15, cantidad: 1 }], reconciliation: { ok: false, total_boleta: 260 } };
let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); } }).listen(0);
const BASE = `http://localhost:${srv.address().port}/v2/`;
const browser = await chromium.launch();

async function pagina(scheme, scan) {
  const ctx = await browser.newContext({ locale: 'es-CL', viewport: { width: 390, height: 844 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.route('**/api/scan-receipt', rt => rt.fulfill({ status: scan.status || 200, contentType: 'application/json', body: JSON.stringify(scan.body || OK) }));
  await page.route('**/api/translate', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, translations: [] }) }));
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(BASE); await page.waitForTimeout(500);
  return { page, ctx };
}
async function axe(page, nombre, scheme) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  const detalle = res.violations.map(v => `${v.id} [${v.impact}] ×${v.nodes.length}: ${(v.nodes[0].target || []).join(' ')} — ${(v.nodes[0].any[0] && v.nodes[0].any[0].message || '').slice(0, 110)}`);
  ok(res.violations.length === 0, `${scheme} · ${nombre}: sin violaciones de accesibilidad` + (detalle.length ? '\n      ' + detalle.join('\n      ') : ''));
}

for (const scheme of ['light', 'dark']) {
  let { page, ctx } = await pagina(scheme, {});
  await axe(page, 'inicio', scheme);
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 }); await page.waitForTimeout(300);
  await axe(page, 'revisión con aviso de que no cuadra', scheme);
  await page.click('[data-action="add-missing"]'); await page.waitForSelector('.banner.ok', { timeout: 4000 });
  await axe(page, 'revisión cuadrada', scheme);
  await page.click('[data-action="go"][data-to="people"]'); await page.waitForTimeout(250);
  await axe(page, 'personas', scheme);
  for (const nm of ['Ana', 'Beto']) { await page.fill('input[name="name"]', nm); await page.click('form[data-action="add-person"] button[type=submit]'); await page.waitForTimeout(120); }
  await axe(page, 'personas con gente', scheme);
  await page.click('[data-action="go"][data-to="assign"]'); await page.waitForTimeout(250);
  await axe(page, 'asignar', scheme);
  const todo = page.locator('[data-action="toggle-all"]'); const k = await todo.count(); for (let i = 0; i < k; i++) await todo.nth(0).click().catch(() => {});
  await page.click('[data-action="go"][data-to="summary"]').catch(() => {}); await page.waitForTimeout(300);
  await axe(page, 'resumen (cuánto paga cada uno)', scheme);
  await ctx.close();
  ({ page, ctx } = await pagina(scheme, { status: 503, body: { error: 'La lectura automática no está disponible en este momento. Puedes ingresar los ítems a mano.', code: 'SCAN_UNAVAILABLE' } }));
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.danger', { timeout: 9000 });
  await axe(page, 'error de lectura', scheme); await ctx.close();
  ({ page, ctx } = await pagina(scheme, { body: { ok: false, needs_confirmation: true, message: '¿Cuál es la moneda de esta boleta?', candidates: [{ code: 'US', name: 'Estados Unidos', currency: 'USD' }, { code: 'CA', name: 'Canadá', currency: 'CAD' }] } }));
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('text=¿De qué país es la boleta?', { timeout: 9000 });
  await axe(page, 'confirmar país', scheme); await ctx.close();
}
await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} pantallas sin problemas de accesibilidad`);
process.exit(fails ? 1 : 0);
