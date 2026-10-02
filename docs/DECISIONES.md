# Registro de decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-02 | La key de Anthropic vive solo en el servidor; se elimina "trae tu propia key" del cliente | Riesgo de fuga, y los usuarios nuevos quedaban en una ruta de lectura degradada (sin confirmación de país ni reconciliación completa) |
| 2026-10-02 | Saldo agotado / cuota / sobrecarga → `503 SCAN_UNAVAILABLE` con mensaje para ingresar a mano; log `SCAN_UNAVAILABLE` para alertas | La app dejaba de leer sin aviso cuando se acabó el saldo |
| 2026-10-02 | Se borra `api/country-rules.js` | Código muerto y desactualizado (3ª fuente de reglas) |
| 2026-10-02 | Opus se usa para diseño/arquitectura; el modelo de lectura se elige con evals por costo y precisión | Opus es caro para lectura masiva |
| 2026-10-02 | `core/currencies.js` es la única fuente de monedas (símbolo, decimales, sufijo, selector) para servidor y navegador | Había 6 listas distintas de "monedas sin decimales" que no coincidían; causaron 5 errores de moneda y un reparto con centavos en HUF/ISK |
| 2026-10-02 | `core/country-rules.js` es la única fuente de reglas por país (servidor + evals) | Las reglas eran 560 líneas dentro del servidor y el harness las extraía con un parser frágil; ahora ambos importan el mismo archivo |
