#!/usr/bin/env node
// ── Harness de evals del motor de OCR de DiviCuenta ──────────────────────────
//
// Corre cada fixture de fixtures/manifest.json contra la API de Claude usando
// el mismo prompt que usa api/scan-receipt.js en produccion, y compara el
// resultado contra el ground truth escrito a mano.
//
// NO se puede correr desde el sandbox donde se armo este harness (sin acceso
// de red a api.anthropic.com). Correr donde haya ANTHROPIC_API_KEY y salida
// a internet:
//
//   ANTHROPIC_API_KEY=sk-ant-... node services/ocr/evals/run.mjs
//   ANTHROPIC_API_KEY=sk-ant-... node services/ocr/evals/run.mjs --country=DE
//   ANTHROPIC_API_KEY=sk-ant-... node services/ocr/evals/run.mjs --model=claude-haiku-4-6
//
// Que mide:
//   - % de items donde nombre+precio_unitario+cantidad calzan con el ground truth
//     (match de nombre es difuso: normaliza mayusculas/acentos/espacios)
//   - diferencia entre total_referencia extraido y el real
//   - acierto de pais/moneda
// Al final imprime una tabla por pais y un resumen general — eso es lo que
// se necesita para decidir con datos, no a ciegas, si un pais 'simple' puede
// bajar a Haiku sin perder precision (ver selectModel() en scan-receipt.js).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const MODEL = args.model || 'claude-sonnet-4-6';
const COUNTRY_FILTER = (typeof args.country === 'string' && args.country.trim()) ? args.country.trim().toUpperCase() : null;

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/manifest.json'), 'utf8')
);

// Reusa el prompt real de produccion en vez de duplicarlo — si scan-receipt.js
// cambia el prompt, este harness automaticamente prueba la version nueva.
const scanReceiptSrc = fs.readFileSync(path.join(REPO_ROOT, 'api/scan-receipt.js'), 'utf8');

function extractFn(src, name) {
  // Extrae una funcion top-level del archivo de produccion por nombre, sin
  // ejecutar el resto del archivo (que tiene un handler de Vercel al final).
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`No se encontro ${name}() en scan-receipt.js`);
  let depth = 0, i = src.indexOf('{', start), end = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

// Las reglas por país viven en core/country-rules.js (fuente única que también usa el servidor).
import '../../../core/country-rules.js';
const COUNTRY_RULES = globalThis.DC_COUNTRY_RULES;
const buildV5PromptSrc = extractFn(scanReceiptSrc, 'buildV5Prompt');

// eslint-disable-next-line no-new-func
const buildV5Prompt = new Function('COUNTRY_RULES', `${buildV5PromptSrc}; return buildV5Prompt;`)(COUNTRY_RULES);

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreItems(expected, actual) {
  const actualPool = [...actual];
  let matched = 0;
  const details = [];
  for (const exp of expected) {
    const expNorm = normName(exp.nombre);
    let bestIdx = -1, bestScore = 0;
    actualPool.forEach((act, idx) => {
      const actNorm = normName(act.nombre);
      // overlap simple de tokens — suficiente para un eval, no hace falta mas.
      const expTokens = new Set(expNorm.split(' '));
      const actTokens = new Set(actNorm.split(' '));
      const inter = [...expTokens].filter(t => actTokens.has(t)).length;
      const nameScore = inter / Math.max(expTokens.size, 1);
      if (nameScore > bestScore) { bestScore = nameScore; bestIdx = idx; }
    });
    if (bestIdx > -1 && bestScore >= 0.5) {
      const act = actualPool[bestIdx];
      const priceOk = Math.abs((act.precio_unitario ?? NaN) - exp.precio_unitario) < 0.02 * Math.max(1, Math.abs(exp.precio_unitario));
      const qtyOk = (act.cantidad ?? null) === exp.cantidad;
      if (priceOk && qtyOk) matched++;
      details.push({ nombre: exp.nombre, encontrado: true, priceOk, qtyOk, got: act });
      actualPool.splice(bestIdx, 1);
    } else {
      details.push({ nombre: exp.nombre, encontrado: false });
    }
  }
  return { matched, total: expected.length, extra: actualPool.length, extraNames: actualPool.map(a => `${a.nombre} ${a.precio_unitario}x${a.cantidad}`), details };
}

async function callClaude(apiKey, imagePath, system) {
  const buf = fs.readFileSync(imagePath);
  const imageBase64 = buf.toString('base64');
  // El tipo se detecta por los primeros bytes, no por la extensión (hay .jpg que en realidad son PNG).
  const mediaType = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png'
    : buf[0] === 0x52 && buf[1] === 0x49 ? 'image/webp'
    : buf[0] === 0x47 && buf[1] === 0x49 ? 'image/gif' : 'image/jpeg';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: 'Extrae todos los items con sus precios de esta boleta.' }
      ]}]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  const block = d.content?.find(b => b.type === 'text');
  if (!block?.text) throw new Error('Sin respuesta de Claude');
  return block.text;
}

function parseJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch (_) {}
  try { return JSON.parse(raw.replace(/```json|```/gi, '').trim()); } catch (_) {}
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s > -1 && e > s) { try { return JSON.parse(raw.substring(s, e + 1)); } catch (_) {} }
  return null;
}

