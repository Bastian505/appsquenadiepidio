# Sesión B · Laboratorio de diferenciación y sistema de retorno (Fases 3 y 4)

Fecha: 2026-10-22 · Parte de `A_diagnostico_y_mercado.md` (fuentes numeradas igual que allí; las nuevas, en el apéndice).
Etiquetas: **[DATO]** repo · **[FUENTE n]** · **[ESTIMACIÓN]** con rango pesimista/base/optimista · **[OPINIÓN]**.

---

## Resumen de una página

1. Generé **18 conceptos** y los pasé por el filtro "¿por qué un grupo lo usaría **sin que nadie se lo pida** la semana siguiente?". **Pasan muy pocos.** La utilidad no crea hábito, y dividir una cena es ocasional.
2. Hay **dos formas** de ganarle al problema de frecuencia:
   - **(a) Crear ocasiones repetidas** (grupos permanentes, gastos del hogar, almuerzo de oficina): suben la frecuencia, pero compiten de frente con productos gratis (Tricount, Splitwise) y cobran mal (~2 % de conversión típica en freemium [FUENTE 39]).
   - **(b) Dejar de depender de la frecuencia:** cobrar **una vez por ocasión** (un viaje, un evento). El cliente no tiene que volver cada semana; tiene que volver **en el próximo viaje**. Precedentes de pago reales: Settle Up "Group Premium" US$9,99 por 2 semanas, Kittysplit ≈€3 por grupo, Trip Pass de 30 días de Splitwise [FUENTE 1, 12, 13].
3. **El contendor "Grupos con saldos" (E) pierde** frente al **Pase de viaje (A)** en las dos cosas que más pesan para el dueño: cobra más tarde (requiere identidad, avisos, historial) y compite contra productos gratis más grandes. Los números están en la Sesión C.
4. **Dónde sí somos distintos:** en el extranjero, con boletas en otro idioma, otra moneda y otras reglas de propina/servicio/IVA, y con gente que no comparte banco ni billetera. Ahí Apple no llega (solo EE. UU. [FUENTE 9]), las billeteras tampoco (cada una exige su cuenta) y Splitwise cobra por escanear [FUENTE 1].
5. **Sistema de retorno recomendado (para el pase):** el saldo del viaje **abierto** es el disparador diario durante el viaje; el **cierre** ("quedan a mano con 3 transferencias") es la recompensa; la **inversión** es el historial del viaje y los datos para transferir de cada uno; el **contagio** ocurre porque todo el grupo vive el producto y cualquiera puede organizar el próximo viaje.
6. **Prototipo de 2 semanas:** preventa del "Pase de viaje" con enlace de pago manual (Flow) a grupos que viajan pronto, antes de construir nada. **Éxito:** ≥3 pases pagados de ≥20 grupos contactados. **Se mata:** 0 pagos con ≥20 grupos que viajan en los próximos 60 días.

---

## FASE 3 · Laboratorio de diferenciación (18 conceptos)

Formato de cada ficha: **qué es · para quién · por qué es distinto · por qué nadie lo hace · qué se construye (horas, costo) · cómo se prueba en 2 semanas**, y al final el **filtro de hábito** ("¿lo usarían sin que se lo pidan la semana siguiente?").
Horas = horas de trabajo con asistentes de IA, supervisadas por el dueño; todas son **[ESTIMACIÓN]**.

### Las 5 hipótesis pedidas (A–E)

**1. (A) Pase de viaje para grupos hispanohablantes**
- **Qué:** un grupo temporal (30 días) que junta todas las boletas del viaje, en cualquier país y moneda, calcula saldos netos y propone el mínimo de transferencias; pago único por grupo.
- **Para quién:** grupos de 3–8 amigos o familia que viajan (chilenos afuera; argentinos, peruanos y brasileños en Chile).
- **Distinto:** lectura de boletas extranjeras con reglas locales y verificación contra el total impreso; invitados sin registrarse; resumen por WhatsApp; sin banco común.
- **Por qué nadie lo hace así:** los que tienen pase (Settle Up, Kittysplit) no leen ítems; Splitwise lee pero cobra suscripción y pide cuenta a todos; Apple solo en EE. UU. [FUENTE 1, 9, 12, 13].
- **Construir:** grupo temporal que agrupa varias cuentas existentes + saldo neto + conversión a una moneda + cierre: **60–120 h**; costo de IA por pase ≈US$0,30 (25 boletas × 1,2 ¢) [DATO de costo por boleta].
- **Prueba en 2 semanas:** preventa con enlace de Flow a ≥20 grupos que viajan en los próximos 60 días.
- **Filtro de hábito:** **sí, durante el viaje** (hay boletas todos los días y un saldo abierto); fuera del viaje no, y no hace falta porque no es suscripción.

