#!/usr/bin/env node
// Chequeo sin API de la fuente única de monedas (core/currencies.js):
//  1. cada moneda de core/country-rules.js existe en core/currencies.js con los mismos decimales;
//  2. ambas copias del HTML cargan /core/currencies.js antes de su código;
//  3. nadie vuelve a escribir listas de monedas a mano en el HTML o el servidor.
// Uso: node tests/check-currencies.mjs   (sale con código 1 si algo falla)
import fs from 'node:fs';
import '../core/currencies.js';
import '../core/country-rules.js';
const C = globalThis.DC_CURRENCIES;

let errors = 0;
const fail = m => { console.log('✗ ' + m); errors++; };

const server = fs.readFileSync('api/scan-receipt.js', 'utf8');
const rules = Object.entries(globalThis.DC_COUNTRY_RULES)
  .map(([code, r]) => ({ code, name: r.name, cur: r.currency, dec: r.has_decimals }));
if (rules.length < 30) { console.error('No pude leer DC_COUNTRY_RULES (' + rules.length + ' países)'); process.exit(1); }
for (const r of rules) if (typeof r.dec !== 'boolean' || !/^[A-Z]{3}$/.test(r.cur || '')) fail(`${r.code}: currency/has_decimals inválidos`);

for (const r of rules) {
  if (!C.list[r.cur]) { fail(`core: falta la moneda ${r.cur} (${r.name})`); continue; }
  if ((C.decimals(r.cur) === 2) !== r.dec) fail(`${r.cur} (${r.name}): has_decimals=${r.dec} en el servidor pero decimals=${C.decimals(r.cur)} en core`);
}
for (const [code, c] of Object.entries(C.list)) {
  if (!c.symbol) fail(`core: ${code} sin símbolo`);
  if (c.decimals !== 0 && c.decimals !== 2) fail(`core: ${code} con decimales inválidos`);
}

// Listas escritas a mano (ej. ['CLP','JPY',...] o {'EUR':'€',...}) = señal de que alguien duplicó datos.
const handList = /\[\s*'(CLP|JPY|KRW|COP|HUF)'\s*,\s*'[A-Z]{3}'\s*,\s*'[A-Z]{3}'/;
const handMap = /\{\s*'EUR'\s*:\s*'/;
for (const file of ['index.html', 'apps/divicuenta/index.html', 'api/scan-receipt.js']) {
  const src = fs.readFileSync(file, 'utf8');
  if (handList.test(src)) fail(`${file}: lista de monedas escrita a mano; usar DC_CURRENCIES`);
  if (handMap.test(src)) fail(`${file}: tabla de símbolos escrita a mano; usar DC_CURRENCIES`);
  if (file.endsWith('.html')) {
    const i = src.indexOf('<script src="/core/currencies.js">');
    const j = src.indexOf('<script>');
    if (i < 0) fail(`${file}: no carga /core/currencies.js`);
    else if (j > -1 && i > j) fail(`${file}: carga /core/currencies.js después del código de la app`);
  }
}
if (!/import '\.\.\/core\/currencies\.js'/.test(server)) fail('api/scan-receipt.js: no importa core/currencies.js');
if (!/import '\.\.\/core\/country-rules\.js'/.test(server)) fail('api/scan-receipt.js: no importa core/country-rules.js');
if (/^\s+[A-Z]{2}: \{\s*\n\s*name:'/m.test(server)) fail('api/scan-receipt.js: tiene reglas de país escritas a mano; van en core/country-rules.js');

if (errors) { console.log(`\n${errors} problema(s)`); process.exit(1); }
console.log(`✓ ${rules.length} países y ${Object.keys(C.list).length} monedas: una sola fuente (core/currencies.js), sin listas duplicadas`);
