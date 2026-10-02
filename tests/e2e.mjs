#!/usr/bin/env node
// Prueba de punta a punta en un navegador real (Chromium, tamaño iPhone), sin API ni internet:
// la respuesta de /api/scan-receipt se simula. Recorre: escanear → personas → asignar → cobrar,
// y comprueba que las cuentas suman el total de la boleta. También el aviso de "lectura no
// disponible". Corre sobre ambas copias de la app (/ y /apps/divicuenta/).
// Uso: npm i --no-save playwright && npx playwright install chromium && node tests/e2e.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PWLIB || 'playwright');

const ROOT = process.cwd();
const IMG = 'services/ocr/evals/fixtures/MY/khan-jee-kl.jpg';
const OUT = process.env.E2E_OUT || null; // carpeta para capturas (opcional)

// Boleta simulada (Malasia, del caso real): ítems + servicio + impuesto = 1.013,00
const SCAN_OK = {
  ok: true, restaurante: 'Pub KL', moneda: 'MYR', pais: 'MY', pais_nombre: 'Malasia',
  items: [
    { nombre: 'Heineken H/Pint', precio_unitario: 18.2, cantidad: 5 },
    { nombre: 'Guinness H/Pint', precio_unitario: 23.4, cantidad: 5 },
    { nombre: 'Olive Afghani Mix Tandoori', precio_unitario: 118, cantidad: 1 },
    { nombre: 'Gosht Hyderabadi Biryani', precio_unitario: 54, cantidad: 1 },
    { nombre: 'Lamb Burger', precio_unitario: 52, cantidad: 1 },
    { nombre: 'French Fries', precio_unitario: 20, cantidad: 1 },
    { nombre: 'Service Charge', precio_unitario: 44.7, cantidad: 1 },
    { nombre: 'Impuesto', precio_unitario: 31.74, cantidad: 1 }
  ],
  total: 528.44,
  reconciliation: { ok: true, sum_items: 528.44, total_boleta: 528.44, diff_ratio: 0, auto_fixed: false },
  warnings: []
};
const EXPECTED_TOTAL = 528.44;
const SCAN_UNAVAILABLE = { error: 'La lectura automática no está disponible en este momento. Puedes ingresar los ítems a mano.', code: 'SCAN_UNAVAILABLE' };

const num = t => parseFloat(String(t).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200); r.end(fs.readFileSync(f)); }
  else { r.writeHead(404); r.end(); }
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();

async function openApp(urlPath, scanResponse) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const sent = [];
  await page.route('**/api/scan-receipt', async route => {
    sent.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: scanResponse.status, contentType: 'application/json', body: JSON.stringify(scanResponse.body) });
  });
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort()); // sin internet: CDN, Supabase, FX
  await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2300); // splash
  const skip = page.getByText('Ahora no, seguir sin cuenta');
  if (await skip.count()) { await skip.first().click(); await page.waitForTimeout(500); }
  await page.getByText('¡Dividir mi cuenta!').first().click();
  await page.waitForTimeout(800);
  await (await page.$('input[type=file]')).setInputFiles(IMG);
  await page.waitForTimeout(3500);
  return { page, errors, sent };
}
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name), fullPage: true }); };

for (const urlPath of ['/', '/apps/divicuenta/']) {
  console.log(`\n${urlPath}`);

  // ── 1) Flujo completo ────────────────────────────────────────────────────
  {
    const { page, errors, sent } = await openApp(urlPath, { status: 200, body: SCAN_OK });
    ok(sent.length === 1, 'envía la foto al servidor una vez');
    ok(sent[0] && !('api_key' in sent[0]), 'no envía ninguna API key');
    const body1 = await page.innerText('body');
    ok(/RM\s?91,00/.test(body1), 'muestra los ítems en RM (Heineken x5 = RM91,00)');
    ok(/528,44/.test(body1), 'total a dividir = RM528,44');
    await shot(page, `e2e${urlPath.replace(/\//g, '_')}1-items.png`);

    await page.getByText('Agregar personas').first().click();
    for (const n of ['Ana', 'Beto']) { await page.fill('#p-inp', n); await page.press('#p-inp', 'Enter'); }
    await page.click('#p2-next');
    await page.click('#modo-solo-card');
    await page.waitForTimeout(600);
    const body3 = await page.innerText('body');
    ok(!/Service Charge|Impuesto/.test(body3.split('Ver resumen final')[0]), 'impuesto y servicio no aparecen para asignar');
    await page.getByText('Todos compartimos todo').first().click();
    await page.getByText('Ver resumen final').first().click();
    await page.waitForTimeout(800);
    await shot(page, `e2e${urlPath.replace(/\//g, '_')}2-cobrar.png`);

    const amounts = await page.$$eval('#summary-body .sum-total', els => els.map(e => e.childNodes[0]?.textContent || e.textContent));
    const sum = amounts.map(num).reduce((a, b) => a + b, 0);
    ok(amounts.length === 2, `una cuenta por persona (${amounts.join(' · ')})`);
    ok(Math.abs(sum - EXPECTED_TOTAL) <= 0.05, `las cuentas suman el total: ${sum.toFixed(2)} vs ${EXPECTED_TOTAL}`);
    const body4 = await page.innerText('body');
    ok(/Impuesto y cargos \(\d+(\.\d)?%\)/.test(body4), 'cada cuenta muestra "Impuesto y cargos (X%) incluido"');
    ok(!/Redondear a/.test(body4), 'sin barra de redondeo tipo CLP en una moneda con centavos');
    ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await page.close();
  }

  // ── 2) Lectura no disponible (saldo agotado, cuota…) ──────────────────────
  {
    const { page, errors } = await openApp(urlPath, { status: 503, body: SCAN_UNAVAILABLE });
    const body = await page.innerText('body');
    ok(/no está disponible en este momento/.test(body), 'muestra el aviso de lectura no disponible');
    ok(/Ingresar a mano/.test(body), 'ofrece ingresar los ítems a mano');
    ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await shot(page, `e2e${urlPath.replace(/\//g, '_')}3-no-disponible.png`);
    await page.close();
  }
}

await browser.close(); server.close();
console.log(failures ? `\n${failures} fallo(s) de ${checks}` : `\n✓ ${checks} comprobaciones de punta a punta OK`);
process.exit(failures ? 1 : 0);
