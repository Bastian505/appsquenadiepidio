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
| 2026-10-02 | El invitado ve una pantalla propia ("Marca lo tuyo"), no la del anfitrión | Solo decide lo suyo; evita que toque los ítems o las marcas de otros |
| 2026-10-02 | Al recargar, la app reconecta con `DC_SYNC.resume()` usando el borrador guardado | Sin eso el anfitrión perdía la conexión en vivo tras recargar (lo detectó la prueba de dos teléfonos) |

## 2026-10-03 · Segunda lectura cuando la suma no cuadra: implementada, APAGADA

**Problema (boleta real, Grecia, foto inclinada):** la columna de importes quedó corrida de fila (Varvagiannis 7,00 en vez de 6,00; Tono 2,00 en vez de 7,00) y se omitió una fila con nombre repetido: suma 100,84 vs 105,84 impreso. La app avisó "faltan €5,00", no engañó, pero la lectura estaba mal.

**Intentos medidos (fixture `GR/aimani-columnas-desfasadas`, Sonnet 4.6, 20 ítems):**
| Cambio | Ítems correctos |
|---|---|
| Línea base (sin cambios) | 7/20, 7/20 |
| Regla R22 (contar filas, no fundir repetidas, sumar antes de responder) | 7/20, 7/20 y una respuesta inválida (`parse_error`) → **revertida** |
| Segunda lectura con aviso de cuánto falta (mismo modelo) | 7/20 (se activó en 1 de 4 corridas; en las otras la suma inicial ya caía cerca del total) |
| Segunda lectura con Opus 5.5 | no se llegó a activar en las corridas (1 de 3 corridas hizo el intento; sin mejora medible) |

**Decisión:** el código de la segunda lectura queda (`OCR_RETRY=1` la enciende, `OCR_RETRY_MODEL` elige el modelo, probada sin red en `tests/check-retry.mjs`) pero **apagado por defecto**: cuesta una llamada extra y ~20 s en las boletas que no cuadran sin evidencia de mejora. Reactivar solo con evidencia en una corrida completa con `pipeline=true`.

**Qué queda por probar:** un modelo más potente para toda la lectura de fotos difíciles, o pedir al usuario una foto más recta cuando la suma no cuadra (ya se muestra el aviso en rojo y los ítems dudosos).

Las evals ahora pueden pasar cada boleta por el mismo flujo de la app (`--pipeline`), con lo que miden reconciliación y segunda lectura, no solo la lectura cruda.

## 2026-10-22 · Reconciliación: cargo ya incluido y signo cambiado (aritmética exacta, cualquier país)

**Problema (2 de las 32 boletas nuevas no cuadraban, Haiku 5.5 + cascada Sonnet 5.5):**
- `PE/isolina-barranco`: los platos suman 370 = total, pero el lector agregó "Servicio 36,72" del desglose impreso (ya incluido en los precios). Sobran 36,72.
- `VN/bar-hcm-holiday-surcharge`: los montos de los cargos están corridos una fila; el servicio 1.864.000 quedó como "Giảm giá Discount −1.864.000". Faltan 3.728.000 = 2 × 1.864.000.

**Decisión:** dos reglas nuevas en `reconcile()` (`api/scan-receipt.js`), sin tocar el prompt ni gastar IA, solo cuando la diferencia calza **al peso** (tolerancia 0,15 % del total):
1. **Cargo ya incluido:** si la suma supera el total justo en lo que suman 1 a 3 cargos leídos (servicio, IGV, VAT, propina…), se quitan esos cargos. Nunca quita platos.
2. **Signo cambiado:** si cambiar el signo de una línea deja la suma exacta, se cambia: un negativo pasa a cargo (renombrado "Servicio" si decía descuento) o un descuento/redondeo positivo pasa a restar. Un plato positivo nunca se vuelve negativo.

Como las otras correcciones automáticas, marcan `auto_fixed` y dejan `user_message`; ahora la corrección puede devolver la lista completa (`auto_fix_items`), no solo un ítem agregado. Si la reconciliación corrige, la cascada no relee (ahorra la llamada a Sonnet).

**Evidencia (sin costo):** repetida la reconciliación sobre 48 respuestas reales guardadas de las evals (32 nuevas + 16 anteriores): cuadraban 46 → ahora 48, y ninguna otra cambia. Casos en `tests/check-reconcile.mjs` (incluye los que NO deben corregirse).

