#!/usr/bin/env node
// Prueba de punta a punta de la app v2 en Chromium (390x844), API simulada y sin internet.
// Uso: npm i --no-save playwright && npx playwright install chromium && node tests/e2e-v2.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PWLIB || 'playwright');
const ROOT = process.cwd(), OUT = process.env.E2E_OUT || null, DARK = !!process.env.E2E_DARK;
const IMG = 'services/ocr/evals/fixtures/MY/khan-jee-kl.jpg';
const SCAN = {
  ok: true, restaurante: 'Pub KL', moneda: 'MYR', pais: 'MY', pais_nombre: 'Malasia',
  items: [
    { nombre: 'Heineken H/Pint', precio_unitario: 18.2, cantidad: 5, confianza: 0.95 },
    { nombre: 'Guinness H/Pint', precio_unitario: 23.4, cantidad: 5, confianza: 0.95 },
    { nombre: 'Olive Afghani Mix Tandoori', precio_unitario: 118, cantidad: 1, confianza: 0.9 },
    { nombre: 'Gosht Hyderabadi Biryani', precio_unitario: 54, cantidad: 1, confianza: 0.62 },
    { nombre: 'Lamb Burger', precio_unitario: 52, cantidad: 1 },
    { nombre: 'French Fries', precio_unitario: 20, cantidad: 1 },
    { nombre: 'Service Charge', precio_unitario: 45.2, cantidad: 1 },
    { nombre: 'Impuesto', precio_unitario: 31.24, cantidad: 1 }],
  reconciliation: { ok: true, sum_items: 528.44, total_boleta: 528.44 }
};
const TOTAL = 528.44;
const num = t => parseFloat(String(t).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); } }).listen(0);
const BASE = `http://localhost:${srv.address().port}/v2/`;
const browser = await chromium.launch();
const shot = async (p, name) => { if (OUT) await p.screenshot({ path: path.join(OUT, (DARK ? 'dark-' : '') + name), fullPage: true }); };

async function open(scan) {
  const ctx = await browser.newContext({ locale: 'es-CL', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: DARK ? 'dark' : 'light' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const sent = [], translated = [];
  page._translated = translated;
  await page.route('**/api/scan-receipt', async rt => { sent.push(JSON.parse(rt.request().postData())); await new Promise(r => setTimeout(r, 2500)); await rt.fulfill({ status: scan.status, contentType: 'application/json', body: JSON.stringify(scan.body) }); });
  await page.route('**/api/translate', async rt => { const b = JSON.parse(rt.request().postData()); translated.push(b); await rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, translations: b.names.map(n => n === 'Gosht Hyderabadi Biryani' ? 'Biryani de cordero' : n === 'French Fries' ? 'Papas fritas' : n) }) }); });
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(BASE); return { page, errs, sent };
}