// --pipeline: en vez de llamar al modelo directo, pasa cada boleta por el MISMO handler que usa la app
// (reconciliación, auto-arreglos y segunda lectura incluidas). Sin la bandera mide solo la lectura cruda.
const PIPELINE = process.argv.includes('--pipeline');
let _handler = null, _ipSeq = 0;
async function viaHandler(fx, imgPath) {
  if (!_handler) _handler = (await import('../../../api/scan-receipt.js')).default;
  const buf = fs.readFileSync(imgPath);
  const mediaType = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : 'image/jpeg';
  let status = 0, body = null;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { body = b; return this; }, end() {} };
  await _handler({ method: 'POST', headers: { 'x-forwarded-for': '10.1.' + Math.floor(++_ipSeq / 250) + '.' + (_ipSeq % 250) },
    body: { image_base64: buf.toString('base64'), media_type: mediaType, country_hint: fx.pais } }, res);
  if (status !== 200 || !body || body.ok === false) return { ok: false, reason: (body && (body.reason || body.code || body.error)) || ('HTTP ' + status) };
  return body;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Falta ANTHROPIC_API_KEY en el entorno.');
    process.exit(1);
  }

  let fixtures = manifest.fixtures;
  if (COUNTRY_FILTER) fixtures = fixtures.filter(f => f.pais === COUNTRY_FILTER);
  if (!fixtures.length) {
    const paises = [...new Set(manifest.fixtures.map(f => f.pais))].sort().join(', ');
    console.error(`No hay boletas para el país "${COUNTRY_FILTER}". Países disponibles: ${paises}`);
    process.exit(1);
  }

  const results = [];
  for (const fx of fixtures) {
    const imgPath = path.join(__dirname, 'fixtures', `${fx.id}.jpg`);
    const system = buildV5Prompt(fx.pais);
    process.stdout.write(`${fx.id} ... `);
    try {
      const parsed = PIPELINE ? await viaHandler(fx, imgPath) : parseJSON(await callClaude(apiKey, imgPath, system));
      if (!parsed || parsed.ok === false) {
        console.log(`REHUSADA (${parsed?.reason || 'parse_error'})`);
        results.push({ fixture: fx, ok: false, reason: parsed?.reason || 'parse_error' });
        continue;
      }
      const itemScore = scoreItems(fx.items, parsed.items || []);
      const totalDiff = Math.abs((parsed.total_referencia ?? 0) - fx.total_referencia);
      const totalOk = totalDiff <= Math.max(1, fx.total_referencia * 0.02);
      const countryOk = parsed.pais === fx.pais;
      const currencyOk = parsed.moneda === fx.moneda;
      console.log(
        `items ${itemScore.matched}/${itemScore.total}` +
        `${itemScore.extra ? ` (+${itemScore.extra} de mas)` : ''}` +
        ` · total ${totalOk ? 'OK' : `MAL (${parsed.total_referencia} vs ${fx.total_referencia})`}` +
        ` · pais ${countryOk ? 'OK' : `MAL (${parsed.pais})`}` +
        ` · moneda ${currencyOk ? 'OK' : `MAL (${parsed.moneda})`}`
      );
      // Detalle de fallos: qué ítems no calzaron y qué total leyó el modelo
      const faltan = itemScore.details.filter(d => !d.encontrado || !d.priceOk || !d.qtyOk);
      if (faltan.length || itemScore.extra || !totalOk) {
        for (const d of faltan) {
          console.log(`    - ${d.encontrado ? 'distinto' : 'falta'}: ${d.nombre}` + (d.got ? ` (leyó ${d.got.nombre} ${d.got.precio_unitario}x${d.got.cantidad})` : ''));
        }
        for (const n of itemScore.extraNames) console.log(`    + de más: ${n}`);
        if (!totalOk) console.log(`    total leído ${parsed.total_referencia} · esperado ${fx.total_referencia} · suma ítems leídos ${(parsed.items||[]).reduce((a,i)=>a+(i.precio_unitario||0)*(i.cantidad||1),0)}`);
      }
      results.push({ fixture: fx, ok: true, itemScore, totalOk, countryOk, currencyOk, raw: parsed });
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      results.push({ fixture: fx, ok: false, reason: 'api_error', error: e.message });
    }
  }

  // ── Resumen por pais ──
  const byCountry = {};
  for (const r of results) {
    const c = r.fixture.pais;
    byCountry[c] ??= { n: 0, itemsMatched: 0, itemsTotal: 0, totalOk: 0, countryOk: 0, currencyOk: 0, failed: 0 };
    const b = byCountry[c];
    b.n++;
    if (!r.ok) { b.failed++; continue; }
    b.itemsMatched += r.itemScore.matched;
    b.itemsTotal += r.itemScore.total;
    if (r.totalOk) b.totalOk++;
    if (r.countryOk) b.countryOk++;
    if (r.currencyOk) b.currencyOk++;
  }

  console.log('\n── Resumen por pais ──');
  console.log('pais  n  items     total  pais  moneda');
  for (const [c, b] of Object.entries(byCountry).sort()) {
    const itemsPct = b.itemsTotal ? Math.round(100 * b.itemsMatched / b.itemsTotal) : 0;
    console.log(
      `${c.padEnd(5)} ${String(b.n).padEnd(2)} ${String(itemsPct + '%').padEnd(9)} ` +
      `${String(b.totalOk + '/' + b.n).padEnd(5)} ${String(b.countryOk + '/' + b.n).padEnd(5)} ${b.currencyOk + '/' + b.n}` +
      (b.failed ? `  (${b.failed} fallidas)` : '')
    );
  }

  fs.writeFileSync(
    path.join(__dirname, `results.${MODEL}.${Date.now()}.json`),
    JSON.stringify(results, null, 2)
  );
}

main();
