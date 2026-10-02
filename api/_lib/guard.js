// Protecciones comunes para las funciones de /api (los archivos con "_" no se publican como ruta).
// Origen permitido, secreto compartido opcional y límite de uso por IP (en memoria: best-effort,
// vive mientras la instancia esté tibia; el límite real a escala va en la Fase 2 con almacenamiento compartido).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://yporqueno.vercel.app').split(',').map(s => s.trim());
const APP_SHARED_SECRET = process.env.APP_SHARED_SECRET || null;
const hitsByKey = new Map();

export function guard(req, res, { limit = 20, windowMs = 60_000, name = 'api' } = {}) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret');
  if (req.method === 'OPTIONS') { res.status(200).end(); return false; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return false; }
  if (APP_SHARED_SECRET && req.headers['x-app-secret'] !== APP_SHARED_SECRET) {
    res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED' }); return false;
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const key = name + ':' + ip, now = Date.now();
  const hits = (hitsByKey.get(key) || []).filter(t => now - t < windowMs);
  hits.push(now); hitsByKey.set(key, hits);
  if (hits.length > limit) { res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un minuto.', code: 'RATE_LIMITED' }); return false; }
  return true;
}
