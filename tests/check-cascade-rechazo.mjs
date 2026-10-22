#!/usr/bin/env node
// Cascada ante rechazo: si el modelo barato rehúsa la boleta (o no devuelve ítems), se intenta con el modelo fuerte antes de decirle "no pude" al usuario.
// Sin red: se reemplaza fetch por respuestas simuladas, una por modelo pedido.
process.env.ANTHROPIC_API_KEY = 'test';
process.env.OCR_MODEL = 'claude-haiku-5-5';
const { default: handler } = await import('../api/scan-receipt.js');

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } };
const it = (nombre, p, c = 1) => ({ nombre, precio_unitario: p, cantidad: c, confianza: 0.9 });
const lectura = { ok: true, restaurante: 'Restaurante', moneda: 'EGP', pais: 'EG', items: [it('A', 100), it('B', 55.77)], total_referencia: 155.77, confianza_global: 0.9 };
const rechazo = { ok: false, reason: 'unknown_currency', message: 'No puedo identificar la moneda.', candidates: [] };

async function run(porModelo, cascada) {
  if (cascada) process.env.OCR_CASCADE_MODEL = cascada; else delete process.env.OCR_CASCADE_MODEL;
  const pedidos = [];
  globalThis.fetch = async (_u, init) => {
    const m = JSON.parse(init.body).model; pedidos.push(m);
    const r = porModelo[m];
    if (r instanceof Error) throw r;
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: {} }) };
  };
  let body = null, status = 0;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { body = b; return this; }, end() {} };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '10.0.1.' + Math.floor(Math.random() * 250) }, body: { image_base64: 'AAAA', media_type: 'image/jpeg' } }, res);
  return { body, status, pedidos };
}

let r = await run({ 'claude-haiku-5-5': rechazo, 'claude-sonnet-5-5': lectura }, 'claude-sonnet-5-5');
ok(r.pedidos.join() === 'claude-haiku-5-5,claude-sonnet-5-5' && r.body.items && r.body.items.length === 2, 'rechazo del modelo barato → el fuerte la lee');

r = await run({ 'claude-haiku-5-5': rechazo, 'claude-sonnet-5-5': lectura }, '');
ok(r.pedidos.length === 1 && r.body.ok === false, 'sin cascada configurada, el rechazo se entrega como antes');

r = await run({ 'claude-haiku-5-5': rechazo, 'claude-sonnet-5-5': rechazo }, 'claude-sonnet-5-5');
ok(r.pedidos.length === 2 && r.body.ok === false && r.body.reason === 'unknown_currency', 'si el fuerte también rehúsa, se entrega el rechazo original');

r = await run({ 'claude-haiku-5-5': rechazo, 'claude-sonnet-5-5': new Error('boom') }, 'claude-sonnet-5-5');
ok(r.status === 200 && r.body.ok === false, 'si el fuerte falla, se responde con el rechazo original (sin romper)');

r = await run({ 'claude-haiku-5-5': lectura, 'claude-sonnet-5-5': lectura }, 'claude-sonnet-5-5');
ok(r.pedidos.length === 1 && r.body.items.length === 2, 'si el barato lee bien y cuadra, el fuerte no se llama');

console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones de cascada ante rechazo OK`);
process.exit(fails ? 1 : 0);