**2. (B) API "lector de boletas verificado" para otras empresas**
- **Qué:** vender `api/scan-receipt.js` como servicio: foto → ítems, impuestos, servicio, propina y **chequeo contra el total impreso**, 43 países medidos.
- **Para quién:** apps de gastos, contabilidad pyme, apps de viaje, desarrolladores de apps de dividir cuentas.
- **Distinto:** verificación aritmética + reglas por país + set de evaluación publicado; costo propio ≈0,6–1,2 ¢ frente a precios de lista de US$0,04–0,08 por recibo (Veryfi, Taggun, Mindee) [FUENTE 14, 15, 16].
- **Por qué nadie lo hace así:** las APIs grandes venden documentos genéricos (facturas, recibos) y no publican exactitud por país para boletas de restaurante [OPINIÓN].
- **Construir:** llaves de API, límites, cobro, documentación, página de estado: **20–40 h**; sin costo fijo extra salvo Vercel Pro (US$20/mes).
- **Prueba:** página con la exactitud por país + 15 mensajes directos a posibles compradores; contar respuestas y pruebas con llave gratis.
- **Filtro:** para el cliente B2B el uso es continuo si integra (alta frecuencia); el riesgo no es el hábito sino que **compre**.

**3. (C) Dividir cuentas con foco en Latinoamérica + WhatsApp**
- **Qué:** el producto actual, posicionado para Latinoamérica, con WhatsApp como canal principal (link, recordatorio, resumen).
- **Para quién:** grupos de amigos en Chile/Argentina/Perú/México.
- **Distinto:** español primero, propina sugerida/IVA incluido, datos para transferir, sin banco común.
- **Por qué nadie:** lo hacen muchos gratis (Mercado Pago "Amigos", Tenpo, clones) [FUENTE 11, 30].
- **Construir:** casi nada (ya existe).
- **Prueba:** la de 5 grupos (`docs/PRUEBA_5_GRUPOS.md`).
- **Filtro:** **no** (una cena no se repite la semana siguiente) [OPINIÓN].

**4. (D) Lado B2B de restaurantes ("dividir y pagar en la mesa")**
- **Qué:** QR en la mesa, cada comensal paga lo suyo.
- **Para quién:** restaurantes y bares.
- **Distinto:** nada que el POS no pueda hacer: el POS ya **tiene** los ítems; leer la boleta no aporta.
- **Por qué nadie (pequeño) lo hace:** exige integración con POS y cobros regulados; Justo ya lo lanzó en Chile [FUENTE 28]; Sunday levantó >US$120 M y salió del 60 % de sus mercados [FUENTE 34].
- **Construir:** cientos de horas + integración + pasarela: **>400 h** y venta en terreno.
- **Prueba:** 10 conversaciones con dueños de restaurantes (sin construir).
- **Filtro:** el comensal no "vuelve" a la app; vuelve al restaurante.

**5. (E) Grupos permanentes con saldos (el contendor del asistente anterior)**
- **Qué:** grupo permanente; cada boleta suma al saldo neto; recordatorios; cuentas recurrentes; mínimo de transferencias.
- **Para quién:** compañeros de piso, parejas, amigos fijos.
- **Distinto:** escaneo de boletas de cualquier país + español + invitados sin registro para la primera cuenta.
- **Por qué nadie (así):** Splitwise y Tricount ya hacen saldos; Tricount gratis y sin límites con 17–24 millones de usuarios [FUENTE 5].
- **Construir:** identidad mínima entre cuentas, grupos, historial, avisos fuera de la app, recurrentes: **150–300 h**.
- **Prueba:** grupo "falso" manual: el dueño lleva el saldo de 3 grupos reales en una planilla compartida por 2 semanas y mide si lo consultan.
- **Filtro:** **sí** para pisos y parejas (deuda abierta), pero allí la boleta de restaurante casi no aparece y el competidor es gratis.

### Otros 13 conceptos

**6. Pase de evento** (cumpleaños, despedida, paseo de curso, matrimonio)
Qué: igual que el pase de viaje, por un día y para grupos grandes · Para: organizadores de eventos de 8–30 personas · Distinto: muchas boletas y pagos adelantados · Nadie: precio por evento poco común en dividir cuentas · Construir: reutiliza el pase (≈+10 h) · Prueba: ofrecerlo a 10 organizadores · Hábito: no; pago único sí.

