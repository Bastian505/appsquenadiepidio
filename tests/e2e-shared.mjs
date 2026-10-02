#!/usr/bin/env node
// Cuentas compartidas: dos "teléfonos" a la vez contra un Supabase falso que corre en este proceso.
// Comprueba el caso real: el anfitrión comparte, el invitado entra por el link, marca lo suyo
// y ambos ven lo mismo. Las reglas de permisos se prueban aparte, contra Postgres (tests/check-sql.sh).
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PWLIB || 'playwright');
const ROOT = process.cwd(), OUT = process.env.E2E_OUT || null;
const IMG = 'services/ocr/evals/fixtures/MY/khan-jee-kl.jpg';

const SCAN = {
  ok: true, restaurante: 'Pub KL', moneda: 'MYR', pais: 'MY', pais_nombre: 'Malasia',
  items: [
    { nombre: 'Pizza', precio_unitario: 100, cantidad: 1 },
    { nombre: 'Cerveza', precio_unitario: 20, cantidad: 2 },
    { nombre: 'Service Charge', precio_unitario: 14, cantidad: 1 }],
  reconciliation: { ok: true, total_boleta: 154 }
};

let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) {
    r.writeHead(200, { 'Content-Type': p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.svg') ? 'image/svg+xml' : 'text/html' });
    r.end(fs.readFileSync(f));
  } else { r.writeHead(404); r.end(); }
}).listen(0);
const BASE = `http://localhost:${srv.address().port}/v2/`;

// ── Supabase falso: vive en Node, compartido por las dos pestañas ────────────
const db = { bills: [], members: [], claims: [] };
const fakeSupabase = `
window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: window.__uid } } } }), signInAnonymously: async () => ({ data: {}, error: null }) },
  rpc: (fn, args) => window.__rpc(fn, args).then(data => ({ data, error: null })).catch(e => ({ data: null, error: { message: e.message } })),
  from: (table) => {
    const q = { table, filters: [], _then: null };
    const run = () => window.__db(table, q.op, q.payload, q.filters);
    q.select = () => { q.op = 'select'; return q; };
    q.insert = (p) => { q.op = 'insert'; q.payload = p; return q; };
    q.update = (p) => { q.op = 'update'; q.payload = p; return q; };
    q.upsert = (p) => { q.op = 'upsert'; q.payload = p; return q; };
    q.delete = () => { q.op = 'delete'; return q; };
    q.eq = (c, v) => { q.filters.push([c, v]); return q; };
    q.order = () => q;
    q.maybeSingle = () => run().then(rows => ({ data: rows[0] || null, error: null }));
    q.then = (res, rej) => run().then(rows => ({ data: rows, error: null })).then(res, rej);
    return q;
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {}
}) };`;

async function wire(page, uid) {
  await page.addInitScript(`window.__uid = ${JSON.stringify(uid)};`);
  await page.exposeFunction('__rpc', async (fn, args) => {
    if (fn === 'dc_create_bill') {
      const bill = { id: 'b1', host_id: uid, share_token: (Math.random().toString(36) + Math.random().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 22), currency: args.p_currency, items: [], tip: null, status: 'open', restaurant: null, country_code: null, receipt_total: null };
      db.bills.push(bill);
      const m = { id: 'm-' + uid, bill_id: bill.id, user_id: uid, name: args.p_name };
      db.members.push(m);
      return [{ out_bill_id: bill.id, out_member_id: m.id, out_share_token: bill.share_token }];
    }
    if (fn === 'dc_join_bill') {
      const bill = db.bills.find(b => b.share_token === args.p_token && b.status === 'open');
      if (!bill) return [];                                   // token inválido → sin filas
      let m = db.members.find(x => x.bill_id === bill.id && x.user_id === uid);
      if (!m) { m = { id: 'm-' + uid, bill_id: bill.id, user_id: uid, name: args.p_name }; db.members.push(m); }
      else m.name = args.p_name;
      return [{ out_bill_id: bill.id, out_member_id: m.id }];
    }
    throw new Error('rpc desconocida: ' + fn);
  });
  await page.exposeFunction('__db', async (table, op, payload, filters) => {
    const rows = db[{ dc_bills: 'bills', dc_bill_members: 'members', dc_claims: 'claims' }[table]];
    const match = r => filters.every(([c, v]) => String(r[c]) === String(v));
    if (op === 'select') return rows.filter(match);
    if (op === 'update') { rows.filter(match).forEach(r => Object.assign(r, payload)); return []; }
    if (op === 'delete') { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1); return []; }
    if (op === 'insert' || op === 'upsert') {
      const list = Array.isArray(payload) ? payload : [payload];
      list.forEach(p => {
        const same = rows.find(r => r.bill_id === p.bill_id && r.member_id === p.member_id && r.item_id === p.item_id);
        if (same) Object.assign(same, p); else rows.push(Object.assign({}, p));
      });
      return list;
    }
    return [];
  });
  await page.addInitScript(fakeSupabase);
  // Sin internet (CDN de Supabase incluido: lo reemplaza el falso)
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.route('**/api/scan-receipt', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN) }));
  await page.route('**/api/translate', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, translations: [] }) }));
}

