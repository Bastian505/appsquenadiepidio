#!/usr/bin/env node
// Prototipo "asignar hablando": apagado por defecto, no toca lo existente; encendido muestra qué entendió, se aplica y se puede deshacer.
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
const BASE = `http://localhost:${srv.address().port}/v2/`;

const draft = { step: 'assign', currency: 'ARS', restaurant: 'Test', country: null, items: [
  { id: 1, name: 'BIFE', price: 400, qty: 1 }, { id: 2, name: 'PIZZA', price: 300, qty: 1 }, { id: 3, name: 'CERVEZA', price: 100, qty: 4 }],
  people: [{ id: 1, name: 'Rodrigo', color: '#2563eb' }, { id: 2, name: 'Tiano', color: '#db2777' }], assigns: {}, tip: null, receiptTotal: null, recon: null, nextId: 3, share: null, myMemberId: null };

const browser = await chromium.launch();
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const calls = [];
  await page.route('**/api/assign', async rt => {
    const b = JSON.parse(rt.request().postData()); calls.push(b);
    await rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, assigns: [
      { item: 1, who: ['1'] }, { item: 2, who: ['2'] }, { item: 3, who: ['1', '2'], units: { 1: 3, 2: 1 } }] }) });
  });
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.addInitScript(d => { if (!localStorage.getItem('dc_seeded')) { localStorage.setItem('dc_seeded', '1'); localStorage.setItem('dc_v2_draft', JSON.stringify(d)); } }, draft);
  await page.goto(url); await page.waitForSelector('text=¿Quién consumió qué?', { timeout: 8000 });
  return { page, errs, calls };
}

// Apagado por defecto: ni se ve.
{
  const { page } = await open(BASE);
  ok(!/Asignar hablando/.test(await page.innerText('body')), 'apagado por defecto: no aparece nada nuevo');
}
// Encendido con ?voz=1
{
  const { page, errs, calls } = await open(BASE + '?voz=1');
  ok(/Asignar hablando/.test(await page.innerText('body')), 'con ?voz=1 aparece el botón (marcado como prueba)');
  await page.click('[data-action=voice-open]');
  await page.fill('textarea[name=voicetext]', 'yo el bife, Tiano la pizza, 3 cervezas yo y 1 Tiano');
  await page.click('[data-action=voice-go]');
  await page.waitForSelector('text=Esto entendí', { timeout: 5000 });
  ok(calls.length === 1 && calls[0].items.length === 3 && calls[0].people.length === 2 && calls[0].speaker === 1, 'manda ítems, personas y quién habla');
  ok(/BIFE/.test(await page.innerText('body')) && /CERVEZA/.test(await page.innerText('body')) && /Rodrigo \(3\)/.test(await page.innerText('body')), 'muestra lo que entendió, con unidades, antes de aplicar');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('dc_v2_draft')).assigns);
  ok(Object.keys(before).length === 0, 'mostrar la propuesta no cambia nada todavía');
  await page.click('[data-action=voice-apply]');
  await page.waitForTimeout(300);
  ok(/3 de 3 ítems asignados/.test(await page.innerText('body')), 'al aplicar quedan asignados los 3 ítems');
  const a = await page.evaluate(() => JSON.parse(localStorage.getItem('dc_v2_draft')).assigns);
  ok(a[1].people[0] === 1 && a[2].people[0] === 2 && a[3].units[1] === 3 && a[3].units[2] === 1, 'las marcas y unidades quedaron como se dictó');
  await page.click('[data-action=voice-undo]');
  await page.waitForTimeout(300);
  ok(/0 de 3 ítems asignados/.test(await page.innerText('body')), 'Deshacer devuelve todo a como estaba');
  ok(errs.length === 0, 'sin errores JS ' + errs.join('|'));
}
// Si el servicio falla, la app sigue sirviendo para marcar a mano.
{
  const { page } = await open(BASE + '?voz=1');
  await page.route('**/api/assign', rt => rt.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'x', code: 'ASSIGN_FAILED' }) }));
  await page.click('[data-action=voice-open]');
  await page.fill('textarea[name=voicetext]', 'yo el bife');
  await page.click('[data-action=voice-go]');
  await page.waitForSelector('.banner.danger', { timeout: 5000 });
  ok(/marcar a mano/.test(await page.innerText('body')), 'si falla, avisa y deja marcar a mano');
  await page.click('[data-action=voice-close]');
  await page.locator('.assign').first().locator('.pbtn').first().click();
  ok(/1 de 3 ítems asignados/.test(await page.innerText('body')), 'y marcar a mano sigue funcionando');
}
await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} comprobaciones de asignar hablando (pantalla) OK`);
process.exit(fails ? 1 : 0);