**7. Gastos recurrentes del hogar** (arriendo, gastos comunes, internet, suscripciones)
Qué: reparto mensual automático · Para: pisos y parejas · Distinto: poco (no usa la lectura) · Nadie: Splitwise lo tiene; administración de edificios tiene sus propias apps [OPINIÓN] · Construir: 60–100 h · Prueba: planilla manual con 3 hogares · Hábito: sí (mensual), pero sin pago probable.

**8. Bot de WhatsApp** (mandas la foto a un número, recibes el link)
Qué: interfaz sin instalar nada · Para: Latinoamérica · Distinto: cero instalación · Nadie: exige verificación de empresa en Meta y un proveedor; Meta cobra por mensaje desde jul-2025 (las respuestas dentro de la ventana de atención son gratis; las plantillas de marketing en Chile ≈US$0,09 según un tercero) [FUENTE 25] · Construir: 40–80 h + trámite · Prueba: "bot mago de Oz": el dueño recibe fotos en su WhatsApp y responde el link a mano por 2 semanas · Hábito: igual que el producto; mejora la entrada, no la frecuencia.

**9. Cobro integrado** (Flow, Khipu, Mercado Pago, Pix, enlaces de pago)
Qué: cada persona paga su parte con un toque · Para: anfitrión que adelantó · Distinto: cierra el ciclo · Nadie: cobrar por mover dinero entre personas exige ser facilitador o iniciador de pagos regulado (Ley Fintec 21.521, registro CMF) [FUENTE 42] · Construir: >150 h + regulatorio · Prueba: poner el link de pago **del propio anfitrión** (ya existe "datos para transferir") y medir clics · Hábito: no.

**10. Marca blanca para billeteras y bancos** (Tenpo, MACH, Mercado Pago)
Qué: licenciar "dividir por ítems con la boleta" dentro de su app · Para: billeteras · Distinto: ellas reparten por total, no por ítem [FUENTE 11, 30] · Nadie: ciclo de venta largo y exigencias de seguridad · Construir: SDK + seguridad: 100–200 h · Prueba: 3 conversaciones con producto de billeteras · Hábito: lo pone la billetera.

**11. Lector del timbre electrónico del SII (y QR de CFDI/NFC-e)**
Qué: leer el código de la boleta en vez de la foto · Para: Chile, México, Brasil · Distinto: costo ≈0 · Nadie: en Chile el timbre (PDF417) es obligatorio [FUENTE 45], pero según el formato del SII (por conocimiento general, **verificar**) trae el **monto total y solo el primer ítem**, no el detalle: **no sirve para dividir por ítem** · Construir: 20–40 h · Prueba: leer 5 timbres de boletas propias · Hábito: no. **Se descarta como apuesta.**

**12. Asignar hablando** ("yo el lomo, Tiano la pizza") — ya prototipado [DATO]
Qué/para: todos · Distinto: rapidez · Nadie: poco común · Construir: pulir 10–20 h · Prueba: e2e ya existe (`e2e-voz.mjs`) + 5 grupos · Hábito: no; es comodidad.

**13. Guía de propinas y cargos por país** (contenido + calculadora)
Qué: páginas "¿cuánta propina se deja en Perú/Japón/EE. UU.?" construidas desde `core/country-rules.js` (48 perfiles) · Para: viajeros que buscan en Google antes de viajar · Distinto: datos verificados con boletas reales · Nadie: hay blogs, pero no calculadoras alimentadas por reglas probadas [OPINIÓN] · Construir: 20–40 h · Prueba: publicar 5 países y medir visitas de búsqueda en 4–8 semanas · Hábito: no; **es canal de adquisición del pase**, no producto.

**14. "Wrapped" del grupo / tabla de "el que siempre paga"**
Qué: resumen lúdico anual o del viaje · Para: grupos · Distinto: compartible · Nadie: requiere historial · Construir: 20–40 h (necesita grupos) · Prueba: hacerlo a mano para 3 grupos · Hábito: no; contagio sí. Útil como **cierre del pase** (imagen final del viaje).

**15. Almuerzo de oficina** (pedidos diarios en grupo)
Qué: cuenta diaria del equipo · Para: oficinas · Distinto: frecuencia diaria · Nadie: la mayoría usa delivery con pago individual [OPINIÓN] · Construir: 30–60 h · Prueba: 2 oficinas por 2 semanas · Hábito: **sí**, pero nadie paga por esto.

