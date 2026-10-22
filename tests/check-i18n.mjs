#!/usr/bin/env node
// Idiomas de la interfaz: cada texto L('…') de app.js tiene su traducción al inglés, con los mismos {datos}; el español no cambia.
import fs from 'node:fs'; import vm from 'node:vm';
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  ✗ ' + m); } };
const store = {}, win = {}; const doc = { documentElement: {} };
const ctx = { window: win, document: doc, navigator: { language: 'es-CL' }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } } };
vm.runInNewContext(fs.readFileSync('v2/i18n.js', 'utf8'), ctx);
const I = win.DC_I18N;
const src = fs.readFileSync('v2/app.js', 'utf8');
const keys = new Set(); const re = /\bL\(\s*(?:[^'()]*\?\s*)?'((?:[^'\\]|\\.)*)'/g; let m;
while ((m = re.exec(src))) keys.add(m[1].replace(/\\'/g, "'"));
// los ternarios L(cond ? 'a' : 'b') se leen aparte
const re2 = /\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
while ((m = re2.exec(src))) { for (const k of [m[1], m[2]]) if (I.EN[k.replace(/\\'/g, "'")] != null) keys.add(k.replace(/\\'/g, "'")); }
const vars = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
ok(keys.size > 150, 'se encontraron los textos de app.js (' + keys.size + ')');
for (const k of keys) {
  if (/^[^a-zA-ZáéíóúñÁÉÍÓÚÑ¿¡]*$/.test(k)) continue;
  ok(I.EN[k] != null, 'falta la traducción al inglés de: ' + k);
  if (I.EN[k] != null) ok(vars(I.EN[k]) === vars(k), 'los {datos} no coinciden en: ' + k);
}
for (const k of Object.keys(I.EN)) ok(!/^\s|\s$/.test(k) || k.startsWith(' ') || k.endsWith(' '), 'clave rara: ' + k);
// el español devuelve el mismo texto; el inglés traduce
ok(I.t('Total impreso {printed}', { printed: '5' }) === 'Total impreso 5', 'español: sustituye datos');
I.set('en'); ok(I.t('Escanear boleta') === 'Scan receipt' && I.locale === 'en-US' && I.dec === '.', 'inglés: traduce y cambia el formato');
ok(I.t('Texto nuevo sin traducir') === 'Texto nuevo sin traducir', 'sin traducción: queda en español');
ok(store.dc_lang === 'en', 'recuerda el idioma elegido');
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones de idioma`);
process.exit(fails ? 1 : 0);