**Aviso en la app:** la v2 muestra `user_message` de toda corrección automática como "Corregí la lectura: …" en la revisión, con un botón "Entendido" que lo cierra (antes no se mostraba ninguna).

## 2026-10-22 — R24 (número de línea ≠ cantidad) probada y NO fusionada

**Hipótesis:** en el cupom fiscal de Brasil el lector leía el número de ítem como cantidad (`Galinha Chic 18x2` en vez de `36x1`, boleta `BR/pimenta-verde-sp`). Se escribió una regla de prompt (R24) en la rama `fix/brasil-numero-de-item`.

**Medición** (Haiku 5.5 solo, 8 boletas de Brasil, `EVAL_NOHINT=1`, 0,11¢ por boleta, una corrida cada una):
| | La suma cuadra | Ítems exactos |
|---|---|---|
| Sin R24 (main) | 7/8 | 65/69 (94 %) |
| Con R24 | 6/8 | 62/69 (90 %) |
Regresión con R24 (PE, VN, CL, GB, TR; 14 boletas con cascada): 14/14 cuadran, 89 % ítems (sin R24: 88 %).

**Conclusión:** sin mejora medible. La diferencia (3 ítems) cae dentro del ruido entre corridas de Haiku (se vio lo mismo con Table 9: la misma boleta lee distinto en dos intentos), y el error original de Pimenta Verde no se reproduce de forma estable. No se agrega una regla de prompt que no demuestra su efecto (cada regla puede romper otras boletas). Para decidir con datos haría falta repetir cada corrida 3–5 veces (≈ 5¢) o juntar más boletas con ese formato.

**Fallo de Brasil que sí se repite (con y sin R24):** `BR/torres-amores-gavea-2024`, sobran 62,76 de 170,24: un plato con 100 % de descuento aparece sumado y la línea de descuento no se lee. Es la clase "descuento no leído"; candidato a regla determinista en `reconcile()` solo si calza al peso con un único ítem (hoy lo mitiga el aviso "Si este ítem no va, la suma cuadra" de la pantalla de revisión).

## 2026-10-23 — Cargo negativo + IVA ya incluido, y nombres de servicio/impuesto en más idiomas

**Problema (medición de 24 boletas de países nuevos, Haiku 5.5 + cascada):** en `AE/guest-bill-dubai-2026` el servicio 4 % salió como `Servicio −10,08` y se sumó encima el `VAT 5 % 12,48` que la boleta solo desglosa (ya incluido): suma 254,40 vs 262,08 impreso. La diferencia (2,9 %) caía bajo la tolerancia del 3 % y pasaba **en silencio**, con el servicio mal y el reparto distinto.

**Decisión:** nueva regla exacta en `reconcile()` (antes de la tolerancia del 3 %): si hay UNA línea de cargo con importe negativo (servicio, propina, recargo…), se invierte su signo y se quitan hasta 2 cargos ya incluidos **solo si la suma da justo el total** (tolerancia 0,15 %). Un servicio negativo que ya cuadra, o que no calza al invertirlo, no se toca. Marca `auto_fixed` y deja `user_message`.

**Nombres locales:** `EXTRA_RE` (core/split.js) reconoce ahora `Apkalpošana` (LV), `Szervizdíj` (HU), `teenindustasu` (EE), `bacșiș/BACSIS` (RO), `obsluha` (CZ/SK), `drikkepenge` (DK) y las palabras de IVA `TVA, MwSt, USt, BTW, KDV, moms, mva, DPH, ÁFA, ALV, PDV`. Antes llegaban como plato y cambiaban el reparto (casos `LV/edam-riga-2025` y `RO/nota-informativa-bucuresti-2025`).

**Evidencia (sin costo):** `check-reconcile` 60 (+3: Dubái, y dos controles negativos), `check-split-core` 55 (+11 nombres). No se tocó el prompt.

**No cambia (aclaración):** `HU/trattoria-toscana-2023` (redondeo de −2 Ft, 0,0 %) NO es un fallo de la app: la tolerancia del 3 % ya lo absorbe en silencio; el "no cuadra" lo marca solo el evaluador, que exige igualdad exacta. Tampoco se resuelve `RO/la-latina` (foto lejana con país y moneda mal leídos): requiere confirmar país/moneda con el usuario, pendiente de diseño (Opus 5.5).

