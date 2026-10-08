#!/usr/bin/env node
// Palancas de costo del lector: modelo por variable de entorno, caché, prefijo común entre países y cascada barato → fuerte. Sin red.
process.env.ANTHROPIC_API_KEY = 'test';
const { default: handler } = await import('../api/scan-receipt.js');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } };
const it = (nombre, p, c = 1) => ({ nombre, precio_unitario: p, cantidad: c, confianza: 0.9 });
const lect = (items, total = 100, pais = 'AR') => ({ ok: true, restaurante: 'X', moneda: 'ARS', pais, items, total_referencia: total, confianza_global: 0.9 });
const buena = lect([it('A', 60), it('B', 40)]), mala = lect([it('A', 60), it('B', 5)]);

async function run(respuestas, pais = 'AR') {
  const bodies = []; let i = 0;
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    const r = respuestas[Math.min(i++, respuestas.length - 1)];
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 10, output_tokens: 5 } }) };
  };
  let body = null, status = 0;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { body = b; return this; }, end() {} };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '10.2.0.' + Math.floor(Math.random() * 250) }, body: { image_base64: 'AAAA', media_type: 'image/jpeg', country_hint: pais } }, res);
  return { body, status, bodies };
}
const reset = () => ['OCR_MODEL', 'OCR_CACHE', 'OCR_PROMPT_LAYOUT', 'OCR_CASCADE_MODEL', 'OCR_EFFORT', 'OCR_THINKING', 'OCR_PROFILE_RETRY'].forEach(k => delete process.env[k]);

// Por defecto: exactamente lo de siempre
reset();
let r = await run([buena]);
let b = r.bodies[0];
ok(b.model === 'claude-sonnet-4-6' && b.temperature === 0 && !b.thinking && !b.output_config, 'por defecto: Sonnet 4.6 con temperature 0 y sin campos de pensamiento');
ok(Array.isArray(b.system) && b.system.length === 1 && b.system[0].cache_control && /País sugerido: AR/.test(b.system[0].text), 'por defecto: un solo bloque cacheado, con el país dentro (formato original)');

// OCR_MODEL
process.env.OCR_MODEL = 'claude-haiku-4-5-20251001';
r = await run([buena]); ok(r.bodies[0].model === 'claude-haiku-4-5-20251001' && r.body.model_used === 'claude-haiku-4-5-20251001', 'OCR_MODEL elige el modelo y la respuesta dice cuál respondió');
process.env.OCR_MODEL = 'no es un modelo; drop table';
r = await run([buena]); ok(r.bodies[0].model === 'claude-sonnet-4-6', 'un OCR_MODEL con formato inválido se ignora');

// Sonnet 5.5: sin temperature, pensamiento mínimo y esfuerzo configurable
process.env.OCR_MODEL = 'claude-sonnet-5-5';
r = await run([buena]); b = r.bodies[0];
ok(b.temperature === undefined && b.thinking?.type === 'between_tools' && b.output_config?.effort === 'high', 'Sonnet 5.5: sin temperature, thinking between_tools y esfuerzo high');
process.env.OCR_EFFORT = 'low';
r = await run([buena]); ok(r.bodies[0].output_config.effort === 'low', 'OCR_EFFORT cambia el esfuerzo');
process.env.OCR_THINKING = 'adaptive';
r = await run([buena]); ok(r.bodies[0].thinking === undefined, 'OCR_THINKING=adaptive deja el pensamiento adaptativo (sin campo)');

// Caché apagada
reset(); process.env.OCR_CACHE = '0';
r = await run([buena]); ok(!JSON.stringify(r.bodies[0].system).includes('cache_control'), 'OCR_CACHE=0 quita cache_control');

// Prefijo común entre países
reset(); process.env.OCR_PROMPT_LAYOUT = 'split';
const ar = (await run([buena], 'AR')).bodies[0].system, cl = (await run([buena], 'CL')).bodies[0].system;
ok(ar.length === 2 && ar[0].cache_control && !ar[1].cache_control, 'layout split: bloque estable cacheado y bloque de contexto sin caché');
ok(ar[0].text === cl[0].text, 'layout split: el bloque cacheado es idéntico para AR y CL (una sola entrada de caché)');
ok(/País sugerido: AR/.test(ar[1].text) && /País sugerido: CL/.test(cl[1].text) && !/País sugerido: AR/.test(ar[0].text), 'layout split: el país va solo en el contexto');

// Cascada
reset(); process.env.OCR_MODEL = 'claude-haiku-4-5-20251001'; process.env.OCR_CASCADE_MODEL = 'claude-sonnet-5-5';
r = await run([buena]);
ok(r.bodies.length === 1 && !r.body.reconciliation.cascada.usado, 'cascada: si el modelo barato cuadra, no se llama al fuerte');
r = await run([mala, buena]);
ok(r.bodies.length === 2 && r.bodies[1].model === 'claude-sonnet-5-5' && r.body.reconciliation.cascada.mejoro && r.body.model_used === 'claude-sonnet-5-5', 'cascada: si no cuadra, el fuerte vuelve a leer y se adopta');
const suma = x => x.items.reduce((a, i) => a + i.precio_unitario * i.cantidad, 0);
ok(Math.abs(suma(r.body) - 100) < 0.01, 'cascada: la suma final cuadra con el total impreso');
r = await run([mala, lect([it('A', 10), it('B', 5)])]);
ok(r.bodies.length === 2 && !r.body.reconciliation.cascada.mejoro && r.body.model_used === 'claude-haiku-4-5-20251001', 'cascada: si el fuerte deja la suma más lejos, se conserva la primera lectura');
reset();
r = await run([mala]); ok(r.bodies.length === 1, 'sin OCR_CASCADE_MODEL no hay cascada (conducta de siempre)');