**16. Rendición personal de gastos** (freelancers y dueños de pyme: boleta → planilla)
Qué: escanear boletas de gastos y exportar a planilla/contador · Para: trabajadores independientes · Distinto: lectura con reglas chilenas (IVA, propina) · Nadie: Rindegastos ya lo hace para empresas con IA y WhatsApp desde UF 0,05 por usuario/mes (≈US$2,2) [FUENTE 19] · Construir: 40–80 h · Prueba: landing + 30 contactos · Hábito: sí (semanal); pago probable bajo, competencia fuerte.

**17. Turistas extranjeros en Chile vía hostales y operadores** (canal del pase)
Qué: QR del pase en hostales, tours y agencias · Para: 6 millones de llegadas al año (2,86 millones de argentinos) [FUENTE 27] · Distinto: llega al grupo en el momento justo · Nadie: requiere alianzas locales · Construir: material + comisión (20–30 % del pase, [ESTIMACIÓN]) · Prueba: 3 hostales en Santiago/Valparaíso por 2 semanas · Hábito: igual que el pase.

**18. (Loca) Datos agregados de precios de restaurantes por ciudad**
Qué: "índice del costo de comer afuera" vendido a medios/turismo · Distinto: datos reales por ítem · Nadie: riesgo legal y de confianza; hoy **no se guardan** ítems ni imágenes [DATO `docs/CUOTA_Y_USO.md`] · Construir: cambiar la política de datos (no recomendado) · Prueba: ninguna hasta tener abogado · Hábito: no. **Descartada** por el riesgo con la Ley 21.719 y por contradecir la promesa de privacidad.

**19. (Loca) Afiliados con reservas de restaurantes**
Qué: comisión por reservas sugeridas al grupo · Distinto: monetiza sin cobrar al usuario · Nadie: volumen mínimo enorme · Construir: 20–40 h + alianzas · Prueba: 1 alianza · Hábito: no. **Descartada** por volumen.

### Resultado del filtro de hábito
- **Pasan (con hábito real):** Grupos con saldos (E), gastos del hogar, almuerzo de oficina, rendición personal: crean frecuencia, **pero ninguno tiene disposición a pagar probada** y todos tienen un competidor gratis o ya instalado.
- **Pasan "por ocasión" (sin necesitar hábito semanal):** **Pase de viaje (A)**, pase de evento, canal de hostales: uso diario **durante** la ocasión y pago único.
- **B2B (B, marca blanca):** el hábito lo pone el cliente; el problema es venderlo.
- **No pasan:** C sola, D, cobro integrado, timbre SII, voz, wrapped, datos de precios, afiliados (algunas sirven como **piezas** de otro concepto).

---

## FASE 4 · De uso ocasional a hábito (sistema de retorno)

### 4.1 Mapa de frecuencia (veces al mes que aparece la necesidad) [ESTIMACIÓN pesimista/base/optimista]

| Segmento | Frecuencia natural | ¿<2/mes? | Qué agrega ocasiones | Qué ocupa los espacios entre cuentas |
|---|---|---|---|---|
| Amigos que salen | 0,5 / 1,5 / 4 | Sí | Viajes y eventos del mismo grupo | "Cobros pendientes", recordatorio |
| Viajeros (durante el viaje) | 30–150 boletas en 7–15 días | No (mientras dura) | El próximo viaje del grupo | Saldo abierto hasta cerrar |
| Viajeros (al año) | 0,04 / 0,08 / 0,25 viajes/mes | Sí | Escapadas de fin de semana, eventos | Recuerdo del viaje (resumen) |
| Compañeros de piso | 1 / 3 / 6 | A veces | Gastos recurrentes | Saldo del hogar |
| Parejas | 2 / 4 / 8 | No | — | Saldo |
| Almuerzo de oficina | 4 / 8 / 20 | No | — | — |

**Conclusión:** la única forma de que el producto actual no quede bajo 2 usos al mes es meterse en el saldo permanente (E) o **aceptar que es ocasional y cobrar por ocasión** (A).

### 4.2 Recorrido de 30 días: E (Grupos con saldos) vs. A (Pase de viaje)

