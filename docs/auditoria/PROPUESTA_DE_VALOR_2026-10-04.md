# Propuesta de valor única — "La cuenta que se cobra sola" (4 de octubre de 2026)

Basada en `COMPETENCIA_2026-10-04.md` y en lo que dice el público (reseñas, encuestas, notas de prensa). **Límite:** no encontré hilos de foros ni reseñas completas (las tiendas están bloqueadas desde este entorno); la voz del público viene de resúmenes de reseñas, de encuestas citadas en prensa (una de ellas de Zelle, que es parte interesada) y de blogs. Casi todo es de EE. UU.; para Latinoamérica la evidencia es mucho más delgada. Marcas: ✅ varias fuentes · 🔎 una sola o parte interesada · 💭 mi juicio.

## 1. Qué ofrece el mercado y qué dice el público

| Lo que ofrece el mercado | Lo que se queja o falta (voz del público) | Evidencia |
|---|---|---|
| Foto de la boleta → ítems → "quién debe cuánto" | El problema real viene **después**: el que pagó no recupera el dinero. Entre la generación Z que adelantó gastos de grupo, **76 % no fue reembolsada del todo, 47 % dice haberse endeudado** y para 42 % "uno adelanta y luego cobra" es la forma habitual | 🔎 informe de Zelle citado en prensa (parte interesada) |
| Fricción de pagos con Venmo/Cash App/PayPal | Solo sirven en EE. UU.; en la región cada país paga distinto (Pix, alias, CLABE, Yape, Bizum) | ✅ fichas de apps; 💭 |
| Gratis con topes o anuncios | Splitwise y su límite diario de gastos: la queja más repetida | ✅ |
| Cuenta obligatoria | Tab pide cuenta; una reseña reciente se queja de que una actualización borra los datos si no das tu correo | 🔎 |
| Foto "en el momento" | La queja principal de Tab: **no se puede subir una foto de la galería** | 🔎 |
| Reseñas de Tab | 66,7 % negativas de 1.093 reseñas (análisis automático) | 🔎 |
| Reparto proporcional de impuesto y propina | Lo hacen todas; algunas apps hispanas destacan poder elegir si la propina va **antes o después del impuesto** y repartirla según lo consumido | ✅ |
| Viajes | Mal manejo de varias monedas y de varios que pagan | 🔎 |
| Consejo de la propia Mercado Pago | "Cobrar en el momento, por transferencia, con la solicitud de cobro, y no después de palabra" | ✅ |

**Lectura (💭):** el hueco está en el **cobro**, no en leer la boleta. Todos resuelven "cuánto debe cada uno"; casi nadie resuelve "que me paguen, en mi país, sin pelear".

## 2. La propuesta

> **"De la foto al último pago: la cuenta que se cobra sola — en cualquier país, sin registrarte."**

Se apoya en tres cosas que ya existen en la app y en otras que faltan:

| Pilar | Qué es | Estado |
|---|---|---|
| **Verdad** | La suma de los ítems se verifica contra el total impreso; reglas por país (IVA incluido, servicio, "cubierto", propina sugerida) | ✅ hecho (48 países, ~89 % cuadra) |
| **Cobro por país** | Datos de transferencia con plantilla local (alias, CLABE, RUT/banco, Pix, Yape, Bizum) y botón "copiar monto + datos" | 🟡 texto libre guardado en el teléfono; faltan plantillas |
| **Seguimiento** | Quién pagó y quién no, con **recordatorio personalizado por WhatsApp** en un toque y una lista de **"mis cobros pendientes"** | 🟡 "Ya pagué" y ✓ en vivo hechos; falta recordar y la lista |
| **Cero fricción** | Un link, sin cuenta, sin límites, foto de la galería, funciona en cualquier teléfono | ✅ hecho |

## 3. Por qué sería distinta (y dónde no)

- **Contra apps de EE. UU.:** su cobro es Venmo/Cash App; el tuyo es "como se paga aquí".
- **Contra Splitwise/Tricount:** ellos son libros de saldos de largo plazo; tú resuelves **la noche de la cena y su cobro**, sin cuenta.
- **Contra Apple (iOS 27):** su cobro es Apple Cash, que hasta enero de 2026 solo funcionaba entre personas en EE. UU. (🔎); no sirve a quien no tiene iPhone reciente.
- **Contra divídelo/Splitea:** no sé aún qué cobro ofrecen; hay que probarlos (ver plan de prueba). **Es la mayor incógnita.**
- **Donde no gana nadie todavía:** retención. Hoy cada cena es de un solo uso; la lista de cobros pendientes crea una razón de volver (💭).

## 4. Qué construir (en orden)

| # | Qué | Por qué | Esfuerzo | Costo de IA |
|---|---|---|---|---|
| 1 | **"Recordar por WhatsApp"**: botón por persona que no ha pagado, con mensaje listo ("Hola Tiano, la cena fue $825, mi alias es …") | Ataca directamente "no me pagan"; sin API, solo un link `wa.me` | S | 0 |
| 2 | **"Mis cobros pendientes"** en la pantalla de inicio: cuentas anteriores con deudas sin pagar y botón de recordar | Da razón de volver; el que adelanta es el que más lo necesita | M | 0 |
| 3 | **Plantillas de datos de pago por país** (CL, AR, MX, CO, PE, BR, ES) y "copiar monto + datos" | Cobrar en la forma local; es la diferencia frente a Venmo | S–M | 0 |
| 4 | **Insignia "Verificado con el total impreso"** y qué hacer cuando no cuadra | Confianza; se apoya en lo ya medido | S | 0 |
| 5 | Voz (ya existe como prueba) | Rapidez en la mesa | — | ≈0,07 ¢ por frase (est.) |
| 6 | **Pix con monto** (código "copia e cola") para Brasil | Cobro con un toque en el mercado más grande de la región; requiere interfaz en portugués | M | 0 |
| 7 | Saldos entre cenas de un mismo grupo ("los de los viernes") | Retención más fuerte | L | 0 |

## 5. Cómo saber si funciona (2–3 semanas, 5–10 cenas reales)

- **Métrica principal:** % de cuentas en que **todos** pagaron dentro de 24 horas, contra lo que hacían antes (preguntar a los participantes).
- **Secundarias:** recordatorios enviados, cuentas abiertas desde "cobros pendientes", invitados que marcan, tiempo de la foto al último pago.
- **Criterio de salida:** si el cobro no mejora frente a hacerlo por WhatsApp a mano, la propuesta no es tan fuerte como parece; hay que volver a mirar la competencia.

## 6. Riesgos

- La evidencia de la tasa de reembolso es de EE. UU. y de una empresa de pagos; **hay que medirla aquí**.
- Cobrar mejor depende de que el pagador use la app; si el que adelanta no la abre, nada pasa. Por eso el recordatorio debe ser casi gratis de usar.
- Los datos de pago son sensibles: se guardan solo en el teléfono del anfitrión y en la cuenta (hoy sin borrado automático; ver S-4 de la auditoría).
