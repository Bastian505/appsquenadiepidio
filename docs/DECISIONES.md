# Registro de decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-10-02 | La key de Anthropic vive solo en el servidor; se elimina "trae tu propia key" del cliente | Riesgo de fuga, y los usuarios nuevos quedaban en una ruta de lectura degradada (sin confirmación de país ni reconciliación completa) |
| 2026-10-02 | Saldo agotado / cuota / sobrecarga → `503 SCAN_UNAVAILABLE` con mensaje para ingresar a mano; log `SCAN_UNAVAILABLE` para alertas | La app dejaba de leer sin aviso cuando se acabó el saldo |
| 2026-10-02 | Se borra `api/country-rules.js` | Código muerto y desactualizado (3ª fuente de reglas) |
| 2026-10-02 | Opus se usa para diseño/arquitectura; el modelo de lectura se elige con evals por costo y precisión | Opus es caro para lectura masiva |
