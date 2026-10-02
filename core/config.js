// Configuración compartida del cliente (v1 y v2). Ver api/scan-receipt.js → APP_SHARED_SECRET.
// No es un secreto real (vive en el navegador): solo añade fricción a llamadas desde otros sitios.
(function (root) {
  root.DC_CONFIG = {
    SCAN_URL: '/api/scan-receipt',
    TRANSLATE_URL: '/api/translate',
    // Cuentas compartidas (opcional): sin esto la app funciona igual, en un solo teléfono.
    // La clave anónima es pública por diseño; quién puede ver o cambiar qué lo decide la base
    // de datos (ver supabase/migrations/20261002_shared_bills.sql).
    SUPABASE_URL: 'https://kozakmufitkepgpxctxu.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvemFrbXVmaXRrZXBncHhjdHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDI3NzUsImV4cCI6MjA5MTQxODc3NX0.HXAuXex26Y7ns2HR4VX6_htnSkbo1lldurWNmoGh9-k',
    APP_SHARED_SECRET: 'CHANGE_ME_TO_MATCH_VERCEL_ENV_VAR'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