// Segunda lectura con las reglas del país
process.env.OCR_PROFILE_RETRY = '1';
async function runNoHint(resp) { // como la app: sin country_hint
  const bodies = []; let i = 0;
  globalThis.fetch = async (u, init) => { bodies.push(JSON.parse(init.body)); const x = resp[Math.min(i++, resp.length - 1)];
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(x) }], usage: {} }) }; };
  let body = null; const res = { setHeader() {}, status() { return this; }, json(b) { body = b; return this; }, end() {} };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '10.3.0.' + Math.floor(Math.random() * 250) }, body: { image_base64: 'AAAA', media_type: 'image/jpeg' } }, res);
  return { body, bodies };
}
r = await runNoHint([buena]);
ok(r.bodies.length === 1 && !r.body.reconciliation.perfil_pais.usado, 'reglas del país: si la primera cuadra, no hay segunda lectura');
r = await runNoHint([mala, buena]);
ok(r.bodies.length === 2 && /País sugerido: AR/.test(r.bodies[1].system[0].text) && !/País sugerido: AR/.test(r.bodies[0].system[0].text), 'reglas del país: la segunda lectura lleva el país reconocido y la primera no');
ok(r.body.reconciliation.perfil_pais.mejoro && Math.abs(suma(r.body) - 100) < 0.01, 'reglas del país: se adopta la segunda si deja la suma en el total');
r = await runNoHint([mala, lect([it('A', 10)])]);
ok(r.bodies.length === 2 && !r.body.reconciliation.perfil_pais.mejoro, 'reglas del país: si la segunda queda más lejos, se conserva la primera');
delete process.env.OCR_PROFILE_RETRY;
r = await runNoHint([mala]); ok(r.bodies.length === 1, 'sin OCR_PROFILE_RETRY no hay segunda lectura por país');
// Propina sugerida impresa: porcentaje directo, calculada desde el monto, o descartada si no es plausible
reset();
const conSug = x => ({ ...lect([it('A', 60), it('B', 40)], 100), ...x });
r = await run([conSug({ propina_sugerida_pct: 10 })]); ok(r.body.propina_sugerida_pct === 10, 'propina sugerida: el porcentaje impreso pasa tal cual');
r = await run([conSug({ propina_sugerida_monto: 9.99 })]); ok(r.body.propina_sugerida_pct === 10, 'propina sugerida: solo con monto se calcula contra el total (9,99 de 100 = 10 %)');
r = await run([conSug({ propina_sugerida_pct: 80 })]); ok(r.body.propina_sugerida_pct === null, 'propina sugerida: un porcentaje absurdo se descarta');
r = await run([buena]); ok(r.body.propina_sugerida_pct === null, 'propina sugerida: sin sugerencia en la boleta, null');

// Alemania (Lidl): la IA omite la devolución de envases; la app la agrega como línea que RESTA (cantidad -1, precio positivo), no en 0 €
reset();
const lidl = lect([it('Wasser medium', 0.29, 6), it('Pfand 0,25 EM', 0.25, 6), it('Mineralwasser still', 1.29, 2), it('Pfand 2,25 EM', 2.25, 2)], 6.82, 'DE');
lidl.moneda = 'EUR';
r = await run([lidl], 'DE');
const dev = (r.body.items || []).find(x => x.auto_created);
ok(dev && dev.cantidad === -1 && Math.abs(dev.precio_unitario - 3.5) < 0.001 && /Pfandr/.test(dev.nombre), 'Lidl: la devolución agregada resta 3,50 (cantidad -1), no queda en 0 €');
ok(Math.abs(r.body.items.reduce((a, x) => a + x.precio_unitario * x.cantidad, 0) - 6.82) < 0.01, 'Lidl: con la devolución agregada la suma de la respuesta cuadra con 6,82');

// R22: el cargo de servicio en cualquier idioma queda como "Servicio" (la app lo reparte proporcional, no como plato)
reset();
const br = { ok: true, restaurante: 'Conferencia de conta', moneda: 'BRL', pais: 'BR', total_referencia: 190.3, confianza_global: 0.9,
  items: [it('SAND FILE COM QUEIJO', 39), it('CAIPI SMIRNOFF', 28, 2), it('FILE CARNE A PARMEGI', 52), it('BOLINHO DE BACALHAU', 12), it('PASTEL DE PALMITO CO', 14),
    { nombre: 'Servico', precio_unitario: 17.3, cantidad: 1, confianza: 0.95, cargo: 'servicio' }] };
r = await run([br], 'BR');
const sv = r.body.items.find(x => /serv/i.test(x.nombre));
ok(sv && sv.nombre === 'Servicio' && sv.precio_unitario === 17.3, 'R22: "Servico" marcado como cargo queda como "Servicio"');
ok(r.body.items.filter(x => /^servicio$/i.test(x.nombre)).length === 1 && r.body.items.length === 6, 'R22: no se duplica el servicio ni se pierden ítems');
const plato = lect([{ nombre: 'Servicio de bar', precio_unitario: 40, cantidad: 1, confianza: 0.9 }, it('B', 60)], 100);
r = await run([plato]);
ok(r.body.items.some(x => x.nombre === 'Servicio de bar'), 'R22: sin "cargo" el nombre no se toca');

console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones de palancas de costo OK`);
process.exit(fails ? 1 : 0);
