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
const modelsUsed = {};
// Tokens reales de cada llamada (el flujo de la app los escribe en el registro) para estimar el costo por boleta.
const usage = {};   // modelo -> { calls, input, output, cw, cr }
// Precios de lista por millón de tokens (los que conozco; confirmar en la consola de Anthropic): entrada, salida, escritura de caché (5 min), lectura de caché.
const PRICES = {
  'claude-sonnet-4-6': { in: 3, out: 15, cw: 3.75, cr: 0.30 }, 'claude-sonnet-5-5': { in: 2, out: 10, cw: 2.5, cr: 0.20 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cw: 1.25, cr: 0.10 }, 'claude-haiku-4-5': { in: 1, out: 5, cw: 1.25, cr: 0.10 },
  'claude-haiku-5-5': { in: 0.10, out: 0.50, cw: 0.125, cr: 0.01 }
};
const origLog = console.log.bind(console);
console.log = (...a) => {
  if (a[0] === 'claude usage' && typeof a[1] === 'string') {
    try { const u = JSON.parse(a[1]); const k = u.model || '?', x = usage[k] || (usage[k] = { calls: 0, input: 0, output: 0, cw: 0, cr: 0 });
      x.calls++; x.input += u.input || 0; x.output += u.output || 0; x.cw += u.cache_write || 0; x.cr += u.cache_read || 0; } catch (e) {}
  }
  origLog(...a);
};   // qué modelo respondió de verdad (la prueba no vale si no coincide con el pedido)
async function viaHandler(fx, imgPath) {
  if (!_handler) { process.env.OCR_MODEL = MODEL; _handler = (await import('../../../api/scan-receipt.js')).default; }
  const buf = fs.readFileSync(imgPath);
  const mediaType = buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : 'image/jpeg';
  let status = 0, body = null;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { body = b; return this; }, end() {} };
  await _handler({ method: 'POST', headers: { 'x-forwarded-for': '10.1.' + Math.floor(++_ipSeq / 250) + '.' + (_ipSeq % 250) },
    body: { image_base64: buf.toString('base64'), media_type: mediaType, country_hint: process.env.EVAL_NOHINT === '1' ? undefined : fx.pais } }, res);   // EVAL_NOHINT=1: como la primera lectura en producción, sin país
  if (status !== 200 || !body || body.ok === false) return { ok: false, reason: (body && (body.reason || body.code || body.error)) || ('HTTP ' + status) };
  modelsUsed[body.model_used || '?'] = (modelsUsed[body.model_used || '?'] || 0) + 1;
  return body;
}

