# DiviCuenta — contexto para sesiones de Claude

PWA web: se fotografía una boleta (de cualquier país), Claude visión extrae los ítems, el grupo marca qué consumió cada uno (en un solo teléfono o en cuenta compartida en vivo vía Supabase), impuestos/servicio/propina se reparten proporcionalmente y se cierra el pago.
Dueño del proyecto: no técnico, chileno, prueba en iPhone con boletas reales. **Responder siempre en español.**

## Reglas de trabajo con el dueño
- En cada paso decir qué modelo usar: **Opus 5.5** para diseño/arquitectura/lógica de retención; **Sonnet 5.5** para OCR, evals, arreglos, SQL y tareas chicas.
- Ante "¿es tu mejor propuesta?": ser honesto y dar una recomendación, no un menú.
- **Nunca correr evals con IA de pago sin dar costo estimado y recibir OK.** Saldo de la API es chico (~US$5). Medir con muestras pequeñas (≈8 boletas ≈ 1¢ con Haiku 5.5; las 148 ≈ 15–20¢).
- No usar el correo del dueño en páginas/servicios públicos. No repetir RUT ni datos personales de boletas. Las imágenes de Google/Tripadvisor son solo fixtures internos, nunca públicas.
- PR #94 (política de privacidad) NO se mergea hasta tener titular/correo y revisión legal.
- No crear PR salvo que se pida. Commits terminan con los trailers de atribución que indique el sistema.

## Mapa del repo
- `v2/` — app actual (vanilla JS): `app.js`, `sync.js`, `styles.css`, `sw.js` (cache `dc-shell-v2`). Cada cambio visible sube la cadena `BUILD` en `v2/app.js`. La raíz (`index.html`, `style.css`) es la v1 antigua.
- `core/` — lógica pura compartida: `split.js` (reparto, `EXTRA_RE` nombres multi-idioma de servicio/impuesto), `currencies.js` y `country-rules.js` (fuentes únicas de verdad).
- `api/` — serverless Vercel: `scan-receipt.js` (OCR, `maxDuration` 60), `translate.js`, `assign.js`, `_lib/quota.js` (cuota + costo).
- `supabase/migrations/` — esquema, RLS, RPC `dc_*` (SECURITY DEFINER), Realtime, eventos (`dc_track_event`).
- `services/ocr/evals/` — harness de evals (`run.mjs`, `manifest.json` con 159 fixtures / 33 países, `fixtures/<PAIS>/<nombre>.jpg`).
- `docs/` — `DECISIONES.md` (decisiones de arquitectura, leer antes de cambiar algo estructural), `ALCANCE.md`, `PROMPT_MAESTRO.md`, `CUOTA_Y_USO.md`, `CUENTAS_COMPARTIDAS.md`, `auditoria/`.

## Arquitectura clave
- Anfitrión entra con Google; invitados con sesión anónima de Supabase. Permisos aplicados por RLS, no por el cliente.
- Traducción de nombres: llamada aparte a Haiku (`api/translate.js`).
- Cuota: `SCAN_QUOTA_PER_MONTH` y `SCAN_GLOBAL_DAILY_LIMIT`; si Supabase falla, **falla abierta** (deja pasar).
- Reconciliación en la app (`recon()`): suma de ítems vs total impreso; detecta propina sugerida incluida (`viaTip`), servicio incluido (`servicePct` solo en tasas usuales 5/10/12/12.5/15/18/20), y ofrece "apply-service" que agrega la diferencia exacta como ítem "Servicio".

## OCR (`api/scan-receipt.js`)
Variables de entorno (Vercel): `OCR_MODEL` (hoy `claude-haiku-5-5`), `OCR_CACHE`, `OCR_PROMPT_LAYOUT`, `OCR_CASCADE_MODEL` (modelo barato primero; el fuerte relee solo si la suma ≠ total impreso y se adopta solo si queda más cerca), `OCR_EFFORT`, `OCR_THINKING`, `OCR_RETRY*` (apagado: no ayudó, ver DECISIONES), `EVAL_NOHINT`.
- Haiku 5.5: sin `temperature`; `thinking:{type:'disabled'}` salvo `OCR_THINKING=adaptive`. Precios USD/MTok: Haiku 5.5 0.10/0.50; Sonnet 5.5 2/10; Opus 5.5 4/20.
- Reglas de prompt con número (R6b, R9, R19 recorte → total null, R22 `cargo` → Servicio/Impuesto/Propina, R23 columnas desalineadas). Antes de añadir una regla, preguntar si generaliza a todo el mundo o solo arregla una boleta; preferir lógica determinista en `core/` o en `recon()`.
- Clase de fallo conocida: columna de precios desfasada por papel inclinado/curvo o líneas modificadoras; los errores pueden cancelarse y la suma "cuadra" con ítems mal. Mitigación: R23 y cascada.

## Evals
- Harness: `services/ocr/evals/run.mjs`; workflow `evals.yml` (inputs model, pipeline, country, extra_env). Requiere el secreto `ANTHROPIC_API_KEY` de GitHub con saldo.
- El emparejamiento de nombres usa solo `a-z0-9`: los nombres no latinos ahora coinciden (letras Unicode; árabe sin vocales ni variantes de alef/ta marbuta); hay 7 fixtures de Siria y Arabia Saudita, con los nombres transcritos a mano (pueden tener errores: mirar sobre todo si la suma cuadra).
- Fixtures se guardan como `.jpg` aunque sean PNG. Flag `total_visible:false` para boletas recortadas. Al añadir al `manifest.json`, agregar el texto a mano (no reformatear el archivo entero).

## Tests (sin costo)
Ejecutar con `export PWLIB=$(npm root -g)/playwright AXELIB=<ruta a axe-core>`; usar el Playwright global y Chromium preinstalado (no correr `playwright install`).
`node tests/check-reconcile.mjs` (44) · `check-ocr-costs.mjs` (33) · `check-quota.mjs` (20) · `check-retry.mjs` (5) · `check-split-core.mjs` (33) · `check-assign.mjs` (17) · `e2e-v2.mjs` (71, claro y oscuro) · `e2e-shared.mjs` (49) · `e2e-pwa.mjs` (6) · `e2e-boot.mjs` · `e2e-voz.mjs` (11) · `a11y-v2.mjs` (18, axe-core). Todo debe quedar verde antes de publicar.

## Convenciones
- Escribir código que se lea como el de al lado: mismo estilo de comentarios y nombres; comentarios en español.
- Cambios de cálculo de dinero: añadir caso en `check-split-core`/`check-reconcile`. Cambios de pantalla: caso en `e2e-v2` y revisar `a11y-v2`.
- Decisiones estructurales nuevas se anotan en `docs/DECISIONES.md`.
