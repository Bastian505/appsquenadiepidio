# Registro de decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-02 | La key de Anthropic vive solo en el servidor; se elimina "trae tu propia key" del cliente | Riesgo de fuga, y los usuarios nuevos quedaban en una ruta de lectura degradada (sin confirmación de país ni reconciliación completa) |
| 2026-10-02 | Saldo agotado / cuota / sobrecarga → `503 SCAN_UNAVAILABLE` con mensaje para ingresar a mano; log `SCAN_UNAVAILABLE` para alertas | La app dejaba de leer sin aviso cuando se acabó el saldo |
| 2026-10-02 | Se borra `api/country-rules.js` | Código muerto y desactualizado (3ª fuente de reglas) |
| 2026-10-02 | Opus se usa para diseño/arquitectura; el modelo de lectura se elige con evals por costo y precisión | Opus es caro para lectura masiva |
| 2026-10-02 | `core/currencies.js` es la única fuente de monedas (símbolo, decimales, sufijo, selector) para servidor y navegador | Había 6 listas distintas de "monedas sin decimales" que no coincidían; causaron 5 errores de moneda y un reparto con centavos en HUF/ISK |
| 2026-10-02 | `core/country-rules.js` es la única fuente de reglas por país (servidor + evals) | Las reglas eran 560 líneas dentro del servidor y el harness las extraía con un parser frágil; ahora ambos importan el mismo archivo |
| 2026-10-02 | Un ítem de varias unidades marcado con "Todos" sin repartir unidades se divide en partes iguales (línea completa) | Antes contaba como 0 y desaparecía de las cuentas (encontrado por la prueba e2e) |
| 2026-10-02 | App nueva en `/v2` en paralelo a la actual; HTML + JS sin framework ni build por ahora | No cambia el deploy de Vercel ni arriesga la app actual; React/Vite se decide cuando /v2 reemplace a v1 |
| 2026-10-02 | `core/split.js`: reparto con "mayor resto" para que la suma de las cuentas sea exactamente el total | Antes podía quedar 1 unidad de diferencia por redondeo |
| 2026-10-02 | Cuentas: anfitrión con Google; invitados sin registrarse (anónimos) | Mantener la ventaja de cero fricción para invitados; la cuenta controla costo, historial y cobro |
| 2026-10-02 | Cuentas compartidas: anfitrión dueño, invitados anónimos por token, permisos impuestos por RLS en Postgres (no por la app) | Hoy cualquiera con un id de sesión puede leer y editar sesiones ajenas |
| 2026-10-02 | `dc_join_bill` devuelve vacío (no excepción) con token inválido | Al lanzar excepción, Postgres deshacía también el registro del intento y el bloqueo por fuerza bruta nunca se activaba (lo detectó la prueba) |
| 2026-10-02 | Traducción de nombres en una llamada aparte (`/api/translate`, Haiku, solo texto) después de leer la boleta | Pedírsela al modelo de visión alarga la respuesta justo donde ya era lenta; así la boleta aparece al instante y la traducción llega sola |
| 2026-10-02 | Con ítems sin asignar el sello dice "Cuentas + sin asignar = total" | "Las cuentas suman el total" junto a "Falta asignar" se contradecía |
