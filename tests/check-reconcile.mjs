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
const reconcile = new Function(['TAX_COUNTRIES','DEPOSIT_COUNTRIES','CA_TAX_RATES','TAX_ON_TOP_HIGH','SERVICE_CHARGE_COUNTRIES','TIP_COUNTRIES'].map(line).join('\n') + '\n' + fn('reconcile') + '\nreturn reconcile;')();

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
// Singapur: GST 7% va encima del subtotal + servicio
ok(near(fixed(reconcile([it('Adult', 38.8, 6), it('Gin', 68), it('Ume', 10), it('Svc Charge', 31.08)], 365.81, 'SG')), 23.93), 'SG: GST 23,93 sobre servicio listado');
ok(reconcile([it('platos', 251.2), it('Service Charge', 25.12)], 276.3, 'SG').ok, 'SG: GST 0.00 y redondeo -0,02 → ok sin ruido');
// Tailandia: sin impuesto inventado
ok(!reconcile([it('platos', 110)], 110, 'TH').auto_fixed, 'TH: VAT incluido, nada que agregar');
// Canadá: impuesto provincial reconocido por su tasa exacta sobre la suma
ok(near(fixed(reconcile([it('platos', 414)], 476, 'CA')), 62), 'CA Quebec 14,975%: 414 → 476 (Château Frontenac)');
ok(near(fixed(reconcile([it('platos', 76.3)], 87.73, 'CA')), 11.43), 'CA Quebec: 76,30 → 87,73 (Keung Kee)');
ok(near(fixed(reconcile([it('platos', 100)], 113, 'CA')), 13), 'CA Ontario HST 13%');
ok(near(fixed(reconcile([it('platos', 100)], 105, 'CA')), 5), 'CA GST 5%');
ok(!reconcile([it('platos', 100)], 110, 'CA').auto_fixed, 'CA: 10% no es una tasa provincial → no inventa impuesto');
ok(!reconcile([it('platos', 414)], 476, 'ES').auto_fixed, 'la misma diferencia en otro país no se toma por impuesto');
ok(!reconcile([it('platos', 100), it('TPS', 5), it('TVQ', 9.975)], 129.95, 'CA').auto_fixed, 'CA: con impuestos ya listados no agrega otro');
// Si "Taxes" ya está listado como ítem no se duplica
const dup = reconcile([it('platos', 49200), it('Service Charge', 4920), it('Taxes', 11998.3)], 66118.3, 'LK');
ok(!dup.auto_fixed && dup.ok, 'LK: con Taxes ya listado no se agrega otro impuesto');
// EE. UU.: impuesto de venta omitido, también cuando ya hay propina o servicio listados (3 boletas reales de producción)
ok(near(fixed(reconcile([it('Chx Milan Sand', 16), it('Sm Grilled Chx', 21.5), it('Lg Margherita', 25.25), it('Lg Hawaiian', 24.5), it('Pint Soda', 3, 3)], 104.8, 'US')), 8.55), 'US Nueva York: Tax 8,55 (8,2 % del total: fuera de la ventana vieja de 6–8 %)');
ok(near(fixed(reconcile([it('LG SAM ADAMS', 11), it('SGL MOSCOW MULE', 14), it('FISH&CHIPS', 20.99), it('BLT CHICKEN', 14.99), it('SYCMLN', 10), it('18% Gratuity', 12.78)], 89.44, 'US')), 5.68), 'US Miami aeropuerto: Tax 5,68 con la gratuity ya listada');
ok(near(fixed(reconcile([it('Bandeja Paisa', 17.5), it('Chicken Pollo', 15.5), it('Bread', 2.5), it('Water', 1.99, 2), it('Service Charge (18%)', 7.11)], 50.14, 'US')), 3.55), 'US Miami Beach: Tax 3,55 con el Service Charge ya listado');
ok(!reconcile([it('platos', 96.25), it('Tax', 8.54)], 104.8, 'US').auto_fixed, 'US: con Tax ya listado no se agrega otro');
ok(reconcile([it('platos', 50)], 62, 'US').auto_fix_item?.nombre !== 'Impuesto', 'US: 24 % de diferencia no es un impuesto de venta (la lógica de propina existente sigue igual)');
ok(!reconcile([it('platos', 100)], 102, 'US').auto_fixed, 'US: 2 % de diferencia (redondeo/propina chica) → no inventa impuesto');
// Otros países: nunca se inventa un impuesto con la misma diferencia
for (const c of ['ES', 'CL', 'DE', 'XX']) ok(!reconcile([it('platos', 11723)], 12309.15, c).auto_fixed, `${c}: no inventa impuesto con 5% de diferencia`);
// Alemania: la IA omite la devolución de envases (Pfandrückgabe) aun con la regla en el prompt (Lidl Berlín real)
const pf = reconcile([it('Wasser medium', 0.29, 6), it('Pfand 0,25 EM', 0.25, 6), it('Mineralwasser still', 1.29, 2), it('Pfand 2,25 EM', 2.25, 2)], 6.82, 'DE');
ok(pf.auto_fixed && near(pf.auto_fix_item.precio_unitario, -3.5) && pf.auto_fix_item.auto_fix_type === 'deposit_refund', 'DE Lidl: agrega la devolución de envases por -3,50');
ok(!reconcile([it('Wasser', 1.74), it('Pfand 0,25 EM', 1.5), it('Pfandrückgabe', -1.5)], 4, 'DE').auto_fixed, 'DE: con devolución ya leída no agrega otra');
ok(!reconcile([it('Wasser', 10), it('Bier', 5)], 12, 'DE').auto_fixed, 'DE: sin depósitos, suma > total → no inventa devolución');
ok(!reconcile([it('Pfand', 1), it('Wasser', 10)], 6, 'DE').auto_fixed, 'DE: la diferencia supera los depósitos → no inventa devolución');
ok(!reconcile([it('Wasser', 1.74), it('Pfand', 1.5)], 1.74, 'ES').auto_fixed, 'ES: la misma situación en otro país no se toma por devolución de envases');
// Tailandia: VAT 7 % omitido (Three Monkeys real) y sin inventarlo cuando el IVA va incluido
ok(near(fixed(reconcile([it('a', 250), it('b', 499, 2), it('c', 150), it('d', 180), it('e', 220), it('f', 230), it('Smoothie', 150), it('Water', 30, 2), it('ค่าบริการ 10%', 239.47)], 2634, 'TH')), 156.53), 'TH Three Monkeys: VAT 7% 156,53');
ok(!reconcile([it('a', 250), it('ค่าบริการ 10%', 25), it('VAT 7%', 17.5)], 292.5, 'TH').auto_fixed, 'TH: con VAT ya listado no agrega otro');
ok(reconcile([it('a', 100)], 110, 'TH').auto_fix_item?.nombre !== 'VAT 7%', 'TH: 10 % de diferencia no es VAT 7 % (sigue la regla de servicio de siempre)');
// Canadá: impuesto omitido que no es una tasa provincial exacta (BC: PST solo sobre licor + GST 5 %; Ontario con cargos y propina incluida)
ok(near(fixed(reconcile([it('Pop', 3.99, 3), it('Peach Lemonade', 7.99), it('Pulled Pork', 20.99), it('Chicken BLT', 29.49), it('Whiskey BBQ', 26.49), it('Chicken BLT', 22.99), it('Open Food', 2.5), it('Open Food', 3), it('Ice Cream', 6.49), it('Sticky Toffee', 11.99, 2)], 165.08, 'CA')), 9.19), 'CA BFF (BC): impuestos 9,19 = 5,9 % de la consumición');
ok(near(fixed(reconcile([it('Calamari', 19.95, 2), it('Truffle Fries', 10.95), it('Riley Pizza', 14.95), it('Chicken Thai', 29.95, 2), it('Elderberry', 21.95), it('Cranberry', 21.95, 2), it('Gin Fizz', 16.95), it('Village Enhancement', 1.92), it('e payment processing', 4.17), it('Gratuity 18%', 37.53)], 267.76, 'CA')), 15.64), 'CA Ontario: HST omitido con la gratuity incluida');
ok(reconcile([it('platos', 100), it('HST', 13)], 113, 'CA').ok, 'CA: con HST ya listado y la suma cuadrando no agrega nada');
// Tailandia: VAT 7 % calculado sobre consumición + servicio (Ippudo y The Local reales, fallaban en producción)
ok(near(fixed(reconcile([it('Coke', 45), it('Ippu Mineral Water', 30), it('Kuro Ramen', 240, 3), it('Service', 79.5)], 935.72, 'TH')), 61.22), 'TH Ippudo: VAT 61,22 = 7 % de ítems + servicio');
ok(near(fixed(reconcile([it('Appetizer set', 250), it('Pomelo Salad', 250), it('Bai cha kram', 250, 2), it('Grill Beef', 850), it('Chicken Pandanus', 220), it('Rice', 40, 2), it('Mango Blended', 120), it('Cold Butt&Passion', 85), it('Soda', 55), it('Service Charge 10%', 241)], 2836.57, 'TH')), 185.57), 'TH The Local: VAT 185,57 = 7 % de ítems + servicio');
ok(!reconcile([it('a', 100), it('Service', 10)], 125, 'TH').auto_fix_item || reconcile([it('a', 100), it('Service', 10)], 125, 'TH').auto_fix_item.nombre !== 'VAT 7%', 'TH: 13,6 % de diferencia no es VAT 7 %');
// Austria: ítems de más (suplemento contado dos veces) → avisa, nunca "arregla"
const at = reconcile([it('Hirter', 4, 2), it('Prosecco', 5.2, 2), it('Venezia', 13.1), it('San Daniele', 13.2)], 43.5, 'AT');
ok(!at.auto_fixed && at.diff < 0, 'AT: suma > total → sin auto-fix');
// Cuadra: sin ruido
ok(reconcile([it('a', 43.5)], 43.5, 'AT').ok, 'AT: suma = total → ok');

console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones de reconciliación OK`);
process.exit(fails ? 1 : 0);