// 1) Flujo completo
{
  const { page, errs, sent } = await open({ status: 200, body: SCAN });
  await shot(page, 'v2-1-inicio.png');
  await page.setInputFiles('#photo', IMG);
  await page.waitForTimeout(900); await shot(page, 'v2-2-leyendo.png');
  await page.waitForSelector('text=Agregar personas', { timeout: 8000 });
  ok(sent.length === 1 && !('api_key' in sent[0]), 'envía la foto una vez y sin API key');
  let body = await page.innerText('body');
  ok(/RM91,00/.test(body), 'ítems en RM');
  ok(/Cuadra con el total impreso/.test(body), 'confirma que cuadra con la boleta');
  ok(/528,44/.test(body), 'total RM528,44');
  ok(/revisar/.test(body), 'marca el ítem de baja confianza');
  await page.waitForTimeout(400);
  body = await page.innerText('body');
  ok(page._translated.length === 1 && page._translated[0].lang === 'es', 'pide traducción una vez, al español');
  ok(/Biryani de cordero/.test(body) && /Papas fritas/.test(body), 'muestra la traducción bajo el nombre original');
  await shot(page, 'v2-3-revision.png');
  await page.click('text=Agregar personas');
  for (const nm of ['Rodrigo', 'Tiano', 'Caro']) { await page.fill('input[name=name]', nm); await page.press('input[name=name]', 'Enter'); }
  await shot(page, 'v2-4-personas.png');
  await page.click('text=Asignar ítems');
  body = await page.innerText('body');
  ok(!/Service Charge|Impuesto/.test(body), 'impuesto y servicio no aparecen para asignar');
  // Heineken: unidades 2/2/1; Guinness: todos; resto variado
  const rows = page.locator('.assign');
  await rows.nth(0).locator('.pbtn.all').click();
  await rows.nth(0).locator('text=Repartir por unidades').click();
  for (const [who, k] of [['Rodrigo', 2], ['Tiano', 2], ['Caro', 1]]) for (let i = 0; i < k; i++) await rows.nth(0).locator('.unit', { hasText: who }).locator('button[aria-label="Más"]').click();
  await rows.nth(1).locator('.pbtn.all').click();
  await rows.nth(2).locator('.pbtn', { hasText: 'Rodrigo' }).click(); await rows.nth(2).locator('.pbtn', { hasText: 'Tiano' }).click();
  await rows.nth(3).locator('.pbtn', { hasText: 'Caro' }).click();
  await rows.nth(4).locator('.pbtn', { hasText: 'Tiano' }).click();
  await rows.nth(5).locator('.pbtn.all').click();
  body = await page.innerText('body');
  ok(/6 de 6 ítems asignados/.test(body), 'progreso 6 de 6');
  await shot(page, 'v2-5-asignar.png');
  await page.click('text=Ver cuánto paga');
  const amounts = await page.$$eval('.pcard .amount', els => els.map(e => e.textContent));
  const sum = amounts.map(num).reduce((a, b) => a + b, 0);
  ok(amounts.length === 3, 'tres cuentas: ' + amounts.join(' · '));
  ok(Math.abs(sum - TOTAL) < 0.005, `suman exacto el total: ${sum.toFixed(2)}`);
  body = await page.innerText('body');
  ok(/Todo repartido/.test(body), 'muestra que todo está repartido y cuadra');
  await page.locator('.pcard summary').first().click();
  await shot(page, 'v2-6-cobro.png');
  ok(/Impuesto y cargos \(/.test(await page.innerText('body')), 'detalle con impuesto y cargos');
  // Cobro en un solo teléfono: se elige quién pagó, se marca quién ya le pagó y el mensaje lo dice.
  ok(/Cobro/.test(await page.innerText('body')) && /¿Quién pagó la cuenta\?/.test(await page.innerText('body')), 'hay sección de cobro con "¿Quién pagó la cuenta?"');
  const first = await page.locator('[data-action=toggle-paid]').count();
  ok(first === 2, 'quedan dos personas por cobrarle al que pagó: ' + first);
  await page.locator('[data-action=toggle-paid]').first().click();
  ok(/✓ Pagó/.test(await page.innerText('body')), 'se puede marcar que alguien ya pagó');
  await page.fill('textarea[name=payinfo]', 'Alias: yo.pago'); await page.locator('textarea[name=payinfo]').blur();
  const shared = await page.evaluate(() => { let t = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: x => { t = x; return Promise.resolve(); } } }); document.querySelector('[data-action=copy]').click(); return new Promise(r => setTimeout(() => r(t), 100)); });
  ok(/Pagó /.test(shared) && /Alias: yo\.pago/.test(shared) && /✓ pagó/.test(shared), 'el mensaje dice quién pagó, los datos para transferir y quién ya pagó');
  ok(await page.evaluate(() => localStorage.getItem('dc_pay_info')) === 'Alias: yo.pago', 'los datos para transferir se recuerdan en este teléfono');
  // Una cuenta nueva ya trae mis datos para transferir (no hay que volver a escribirlos).
  await page.evaluate(() => localStorage.removeItem('dc_v2_draft')); await page.reload(); await page.waitForTimeout(500);
  await page.click('text=Ingresar ítems a mano');
  await page.click('text=Agregar personas').catch(() => {});
  for (const nm of ['Ana', 'Beto']) { await page.fill('input[name=name]', nm); await page.press('input[name=name]', 'Enter'); }
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('dc_v2_draft')); d.items = [{ id: 1, name: 'Pizza', price: 100, qty: 1 }]; d.assigns = { 1: { people: [d.people[0].id], units: {} } }; d.step = 'summary'; localStorage.setItem('dc_v2_draft', JSON.stringify(d)); });
  await page.reload(); await page.waitForSelector('textarea[name=payinfo]', { timeout: 5000 });
  ok(await page.inputValue('textarea[name=payinfo]') === 'Alias: yo.pago', 'una cuenta nueva ya trae los datos para transferir guardados');
  ok(errs.length === 0, 'sin errores JS ' + errs.join('|'));
  // persistencia: recarga y sigue en el resumen
  await page.reload(); await page.waitForTimeout(400);
  ok(/Cuánto paga cada uno/.test(await page.innerText('body')), 'recargar no pierde la cuenta');
}
// 2) Lectura no disponible
{
  const { page, errs } = await open({ status: 503, body: { error: 'La lectura automática no está disponible en este momento. Puedes ingresar los ítems a mano.', code: 'SCAN_UNAVAILABLE' } });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.danger', { timeout: 8000 });
  const body = await page.innerText('body');
  ok(/no está disponible/.test(body) && /Ingresar ítems a mano/.test(body), 'aviso + opción manual');
  await shot(page, 'v2-7-no-disponible.png');
  ok(errs.length === 0, 'sin errores JS');
}
// 3) Confirmación de país
{
  const { page } = await open({ status: 200, body: { ok: false, needs_confirmation: true, message: '¿Cuál es la moneda de esta boleta?', candidates: [{ code: 'US', name: 'Estados Unidos', currency: 'USD' }, { code: 'CA', name: 'Canadá', currency: 'CAD' }] } });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('text=¿De qué país es la boleta?', { timeout: 8000 });
  ok(await page.locator('.chip', { hasText: 'Canadá' }).count() === 1, 'ofrece elegir país');
}
await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} comprobaciones v2 OK`);
process.exit(fails ? 1 : 0);
