#!/usr/bin/env node
// Chequeo sin API: cada moneda de COUNTRY_RULES (servidor) debe tener símbolo en las tablas
// del cliente (ambas copias del HTML), y las monedas sin decimales deben coincidir.
// Uso: node tests/check-currencies.mjs   (sale con código 1 si algo falla)
import fs from 'node:fs';

const server = fs.readFileSync('api/scan-receipt.js', 'utf8');
const rules = [...server.matchAll(/^  ([A-Z]{2}): \{\s*\n\s*name:'([^']*)', currency:'([A-Z]{3})', symbol:'([^']*)', has_decimals:(true|false)/gm)]
  .map(m => ({ code: m[1], name: m[2], cur: m[3], sym: m[4], dec: m[5] === 'true' }));
if (rules.length < 30) { console.error('No pude leer COUNTRY_RULES (' + rules.length + ' países)'); process.exit(1); }

const noDecServer = new Set((server.match(/const NO_DECIMAL = new Set\(\[([^\]]*)\]/s)?.[1] || '').match(/'([A-Z]{3})'/g)?.map(s => s.slice(1, 4)) || []);
let errors = 0;
const fail = m => { console.log('✗ ' + m); errors++; };

for (const file of ['index.html', 'apps/divicuenta/index.html']) {
  const html = fs.readFileSync(file, 'utf8');
  const symBlock = html.match(/var sym=\{([^}]*)\};/)?.[1] || '';
  const symbols = Object.fromEntries([...symBlock.matchAll(/'([A-Z]{3})':'([^']*)'/g)].map(m => [m[1], m[2]]));
  const sinDec = new Set((html.match(/var sinDec=\[([^\]]*)\]/)?.[1] || '').match(/'([A-Z]{3})'/g)?.map(s => s.slice(1, 4)) || []);
  const suf = (html.match(/var suf=\[([^\]]*)\]/)?.[1] || '');
  const sinD = new Set((html.match(/var sinD=\[([^\]]*)\]/)?.[1] || '').match(/'([A-Z]{3})'/g)?.map(s => s.slice(1, 4)) || []);
  for (const c of noDecServer) if (!sinD.has(c)) fail(`${file}: ${c} está en NO_DECIMAL del servidor pero no en sinD (normalización del cliente)`);
  for (const r of rules) {
    if (!symbols[r.cur]) fail(`${file}: falta símbolo para ${r.cur} (${r.name}) en la tabla sym`);
    if (!r.dec && !sinDec.has(r.cur)) fail(`${file}: ${r.cur} (${r.name}) no tiene decimales en el servidor pero no está en sinDec`);
  }
  // símbolos de texto (RSD, Rs...) que van como sufijo deben estar en la lista suf
  for (const [cur, s] of Object.entries(symbols)) {
    if (/^[A-Za-z]{2,}$/.test(s) && s.length >= 3 && !suf.includes(`'${s}'`) && ['AED','SAR','RSD','Lek','kn'].includes(s)) fail(`${file}: símbolo sufijo ${s} (${cur}) no está en suf`);
  }
}
for (const r of rules) {
  if (!r.dec && !noDecServer.has(r.cur)) fail(`servidor: ${r.cur} (${r.name}) tiene has_decimals:false pero no está en NO_DECIMAL`);
}
if (errors) { console.log(`\n${errors} problema(s)`); process.exit(1); }
console.log(`✓ ${rules.length} países, monedas y símbolos sincronizados en servidor y ambos HTML`);
