#!/usr/bin/env node
// Prueba la reconciliación del servidor (suma de ítems vs total impreso) con los casos REALES de
// boletas que fallaron en producción. Sin API. Extrae reconcile() y sus constantes de api/scan-receipt.js.
import fs from 'node:fs';
const src = fs.readFileSync('api/scan-receipt.js', 'utf8');
function line(name) { const i = src.indexOf('const ' + name); return src.slice(i, src.indexOf('\n', i)); }
function fn(name) {
  const i = src.indexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
}
const reconcile = new Function(['TAX_COUNTRIES','TAX_ON_TOP_HIGH','SERVICE_CHARGE_COUNTRIES','TIP_COUNTRIES'].map(line).join('\n') + '\n' + fn('reconcile') + '\nreturn reconcile;')();

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } };
const it = (nombre, precio, cantidad = 1) => ({ nombre, precio_unitario: precio, cantidad, confianza: 0.9 });
const fixed = r => r.auto_fixed ? r.auto_fix_item.precio_unitario : null;
const near = (a, b) => a != null && Math.abs(a - b) < 0.01;

// Pakistán: impuesto sumado encima, tasas 5 / 13 / 15 %
ok(near(fixed(reconcile([it('platos', 11723)], 12309.15, 'PK')), 586.15), 'PK 5%: Tau\'s I-8');
ok(near(fixed(reconcile([it('platos', 7885)], 8910, 'PK')), 1025), 'PK 13%: Dine-In');
ok(near(fixed(reconcile([it('platos', 14461)], 16630, 'PK')), 2169), 'PK 15%: TKR Islamabad');
// Malasia: servicio ya listado + SST encima
ok(near(fixed(reconcile([it('platos', 208), it('Service Charges', 20.8)], 242.55, 'MY')), 13.75), 'MY: servicio listado + SST');
// Nigeria: con Stamp Duty queda solo el VAT; sin él (error de lectura) se nota
ok(near(fixed(reconcile([it('platos', 58500), it('SC (7.5%)', 4387.5)], 67275, 'NG')), 4387.5), 'NG: VAT 4.387,50');
ok(near(fixed(reconcile([it('platos', 58450), it('SC (7.5%)', 4387.5)], 67275, 'NG')), 4437.5), 'NG: sin Stamp Duty el faltante es 4.437,50');
// Sri Lanka: impuestos ~22% sobre subtotal + servicio
ok(near(fixed(reconcile([it('platos', 49200), it('Service Charge', 4920)], 66118.3, 'LK')), 11998.3), 'LK: Taxes 11.998,30');
// Si "Taxes" ya está listado como ítem no se duplica
const dup = reconcile([it('platos', 49200), it('Service Charge', 4920), it('Taxes', 11998.3)], 66118.3, 'LK');
ok(!dup.auto_fixed && dup.ok, 'LK: con Taxes ya listado no se agrega otro impuesto');
// Otros países: nunca se inventa un impuesto con la misma diferencia
for (const c of ['ES', 'CL', 'DE', 'XX']) ok(!reconcile([it('platos', 11723)], 12309.15, c).auto_fixed, `${c}: no inventa impuesto con 5% de diferencia`);
// Austria: ítems de más (suplemento contado dos veces) → avisa, nunca "arregla"
const at = reconcile([it('Hirter', 4, 2), it('Prosecco', 5.2, 2), it('Venezia', 13.1), it('San Daniele', 13.2)], 43.5, 'AT');
ok(!at.auto_fixed && at.diff < 0, 'AT: suma > total → sin auto-fix');
// Cuadra: sin ruido
ok(reconcile([it('a', 43.5)], 43.5, 'AT').ok, 'AT: suma = total → ok');

console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones de reconciliación OK`);
process.exit(fails ? 1 : 0);
