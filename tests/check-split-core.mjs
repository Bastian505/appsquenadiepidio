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
for (const t of ['Impuesto', 'Service Charges', 'Sales Tax 5%', 'GST', 'SST', 'FBR POS CHARGES', 'Propina', 'Card surcharge', 'Credit Card Fee', 'Servico', 'Serviço', 'Taxa de serviço 10%', 'Gorjeta', 'Servizio', 'Bedienung', 'Trinkgeld', 'Apkalpošana 10%', 'Szervizdíj', 'BACSIS', 'Bacșiș', 'Obsluha', 'MwSt', 'TVA 19%', 'Moms 25%', 'ÁFA 27%']) ok(S.isExtra({ name: t }), `"${t}" es extra`);
for (const t of ['Tax Free Water', 'Tipsy Cake', 'Card holder platter', 'Servicio de mesa especial', 'Chicken Tikka', 'Servicio de bar', 'Servizio tavolo VIP', 'Tvaroh', 'Obsluha stolu VIP']) ok(!S.isExtra({ name: t }), `"${t}" no es extra`);

// 7) HUF sin decimales
r = S.compute({ currency: 'HUF', people: P.slice(0, 2), tip: { pct: 10 }, items: [{ id: 1, name: 'Gulyás', price: 3290, qty: 1 }], assigns: { 1: { people: ['a', 'b'] } } });
ok(r.perPerson.every(p => Number.isInteger(p.amount)) && total(r) === 3619, `HUF: ${r.perPerson.map(p => p.amount)}`);


// Descuentos (Molecule, Nueva Delhi): 20 % de TODO el consumo → se reparte proporcional, sin asignarlo a mano
const molecule = [
  { id: 1, name: 'FARM TO TABLE PIZZA', price: 655, qty: 1 }, { id: 2, name: 'LANTERN CHILLI POTATOES', price: 425, qty: 2 },
  { id: 3, name: 'SANTONI LION', price: 595, qty: 2 }, { id: 4, name: 'SMOKEY FASHIONED', price: 595, qty: 1 },
  { id: 5, name: 'GREY GOOSE', price: 495, qty: 2 }, { id: 6, name: 'MOLECULE KIT', price: 245, qty: 2 },
  { id: 7, name: 'HAKKA NOODLES', price: 295, qty: 1 }, { id: 8, name: 'TRUFFLE MALAI SOYA', price: 455, qty: 1 },
  { id: 9, name: 'CHEESY GARLIC BREAD', price: 375, qty: 1 }, { id: 10, name: 'Descuento 20%', price: -1179, qty: 1 },
  { id: 11, name: 'Servicio', price: 471.6, qty: 1 }, { id: 12, name: 'Impuesto', price: 68.64, qty: 1 },
  { id: 13, name: 'Impuesto', price: 68.64, qty: 1 }, { id: 14, name: 'Impuesto', price: 610.5, qty: 1 }];
let cl = S.classify(molecule);
ok(cl.extras.some(i => i.id === 10) && !cl.base.some(i => i.id === 10), 'Molecule: el descuento 20 % es global (va con los cargos, no se asigna)');
r = S.compute({ currency: 'INR', people: P.slice(0, 2), items: molecule, assigns: { 1: { people: ['a'] }, 2: { people: ['a'] }, 3: { people: ['b'] }, 4: { people: ['b'] }, 5: { people: ['a', 'b'] }, 6: { people: ['a', 'b'] }, 7: { people: ['a'] }, 8: { people: ['b'] }, 9: { people: ['a', 'b'] } } });
ok(near(total(r), 5935.38) && r.unassigned === 0, `Molecule: total ${total(r)} = 5935.38 y nada sin asignar`);
const base0 = r.perPerson.map(p => p.base), conDesc = r.perPerson.map(p => p.amount);
ok(near(base0[0] + base0[1], 5895) && near(r.perPerson[0].amount / r.perPerson[1].amount, base0[0] / base0[1], 0.001), 'Molecule: lo que paga cada uno es proporcional a su consumo (descuento incluido)');

// Descuento de UN plato (Midori, Yakarta): 30 % de CHIRASI MIDORI → lo paga quien lo consumió
const midori = [
  { id: 1, name: 'GYURAMEN (L)', price: 74000, qty: 1 }, { id: 2, name: 'CHIRASI MIDORI', price: 86000, qty: 1 },
  { id: 3, name: '(Discount) 30 %', price: -25800, qty: 1 }, { id: 4, name: 'TAI SASHIMI', price: 36000, qty: 1 },
  { id: 5, name: 'Servicio 5 %', price: 9800, qty: 1 }, { id: 6, name: 'Impuesto 10 %', price: 10000, qty: 1 }];
cl = S.classify(midori);
ok(cl.linked.length === 1 && cl.discounts[3].parentId === 2 && !cl.base.some(i => i.id === 3), 'Midori: el 30 % se liga a CHIRASI MIDORI (no se asigna a mano)');
r = S.compute({ currency: 'IDR', people: P.slice(0, 2), items: midori, assigns: { 1: { people: ['a'] }, 2: { people: ['b'] }, 4: { people: ['a'] } } });
ok(total(r) === 194000 - 25800 + 19800 + 0 || total(r) === 74000 + 86000 - 25800 + 36000 + 9800 + 10000, `Midori: total ${total(r)} correcto`);
ok(r.perPerson[1].base === 86000 - 25800 && r.perPerson[0].base === 110000, 'Midori: Beto (el del plato) absorbe el descuento; Ana no');
// el plato con descuento compartido: el descuento se reparte en proporción
r = S.compute({ currency: 'IDR', people: P.slice(0, 2), items: midori, assigns: { 2: { people: ['a', 'b'] } } });
ok(r.perPerson[0].base === 43000 - 12900 && r.perPerson[1].base === 43000 - 12900, 'Midori: plato compartido → descuento compartido');
// plato con descuento sin asignar: el descuento queda sin asignar con él
r = S.compute({ currency: 'IDR', people: P.slice(0, 2), items: midori, assigns: {} });
ok(r.unassigned === total(r) && near(total(r), 74000 + 86000 - 25800 + 36000 + 19800, 1), 'Midori: sin asignar nada, todo (descuento incluido) queda sin asignar');
// descuento que no calza con nada: queda como una línea normal (como antes)
cl = S.classify([{ id: 1, name: 'A', price: 100, qty: 1 }, { id: 2, name: 'Descuento', price: -37, qty: 1 }]);
ok(cl.base.length === 2 && cl.linked.length === 0, 'Descuento raro (37 de 100, sin %): queda como línea normal');
// 'Tax Free Water' o 'Discount' sin importe negativo no son descuentos
cl = S.classify([{ id: 1, name: 'Discount Cocktail', price: 12, qty: 1 }]);
ok(cl.base.length === 1, 'Un plato llamado "Discount Cocktail" con precio positivo no es descuento');

ok(S.isExtra({ name: 'Impuesto (SGST 2.5%)' }) && S.isExtra({ name: 'Impuesto (VAT 25 %)' }) && !S.isExtra({ name: 'Servicio (de mesa especial)' }), 'Impuesto con el nombre original entre paréntesis es cargo; un plato con paréntesis no');
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones del núcleo de reparto OK`);
process.exit(fails ? 1 : 0);
