// Cuota de escaneos por usuario + registro de uso real (migración supabase/migrations/20261007_scan_quota.sql).
// Se activa SOLO si SCAN_QUOTA_PER_MONTH > 0; sin esa variable no cambia nada y no se llama a Supabase.
// Identidad: la sesión anónima de Supabase que la app ya usa para las cuentas compartidas (cabecera Authorization: Bearer <jwt>).
// Si Supabase no responde, se deja pasar (falla abierta): preferimos no bloquear a quien paga con tiempo antes que cortar el servicio.
// La URL y la clave "anon" de Supabase son públicas por diseño (están en core/config.js); lo que protege los datos es la base.
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://kozakmufitkepgpxctxu.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvemFrbXVmaXRrZXBncHhjdHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDI3NzUsImV4cCI6MjA5MTQxODc3NX0.HXAuXex26Y7ns2HR4VX6_htnSkbo1lldurWNmoGh9-k';

export const userLimit = () => Math.max(0, Math.floor(Number(process.env.SCAN_QUOTA_PER_MONTH) || 0));
export const globalDailyLimit = () => Math.max(0, Math.floor(Number(process.env.SCAN_GLOBAL_DAILY_LIMIT) || 0));
export const quotaEnabled = () => userLimit() > 0;

// USD por millón de tokens: [entrada, salida, escritura de caché, lectura de caché]
const PRICES = [
  [/haiku-5/i,      [0.10, 0.50, 0.125, 0.01]],   // Haiku 5.5 (caché: 1,25× y 0,1× de la entrada, como el resto; estimado)
  [/haiku/i,        [1, 5, 1.25, 0.10]],
  [/(sonnet|opus|fable)-5/i, [2, 10, 2.5, 0.20]],
  [/./,             [3, 15, 3.75, 0.30]]   // Sonnet 4.6 y cualquier otro: la tarifa más alta (estimación conservadora)
];
export function estimateCostCents(model, usage) {
  const p = (PRICES.find(([re]) => re.test(model || '')) || PRICES[PRICES.length - 1])[1];
  const u = usage || {};
  const usd = ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] +
               (u.cache_creation_input_tokens || 0) * p[2] + (u.cache_read_input_tokens || 0) * p[3]) / 1e6;
  return usd * 100;
}

export function bearerToken(req) {
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '').trim());
  return m ? m[1] : null;
}

async function rpc(name, args, jwt) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + jwt },
      body: JSON.stringify(args)
    });
    if (r.status === 401 || r.status === 403) return { authFailed: true };
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { data: await r.json() };
  } finally { clearTimeout(t); }
}

// Reserva un escaneo. Devuelve { skipped } (cuota apagada o Supabase caído), { authFailed }, { allowed:false, reason, used, limit } o { allowed:true, scanId, used, limit }.
export async function consumeScan(jwt) {
  try {
    const r = await rpc('dc_consume_scan', { p_user_limit: userLimit(), p_global_daily: globalDailyLimit() }, jwt);
    if (r.authFailed) return { authFailed: true };
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!row) return { skipped: true };
    if (row.out_reason === 'no_auth') return { authFailed: true };
    return row.out_allowed
      ? { allowed: true, scanId: row.out_scan_id, used: row.out_used, limit: row.out_limit }
      : { allowed: false, reason: row.out_reason, used: row.out_used, limit: row.out_limit };
  } catch (e) {
    console.error('QUOTA_UNAVAILABLE:', e && e.message);
    return { skipped: true };
  }
}

export async function finishScan(jwt, scanId, d) {
  try {
    await rpc('dc_finish_scan', {
      p_scan_id: scanId, p_ok: !!d.ok, p_country: d.country || null, p_model: d.model || null,
      p_cuadra: d.cuadra == null ? null : !!d.cuadra, p_cost_cents: d.costCents == null ? null : Math.round(d.costCents * 1000) / 1000, p_items: d.items == null ? null : d.items
    }, jwt);
  } catch (e) { console.error('QUOTA_FINISH_FAILED:', e && e.message); }
}
