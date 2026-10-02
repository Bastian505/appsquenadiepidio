// Configuración compartida del cliente (v1 y v2). Ver api/scan-receipt.js → APP_SHARED_SECRET.
// No es un secreto real (vive en el navegador): solo añade fricción a llamadas desde otros sitios.
(function (root) {
  root.DC_CONFIG = {
    SCAN_URL: '/api/scan-receipt',
    APP_SHARED_SECRET: 'CHANGE_ME_TO_MATCH_VERCEL_ENV_VAR'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
