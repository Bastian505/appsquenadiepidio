// Service worker de DiviCuenta: deja instalar la app y abrirla aunque no haya señal.
// Estrategia "red primero": siempre se intenta traer la versión nueva (así una actualización se ve de inmediato)
// y solo si no hay conexión se usa la copia guardada. Nunca guarda llamadas a la API ni a Supabase.
const CACHE = 'dc-shell-v2';
const SHELL = ['/v2/', '/v2/styles.css', '/v2/app.js', '/v2/sync.js', '/v2/icon.svg', '/v2/fonts/bricolage-latin.woff2', '/v2/icon-192.png',
  '/core/config.js', '/core/currencies.js', '/core/split.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/v2/') : Response.error())))
  );
});
