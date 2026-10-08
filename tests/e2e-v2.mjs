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
  page._translated = translated; page._scanHeaders = [];
  await page.route('**/api/scan-receipt', async rt => { sent.push(JSON.parse(rt.request().postData())); page._scanHeaders.push(rt.request().headers()); await new Promise(r => setTimeout(r, 2500)); await rt.fulfill({ status: scan.status, contentType: 'application/json', body: JSON.stringify(scan.body) }); });
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
  // Recordar por WhatsApp: mensaje personalizado con nombre, monto y datos para transferir; solo a quien no ha pagado.
  const remindBtns = await page.locator('[data-action=remind]').count();
  ok(remindBtns === 1, 'hay botón "Recordar" solo para quien aún no paga (uno ya está marcado como pagado): ' + remindBtns);
  const opened = await page.evaluate(() => { let u = ''; window.open = x => { u = x; }; document.querySelector('[data-action=remind]').click(); return u; });
  const msg = decodeURIComponent(opened.split('text=')[1] || '');
  ok(/^https:\/\/wa\.me\/\?text=/.test(opened) && /Hola \S+!/.test(msg) && /tu parte es/.test(msg) && /Alias: yo\.pago/.test(msg), 'el recordatorio abre WhatsApp con el nombre, el monto y los datos para transferir');
  const shared = await page.evaluate(() => { let t = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: x => { t = x; return Promise.resolve(); } } }); document.querySelector('[data-action=copy]').click(); return new Promise(r => setTimeout(() => r(t), 100)); });
  ok(/Pagó /.test(shared) && /Alias: yo\.pago/.test(shared) && /✓ pagó/.test(shared), 'el mensaje dice quién pagó, los datos para transferir y quién ya pagó');
  ok(await page.evaluate(() => localStorage.getItem('dc_pay_info')) === 'Alias: yo.pago', 'los datos para transferir se recuerdan en este teléfono');
  // Una cuenta nueva ya trae mis datos para transferir (no hay que volver a escribirlos).
  await page.evaluate(() => localStorage.removeItem('dc_v2_draft')); await page.reload(); await page.waitForTimeout(500);
  // Cobros pendientes: la cuenta anterior queda en la pantalla de inicio con lo que aún me deben.
  ok(/Cobros pendientes/.test(await page.innerText('body')), 'el inicio muestra "Cobros pendientes" de la cuenta anterior');
  ok(await page.locator('[data-action=ledger-remind]').count() === 1, 'solo aparece quien aún no pagó (el otro ya estaba marcado)');
  const openedL = await page.evaluate(() => { let u = ''; window.open = x => { u = x; }; document.querySelector('[data-action=ledger-remind]').click(); return u; });
  const msgL = decodeURIComponent(openedL.split('text=')[1] || '');
  ok(/tu parte es/.test(msgL) && /Alias: yo\.pago/.test(msgL), 'Recordar desde el inicio arma el mensaje con el monto y los datos para transferir');
  await page.click('[data-action=ledger-paid]');
  ok(!/Cobros pendientes/.test(await page.innerText('body')), 'al marcar "Ya pagó" desaparece de la lista');
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
// 4) Propina sugerida impresa en la boleta: queda preseleccionada
{
  const base = { ok: true, restaurante: 'Tquila', moneda: 'CLP', pais: 'CL', pais_nombre: 'Chile', items: [{ nombre: 'Churros', precio_unitario: 6490, cantidad: 1 }, { nombre: 'Agua', precio_unitario: 2990, cantidad: 2 }], reconciliation: { ok: true, total_boleta: 12470 } };
  for (const [sug, esperado, etiqueta] of [[10, '10% · sugerida', 'del 10 %'], [18, '18% · sugerida', 'del 18 % (no está entre los botones fijos)'], [null, 'Sin propina', 'sin sugerencia']]) {
    const { page, errs } = await open({ status: 200, body: { ...base, propina_sugerida_pct: sug } });
    await page.setInputFiles('#photo', IMG); await page.waitForSelector('.chips', { timeout: 9000 });
    const on = (await page.locator('.chips .chip.on').first().innerText()).trim();
    ok(on === esperado, `propina sugerida ${etiqueta}: queda marcada "${esperado}" (vi "${on}")`);
    ok(errs.length === 0, 'sin errores JS');
  }
}
// 4b) Servicio sumado al total impreso (boletas reales de Río de Janeiro)
{ // R21 Barra: la IA lo leyó como "propina sugerida 10 %"; ítems + 10 % = total impreso → cuadra, sin duplicar
  const body = { ok: true, restaurante: 'R21 BARRA', moneda: 'BRL', pais: 'BR', pais_nombre: 'Brasil', propina_sugerida_pct: 10,
    items: [{ nombre: 'COMBO CAMARAO PARISIENSE', precio_unitario: 139.9, cantidad: 1 }, { nombre: 'CAIPIRINHA TRADICIONAL', precio_unitario: 22.9, cantidad: 1 }, { nombre: 'CANECA ZERO GRAU BRAHMA', precio_unitario: 12.9, cantidad: 1 }],
    reconciliation: { ok: false, total_boleta: 193.27 }, total_referencia: 193.27 };
  const { page, errs } = await open({ status: 200, body });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner', { timeout: 9000 });
  ok(/Cuadra con el total impreso/.test(await page.innerText('.banner.ok')) && /servicio del 10 %/.test(await page.innerText('.banner.ok')), 'R21: ítems + servicio del 10 % cuadran con el total impreso (no avisa "no coincide")');
  ok(/R\$193,27/.test(await page.locator('.row.grand').innerText()), 'R21: el total de la cuenta es R$193,27 (no se duplica el servicio)');
  await page.click('.chip:has-text("Sin propina")');
  ok(/Actívalo en Propina/.test(await page.innerText('.banner.warn')) && await page.locator('[data-action=apply-service]').count() === 1, 'R21: sin propina, avisa que el total impreso incluye el servicio y ofrece aplicarlo');
  await page.click('[data-action=apply-service]');
  ok(/R\$193,27/.test(await page.locator('.row.grand').innerText()) && await page.locator('.banner.ok').count() === 1, 'R21: aplicar el servicio vuelve a dejar R$193,27');
  ok(errs.length === 0, 'sin errores JS ' + errs.join('|'));
}
{ // Marius Degustare: faltan R$90,36 = 12 % exacto de R$753,00 → un toque aplica el servicio
  const body = { ok: true, restaurante: 'MARIUS DEGUSTARE', moneda: 'BRL', pais: 'BR', pais_nombre: 'Brasil', propina_sugerida_pct: null,
    items: [{ nombre: 'CAIPIRAS', precio_unitario: 30, cantidad: 2 }, { nombre: 'MENU DEGUSTACAO', precio_unitario: 190, cantidad: 3 }, { nombre: 'AGUA MINERAL SEM GAS', precio_unitario: 11, cantidad: 1 },
      { nombre: 'COCA COLA', precio_unitario: 11, cantidad: 1 }, { nombre: 'LIMONADA SUICA', precio_unitario: 21, cantidad: 1 }, { nombre: 'BADEN BADEN WEISS', precio_unitario: 40, cantidad: 2 }],
    reconciliation: { ok: false, total_boleta: 843.36 }, total_referencia: 843.36 };
  const { page, errs } = await open({ status: 200, body });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  ok(/12 %/.test(await page.innerText('.banner.warn')) && await page.locator('[data-action=apply-service]').count() === 1, 'Marius: detecta que lo que falta es el 12 % y ofrece aplicarlo');
  await page.click('[data-action=apply-service]');
  ok(/R\$843,36/.test(await page.locator('.row.grand').innerText()) && /Cuadra con el total impreso/.test(await page.innerText('.banner.ok')), 'Marius: con un toque el total es R$843,36 y cuadra');
  await page.click('.chip:has-text("Otro %")'); await page.fill('.chip-input', '15'); await page.click('[data-action=tip-apply]');
  ok(/R\$865,95|R\$865,94/.test(await page.locator('.row.grand').innerText()) || await page.locator('.chip.on:has-text("15%")').count() === 1, 'Otro %: "15" se aplica como 15 % (no como monto)');
  await page.click('.chip:has-text("Otro monto")'); await page.fill('.chip-input', '50'); await page.click('[data-action=tip-apply]');
  ok(/R\$50,00/.test(await page.locator('.totals').innerText()), 'Otro monto: "50" se aplica como monto');
  await page.click('.chip:has-text("Otro %")'); await page.fill('.chip-input', '12%'); await page.click('[data-action=tip-apply]');
  ok(await page.locator('.chip.on:has-text("12%")').count() === 1, 'escribir "12 %" siempre es porcentaje');
  ok(errs.length === 0, 'sin errores JS ' + errs.join('|'));
}
// 4c) Egipto (boletas reales): un 8 % no es un servicio; y el servicio va sobre el consumo, antes del IVA
{ // Bayouki: la IA no sumó el "Bayouki Rice 40" al pollo (270). Faltan 40 = 8 % de 500: NO debe ofrecer "servicio del 8 %"
  const body = { ok: true, restaurante: 'Bayouki', moneda: 'EGP', pais: 'EG', pais_nombre: 'Egipto', propina_sugerida_pct: null,
    items: [{ nombre: '1/2 Roasted Chicken', precio_unitario: 230, cantidad: 1 }, { nombre: '1/2 Loaded Musakhan', precio_unitario: 270, cantidad: 1 }],
    reconciliation: { ok: false, total_boleta: 540 }, total_referencia: 540 };
  const { page, errs } = await open({ status: 200, body });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  ok(await page.locator('[data-action=apply-service]').count() === 0 && !/servicio o propina sumado/.test(await page.innerText('.banner.warn')), 'Bayouki: un 8 % no se ofrece como servicio');
  ok(await page.locator('[data-action=add-missing]').count() === 1, 'Bayouki: sigue ofreciendo "Agregar lo que falta"');
  ok(errs.length === 0, 'sin errores JS');
}
{ // Table 9: ítems 1735 + servicio 12 % (208,20) + IVA 14 % (272,05): faltan 480,25 y el IVA ya viene como ítem
  const body = { ok: true, restaurante: 'Table 9', moneda: 'EGP', pais: 'EG', pais_nombre: 'Egipto', propina_sugerida_pct: null,
    items: [{ nombre: 'Fresh Mango Juice', precio_unitario: 115, cantidad: 2 }, { nombre: 'Minted Lemonade', precio_unitario: 95, cantidad: 1 }, { nombre: 'Mixed Fresh Juice', precio_unitario: 115, cantidad: 1 },
      { nombre: 'Fattoush', precio_unitario: 150, cantidad: 1 }, { nombre: 'Lahm Bi Ajin', precio_unitario: 185, cantidad: 2 }, { nombre: 'Grilled Chicken Wings', precio_unitario: 285, cantidad: 1 },
      { nombre: 'Chicken Tawouk', precio_unitario: 385, cantidad: 1 }, { nombre: 'Flavoured Tea', precio_unitario: 60, cantidad: 1 }, { nombre: 'Small Water', precio_unitario: 45, cantidad: 1 },
      { nombre: 'Impuesto', precio_unitario: 272.05, cantidad: 1 }],
    reconciliation: { ok: false, total_boleta: 2215.25 }, total_referencia: 2215.25 };
  const { page, errs } = await open({ status: 200, body });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  ok(/12 %/.test(await page.innerText('.banner.warn')) && await page.locator('[data-action=apply-service]').count() === 1, 'Table 9: detecta que lo que falta es el 12 % del consumo (antes del IVA)');
  await page.click('[data-action=apply-service]');
  ok(/2\.215,25/.test(await page.locator('.row.grand').innerText()) && await page.locator('.banner.ok').count() === 1 && await page.locator('input.name[value="Servicio"]').count() === 1, 'Table 9: con un toque el total es EGP2.215,25 y el servicio queda como cargo');
  ok(errs.length === 0, 'sin errores JS');
}
// 5) Cuota de lecturas: el escaneo viaja con la sesión anónima; con la cuota agotada se muestra el aviso
{
  const { page, errs } = await open({ status: 200, body: SCAN });
  await page.evaluate(() => window.DC_SYNC._setClient({ auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'aaa.bbb.ccc' } } }) } }));
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.chips', { timeout: 9000 });
  ok(page._scanHeaders[0] && page._scanHeaders[0].authorization === 'Bearer aaa.bbb.ccc', 'el escaneo manda la sesión anónima en Authorization');
  ok(errs.length === 0, 'sin errores JS');
}
{
  const { page } = await open({ status: 429, body: { error: 'Llegaste al límite de 30 lecturas de este mes. Puedes ingresar los ítems a mano.', code: 'QUOTA_EXCEEDED', used: 30, limit: 30 } });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.danger', { timeout: 9000 });
  const body = await page.innerText('body');
  ok(/límite de 30 lecturas/.test(body) && /Ingresar ítems a mano/.test(body), 'cuota agotada: avisa el límite y ofrece ingresar a mano');
}
{
  const { page } = await open({ status: 200, body: { ...SCAN, quota: { used: 29, limit: 30 } } });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.chips', { timeout: 9000 });
  ok(/te quedan 1 lectura este mes/.test(await page.innerText('body')), 'quedando 1 lectura: lo avisa');
}
// 6) Cuando la boleta no cuadra: guía para arreglarla y métricas sin contenido
const FAKE_SB = () => window.DC_SYNC._setClient({ auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'aaa.bbb.ccc' } } }) }, rpc: (n, a) => { (window.__rpc = window.__rpc || []).push([n, a]); return Promise.resolve({ data: null }); } });
const evs = page => page.evaluate(() => (window.__rpc || []).filter(x => x[0] === 'dc_track_event').map(x => ({ e: x[1].p_event, p: x[1].p_props })));
{ // faltan 32: agregar lo que falta
  const { page, errs, sent } = await open({ status: 200, body: { ...SCAN, reconciliation: { ok: false, total_boleta: 560.44 } } });
  await page.evaluate(FAKE_SB);
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  let body = await page.innerText('.banner.warn');
  ok(/La suma no coincide/.test(body) && /faltan/.test(body) && /Agregar lo que falta/.test(body) && /Sacar otra foto/.test(body), 'faltan montos: avisa cuánto, ofrece agregar lo que falta y sacar otra foto');
  // sacar otra foto desde la revisión
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  ok(sent.length === 2, 'sacar otra foto desde la revisión vuelve a leer la boleta');
  await page.click('[data-action="add-missing"]'); await page.waitForSelector('.banner.ok', { timeout: 4000 });
  ok(await page.locator('input.name[value="Ítem que faltaba"]').count() === 1 && /Cuadra con el total/.test(await page.innerText('.banner.ok')), 'agregar lo que falta: cuadra y el ítem queda editable');
  await page.waitForTimeout(300);
  const e = await evs(page), names = e.map(x => x.e);
  ok(names.includes('scan_ok') && names.includes('mismatch_shown') && names.includes('retake') && names.includes('mismatch_fix'), 'métricas: escaneo, aviso, nueva foto y arreglo registrados (' + names.join(', ') + ')');
  ok(e.find(x => x.e === 'mismatch_fix').p.via === 'agregar', 'métricas: dice cómo se arregló (agregar)');
  ok(!/Heineken|Guinness|Biryani|Burger|Pub KL/.test(JSON.stringify(e)), 'métricas: ningún nombre de ítem ni de local viaja en los eventos');
  ok(errs.length === 0, 'sin errores JS');
}
{ // sobran: marca al sospechoso y deja quitarlo
  const body = { ok: true, restaurante: 'Tquila', moneda: 'CLP', pais: 'CL', pais_nombre: 'Chile', items: [{ nombre: 'Churros', precio_unitario: 6490, cantidad: 1 }, { nombre: 'Agua', precio_unitario: 2990, cantidad: 2 }, { nombre: 'Duplicado', precio_unitario: 5980, cantidad: 1 }], reconciliation: { ok: false, total_boleta: 12470 } };
  const { page } = await open({ status: 200, body });
  await page.evaluate(FAKE_SB);
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  ok(/sobran/.test(await page.innerText('.banner.warn')) && /Marqué en rojo/.test(await page.innerText('.banner.warn')), 'sobran montos: avisa y dice que marcó lo sospechoso');
  ok(await page.locator('.item.suspect').count() === 2 && await page.locator('.hint', { hasText: 'Si este ítem no va' }).count() === 2, 'marca en rojo los ítems que explican la diferencia');
  await page.locator('.item.suspect:has(input.name[value="Duplicado"]) [data-fix="1"]').click(); await page.waitForSelector('.banner.ok', { timeout: 4000 });
  ok(await page.locator('.item.suspect').count() === 0, 'al quitar el sospechoso cuadra y desaparece la marca');
  await page.waitForTimeout(300);
  const e = await evs(page);
  ok(e.find(x => x.e === 'mismatch_fix') && e.find(x => x.e === 'mismatch_fix').p.via === 'quitar', 'métricas: arreglo por quitar el ítem');
  await page.click('[data-action="go"][data-to="people"]'); await page.waitForTimeout(300);
  const e2 = await evs(page); const rd = e2.find(x => x.e === 'review_done');
  ok(rd && rd.p.ok === true && rd.p.edits >= 1, 'métricas: review_done dice que cuadró y cuántas correcciones hubo');
}
{ // unidades de más: sugiere dejar una menos
  const body = { ok: true, restaurante: 'X', moneda: 'CLP', pais: 'CL', pais_nombre: 'Chile', items: [{ nombre: 'Cerveza', precio_unitario: 3000, cantidad: 3 }, { nombre: 'Pizza', precio_unitario: 9000, cantidad: 1 }], reconciliation: { ok: false, total_boleta: 15000 } };
  const { page } = await open({ status: 200, body });
  await page.setInputFiles('#photo', IMG); await page.waitForSelector('.banner.warn', { timeout: 9000 });
  ok(await page.locator('.hint', { hasText: 'una unidad menos' }).count() === 1, 'una unidad de más: lo sugiere');
  await page.click('[data-action="fix-qty"]'); await page.waitForSelector('.banner.ok', { timeout: 4000 });
  ok(/Cuadra/.test(await page.innerText('.banner.ok')), 'dejar una unidad menos: cuadra');
}
await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} comprobaciones v2 OK`);
process.exit(fails ? 1 : 0);
