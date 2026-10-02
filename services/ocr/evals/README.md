# Evals del motor de OCR

Harness para medir qué tan bien lee el prompt de `api/scan-receipt.js` boletas
reales de distintos países, sin tener que confiar a ojo.

## Qué hay acá

- `fixtures/<PAIS>/<id>.jpg` — 38 boletas reales (fotos sacadas por el equipo
  de DiviCuenta, no generadas ni bajadas de internet).
- `fixtures/manifest.json` — el "ground truth": lo que el modelo *debería*
  extraer de cada boleta (ítems, precios, cantidades, país, moneda, total),
  transcrito a mano leyendo cada imagen. Cada fixture trae una nota
  explicando qué caso puntual de las reglas R1-R15 del prompt está probando
  (Pfand alemán, coperto italiano, service charge obligatorio en UK, el
  ejemplo exacto de modificadores que está citado en el propio prompt, etc).
- `run.mjs` — corre cada fixture contra la API real de Claude usando el
  mismo prompt que corre en producción (lo importa directo de
  `api/scan-receipt.js`, no lo duplica — si el prompt cambia, el eval prueba
  la versión nueva automáticamente) y compara contra el manifest.

## Cobertura actual

60 fixtures, 18 de los 38 países de `COUNTRY_RULES` (37 + Sudáfrica,
agregada a partir de este mismo lote — ver commit que la agrega):
CL, DE, ES, MX, AR, US, NL, CH, CO, IL, JP, KR, GB, CA, IT, TR, AL, ZA.
Países `complexity:'complex'` cubiertos: DE, ES, CO, IL, AL (de los 8
marcados así en el código). Faltan: PE, BR, FR, PT, CN, IN, TH, SG, AU, AE,
SA, GR, PL, CZ, HU, SE, NO, DK, UY, PY — si alguien saca fotos de boletas
de esos países, agregarlas acá es el próximo paso obvio.

Nota sobre Sudáfrica: las dos boletas reales de este país funcionaron
correctamente en producción ANTES de que `ZA` existiera en `COUNTRY_RULES`
— las reglas universales (R1-R15) ya le alcanzaban al modelo sin un perfil
de país dedicado. Se agregó igual, ya con datos reales en mano, para
currency/VAT y para documentar un caso nuevo encontrado ahí: boletas con
una propina y un total corregidos A MANO sobre el total impreso por la
máquina (`ZA/handwritten-gratuity`) — un patrón general, no específico de
Sudáfrica, que vale la pena tener presente en cualquier país.

Algunos fixtures traen `confianza_transcripcion` mencionada en sus `notas`
cuando la foto original no permite leer todos los ítems con certeza total
(cortes de encuadre, mala luz). En esos casos el total/país/moneda sigue
siendo confiable, pero el detalle de ítems es mejor esfuerzo — no penalizar
de más un resultado del modelo que difiera ahí sin antes revisar la foto
original.

Nota sobre reconciliación: en varios países (US, CA, CO) el total impreso
en la boleta incluye un impuesto que las reglas del prompt dicen ignorar
como ítem (sales tax, GST/HST, TPS/TVQ, IPC) — que `sum(items) != total`
en esos casos es el comportamiento ESPERADO, no un error de transcripción.
Es exactamente lo que la capa de reconciliación de `scan-receipt.js` ya
maneja en producción.

## Cómo correrlo

Este harness **no se puede correr desde un sandbox sin salida a internet**
(se armó en uno así — no se validó contra la API real, solo se validó que
la extracción del prompt desde `scan-receipt.js` funciona). Correr donde
haya `ANTHROPIC_API_KEY` configurada:

```bash
ANTHROPIC_API_KEY=sk-ant-... node services/ocr/evals/run.mjs

# Solo un país:
ANTHROPIC_API_KEY=sk-ant-... node services/ocr/evals/run.mjs --country=DE

# Comparar con otro modelo (esto es lo que importa para la decisión de costo):
ANTHROPIC_API_KEY=sk-ant-... node services/ocr/evals/run.mjs --model=claude-haiku-4-6
```

Imprime, por boleta: cuántos ítems calzaron con el ground truth, si el total
y el país/moneda detectados son correctos. Al final, un resumen por país.
Guarda el detalle completo en `results.<modelo>.<timestamp>.json`.

## Para qué sirve esto en concreto

`selectModel()` en `api/scan-receipt.js` hoy siempre usa Sonnet, con un
comentario explícito: *"cuando tengas datos, mover países simples a Haiku"*.
Ese es el uso real de este harness — correrlo con `--model=claude-sonnet-4-6`
y de nuevo con `--model=claude-haiku-4-6` sobre los mismos fixtures, país por
país, y recién ahí decidir con números (no a ciegas) cuáles de los países
`complexity:'simple'` pueden bajar de modelo sin perder precisión. Esa es la
palanca de costo más grande que tiene la app hoy.
