# Prueba con 5 grupos reales

Objetivo: saber si DiviCuenta **sirve de verdad** en una salida real, no en pruebas de laboratorio. Es la puerta de la Fase 2 de `docs/ALCANCE.md`.

## La pregunta que responde
¿Cuántos grupos llegan a **"todos pagaron" sin corregir nada a mano**, y cuántos **lo vuelven a usar** sin que se lo pidamos?

## A quién invitar (5 grupos, mezclados a propósito)
- 2 grupos de amigos o familia (los más fáciles, pero los más amables: no confiar solo en ellos).
- 2 grupos con gente que **no te conoce tanto** (compañeros de trabajo, un club, otro curso).
- 1 grupo con **boleta de otro país** o de un lugar con servicio e impuesto aparte, si tienes un viaje o conoces a alguien que viaja.
- Ideal: grupos de **4 a 8 personas** que se reparten la cuenta de verdad (cuando alguien no coincide en qué pidió, la app se prueba).

## Mensaje para mandar por WhatsApp (copiar y pegar)
> Hola 👋 Estoy probando una app para dividir la cuenta del restaurante y necesito tu ayuda. La usan en 2 minutos: alguien saca una foto a la boleta, la app lee todo y cada uno marca lo que consumió. Me ayudas mucho si la usan la próxima vez que salgan a comer y me cuentas cómo les fue (lo bueno y lo malo, sin filtro). Link: **[link de la app]**
> Nota: la foto de la boleta se envía a una IA para leerla. No pidas cuentas con datos personales visibles (si trae nombre o RUT, tapa esa parte).

## Cómo se hace (reglas de oro)
1. **No expliques la app antes.** Si alguien se confunde, eso es un dato; anótalo.
2. **No ayudes** mientras la usan, salvo que se trabe del todo. Mira dónde dudan.
3. Una persona (la que paga) saca la foto; los demás entran por el link o QR.
4. Al final, **3 preguntas** (por WhatsApp, 1 minuto):
   - ¿Qué parte te confundió o te molestó?
   - ¿La cuenta final coincidió con lo que ustedes calcularon?
   - ¿La usarías de nuevo? ¿Por qué sí / por qué no?

## Qué registrar por cada grupo (una fila)
| Dato | Ejemplo |
|---|---|
| Grupo / fecha | Amigos del trabajo, 25-oct |
| País y tipo de local | Chile, restaurante con propina sugerida |
| Personas | 6 |
| ¿La boleta se leyó bien a la primera? (sí / no, qué falló) | no, faltó el servicio |
| ¿Hubo que corregir a mano? (sí / no, qué) | sí, 1 precio |
| ¿Llegaron a "todos pagaron"? | sí |
| Tiempo desde la foto hasta el reparto final | 6 min |
| ¿Algún invitado se unió por link/QR? ¿le funcionó? | sí, 4 de 5 |
| Qué dijeron de la app (frases textuales) | "la propina no la entendí" |
| ¿La volverían a usar? | sí / no / tal vez |
| Foto de la boleta (solo si autorizan; si no, el tipo de problema) | — |

## Lo que la app ya mide sola (eventos, sin datos personales)
`scan_ok`, `scan_fail`, `retake`, `mismatch_shown`, `mismatch_fix`, `review_done`, `shared`, `split_viewed`, `paid`, `all_paid`. Sirven para contrastar lo que cuenten con lo que pasó en realidad (por ejemplo, cuántas veces se mostró "no cuadra").

## Cómo decidir al final
- **Pasa a la Fase 3** si: ≥ 4 de 5 grupos llegaron a "todos pagaron", ≥ 3 de 5 sin corrección manual, y ≥ 3 de 5 dicen que la volverían a usar.
- **Se arregla y se repite** si: la lectura falló en 2 o más grupos por la misma causa (se vuelve fixture, regla o prompt, y se mide otra vez).
- **Se replantea el producto** si: casi nadie la usa una segunda vez aunque funcione bien. Entonces el problema no es la lectura, es la utilidad.

## Antes de mostrarla a desconocidos (muy importante)
- **Política de privacidad:** el PR #94 sigue en borrador (faltan titular/correo y revisión legal). Con amigos y familia, avisando lo del mensaje de arriba, está bien. **Con desconocidos, no, hasta tenerla publicada.**
- No pedir ni guardar fotos de boletas sin permiso explícito; si se guardan, solo como prueba interna.
