#!/usr/bin/env node
// Segunda lectura cuando la suma no cuadra: se adopta solo si acerca claramente al total; si falla, se conserva la primera.
// Sin red: se reemplaza fetch por respuestas simuladas del modelo.
process.env.ANTHROPIC_API_KEY = 'test';
const { default: handler } = await import('../api/scan-receipt.js');

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } };
const it = (nombre, p, c = 1) => ({ nombre, precio_unitario: p, cantidad: c, confianza: 0.9 });
const model = items => ({ ok: true, restaurante: 'Taberna', moneda: 'EUR', pais: 'GR', items, total_referencia: 105.84, confianza_global: 0.9 });
const buenos = [it('A', 50), it('B', 55.84)];                 // suma 105.84
const malos  = [it('A', 50), it('B', 50.84)];                  // suma 100.84 (faltan 5.00)
const peores = [it('A', 20), it('B', 50.84)];                  // suma 70.84

async function run(respuestas) {
  let llamadas = 0;
  globalThis.fetch = async () => {
    const r = respuestas[Math.min(llamadas++, respuestas.length - 1)];
    if (r instanceof Error) throw r;
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: {} }) };
  };
  let body = null, status = 0;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { body = b; return this; }, end() {} };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 250) }, body: { image_base64: 'AAAA', media_type: 'image/jpeg', country_hint: 'GR' } }, res);
  return { body, status, llamadas };
}
const suma = b => b.items.reduce((a, i) => a + i.precio_unitario * i.cantidad, 0);

let r = await run([model(buenos)]);
ok(r.llamadas === 1 && !r.body.reconciliation.reintento.usado, 'si la primera cuadra, no hay segunda lectura');

r = await run([model(malos), model(buenos)]);
ok(r.llamadas === 2 && r.body.reconciliation.reintento.mejoro && Math.abs(suma(r.body) - 105.84) < 0.01, 'si no cuadra, la segunda lectura que acerca al total se adopta');

r = await run([model(malos), model(peores)]);
ok(r.llamadas === 2 && !r.body.reconciliation.reintento.mejoro && Math.abs(suma(r.body) - 100.84) < 0.01, 'si la segunda es peor, se conserva la primera');

r = await run([model(malos), new Error('boom')]);
ok(r.status === 200 && Math.abs(suma(r.body) - 100.84) < 0.01, 'si la segunda lectura falla, se responde con la primera');

r = await run([model(malos), { ok: false, reason: 'not_a_receipt' }]);
ok(r.status === 200 && Math.abs(suma(r.body) - 100.84) < 0.01, 'si la segunda se rehúsa, se responde con la primera');

console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones de la segunda lectura OK`);
process.exit(fails ? 1 : 0);
