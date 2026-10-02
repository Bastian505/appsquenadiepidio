#!/usr/bin/env node
// Pruebas del reparto de cuentas (sin API). Extrae las funciones reales de ambas copias del HTML
// y comprueba que lo que paga cada persona + lo no asignado = total, con impuesto/servicio
// proporcional, propina y monedas con y sin decimales.
import fs from 'node:fs';
import '../core/currencies.js'; // decPlaces() usa DC_CURRENCIES

function fnSrc(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`no encontré ${name}()`);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
}
const NAMES = ['isExtraItem','activeItems','extrasSum','extraRatio','totalMul','decPlaces','rnd','getUnassigned','calcTotals'];
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('  ✗ ' + msg); } };

for (const file of ['index.html', 'apps/divicuenta/index.html']) {
  console.log(file);
  const html = fs.readFileSync(file, 'utf8');
  const re = html.match(/var EXTRA_RE=.*;/)?.[0];
  if (!re) { console.log('  ✗ no encontré EXTRA_RE'); failures++; continue; }
  const code = `var DC_CURRENCIES=globalThis.DC_CURRENCIES,items=[],people=[],assigns={},tipPct=0,window={_currentCurrency:'CLP'};\n${re}\n${NAMES.map(n => fnSrc(html, n)).join('\n')}
    return { set(o){ if('items' in o) items=o.items; if('people' in o) people=o.people; if('assigns' in o) assigns=o.assigns; if('tip' in o) tipPct=o.tip; if('cur' in o) window._currentCurrency=o.cur; },
             calcTotals, getUnassigned, isExtraItem, extraRatio };`;
  const E = new Function(code)();
  const mk = (name, price, qty = 1) => ({ name, price, qty, total: price * qty, selected: true });
  const sumAll = () => E.calcTotals().reduce((s, t) => s + t.amount, 0) + E.getUnassigned().amount;

  // 1) CLP sin decimales, propina 10%, todo asignado a 2 personas
  E.set({ cur: 'CLP', tip: 10, items: [mk('Lomo', 11900), mk('Cerveza', 3200, 3), mk('Postre', 4200)], people: [{ name: 'A' }, { name: 'B' }],
          assigns: { 0: { participants: [0] }, 1: { participants: [0, 1], qty: { 0: 1, 1: 2 } }, 2: { participants: [1] } } });
  let expected = Math.round((11900 + 9600 + 4200) * 1.1);
  ok(Math.abs(sumAll() - expected) <= 2, `CLP con propina: suma ${sumAll()} vs ${expected}`);
  ok(Number.isInteger(E.calcTotals()[0].amount), 'CLP: montos enteros');

  // 2) MYR con decimales: impuesto y servicio como líneas, repartidos proporcional
  const base = [mk('Heineken', 18.2, 5), mk('Guinness', 18.2, 5), mk('Biryani', 54), mk('Pizza', 52), mk('Fries', 20)];
  const withExtras = [...base, mk('Service Charge', 86.5), mk('Impuesto', 61.5)];
  E.set({ cur: 'MYR', tip: 0, items: withExtras, people: [{ name: 'R' }, { name: 'T' }],
          assigns: { 0: { participants: [0, 1], qty: { 0: 3, 1: 2 } }, 1: { participants: [0], qty: { 0: 5 } }, 2: { participants: [1] }, 3: { participants: [0, 1] }, 4: { participants: [1] } } });
  expected = 308 + 86.5 + 61.5;
  ok(Math.abs(sumAll() - expected) < 0.1, `MYR con extras: suma ${sumAll().toFixed(2)} vs ${expected}`);
  ok(!E.getUnassigned().list.some(n => /service|impuesto/i.test(n)), 'MYR: impuesto/servicio no aparecen como "sin asignar"');
  ok(Math.abs(E.extraRatio() - 148 / 308) < 1e-9, `ratio de extras ${E.extraRatio()}`);
  const [r, t] = E.calcTotals();
  ok(r.amount !== Math.round(r.amount) || t.amount !== Math.round(t.amount), 'MYR: conserva centavos');

  // 3) Quien consume más paga más impuesto (proporcional)
  E.set({ cur: 'PKR', tip: 0, items: [mk('Platter', 7900), mk('Refresco', 100), mk('Impuesto', 1600)], people: [{ name: 'X' }, { name: 'Y' }],
          assigns: { 0: { participants: [0] }, 1: { participants: [1] } } });
  const [x, y] = E.calcTotals();
  ok(Math.abs(x.amount - 7900 * 1.2) < 0.1 && Math.abs(y.amount - 100 * 1.2) < 0.1, `impuesto proporcional: X=${x.amount} Y=${y.amount}`);

  // 4) Detección de extras por nombre: no confundir platos reales
  for (const n of ['Sales Tax 5%', 'Service Charges', 'FBR POS CHARGES', 'Impuesto', 'GST', 'Propina']) ok(E.isExtraItem({ name: n }), `"${n}" debería ser extra`);
  for (const n of ['Tax Free Water', 'Chicken Tikka', 'Tipsy Cake', 'Servicio de mesa especial']) ok(!E.isExtraItem({ name: n }), `"${n}" NO debería ser extra`);

  // 4b) HUF no usa centavos: el reparto debe quedar en enteros
  E.set({ cur: 'HUF', tip: 10, items: [mk('Gulyás', 3290), mk('Sör', 990, 3)], people: [{ name: 'A' }, { name: 'B' }],
          assigns: { 0: { participants: [0, 1] }, 1: { participants: [0, 1], qty: { 0: 2, 1: 1 } } } });
  ok(E.calcTotals().every(t => Number.isInteger(t.amount)), `HUF: montos enteros (${E.calcTotals().map(t => t.amount)})`);

  // 5) Sin asignar suma al total cuando nadie tiene nada
  E.set({ cur: 'EUR', tip: 0, items: [mk('A', 10.5), mk('B', 4.25)], people: [{ name: 'P' }], assigns: {} });
  ok(Math.abs(E.getUnassigned().amount - 14.75) < 0.001, `sin asignar = ${E.getUnassigned().amount}`);
}
console.log(failures ? `\n${failures} fallo(s) de ${checks}` : `\n✓ ${checks} comprobaciones del reparto OK`);
process.exit(failures ? 1 : 0);