| Día | E · Grupo permanente (pisos/amigos) | A · Pase de viaje (grupo de 5 en Perú) |
|---|---|---|
| **0** | Ana escanea la cena; 4 invitados marcan lo suyo sin registrarse. Al final: "¿Crear el grupo 'Los del jueves' para llevar el saldo?" → pide **identidad mínima** (número de WhatsApp o Google) a quien quiera ver el saldo después | Antes de viajar o en la primera cena: Ana crea "Cusco 2026". Gratis: primera boleta completa. Para juntar **todas** las boletas del viaje y el cierre final: **Pase CLP 3.990** (pago con Flow). Los 4 amigos entran por link sin registrarse ("Soy yo") |
| **1** | Nada que hacer, salvo que alguien pague algo | Desayuno, taxi, entradas: cada uno escanea **su** boleta o la agrega a mano en soles; todo suma al saldo del viaje en soles y en pesos |
| **7** | Recordatorio por WhatsApp: "Beto le debe $12.300 a Ana". Si no hubo otra salida, el saldo es una sola cena | Fin del viaje: "Quedan a mano con 3 transferencias" + datos para transferir de cada uno + imagen resumen del viaje |
| **14** | Segunda salida (si ocurre): suma al saldo. **Riesgo:** el grupo usa Tricount o nada | Recordatorio a quien no ha pagado; "Ya pagó" cierra la deuda. El grupo queda archivado (historial del viaje) |
| **30** | Resumen del mes; **muro de pago**: ¿US$2–3/mes por historial, varios grupos y recurrentes? | El pase vence; el grupo queda como recuerdo. Cada miembro vio el producto completo: **cualquiera puede ser el organizador del próximo viaje** |
| Qué paga | Suscripción (conversión típica ≈2 % [FUENTE 39]) | Pago único por grupo **antes** de usar lo principal |

**Comparación [OPINIÓN con números en C]:** E necesita que el grupo vuelva a salir y siga usando la app durante meses antes del primer pago; A cobra el día 0 o 1. E necesita identidad entre cuentas; A no (el grupo vive 30 días en un link, cada persona en su teléfono con su nombre, como ya funciona hoy).

### 4.3 Bucle de hábito del mejor concepto (Pase de viaje)

- **Disparador:** cada pago en el viaje ("¿lo anotamos?"), más el saldo visible en el link del grupo de WhatsApp.
- **Acción:** foto de la boleta (5–10 s) o monto a mano.
- **Recompensa:** "Cuadra con el total" + el saldo de cada uno al instante, en la moneda de casa; al final, **3 transferencias en vez de 20 cuentas**.
- **Inversión del usuario:** boletas del viaje, datos para transferir guardados, nombres del grupo. **Costo de cambio:** a mitad del viaje nadie migra las boletas a otra app.
- **Dato que se guarda:** solo el resultado (ítems, montos, nombres que eligieron); **no la imagen** (como hoy).

### 4.4 Efectos de red y contagio (coeficiente k) [ESTIMACIÓN]

- **Mecanismo exacto:** cada miembro del grupo usa la app sin registrarse; al cerrar el viaje ve "¿Organizas el próximo? Crea tu viaje". Quien crea un viaje nuevo es un **organizador nuevo**.
- **k = miembros por grupo × probabilidad de que un miembro organice otro viaje con la app en 12 meses**:
  - Pesimista: 3 × 2 % = **0,06** · Base: 4 × 8 % = **0,32** · Optimista: 5 × 20 % = **1,0**.
- **Lectura:** con k < 1 el crecimiento depende de canales (contenido de propinas, hostales). El contagio **abarata** la adquisición pero no basta solo. Para la cuenta de restaurante (C) el k es parecido, pero cada nuevo anfitrión **no paga**; en el pase, cada organizador nuevo es una venta potencial.
- **Conversión mínima para que sea rentable:** con el pase a CLP 3.990 y 2 % de los grupos gratis comprando, el margen por pase es ≈US$2,0 (Sesión C). Si la conversión cae a 0,5 %, el gratis cuesta más que lo que deja el pase → hay que **achicar lo gratis** (ver C, diseño del cobro).

### 4.5 Disparadores externos que no cuestan

| Disparador | Canal | ¿Agradecido o molesto? [OPINIÓN] |
|---|---|---|
| "Ya pagaste tu parte del viaje: te deben $X" | WhatsApp (link `wa.me`, sin costo) | **Agradecido** (es plata a favor) |
| Recordatorio a quien debe, enviado por el anfitrión revisándolo antes | WhatsApp manual | Agradecido si es 1 vez; molesto si >2 |
| Resumen del viaje (imagen) al cerrar | WhatsApp | **Agradecido**, se comparte |
| "Falta 1 día para que venza el pase" | En la app | Neutro |
| Recordatorios automáticos sin revisión humana | Plantillas de WhatsApp Business (pagadas) | **Molesto** y cuesta ≈US$0,02–0,09 por mensaje [FUENTE 25]: **no hacerlo** |
| Avisos de "vuelve a usar la app" sin deuda | — | Molesto: no hacerlo |

