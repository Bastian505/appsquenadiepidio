# Propuesta para bajar el costo del lector de boletas (4 de octubre de 2026)

**Qué se midió:** las 97 boletas reales del repositorio pasadas por el mismo flujo que usa la app (`pipeline`), una corrida por configuración, el 4 de octubre de 2026. Las evaluaciones ahora cuentan los tokens reales de cada llamada y estiman el costo por boleta con los precios de lista (Sonnet 5.5: US$2 entrada / US$10 salida por millón de tokens; Sonnet 4.6: US$3 / US$15; Haiku 4.5: US$1 / US$5; escribir la caché cuesta 1,25 veces la entrada y leerla 0,1 veces). Los precios de Sonnet 4.6 y Haiku 4.5 son los que conozco; **confirmarlos en la consola de Anthropic**.

## 1. Corrección importante

Antes dije que cada escaneo cuesta "unos 1,3 centavos". Eso suponía que la caché de instrucciones se aprovecha siempre. **Con poco tráfico no es así:** la caché se guarda por país (el país va al inicio de las instrucciones), caduca a los 5 minutos y escribirla cuesta más que no usarla. **El costo real de hoy con tráfico bajo es ~2,3–2,6 centavos por boleta**, no 1,3.

## 2. Resultados (97 boletas)

| Configuración | La suma cuadra | Ítems correctos | Costo por boleta, tráfico bajo (caché fría) | Sin caché | Con caché muy aprovechada* |
|---|---|---|---|---|---|
| **Hoy: Sonnet 4.6** | 88/97 (91 %) | 611/679 (90 %) | **2,61 ¢** | 2,27 ¢ | 1,58 ¢ |
| Sonnet 4.6 + reglas comunes a todos los países | 87/97 (90 %) | 601/680 (88 %) | 2,62 ¢ | 2,30 ¢ | 1,16 ¢ |
| **Sonnet 5.5** (pensamiento mínimo) | **90/97 (93 %)** | **625/680 (92 %)** | **2,28 ¢** | **1,97 ¢** | 1,26 ¢ |
| Sonnet 5.5, esfuerzo bajo | 90/97 (93 %) | 626/680 (92 %) | 2,28 ¢ | 1,98 ¢ | 0,95 ¢ |
| **Haiku 4.5 y, si no cuadra, Sonnet 5.5** | 90/97 (93 %) | 603/678 (89 %) | 1,65 ¢ | **1,43 ¢** | 0,88 ¢ |

\* Esta columna depende de cuántas boletas llegan seguidas en la corrida; no es lo que verás con poco tráfico.

**Lecturas honestas:**
- Una corrida por configuración tiene ±1–3 boletas de ruido. Sonnet 5.5 salió mejor en las dos corridas que hice (93 %, 92 % de ítems) que Sonnet 4.6 en todas las que llevo (86–88/97; 604–611 ítems): la mejora es pequeña pero consistente, no un salto.
- Las boletas de las evaluaciones están a su resolución original; la app las reduce a 1.600 px antes de enviarlas, así que en producción hay menos tokens de imagen.
- Las reglas comunes a todos los países **no mejoran el costo con poco tráfico** (2,62 ¢) y la lectura quedó igual o algo peor (88 % de ítems): dejarlo para cuando haya mucho tráfico.
- La cascada (leer con Haiku y repetir con Sonnet 5.5 solo cuando la suma no cuadra) usó el modelo fuerte en 29 de 97 boletas. **Ahorra costo pero baja los ítems correctos de 92 % a 89 %**: hay boletas en que Haiku "cuadra" con nombres o cantidades equivocadas. Además, esas boletas tardan más (dos lecturas).

## 3. Propuesta por etapas

| Etapa | Qué se hace | Costo por boleta (tráfico bajo) | Ahorro vs. hoy | Riesgo |
|---|---|---|---|---|
| **1. Sin riesgo (esta semana)** | Cambiar a **Sonnet 5.5** y **apagar la caché** | **1,97 ¢** | **−24 %** | Bajo: la lectura mejora un poco y no cambia nada visible |
| **2. Con prueba (próximas semanas)** | Añadir la **cascada Haiku → Sonnet 5.5** | **1,43 ¢** | **−45 %** | Medio: ítems correctos 89 % (igual que hoy), más lenta en ~3 de cada 10 boletas |
| **3. Con mucho tráfico** | Reglas comunes a todos los países + caché encendida | ~1,0–1,3 ¢ | −50 a −60 % | Bajo, pero solo sirve con ≥ ~10 escaneos por hora |

**Qué significa por volumen (cálculo con estos costos, tráfico bajo):**

| Escaneos al mes | Hoy | Etapa 1 | Etapa 2 |
|---|---|---|---|
| 1.000 | ~US$26 | ~US$20 | ~US$14 |
| 10.000 | ~US$261 | ~US$197 | ~US$143 |
| 100.000 | ~US$2.610 | ~US$1.970 | ~US$1.430 |

(Una corrección a lo que dije antes: "unos US$130 por 10.000 escaneos" era optimista.)

## 4. Cómo activarlo (sin tocar código)

En Vercel → Settings → Environment Variables, y luego volver a desplegar:
- **Etapa 1:** `OCR_MODEL=claude-sonnet-5-5` y `OCR_CACHE=0`.
- **Etapa 2:** además `OCR_CASCADE_MODEL=claude-sonnet-5-5` y cambiar `OCR_MODEL=claude-haiku-4-5-20251001`.
- **Volver atrás:** borrar esas variables (vuelve a Sonnet 4.6 con caché).

La respuesta de la app dice qué modelo respondió (`model_used`) y si hubo cascada (`reconciliation.cascada`), para vigilar cuánto se usa.

## 5. Lo que no se probó (ideas con efecto estimado, no medido)

| Idea | Efecto esperado | Por qué no se midió |
|---|---|---|
| Reducir la foto de 1.600 a 1.200 px | Menos tokens de imagen (~15–20 % de la entrada) | Hay que medir si baja la precisión; las evaluaciones usan la resolución original |
| Acortar las instrucciones (6.000 tokens) | Ahorro directo sin caché (~US$0,003 por boleta por cada 1.000 tokens menos) | Cada recorte puede romper un país; se mide con las 97 boletas |
| Avisar "saca otra foto" antes de pagar un escaneo en una foto borrosa o torcida | Menos escaneos desperdiciados y menos reintentos | Requiere detectar la mala foto en el teléfono |
| Cuota gratis por persona (p. ej. 5–20 al mes) | Acota el costo máximo; requiere la autenticación de las funciones (hallazgo S‑1 de la auditoría) | Es producto y seguridad, no ajuste de modelo |
| Modelo propio o de código abierto con visión | Costo fijo en vez de variable | Solo tiene sentido con decenas de miles de escaneos al mes; se compararía con las mismas 97 boletas |
| Segunda lectura con aviso de cuánto falta (`OCR_RETRY`) | No mejoró en pruebas anteriores | Ya medido, ver `docs/DECISIONES.md` |

## 6. Qué significa para competir (💭 opinión)

Con ~1,4–2 centavos por boleta, **ofrecer escaneo gratis con un tope razonable es viable**: 20 escaneos al mes cuestan unos 30–40 centavos de dólar por persona activa. El mercado ya tiene muchas apps gratuitas y con topes de escaneos (por ejemplo, 3 o 5 al mes). Un pase por viaje de US$3–5 deja un margen amplio. Lo que protege el margen no es el modelo sino la cuota por persona (autenticar las funciones, S‑1) y no pagar por escaneos que no sirven.