const browser = await chromium.launch();
const shot = async (p, name) => { if (OUT) await p.screenshot({ path: path.join(OUT, name), fullPage: true }); };

// ── Anfitrión ───────────────────────────────────────────────────────────────
const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-CL' });
const host = await ctxA.newPage(); const errA = []; host.on('pageerror', e => errA.push(e.message));
await wire(host, 'user-host');
await host.goto(BASE);
await host.setInputFiles('#photo', IMG);
await host.waitForSelector('text=Agregar personas', { timeout: 8000 });
await host.click('text=Agregar personas');
await host.fill('input[name=name]', 'Rodrigo'); await host.press('input[name=name]', 'Enter');
await host.click('text=Que cada uno marque');
await host.waitForSelector('text=Cuenta compartida', { timeout: 8000 });
ok(db.bills.length === 1, 'el anfitrión crea la cuenta compartida');
ok((db.bills[0].items || []).length === 3, 'la boleta se publica con sus ítems');
await shot(host, 'shared-1-host.png');
const token = db.bills[0].share_token;

// ── Invitado ────────────────────────────────────────────────────────────────
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-CL' });
const guest = await ctxB.newPage(); const errB = []; guest.on('pageerror', e => errB.push(e.message));
await wire(guest, 'user-guest');
await guest.goto(BASE + '#' + token);
await guest.waitForSelector('text=Te invitaron', { timeout: 8000 });
await shot(guest, 'shared-2-invitacion.png');
await guest.fill('input[name=name]', 'Tiano');
await guest.click('button[type=submit]');
await guest.waitForTimeout(1500);
await guest.waitForSelector('text=Marca lo tuyo', { timeout: 8000 });
ok(db.members.length === 2, 'el invitado entra con el link, sin registrarse');
let body = await guest.innerText('body');
ok(/Pizza/.test(body) && /Cerveza/.test(body), 'el invitado ve los ítems de la boleta');
ok(!/Service Charge/.test(body), 'no le mostramos el cargo de servicio para asignar');
await guest.locator('.assign', { hasText: 'Pizza' }).locator('.pbtn').click();
await guest.waitForTimeout(300);
ok(db.claims.length === 1 && db.claims[0].item_id === '1', 'lo que marca el invitado queda guardado');
body = await guest.innerText('body');
ok(/RM11[0-9],/.test(body) || /RM1\d\d,\d\d/.test(body), 'el invitado ve lo que lleva (con servicio repartido): ' + (body.match(/RM[\d.,]+/) || [''])[0]);
await shot(guest, 'shared-3-invitado.png');

// ── El anfitrión ve lo que marcó el invitado ────────────────────────────────
await host.click('text=Asignar ítems');
await host.waitForTimeout(600);
await host.reload(); await host.waitForTimeout(1200);
body = await host.innerText('body');
ok(/Tiano/.test(body), 'el anfitrión ve al invitado en la cuenta');
await shot(host, 'shared-4-host-ve.png');

// ── Un link inválido no deja entrar ─────────────────────────────────────────
const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL' });
const other = await ctxC.newPage(); await wire(other, 'user-otro');
await other.goto(BASE + '#tokeninventadoabcdefgh');
await other.waitForSelector('text=Te invitaron', { timeout: 8000 });
await other.fill('input[name=name]', 'Intruso'); await other.click('button[type=submit]');
await other.waitForSelector('.banner.danger', { timeout: 8000 });
ok(/ya no sirve/.test(await other.innerText('body')), 'un link inválido muestra un aviso claro');
ok(db.members.length === 2, 'y no agrega a nadie a la cuenta');

ok(errA.length === 0, 'anfitrión sin errores JS ' + errA.slice(0, 2).join('|'));
ok(errB.length === 0, 'invitado sin errores JS ' + errB.slice(0, 2).join('|'));

await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} comprobaciones de cuentas compartidas OK`);
process.exit(fails ? 1 : 0);