### 4.6 Métricas de retención desde el día 1 (definición exacta)

| Métrica | Definición | Umbral de "hay algo" |
|---|---|---|
| Repetición del grupo | % de anfitriones con una 2ª cuenta en ≤30 días tras la 1ª (`dc_events` `review_done` por `user_id`) | ≥25 % (restaurante) |
| Boletas por viaje | nº de cuentas en un viaje pagado | ≥8 |
| Invitado → anfitrión | % de `user_id` que primero aparecen como miembro (`dc_bill_members`) y luego crean una cuenta o viaje propio en ≤60 días | ≥5 % |
| Deudas cerradas | % de personas marcadas "Ya pagó" sobre personas con saldo, a 14 días del cierre | ≥70 % |
| Conversión a pase | pases pagados / viajes creados | ≥15 % de los viajes creados; ≥2 % de anfitriones activos |
| Organizador repetido | % de compradores de pase que compran otro en 12 meses | ≥20 % |

### 4.7 Prototipo de retención en 2 semanas (Pase de viaje)

- **Qué se hace:** nada de código. (1) Una página simple en la app o un mensaje con la oferta: "Pase de viaje CLP 3.990: todas las boletas del viaje en un solo saldo y al final quién le paga a quién. Preventa: lo activamos antes de tu viaje". (2) Enlace de pago de Flow (2,89 % + IVA por venta, sin costo fijo [FUENTE 23]). (3) El dueño, con el asistente, junta a mano las cuentas del viaje de quien pague (cada boleta como cuenta normal, y el cierre en una planilla) si el producto no está listo: **conserje**.
- **A quién:** ≥20 grupos que viajan en los próximos 60 días (contactos del dueño, sus amigos, y grupos de viaje en redes).
- **Éxito:** ≥3 pases pagados y ≥1 grupo que usa la app ≥5 veces durante el viaje.
- **Se mata (o se pausa):** 0 pagos con ≥20 grupos contactados que sí viajan.
- **Costo:** US$0 fijo; ≈6–10 h del dueño; IA ≈US$0,30 por viaje.
- **Requisito legal previo:** términos mínimos y política publicada antes de cobrar a alguien fuera del círculo cercano (ver C, 7.3).

---

## Preguntas abiertas y datos que faltan para la Sesión C

1. ¿El hermano y los amigos viajan en grupo? ¿Cómo llevaron las cuentas del último viaje?
2. ¿Los grupos aceptan que **una** persona pague por todos (el organizador)? ¿O prefieren dividir también el pase?
3. Costo real de pedir identidad (para E): no hay datos; se mediría con la prueba manual de 3 grupos.
4. ¿Cuántos grupos que viajan puede contactar el dueño en 2 semanas?
5. Tarifas reales de Flow para cobros pequeños y de un contador para inicio de actividades.

## Apéndice de fuentes nuevas (consultadas el 2026-10-22)
- 14. Veryfi, precios de la API: https://faq.veryfi.com/en/articles/3743986-what-are-the-plans-prices-for-ocr-api · https://www.veryfi.com/pricing/
- 15. Taggun, precios: https://www.taggun.io/pricing
- 16. Mindee, precios: https://www.mindee.com/pricing
- 23. Flow, tarifas: https://web.flow.cl/tarifas/
- 25. Meta, precios de WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp/pricing · tarifas de Chile por un tercero (débil): https://docs.sent.dm/docs/guides/whatsapp-pricing
- 34. Restaurant Dive, Sunday sale del 60 % de sus mercados: https://www.restaurantdive.com/news/restaurant-payments-app-sunday-cuts-staff-exits-60-of-its-markets/627312 · TechCrunch, seed de US$24 M: https://techcrunch.com/2021/04/14/sunday-raises-24-million-seed-round-to-build-a-fast-restaurant-checkout-flow
- 42. CMF, normativa de la Ley Fintec (NCG 502): https://www.garrigues.com/es_ES/garrigues-digital/chile-cmf-dicta-normativa-regula-inscripcion-entidades-reguladas-ley-fintech
- 45. SII, manual de muestras impresas (timbre PDF417): https://www.sii.cl/servicios_online/docs/manual_muestras_impresas.pdf
