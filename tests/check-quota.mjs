#!/usr/bin/env node
// Cuota de escaneos por usuario y registro de uso (api/_lib/quota.js + api/scan-receipt.js). Sin red: Supabase y Anthropic simulados.
process.env.ANTHROPIC_API_KEY = 'test';
const { default: handler } = await import('../api/scan-receipt.js');
const { estimateCostCents, bearerToken } = await import('../api/_lib/quota.js');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } };
const it = (nombre, p, c = 1) => ({ nombre, precio_unitario: p, cantidad: c, confianza: 0.9 });
const LECTURA = { ok: true, restaurante: 'X', moneda: 'CLP', pais: 'CL', items: [it('A', 60), it('B', 40)], total_referencia: 100, confianza_global: 0.9 };
const JWT = 'aaa.bbb.ccc';

// sb: respuesta de dc_consume_scan | 'caido' | 401. claude: 'ok' | 500.
async function run({ auth = 'Bearer ' + JWT, sb, claude = 'ok', body = {} } = {}) {
  const calls = { anthropic: 0, consume: 0, finish: [], supabase: [] };
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.includes('supabase.co')) {
      calls.supabase.push({ url, headers: init.headers });
      if (url.endsWith('dc_consume_scan')) {
        calls.consume++;
        if (sb === 'caido') throw new Error('network down');
        if (sb === 401) return { ok: false, status: 401, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => [sb] };
      }
      if (url.endsWith('dc_finish_scan')) { calls.finish.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => null }; }
    }
    calls.anthropic++;
    if (claude === 500) return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(LECTURA) }], usage: { input_tokens: 1000, output_tokens: 500 } }) };
  };
  let out = null, status = 200;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { out = b; return this; }, end() {} };
  const headers = { 'x-forwarded-for': '10.9.0.' + Math.floor(Math.random() * 250) };
  if (auth) headers.authorization = auth;
  await handler({ method: 'POST', headers, body: { image_base64: 'AAAA', media_type: 'image/jpeg', country_hint: 'CL', ...body } }, res);
  return { out, status, calls };
}
const ALLOW = (used = 1, limit = 30) => ({ out_scan_id: '11111111-1111-1111-1111-111111111111', out_allowed: true, out_reason: null, out_used: used, out_limit: limit });
const DENY = (reason, used = 30, limit = 30) => ({ out_scan_id: null, out_allowed: false, out_reason: reason, out_used: used, out_limit: limit });
const reset = () => { delete process.env.SCAN_QUOTA_PER_MONTH; delete process.env.SCAN_GLOBAL_DAILY_LIMIT; };

// Apagada (por defecto): no se toca Supabase y todo funciona igual que siempre
reset();
let r = await run();
ok(r.status === 200 && r.out.ok && r.calls.supabase.length === 0, 'sin SCAN_QUOTA_PER_MONTH: no llama a Supabase y lee normal');
ok(r.out.quota === undefined, 'sin cuota: la respuesta no trae el campo quota');

// Activada
process.env.SCAN_QUOTA_PER_MONTH = '30';
r = await run({ auth: null, sb: ALLOW() });
ok(r.status === 401 && r.out.code === 'AUTH_REQUIRED' && r.calls.anthropic === 0 && r.calls.consume === 0, 'sin sesión: 401, no gasta IA ni consulta la base');
r = await run({ auth: 'Bearer no-es-un-jwt', sb: ALLOW() });
ok(r.status === 401 && r.calls.anthropic === 0, 'token con formato inválido: 401 sin gastar IA');
r = await run({ sb: 401 });
ok(r.status === 401 && r.out.code === 'AUTH_REQUIRED' && r.calls.anthropic === 0, 'token vencido o falso (la base lo rechaza): 401 sin gastar IA');

r = await run({ sb: ALLOW(3, 30) });
ok(r.status === 200 && r.out.ok && r.calls.anthropic === 1, 'con cupo: lee la boleta');
ok(r.out.quota && r.out.quota.used === 3 && r.out.quota.limit === 30, 'con cupo: la respuesta dice cuántas lecturas lleva (3 de 30)');
ok(r.calls.supabase[0].headers.Authorization === 'Bearer ' + JWT && r.calls.supabase[0].headers.apikey, 'la reserva se hace con la sesión del usuario y la clave pública');
ok(r.calls.finish.length === 1 && r.calls.finish[0].p_ok === true && r.calls.finish[0].p_country === 'CL' && r.calls.finish[0].p_cuadra === true && r.calls.finish[0].p_items === 2 &&
   r.calls.finish[0].p_scan_id === '11111111-1111-1111-1111-111111111111' && r.calls.finish[0].p_cost_cents > 0, 'al terminar anota país, si cuadró, ítems y costo');
ok(/claude/.test(r.calls.finish[0].p_model || ''), 'al terminar anota el modelo que respondió');

r = await run({ sb: DENY('user_month') });
ok(r.status === 429 && r.out.code === 'QUOTA_EXCEEDED' && /30/.test(r.out.error) && r.calls.anthropic === 0 && r.calls.finish.length === 0, 'sin cupo del mes: 429, no gasta IA y no registra');
r = await run({ sb: DENY('global_day') });
ok(r.status === 429 && r.out.code === 'DAILY_LIMIT' && r.calls.anthropic === 0, 'tope diario global: 429 sin gastar IA');

r = await run({ sb: 'caido' });
ok(r.status === 200 && r.out.ok && r.calls.finish.length === 0, 'si Supabase no responde, deja pasar (falla abierta) sin romper');

r = await run({ sb: ALLOW(), claude: 500 });
ok(r.status >= 500 && r.calls.finish.length === 1 && r.calls.finish[0].p_ok === false, 'si la IA falla, el escaneo se devuelve (p_ok = false) y no cuenta');

process.env.SCAN_GLOBAL_DAILY_LIMIT = '500';
r = await run({ sb: ALLOW() });
ok(JSON.parse(JSON.stringify(r.calls.supabase[0])).url.endsWith('dc_consume_scan'), 'con tope diario configurado sigue funcionando');
reset();

// Utilidades
ok(Math.abs(estimateCostCents('claude-sonnet-5-5', { input_tokens: 1000, output_tokens: 500 }) - 0.7) < 1e-9, 'costo Sonnet 5.5: 1000 entrada + 500 salida = 0,7 ¢');
ok(Math.abs(estimateCostCents('claude-haiku-4-5-20251001', { input_tokens: 1000, output_tokens: 500 }) - 0.35) < 1e-9, 'costo Haiku: 0,35 ¢');
ok(Math.abs(estimateCostCents('claude-haiku-5-5', { input_tokens: 1000, output_tokens: 500 }) - 0.035) < 1e-9, 'costo Haiku 5.5: 1000 entrada + 500 salida = 0,035 ¢ (20× menos que Sonnet 5.5)');
ok(estimateCostCents('claude-sonnet-4-6', { input_tokens: 1000, cache_read_input_tokens: 10000 }) > estimateCostCents('claude-sonnet-5-5', { input_tokens: 1000, cache_read_input_tokens: 10000 }), 'Sonnet 4.6 cuesta más que 5.5');
ok(bearerToken({ headers: { authorization: 'Bearer a.b.c' } }) === 'a.b.c' && bearerToken({ headers: {} }) === null && bearerToken({ headers: { authorization: 'Basic xyz' } }) === null, 'lee solo cabeceras Bearer con forma de JWT');

console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones de cuota y uso OK`);
process.exit(fails ? 1 : 0);
