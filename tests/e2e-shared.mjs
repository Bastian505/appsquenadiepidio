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
      const bill = { id: 'b1', host_id: uid, share_token: (Math.random().toString(36) + Math.random().toString(36) + 'abcdefghijklmnop').replace(/[^a-z0-9]/g, '').slice(0, 22) + '==', currency: args.p_currency, items: [], tip: null, status: 'open', restaurant: null, country_code: null, receipt_total: null };
      db.bills.push(bill);
      const m = { id: 'm-' + uid, bill_id: bill.id, user_id: uid, name: args.p_name };
      db.members.push(m);
      return [{ out_bill_id: bill.id, out_member_id: m.id, out_share_token: bill.share_token }];
    }
    if (fn === 'dc_peek_bill') {
      const bill = db.bills.find(b => b.share_token === args.p_token && b.status === 'open');
      if (!bill) return [];
      return [{ out_restaurant: bill.restaurant, out_currency: bill.currency, out_people: bill.people || [],
                out_taken: db.members.filter(x => x.bill_id === bill.id && x.person_key != null).map(x => x.person_key) }];
    }
    if (fn === 'dc_join_bill') {
      const bill = db.bills.find(b => b.share_token === args.p_token && b.status === 'open');
      if (!bill) return [];                                   // token inválido → sin filas
      let name = args.p_name;
      if (args.p_person != null) {
        const per = (bill.people || []).find(x => String(x.id) === String(args.p_person));
        if (!per) throw new Error('PERSON_UNKNOWN');
        if (db.members.some(x => x.bill_id === bill.id && x.person_key === args.p_person && x.user_id !== uid)) throw new Error('NAME_TAKEN');
        name = per.name;                                      // el nombre lo pone el servidor
      }
      let m = db.members.find(x => x.bill_id === bill.id && x.user_id === uid);
      if (!m) { m = { id: 'm-' + uid, bill_id: bill.id, user_id: uid, name, person_key: args.p_person ?? null }; db.members.push(m); }
      else { m.name = name; m.person_key = args.p_person ?? null; }
      if (args.p_person != null && bill.pre_assigns && bill.pre_assigns[args.p_person]) {
        Object.entries(bill.pre_assigns[args.p_person]).forEach(([iid, u]) => {
          if (!db.claims.some(c => c.member_id === m.id && c.item_id === iid)) db.claims.push({ bill_id: bill.id, member_id: m.id, item_id: iid, units: u });
        });
      }
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
await host.fill('input[name=name]', 'Tiano'); await host.press('input[name=name]', 'Enter');
await host.click('text=Que cada uno marque');
await host.waitForSelector('text=Cuenta compartida', { timeout: 8000 });
ok(db.bills.length === 1, 'el anfitrión crea la cuenta compartida');
ok((db.bills[0].items || []).length === 3, 'la boleta se publica con sus ítems');
// Antes de que entre nadie, el anfitrión ya le marcó la pizza a Tiano (esa marca debe pasar a Tiano cuando entre).
await host.click('text=Asignar ítems');
await host.locator('.assign', { hasText: 'Pizza' }).locator('.pbtn', { hasText: 'Tiano' }).click();
await host.waitForTimeout(900);
ok(Object.keys(db.bills[0].pre_assigns || {}).length === 1, 'las marcas del anfitrión para quien aún no entra se publican');
await shot(host, 'shared-1-host.png');
const token = db.bills[0].share_token;
ok(token.endsWith('=='), 'el token trae relleno "==" como los reales: ' + token);

// ── Invitado ────────────────────────────────────────────────────────────────
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-CL' });
const guest = await ctxB.newPage(); const errB = []; guest.on('pageerror', e => errB.push(e.message));
await wire(guest, 'user-guest');
// El invitado ya tenía otra cuenta a medias en este navegador: el link debe ganar al borrador.
await guest.addInitScript("try { if (!localStorage.getItem('dc_probe')) { localStorage.setItem('dc_probe', '1'); localStorage.setItem('dc_v2_draft', JSON.stringify({ step: 'review', items: [{ id: 1, name: 'Otra boleta', price: 6500, qty: 1 }], people: [], assigns: {}, currency: 'KRW', nextId: 5 })); } } catch (e) {}");
await guest.goto(BASE + '#' + token);
await guest.waitForSelector('text=Te invitaron', { timeout: 8000 });
await guest.waitForTimeout(2100);   // pasa la pantalla de entrada
await shot(guest, 'shared-2-invitacion.png');
// El invitado ve la lista de nombres que puso el anfitrión y elige el suyo.
let gb = await guest.innerText('body');
ok(/Elige tu nombre/.test(gb) && /Tiano/.test(gb), 'el invitado ve la lista de nombres del anfitrión');
ok(await guest.locator('button.pick', { hasText: 'Rodrigo' }).isDisabled(), 'el nombre del anfitrión aparece como ya tomado');
await guest.waitForTimeout(2100);   // pasa la pantalla de entrada
await shot(guest, 'shared-2-invitacion.png');
await guest.locator('button.pick', { hasText: 'Tiano' }).click();
await guest.waitForSelector('text=Marca lo tuyo', { timeout: 8000 });
ok(db.members.length === 2 && db.members[1].name === 'Tiano' && db.members[1].person_key != null, 'el invitado entra con el nombre elegido, sin registrarse');
let body = await guest.innerText('body');
ok(/Pizza/.test(body) && /Cerveza/.test(body), 'el invitado ve los ítems de la boleta');
ok(!/Service Charge/.test(body), 'no le mostramos el cargo de servicio para asignar');
ok(db.claims.length === 1 && db.claims[0].item_id === '1', 'lo que el anfitrión ya le había marcado (Pizza) pasa a Tiano al entrar');
ok(/RM1\d\d,\d\d/.test(body), 'y ve lo que lleva (con servicio repartido): ' + (body.match(/RM[\d.,]+/) || [''])[0]);
await guest.locator('.assign', { hasText: 'Cerveza' }).locator('.pbtn').click();
await guest.waitForTimeout(400);
ok(db.claims.length === 2, 'lo que marca el invitado queda guardado');
const beer = () => db.claims.find(c => c.item_id === '2');
ok(beer() && beer().units === 1, 'en una línea de 2 unidades parte con 1 unidad marcada');
ok(/¿Cuántas tomaste\?/.test(await guest.innerText('body')), 'y le ofrece elegir cuántas tomó');
await guest.locator('.assign', { hasText: 'Cerveza' }).locator('button[data-action=claim-unit][data-d="1"]').click();
await guest.waitForTimeout(500);
ok(beer() && beer().units === 2, 'el invitado sube a 2 unidades y se guarda');
ok(await guest.locator('.assign', { hasText: 'Cerveza' }).locator('button[data-action=claim-unit][data-d="1"]').isDisabled(), 'no puede subir más allá de la cantidad de la línea (2)');
await guest.locator('.assign', { hasText: 'Cerveza' }).locator('button[data-action=claim-unit][data-d="-1"]').click();
await guest.waitForTimeout(400);
db.claims.push({ bill_id: 'b1', member_id: 'm-user-host', item_id: '2', units: 1 });   // el anfitrión se queda con la otra
await guest.waitForFunction(() => /También: Rodrigo \(1\)/.test(document.body.innerText), null, { timeout: 9000 }).catch(() => {});
ok(await guest.locator('.assign', { hasText: 'Cerveza' }).locator('button[data-action=claim-unit][data-d="1"]').isDisabled(), 'si otro ya tomó la otra unidad, el + queda desactivado (no se pasan)');
db.claims.splice(db.claims.findIndex(c => c.member_id === 'm-user-host' && c.item_id === '2'), 1);
await guest.waitForFunction(() => /Nadie más lo marcó/.test([...document.querySelectorAll('.assign')].find(x => /Cerveza/.test(x.innerText)).innerText), null, { timeout: 9000 }).catch(() => {});
await guest.locator('.assign', { hasText: 'Cerveza' }).locator('button[data-action=claim-unit][data-d="1"]').click();
await guest.waitForTimeout(500);
await shot(guest, 'shared-3-invitado.png');

// El tiempo real puede cortarse: el anfitrión debe enterarse solo (consulta periódica), sin recargar.
const sawGuest = await host.waitForFunction(() => /Conectados: Rodrigo, Tiano/.test(document.body.innerText), null, { timeout: 9000 }).then(() => true, () => false);
ok(sawGuest, 'el anfitrión ve entrar al invitado sin recargar (aunque falle el tiempo real)');
// ── El anfitrión ve lo que marcó el invitado ────────────────────────────────
await host.waitForFunction(() => /2 de 2 ítems asignados/.test(document.body.innerText), null, { timeout: 9000 }).then(() => ok(true, 'el anfitrión ve lo que marcó el invitado (2 de 2 ítems) sin recargar'), () => ok(false, 'el anfitrión no ve lo marcado por el invitado'));
await host.reload(); await host.waitForTimeout(1200);
body = await host.innerText('body');
ok(/Tiano/.test(body) && !/Invitada/.test(body), 'el anfitrión ve a Tiano (el nombre elegido) y no aparece duplicado');
await shot(host, 'shared-4-host-ve.png');

// ── El anfitrión también marca lo suyo y el invitado lo ve en vivo ──────────
await host.click('text=Asignar ítems').catch(() => {});
const hostAssign = (name) => host.locator('.assign', { hasText: name });
await hostAssign('Pizza').locator('.pbtn', { hasText: 'Rodrigo' }).click();
await host.waitForTimeout(700);
ok(db.claims.some(c => c.member_id === 'm-user-host' && c.item_id === '1'), 'lo que el anfitrión marca para sí llega a la base');
await guest.waitForFunction(() => /También: Rodrigo/.test(document.body.innerText), null, { timeout: 9000 }).then(() => ok(true, 'el invitado ve en vivo lo que marcó el anfitrión'), () => ok(false, 'el invitado ve en vivo lo que marcó el anfitrión'));
await host.waitForTimeout(4500);   // pasa una consulta periódica: la marca del anfitrión no se pierde
ok(await hostAssign('Pizza').locator('.pbtn.on', { hasText: 'Rodrigo' }).count() === 1, 'la marca del anfitrión sigue ahí tras actualizar');
// El anfitrión marca por el invitado conectado (la base lo permite al dueño) y el invitado lo ve y puede corregirlo.
await hostAssign('Cerveza').locator('.pbtn', { hasText: 'Tiano' }).click();
await host.waitForTimeout(700);
ok(!db.claims.some(c => c.member_id === 'm-user-guest' && c.item_id === '2'), 'el anfitrión puede quitar lo que el invitado marcó (Cerveza)');
await hostAssign('Cerveza').locator('.pbtn', { hasText: 'Tiano' }).click();
await host.waitForTimeout(700);
ok(db.claims.some(c => c.member_id === 'm-user-guest' && c.item_id === '2'), 'y volver a marcarla por él');
await hostAssign('Pizza').locator('.pbtn', { hasText: 'Tiano' }).click();
await host.waitForTimeout(700);
ok(!db.claims.some(c => c.member_id === 'm-user-guest' && c.item_id === '1'), 'el anfitrión desmarca la Pizza del invitado');
await guest.waitForFunction(() => { const r = [...document.querySelectorAll('.assign')].find(x => /Pizza/.test(x.innerText)); return r && !/✓ Lo consumí/.test(r.innerText); }, null, { timeout: 9000 }).then(() => ok(true, 'el invitado lo ve en su teléfono'), () => ok(false, 'el invitado lo ve en su teléfono'));
await hostAssign('Pizza').locator('.pbtn', { hasText: 'Rodrigo' }).click();
await host.waitForTimeout(700);
ok(!db.claims.some(c => c.member_id === 'm-user-host' && c.item_id === '1'), 'si el anfitrión desmarca, también se quita en la base');

// ── Un link inválido no deja entrar ─────────────────────────────────────────
const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL' });
const other = await ctxC.newPage(); await wire(other, 'user-otro');
await other.goto(BASE + '#tokeninventadoabcdefgh');
await other.waitForSelector('text=Te invitaron', { timeout: 8000 });
await other.waitForSelector('.banner.danger', { timeout: 8000 });
ok(/ya no sirve/.test(await other.innerText('body')), 'un link inválido muestra un aviso claro');
ok(await other.locator('input[name=name]').count() === 0, 'y no ofrece entrar');
ok(db.members.length === 2, 'y no agrega a nadie a la cuenta');

// Un invitado que no está en la lista escribe su nombre; y un nombre ya tomado se rechaza.
const ctxD = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL' });
const late = await ctxD.newPage(); await wire(late, 'user-tarde');
await late.goto(BASE + '#' + token);
await late.waitForSelector('text=Elige tu nombre', { timeout: 8000 });
ok(await late.locator('button.pick', { hasText: 'Tiano' }).isDisabled(), 'un nombre ya tomado no se puede elegir');
await late.click('text=Mi nombre no está en la lista');
await late.fill('input[name=name]', 'Invitada'); await late.click('button[type=submit]');
await late.waitForSelector('text=Marca lo tuyo', { timeout: 8000 });
ok(db.members.length === 3 && db.members[2].name === 'Invitada', 'quien no está en la lista entra escribiendo su nombre');
await host.waitForFunction(() => /Conectados: Rodrigo, Tiano, Invitada/.test(document.body.innerText) || /Invitada/.test(document.body.innerText), null, { timeout: 9000 }).then(() => ok(true, 'el anfitrión ve también a quien escribió su nombre'), () => ok(false, 'el anfitrión no ve a la invitada'));

ok(errA.length === 0, 'anfitrión sin errores JS ' + errA.slice(0, 2).join('|'));
ok(errB.length === 0, 'invitado sin errores JS ' + errB.slice(0, 2).join('|'));

await browser.close(); srv.close();
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `\n✓ ${n} comprobaciones de cuentas compartidas OK`);
process.exit(fails ? 1 : 0);