// ¿Cuadra? Mismo criterio que el aviso naranja de la app (v2/app.js review()): suma de ítems vs total impreso,
// tolerancia 0,05 (1 en monedas sin decimales). Es lo que ve el usuario; "total OK" solo dice que se leyó bien el total impreso.
const NO_DEC = new Set(['CLP','JPY','KRW','COP','HUF','ISK','PYG','VND','RSD','IDR','UGX']);
function cuadra(items, total, moneda) {
  const sum = (items || []).reduce((a, i) => a + (i.precio_unitario || 0) * (i.cantidad || 1), 0);
  const diff = (total || 0) - sum;
  const tol = NO_DEC.has(moneda) ? 1 : Math.max(0.05, (total || 0) * 0.0015);   // igual que review() en v2/app.js
  return { ok: !total || Math.abs(diff) <= tol, diff, sum };
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
      const cq = cuadra(parsed.items, parsed.total_referencia, parsed.moneda || fx.moneda);
      const currencyOk = parsed.moneda === fx.moneda;
      console.log(
        `items ${itemScore.matched}/${itemScore.total}` +
        `${itemScore.extra ? ` (+${itemScore.extra} de mas)` : ''}` +
        ` · total ${totalOk ? 'OK' : `MAL (${parsed.total_referencia} vs ${fx.total_referencia})`}` +
        ` · cuadra ${cq.ok ? 'SÍ' : `NO (${cq.diff > 0 ? 'faltan' : 'sobran'} ${Math.abs(cq.diff).toFixed(2)})`}` +
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
      results.push({ fixture: fx, ok: true, itemScore, totalOk, countryOk, currencyOk, cuadra: cq.ok, cuadraDiff: cq.diff, raw: parsed });
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      results.push({ fixture: fx, ok: false, reason: 'api_error', error: e.message });
    }
  }

  // ── Resumen por pais ──
  const byCountry = {};
  for (const r of results) {
    const c = r.fixture.pais;
    byCountry[c] ??= { n: 0, itemsMatched: 0, itemsTotal: 0, totalOk: 0, countryOk: 0, currencyOk: 0, cuadra: 0, failed: 0 };
    const b = byCountry[c];
    b.n++;
    if (!r.ok) { b.failed++; continue; }
    b.itemsMatched += r.itemScore.matched;
    b.itemsTotal += r.itemScore.total;
    if (r.totalOk) b.totalOk++;
    if (r.countryOk) b.countryOk++;
    if (r.currencyOk) b.currencyOk++;
    if (r.cuadra) b.cuadra++;
  }

  console.log('\n── Resumen por pais ──');
  console.log('pais  n  items     total  cuadra pais  moneda');
  for (const [c, b] of Object.entries(byCountry).sort()) {
    const itemsPct = b.itemsTotal ? Math.round(100 * b.itemsMatched / b.itemsTotal) : 0;
    console.log(
      `${c.padEnd(5)} ${String(b.n).padEnd(2)} ${String(itemsPct + '%').padEnd(9)} ` +
      `${String(b.totalOk + '/' + b.n).padEnd(5)} ${String(b.cuadra + '/' + b.n).padEnd(6)} ${String(b.countryOk + '/' + b.n).padEnd(5)} ${b.currencyOk + '/' + b.n}` +
      (b.failed ? `  (${b.failed} fallidas)` : '')
    );
  }

  const ok_ = results.filter(r => r.ok), N = results.length;
  const sum_ = k => ok_.filter(r => r[k]).length;
  console.log(`\n── TOTAL (${N} boletas${PIPELINE ? ', flujo completo de la app' : ', lectura cruda'}) ──`);
  if (PIPELINE) {
    const mu = Object.entries(modelsUsed).map(([m, n]) => `${m} x${n}`).join(', ');
    console.log(`modelo que respondió: ${mu || '(ninguno)'}`);
    // Costo estimado con tres escenarios de caché (todos con los mismos tokens medidos):
    //  A) tal como salió en esta corrida (muchas lecturas seguidas → la caché se aprovecha mucho; es el escenario más barato y poco realista con poco tráfico)
    //  B) caché fría: cada llamada escribe la caché y nunca la lee (tráfico esporádico)  C) sin caché: todo se paga como entrada normal
    let cA = 0, cB = 0, cC = 0, calls = 0, tin = 0, tout = 0, tcache = 0;
    for (const [m, x] of Object.entries(usage)) {
      const pr = PRICES[m]; if (!pr) { console.log(`(sin precio para ${m}: no se estima su costo)`); continue; }
      const M = 1e6, cache = x.cw + x.cr;
      cA += (x.input * pr.in + x.output * pr.out + x.cw * pr.cw + x.cr * pr.cr) / M;
      cB += (x.input * pr.in + x.output * pr.out + cache * pr.cw) / M;
      cC += (x.input * pr.in + x.output * pr.out + cache * pr.in) / M;
      calls += x.calls; tin += x.input; tout += x.output; tcache += cache;
    }
    if (calls) {
      const per = v => '$' + (v / N).toFixed(4), cents = v => (100 * v / N).toFixed(2) + ' ¢';
      console.log(`llamadas al modelo: ${calls} (${(calls / N).toFixed(2)} por boleta) · tokens por boleta: entrada ${Math.round(tin / N)}, prefijo de reglas ${Math.round(tcache / N)}, salida ${Math.round(tout / N)}`);
      console.log(`costo por boleta — caché aprovechada (como en esta corrida): ${per(cA)} (${cents(cA)}) · caché fría: ${per(cB)} (${cents(cB)}) · sin caché: ${per(cC)} (${cents(cC)})`);
    }
    if (Object.keys(modelsUsed).some(m => m !== MODEL)) console.log(`⚠ ATENCIÓN: se pidió ${MODEL} pero respondió otro: esta medición no sirve`);
  }
  console.log(`respondió: ${ok_.length}/${N} · total impreso bien leído: ${sum_('totalOk')}/${N} · LA SUMA CUADRA: ${sum_('cuadra')}/${N} (${Math.round(100 * sum_('cuadra') / N)}%) · país: ${sum_('countryOk')}/${N} · moneda: ${sum_('currencyOk')}/${N}`);
  const im = ok_.reduce((a, r) => a + r.itemScore.matched, 0), it = ok_.reduce((a, r) => a + r.itemScore.total, 0);
  console.log(`ítems correctos (nombre+precio+cantidad): ${im}/${it} (${it ? Math.round(100 * im / it) : 0}%)`);
  const nq = ok_.filter(r => !r.cuadra).sort((a, b) => Math.abs(b.cuadraDiff) / (b.fixture.total_referencia || 1) - Math.abs(a.cuadraDiff) / (a.fixture.total_referencia || 1));
  if (nq.length) { console.log('\nBoletas que NO cuadran (de la más lejana a la más cercana):'); for (const r of nq) console.log(`  ${r.fixture.id}: ${r.cuadraDiff > 0 ? 'faltan' : 'sobran'} ${Math.abs(r.cuadraDiff).toFixed(2)} ${r.fixture.moneda} de ${r.fixture.total_referencia} (${(100 * Math.abs(r.cuadraDiff) / (r.fixture.total_referencia || 1)).toFixed(1)}%)`); }

  fs.writeFileSync(
    path.join(__dirname, `results.${MODEL}.${Date.now()}.json`),
    JSON.stringify(results, null, 2)
  );
}

main();
