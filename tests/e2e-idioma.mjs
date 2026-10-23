#!/usr/bin/env node
// Interfaz en inglés: se elige sola según el navegador, se puede cambiar a mano, se recuerda y recorre el flujo completo sin texto en español.
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PWLIB || 'playwright');
const ROOT = process.cwd(), IMG = 'services/ocr/evals/fixtures/MY/khan-jee-kl.jpg';
let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); } }).listen(0);
const BASE = `http://localhost:${srv.address().port}/v2/`;
const OK = { ok: true, restaurante: 'Pub KL', moneda: 'MYR', pais: 'MY', pais_nombre: 'Malasia', items: [
  { nombre: 'Heineken', precio_unitario: 18.2, cantidad: 5 }, { nombre: 'Biryani', precio_unitario: 54, cantidad: 1 }, { nombre: 'Burger', precio_unitario: 52, cantidad: 1 }], reconciliation: { ok: false, total_boleta: 260 } };
const browser = await chromium.launch();
async function abrir(locale) {
  const ctx = await browser.newContext({ locale, viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const traducidos = [];
  await page.route('**/api/scan-receipt', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OK) }));
  await page.route('**/api/translate', rt => { traducidos.push(JSON.parse(rt.request().postData()).lang); rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, translations: [] }) }); });
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(BASE); await page.waitForTimeout(400);
  return { page, errs, traducidos };
}
const txt = p => p.innerText('body');

{ // español por defecto en un navegador en español
  const { page } = await abrir('es-CL');
  ok(/Divide la cuenta en segundos/.test(await txt(page)) && await page.evaluate(() => document.documentElement.lang) === 'es', 'navegador en español: la app abre en español');
}
{ // inglés automático, flujo completo y recordado
  const { page, errs, traducidos } = await abrir('en-US');
  ok(/Split the bill in seconds/.test(await txt(page)) && await page.evaluate(() => document.documentElement.lang) === 'en', 'navegador en inglés: la app abre en inglés');
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  const rev = await txt(page);
  ok(/The total doesn.t match the receipt/.test(rev) && /Printed total/.test(rev) && /Add what.s missing/.test(rev) && /RM ?260\.00|RM ?260/.test(rev), 'revisión en inglés, con números al estilo inglés');
  ok(traducidos.length === 1 && traducidos[0] === 'en', 'los nombres de los platos se traducen al inglés');
  await page.click('[data-action="add-missing"]'); await page.waitForSelector('.banner.ok');
  ok((await page.locator('input.name').evaluateAll(e => e.map(x => x.value))).includes('Missing item') && /Matches the printed total/.test(await txt(page)), 'agregar lo que falta y cuadrar, en inglés');
  await page.click('[data-action="go"][data-to="people"]'); await page.waitForTimeout(200);
  for (const nm of ['Ana', 'Ben']) { await page.fill('input[name="name"]', nm); await page.click('form[data-action="add-person"] button[type=submit]'); await page.waitForTimeout(100); }
  ok(/Who.s here\?/.test(await txt(page)) && /Add everyone sharing the bill/.test(await txt(page)), 'personas en inglés');
  await page.click('[data-action="go"][data-to="assign"]'); await page.waitForTimeout(200);
  ok(/Who had what\?/.test(await txt(page)) && /0 of 4 items assigned/.test(await txt(page)), 'asignar en inglés');
  const todo = page.locator('[data-action="toggle-all"]'); const k = await todo.count(); for (let i = 0; i < k; i++) await todo.nth(0).click().catch(() => {});
  await page.click('[data-action="go"][data-to="summary"]'); await page.waitForTimeout(300);
  const res = await txt(page);
  ok(/What everyone pays/.test(res) && /Bill total/.test(res) && /Who paid the bill\?/.test(res), 'resumen en inglés');
  ok(!/(Cuánto|Total de la cuenta|Quién|Compartir|Ver detalle|Propina)/.test(res.replace(/Propina/g, 'x')), 'sin textos en español en el resumen');
  await page.reload(); await page.waitForTimeout(400);
  ok(/What everyone pays/.test(await txt(page)), 'al recargar sigue en inglés');
  ok(errs.length === 0, 'sin errores de JavaScript');
}
{ // cambio manual y memoria
  const { page } = await abrir('es-CL');
  await page.click('[data-action="lang"]'); await page.waitForTimeout(150);
  ok(/Split the bill in seconds/.test(await txt(page)) && await page.evaluate(() => localStorage.getItem('dc_lang')) === 'en', 'el botón EN cambia a inglés y lo recuerda');
  await page.reload(); await page.waitForTimeout(400);
  ok(/Split the bill in seconds/.test(await txt(page)), 'al volver abre en el idioma elegido');
  await page.click('[data-action="lang"]'); await page.waitForTimeout(150);
  ok(/Divide la cuenta en segundos/.test(await txt(page)), 'el botón ES vuelve al español');
}
await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} comprobaciones del idioma`);
process.exit(fails ? 1 : 0);
