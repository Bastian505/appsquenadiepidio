#!/usr/bin/env node
// Pruebas del núcleo de reparto (core/split.js), sin API ni navegador.
import '../core/currencies.js';
import '../core/split.js';
const S = globalThis.DC_SPLIT;
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } };
const P = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }, { id: 'c', name: 'Caro' }];
const total = r => r.perPerson.reduce((s, p) => s + p.amount, 0) + r.unassigned;
const near = (x, y, e = 0.001) => Math.abs(x - y) < e;

// 1) Malasia: cervezas por unidades, "Todos", servicio e impuesto proporcionales
let r = S.compute({ currency: 'MYR', people: P.slice(0, 2), items: [
  { id: 1, name: 'Heineken', price: 18.2, qty: 5 }, { id: 2, name: 'Guinness', price: 23.4, qty: 5 },
  { id: 3, name: 'Biryani', price: 54, qty: 1 }, { id: 4, name: 'Fries', price: 20, qty: 1 },
  { id: 5, name: 'Service Charge', price: 24.4, qty: 1 }, { id: 6, name: 'Impuesto', price: 17.32, qty: 1 }],
  assigns: { 1: { people: ['a', 'b'], units: { a: 3, b: 2 } }, 2: { people: ['a', 'b'], units: {} }, 3: { people: ['b'] }, 4: { people: ['a', 'b'] } } });
ok(near(total(r), 323.72), `MYR: suma exacta ${total(r)} = 323.72`);
ok(r.unassigned === 0, 'MYR: nada sin asignar');
ok(r.perPerson.every(p => near(p.amount * 100, Math.round(p.amount * 100))), 'MYR: centavos exactos');
ok(near(r.extrasRatio, 41.72 / 282), 'MYR: ratio de extras');

// 2) CLP: enteros, propina 10%, 3 personas que no dividen exacto
r = S.compute({ currency: 'CLP', people: P, tip: { pct: 10 }, items: [{ id: 1, name: 'Pizza', price: 10000, qty: 1 }],
  assigns: { 1: { people: ['a', 'b', 'c'] } } });
ok(total(r) === 11000 && r.perPerson.every(p => Number.isInteger(p.amount)), `CLP: ${r.perPerson.map(p => p.amount)} suman 11000 en enteros`);

// 3) Propina fija y sin asignar
r = S.compute({ currency: 'EUR', people: P.slice(0, 1), tip: { fixed: 5 }, items: [{ id: 1, name: 'A', price: 10, qty: 1 }, { id: 2, name: 'B', price: 10, qty: 1 }],
  assigns: { 1: { people: ['a'] } } });
ok(near(r.perPerson[0].amount, 12.5) && near(r.unassigned, 12.5) && near(total(r), 25), `propina fija + sin asignar: ${r.perPerson[0].amount} + ${r.unassigned}`);
ok(r.unassignedNames.includes('B'), 'lista lo no asignado');

// 4) Unidades parciales: quedan sin asignar las que faltan
r = S.compute({ currency: 'EUR', people: P.slice(0, 1), items: [{ id: 1, name: 'Caña', price: 2, qty: 4 }], assigns: { 1: { people: ['a'], units: { a: 3 } } } });
ok(near(r.perPerson[0].amount, 6) && near(r.unassigned, 2), 'unidades parciales');

// 5) Impuesto proporcional: quien consume más paga más impuesto
r = S.compute({ currency: 'PKR', people: P.slice(0, 2), items: [{ id: 1, name: 'Platter', price: 7900, qty: 1 }, { id: 2, name: 'Refresco', price: 100, qty: 1 }, { id: 3, name: 'Sales Tax 15%', price: 1200, qty: 1 }],
  assigns: { 1: { people: ['a'] }, 2: { people: ['b'] } } });
ok(near(r.perPerson[0].amount, 9085) && near(r.perPerson[1].amount, 115), `impuesto proporcional: ${r.perPerson.map(p => p.amount)}`);

// 6) Detección de extras sin confundir platos
for (const t of ['Impuesto', 'Service Charges', 'Sales Tax 5%', 'GST', 'SST', 'FBR POS CHARGES', 'Propina', 'Card surcharge', 'Credit Card Fee', 'Servico', 'Serviço', 'Taxa de serviço 10%', 'Gorjeta', 'Servizio', 'Bedienung', 'Trinkgeld']) ok(S.isExtra({ name: t }), `"${t}" es extra`);
for (const t of ['Tax Free Water', 'Tipsy Cake', 'Card holder platter', 'Servicio de mesa especial', 'Chicken Tikka', 'Servicio de bar', 'Servizio tavolo VIP']) ok(!S.isExtra({ name: t }), `"${t}" no es extra`);

// 7) HUF sin decimales
r = S.compute({ currency: 'HUF', people: P.slice(0, 2), tip: { pct: 10 }, items: [{ id: 1, name: 'Gulyás', price: 3290, qty: 1 }], assigns: { 1: { people: ['a', 'b'] } } });
ok(r.perPerson.every(p => Number.isInteger(p.amount)) && total(r) === 3619, `HUF: ${r.perPerson.map(p => p.amount)}`);

console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones del núcleo de reparto OK`);
process.exit(fails ? 1 : 0);
