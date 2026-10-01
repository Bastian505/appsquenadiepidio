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

16 de los 36 países de `COUNTRY_RULES`: CL, DE, ES, MX, AR, US, NL, CH, CO,
IL, JP, KR, GB, CA, IT, TR. Países `complexity:'complex'` cubiertos: DE, ES,
CO, IL (de los 7 marcados así en el código). Faltan: PE, BR, FR, PT, CN, IN,
TH, SG, AU, AE, SA, GR, PL, CZ, HU, SE, NO, DK, UY, PY — si alguien saca
fotos de boletas de esos países, agregarlas acá es el próximo paso obvio.

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
