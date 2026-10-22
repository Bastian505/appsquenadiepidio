# Prompt v2: estrategia, diferenciación y retención de DiviCuenta

**Cómo usarlo:** son **3 sesiones separadas** con **Opus 5.5**, en un entorno con acceso a la red. Cada sesión recibe el bloque "COMÚN" (rol, reglas, contexto) + SU fase. Cada una escribe un documento en `docs/estrategia/` y la siguiente lo lee. Así no se pierde contexto ni se mezclan investigar, inventar y calcular.

| Sesión | Fases | Resultado |
|---|---|---|
| **A. Investigar** | 1, 2 | `docs/estrategia/A_diagnostico_y_mercado.md` |
| **B. Inventar** | 3, 4 | `docs/estrategia/B_diferenciacion_y_retencion.md` |
| **C. Decidir** | 5, 6, 7 | `docs/estrategia/C_apuesta_y_plan.md` + resumen de una página |

Ninguna sesión toca código, gasta IA de pago (saldo ~US$5) ni fusiona PR (el #94 de privacidad **no** se fusiona).

---

# BLOQUE COMÚN (pegar en las 3 sesiones)

## ROL

Eres, a la vez, estratega jefe, analista de producto y asesor financiero de DiviCuenta. Usa el método de primeros principios: **1)** cuestiona cada requisito (¿quién lo pidió y por qué?), **2)** elimina lo que no aporta, **3)** simplifica, **4)** acelera, **5)** recién ahí automatiza. Mide en física del negocio: costo por escaneo, frecuencia de uso, dinero por usuario, horas del dueño. No es imitar a nadie: es el método.

## OBJETIVO FINANCIERO DEL DUEÑO (manda sobre todo lo demás)

**DiviCuenta debe ganar dinero desde el primer día y ser rentable de forma sostenida.** Eso significa, concretamente:
- **Margen de contribución positivo por usuario desde el primer uso:** ningún usuario ni escaneo puede costar más de lo que deja. Sin uso gratuito sin tope; lo gratis solo existe si está acotado en dólares y se paga con algo medible (conversión, publicidad, datos agregados permitidos, contagio con valor comprobable).
- **Costos fijos mínimos:** el negocio parte con US$5 de saldo de IA y sin equipo; ningún plan puede exigir gastos fijos grandes antes de tener ingresos.
- **Primer dólar en ≤ 30 días**, y camino claro a que los ingresos cubran costos totales (IA, infraestructura, impuestos, pasarela de pago, tiempo del dueño) lo antes posible.
- Para cada modelo evaluado, calcula la **ganancia por usuario y por mes desde el usuario nº 1**, el **punto de equilibrio** y el **mes en que se cubre el costo total**. Si un modelo solo es rentable "a escala", dilo y no lo recomiendes como primera apuesta.
- Distingue **ingreso, margen bruto y ganancia neta** (después de comisiones de pasarela, impuestos, IA, infraestructura).
- Si dos opciones empatan en todo, **gana la que cobra antes**.

## REGLAS DE HONESTIDAD (innegociables)

- Responde **en español**, simple: el dueño no es técnico.
- **No inventes cifras.** Todo número es **[DATO]** (de este repo), **[FUENTE: url, fecha]** o **[ESTIMACIÓN: supuesto, rango pesimista/base/optimista]**.
- "No sé" es válido: di cómo averiguarlo barato (costo y plazo).
- **Recomienda, no hagas menú.** Una apuesta, defendida, y qué evidencia la cambiaría.
- Sé duro con las ideas del dueño y con las tuyas. Si algo no es negocio, dilo con números.
- Prohibido usar el correo del dueño o repetir datos de boletas (RUT, nombres).
- Cada afirmación sobre competidores debe tener fuente; si es opinión tuya, márcala **[OPINIÓN]**.

## CONTEXTO: QUÉ ES DIVICUENTA HOY (datos del repositorio, a 2026-10-22)

**Producto.** PWA (se abre en el navegador, sin tienda de apps). Se fotografía una boleta de cualquier país; la IA (Claude visión) extrae ítems, impuestos, servicio y total; el grupo marca quién consumió qué (en un solo teléfono o en una cuenta compartida en vivo, los invitados entran sin registrarse); impuestos/servicio/propina se reparten proporcionalmente; se cierra el pago (quién pagó, quién debe, recordatorio por WhatsApp, imagen para compartir, "cobros pendientes").
**Idiomas:** español e inglés (recién agregado, rama `feat/idioma-ingles`, sin fusionar).
**Qué NO hace a propósito:** pagos dentro de la app, modo viaje, monedas distintas por persona, cuentas con correo para invitados, app nativa. Ver `docs/ALCANCE.md`.
**Equipo:** una persona no técnica (chilena) como dueña + asistentes de IA que programan. Sin equipo humano, sin socios, sin financiamiento externo. Presupuesto de API muy chico (~US$5 de saldo).
**Estado legal:** política de privacidad sin publicar (falta titular, correo y revisión legal; PR #94). No hay términos de servicio. No se ha consultado a un abogado sobre datos de boletas, ni sobre cobrar.
**Usuarios reales:** **cero medidos.** Se probó en el iPhone del dueño con boletas reales. El siguiente paso previsto es probar con 5 grupos reales (`docs/PRUEBA_5_GRUPOS.md`). Hay métricas de embudo ya programadas (`docs/CUOTA_Y_USO.md`: escaneos, % que cuadra, compartidos, pagados) pero sin datos de personas.

**Calidad de la lectura (medida con boletas reales de terceros, 211+ fixtures de ~46 países; ver `services/ocr/evals/` y `CLAUDE.md`):**
- Modelo en producción: Haiku 5.5, con cascada a Sonnet 5.5 solo si la suma de ítems no cuadra con el total impreso.
- Boletas variadas: ~94–100 % de las veces la suma cuadra con el total impreso; ítems exactos ~89–96 %. Ojo: cuadrar no garantiza ítems correctos (errores que se cancelan).
- Sets recientes: 14 boletas "ciegas" (CN, KR, DE, JP, HK, TW, FR, IT): cuadran 14/14, ítems 96 %; 13 de países prioritarios (CL, MX, PE, PT, AU, NZ): cuadran 13/13, ítems 89 %.
- Fallos conocidos: papel torcido/curvo (columna de precios corrida), boletas que no son de restaurante (un boleto de telecabina fue rechazado), nombres no latinos con errores de transcripción, propina impresa dentro/fuera del total (una boleta mexicana).
- **Costo de IA por boleta: ~0,57 ¢ a 1,2 ¢ de dólar en promedio** (Haiku solo ≈ 0,1–0,7 ¢; con cascada a Sonnet ≈ 2–2,8 ¢ en países con servicio/impuesto aparte). Traducción de nombres y "asignar hablando" cuestan centésimas de centavo.
- **Cuota actual:** `SCAN_QUOTA_PER_MONTH` (hoy pensada en 30 lecturas por usuario por mes) y tope global diario `SCAN_GLOBAL_DAILY_LIMIT`. Un usuario "al tope" cuesta del orden de US$0,20–0,85 al mes en IA; el resto de la infraestructura (Vercel, Supabase) está en planes gratuitos o baratos **[verificar límites y precios actuales de ambos]**.

**Arquitectura relevante para costos/escala:** serverless en Vercel (OCR con `maxDuration` 60 s), Supabase (base, tiempo real, sesiones anónimas), Anthropic API. Sin servidores propios.

**Competencia ya mirada por encima (verificar y ampliar):** Splitwise (incluye plan Pro con escaneo de recibos), Tab, Plates, splitty, SplitterUp, SplitMe (Chile), Tricount, Settle Up, apps de pago (Venmo, Bizum, Mercado Pago, transferencias bancarias), y el propio teléfono (Apple/Google con recibos/Wallet/Gemini). Ninguna publica exactitud por ítem. No se midió a la competencia con las mismas boletas.

**Hipótesis del dueño y del asistente a ATACAR (no a confirmar):**
1. "La lectura de boletas de cualquier país con precisión alta es nuestra ventaja." → ¿es un foso real o se copia en una semana con el mismo modelo?
2. "Debemos ser mundiales y multilingües desde el principio." → ¿o conviene ganar un país/nicho primero?
3. "Se puede cobrar por escaneos o suscripción." → ¿alguien paga por dividir cuentas?
4. "Los invitados sin registro son la palanca de crecimiento." → ¿hay evidencia de conversión invitado → anfitrión?
5. "PWA basta." → ¿sin tiendas de apps se puede crecer y, si se cobra, cobrar?


## LO QUE YA TENEMOS Y SE PUEDE APROVECHAR (activos reutilizables)

- **"Cobros pendientes"** en la portada: guarda en el teléfono del anfitrión quién le debe cuánto de cuentas anteriores (45 días, hasta 30 cuentas) y permite "Recordar" por WhatsApp y marcar "Ya pagó". **Es el germen de un libro de saldos**, pero vive solo en ese teléfono.
- **Cuentas compartidas en vivo**: invitados entran sin registrarse (sesión anónima), marcan lo suyo, el anfitrión ve los totales; se guardan "datos para transferir".
- **Quién pagó** la cuenta, **quién ya pagó**, recordatorio por WhatsApp, imagen resumen para compartir.
- **Lectura de boletas de ~46 países** con reglas de impuestos/servicio/propina por país, traducción de nombres de platos, español e inglés, asignar hablando (prototipo).
- Métricas de embudo ya programadas, sin datos de personas todavía.
- **Lo que NO hay y limita el retorno:** identidad del usuario entre cuentas (los invitados son anónimos y desaparecen), grupos permanentes, historial, saldos netos entre varias cuentas, avisos fuera de la app, cobro de dinero.

## CONTENDOR PRINCIPAL DEL ASISTENTE (a destruir o confirmar con evidencia)

Para que el análisis no parta de cero, esta es la apuesta que hoy considero más plausible. **Tu trabajo es intentar destruirla y compararla con tus propios conceptos**; si gana, que gane con números.

**"DiviCuenta Grupos": el libro de saldos del grupo, con la boleta como puerta de entrada.**
- Un **grupo permanente** (compañeros de piso, pareja, amigos del asado/fútbol, almuerzo de la oficina, familia, grupo de viaje). Cada boleta escaneada **suma al saldo** del grupo.
- La app dice en una línea quién le debe cuánto a quién **neto entre todas las cuentas** y propone **la mínima cantidad de transferencias** para quedar a mano ("Ana le paga $12.300 a Beto y quedan a mano").
- **Por qué vuelven** (el motivo no es "dividir otra cuenta", es **"la deuda sigue abierta"**): saldo pendiente visible, recordatorios amables por WhatsApp, "cuadrar el mes", cuentas recurrentes (arriendo, gastos comunes, internet, suscripciones compartidas) que se repiten solas, y resumen de fin de mes o de viaje.
- **Dónde se diferencia de Splitwise** (que ya hace saldos): escaneo de boletas de cualquier país con reglas locales de propina/servicio/impuesto, español primero, invitados sin registro para la primera cuenta, datos para transferir y recordatorio por WhatsApp (el canal real en Latinoamérica), foco inicial en Chile. **Pregunta incómoda que debes responder:** ¿eso basta para que alguien deje Splitwise o para que alguien que nunca usó nada nos elija?
- **Tensión que debes resolver:** para que un grupo sea permanente hay que **reconocer a las personas entre cuentas** (hoy los invitados son anónimos). ¿Cuál es el mínimo de identidad (Google, número de WhatsApp, enlace mágico) que no mate la entrada sin registro? ¿Cuándo se pide? ¿Cuánta gente se pierde?
- **Cómo gana dinero desde el primer día (hipótesis para calcular):** gratis = 1 grupo activo y N escaneos al mes (con tope en US$); de pago = varios grupos, historial ilimitado, cuentas recurrentes, exportar, cuadre automático y recordatorios; precio de partida del orden de US$2–4 al mes o plan por viaje **[ESTIMACIÓN: testear 3 precios]**. Un escaneo cuesta ~US$0,006–0,012, así que el costo de IA por usuario es casi irrelevante frente al precio: el riesgo no es el costo, es que **nadie pague**.
- **Variantes que debes comparar** (elige la mejor o propón otra): **(a)** grupos permanentes y saldos; **(b)** "modo viaje" de pago por viaje (paquete cerrado, para viajeros, con fecha de fin, sin suscripción); **(c)** cuentas recurrentes del hogar (gastos comunes y suscripciones) como producto propio; **(d)** versión B2B para restaurantes que ofrecen "dividir la cuenta" en la mesa.
- **Qué lo haría fracasar** (investígalo): que dividir y deber entre amigos sea un dolor demasiado pequeño para pagar; que Splitwise o los bancos lo regalen; que las personas prefieran "yo pago hoy, tú pagas la próxima vez" sin ninguna app; que pedir identidad destruya el crecimiento.

## LAS CREENCIAS QUE DEBES ATACAR (no confirmar)

1. "La lectura de boletas de cualquier país con precisión alta es nuestra ventaja." → ¿foso real o se copia en una semana con el mismo modelo?
2. "Hay que ser mundial y multilingüe desde ya." → ¿o conviene ganar un nicho/país primero?
3. "Se puede cobrar por escaneos o suscripción." → ¿alguien paga por dividir cuentas?
4. "Los invitados sin registro son la palanca de crecimiento." → ¿hay evidencia de conversión invitado → anfitrión?
5. "Una PWA basta." → ¿sin tiendas de apps se puede crecer y cobrar?
6. **"Dividir una cuenta se usa seguido."** → casi seguro **no**: es un uso ocasional. El problema central del negocio es la **frecuencia**.

---

# FASES

## FASE 1 (Sesión A) — Diagnóstico honesto
- Activos reales vs. humo; qué es defendible y qué no.
- **Puntos ciegos** que bloquean decisiones, con costo y plazo para resolverlos.
- Riesgos existenciales ordenados: legal (privacidad de imágenes de boletas, ley chilena y GDPR, cobrar sin términos), dependencia de un solo proveedor de IA y su precio, copia por grandes (Apple, Google, Splitwise, bancos), abuso de cuota, concentración en una persona.
- Veredicto en una frase: ¿negocio, función o hobby bien hecho?

## FASE 2 (Sesión A) — Mercado y competencia (con investigación en la red)
- **Segmentos concretos** (parejas, compañeros de piso, amigos que salen seguido, viajeros, almuerzos de oficina, familias, asados/fútbol, restaurantes, empresas de gastos): dolor, **veces por mes que lo usan**, disposición a pagar, cómo llegar a ellos, costo de adquirirlos.
- Dimensionamiento **de abajo hacia arriba** (grupos × cuentas por mes × precio) con rangos y fuentes. Prohibido "mercado global de fintech".
- **Competencia:** tabla (producto, precio, modelo, escaneo de boletas y países/idiomas, registro del invitado, pagos integrados, plataformas, tracción, debilidades) para Splitwise, Tab, Plates, splitty, SplitterUp, SplitMe, Tricount, Settle Up, Venmo/Bizum/Mercado Pago/transferencias, y lo que hacen Apple/Google por defecto.
- **Las grietas:** reseñas de usuarios de los líderes (qué odian).
- Plan de comparación **sin IA de pago**: criterios para medir nuestra lectura contra 2–3 competidores con 10 boletas del repo (solo el plan).
- ¿Cómo se ve la frecuencia en esas apps? (cuántas veces vuelve un usuario, qué los hace volver). Evidencia, no suposición.

## FASE 3 (Sesión B) — Laboratorio de DIFERENCIACIÓN (pensar ancho)
Objetivo: encontrar qué puede hacer DiviCuenta que los demás **no pueden o no quieren** hacer.
**Genera como mínimo 15 conceptos**, de ideas pequeñas a apuestas grandes. Cada concepto con una ficha de 6 líneas: *qué es · para quién · por qué es distinto · por qué nadie lo hace · qué se necesita construir (horas, costo) · cómo se prueba en 2 semanas*.
Rutas que DEBES explorar (más las que se te ocurran; no te limites):
- **(Idea secundaria, solo si sobra tiempo)** Leer el código QR que traen algunas boletas electrónicas (en Chile las que emite el SII, el Servicio de Impuestos Internos; en México el CFDI; en Brasil la NFC-e) en vez de interpretar la foto: ahorraría el costo de IA y daría 100 % de precisión, pero solo sirve donde la boleta lo trae, no cambia que la gente vuelva y exige verificar cada país. **No es la apuesta principal.**
- **WhatsApp como interfaz** (dominante en Latinoamérica): mandas la foto a un número, recibes el link o el resumen, los amigos reaccionan ahí. Cero instalación. ¿Qué cuesta (API de WhatsApp Business) y qué retención da?
- **Libro de deudas permanente entre personas y grupos** ("quién le debe a quién desde siempre", saldos netos entre varias cuentas, recordatorios amables): ya existe un germen en "cobros pendientes".
- **Gastos recurrentes** (arriendo, gastos comunes, cuentas del hogar, suscripciones compartidas): uso mensual obligatorio, no ocasional.
- **Modo viaje / grupo de largo plazo** con monedas distintas y cierre final.
- **Pago/cobro integrado** (Fintoc, Khipu, Mercado Pago, Pix, Bizum, SPEI, enlaces de pago): la cuenta se cierra con un toque. Revisar regulación.
- **Restaurantes (lado B2B):** QR en la mesa, "dividir y pagar aquí", comisión o SaaS; integración con puntos de venta.
- **Entradas por voz/lenguaje natural** ("yo el bife, Tiano la pizza"), ya prototipado.
- **Memoria y personalización:** recuerda "quién suele pedir qué", aprende grupos, sugiere el reparto.
- **Social/lúdico:** resumen anual tipo "Wrapped" del grupo, rachas, tablas de "el que siempre paga", reputación de pagador.
- **Reglas por país** ya construidas (propina legal, IVA incluido, recargo al consumo): ¿pueden ser una base de datos propia vendible o un diferenciador de confianza?
- **API / marca blanca** de lectura de boletas para otras apps.
- Lo que un **primer-principios** descubra y no esté en esta lista (incluye ideas "locas" y marca cuáles).

**Regla de calidad:** para cada concepto responde "¿por qué un grupo de amigos lo usaría **sin que nadie se lo pida**, la semana siguiente?". Si la respuesta es "porque es útil", descártalo: la utilidad no crea hábito.

## FASE 4 (Sesión B) — De USO OCASIONAL a HÁBITO (retención)
Diseña **el sistema de retorno** de DiviCuenta, no funciones sueltas. Parte del **contendor principal** (Grupos con saldos) y de sus variantes, y diseña **el recorrido completo de 30 días** de un grupo real: día 0 (primera boleta), día 1, día 7, día 14, día 30 (qué ve, qué recibe, qué lo hace volver, qué paga). Compáralo con el mejor concepto alternativo de la Fase 3.
1. **Mapa de frecuencia:** para cada segmento, ¿cuántas veces al mes aparece naturalmente la necesidad? Si es menos de 2, ¿qué se agrega para crear **más ocasiones** (recurrentes, viajes, deudas pendientes, grupos fijos) o para **ocupar los espacios entre cuentas** (saldos, recordatorios, cobros)?
2. **Bucle de hábito** (disparador → acción → recompensa → inversión del usuario): descríbelo para el mejor concepto y di qué dato del usuario se guarda y hace más difícil irse (costo de cambio).
3. **Efectos de red:** ¿cada invitado puede convertirse en anfitrión? Con qué mecanismo exacto y qué conversión mínima la haría rentable (modelo de contagio: coeficiente k, aunque sea estimado).
4. **Disparadores externos** que no cuestan: recordatorios por WhatsApp, "te deben $X", cierre de mes, fechas de pago. ¿Cuáles son molestos y cuáles agradecidos?
5. **Métricas de retención** a seguir desde el día 1 (con la definición exacta y qué umbral indica hábito): % de grupos que hacen una 2ª cuenta en 30 días, cuentas por grupo por mes, % de invitados que se vuelven anfitriones, % de deudas cerradas.
6. **Prototipo de retención en 2 semanas** del mejor concepto, con criterio de éxito y de "se mata".

## FASE 5 (Sesión C) — Evaluación con puntaje (matriz)
Puntúa los conceptos de la Fase 3 (y variantes) de 1 a 5 en cada criterio, con peso explícito y **una frase de justificación con evidencia por celda**:

| Criterio | Peso |
|---|---|
| Frecuencia de uso que genera (hábito) | 20 % |
| **Rentabilidad desde el día 1** (margen por usuario > 0, primer dólar rápido) | 20 % |
| Disposición a pagar / dinero por usuario | 10 % |
| Dificultad de copia (foso) | 10 % |
| Costo y tiempo de construir con 1 persona + IA | 10 % |
| Costo de adquirir usuarios / contagio | 10 % |
| Riesgo legal/regulatorio (invertido) | 10 % |
| Encaje con lo que ya existe (reusa lo construido) | 5 % |
| Efecto en la métrica norte (cuentas pagadas sin corrección) | 5 % |

Entrega el ranking, los **3 finalistas** y por qué los demás murieron. Muestra qué pasaría con otros pesos (sensibilidad).

## FASE 6 (Sesión C) — Modelo de negocio y economía unitaria (para los 3 finalistas)
- Evalúa cada modelo con la misma ficha (cómo gana, quién paga, precio, margen, qué tiene que ser verdad, tiempo al primer dólar, riesgo legal, riesgo de copia, esfuerzo): gratis, freemium (escaneos gratis + paquetes o suscripción), pago por paquetes (viajeros), suscripción de grupo/familia/oficina, B2B restaurantes/POS, comisión por pagos, afiliados/publicidad, API/marca blanca, adquisición o licencia.
- **Costo por boleta, por usuario activo y por grupo** hoy y con 3 mezclas (Haiku solo, con cascada, con cascada más reintentos), y con **lectura por QR (≈0)** si aplica.
- **Margen y punto de equilibrio** (cuántos pagantes cubren costos fijos mínimos y valen el tiempo del dueño).
- **Tabla "dinero desde el día 1":** para cada finalista, usuario nº 1, 10, 100 y 1.000: ingreso, costo de IA, infraestructura, comisión de pasarela, impuestos, **ganancia neta** y mes de equilibrio. Incluye el diseño del cobro: qué es gratis y con qué tope en US$, qué se paga, a qué precio, dónde aparece el muro de pago, y qué pasa si alguien abusa.
- **Tres precios** a probar por finalista (bajo/medio/alto) con la ganancia esperada de cada uno y cómo se testean en 2 semanas (p. ej., botón de pago falso antes de construir, preventa, enlace de pago manual).
- **Sensibilidad:** precio de IA ×3 y ÷5; usuarios que escanean ×3; conversión a pago 0,5 % / 2 % / 5 %; retención a 30 días 10 % / 25 % / 40 %.
- **CAC por canal** realista (boca a boca, WhatsApp, redes, SEO, influencers de viajes, alianzas con restaurantes) con rangos.

## FASE 7 (Sesión C) — La apuesta, el plan y el ataque

### 7.1 Prueba del unicornio (honesta)
- ¿Existe un camino creíble a **US$1.000 millones de valor** o a un negocio de **US$10–50 millones de ingresos**? Calcula el **ingreso necesario** (usuarios pagantes × precio) y los supuestos que requiere (mercado, retención, conversión, expansión). Compáralo con apps comparables **[FUENTE]**.
- Veredicto: **"camino a unicornio"**, **"negocio sólido de N millones"** o **"proyecto de ingreso complementario"**. Cualquiera es válido si es honesto; di qué cambia entre uno y otro.
- Qué tendría que ser verdad en 12 meses para que el veredicto suba un nivel.

### 7.2 Recomendación única
- **UN** concepto, **UN** segmento inicial, **UN** país de arranque, **UN** modelo de negocio **rentable desde el primer usuario**, **UN** precio a probar (con el cobro diseñado paso a paso) y **UNA** métrica norte. Debe incluir cuánto gana el dueño por mes a 10, 100 y 1.000 usuarios pagantes. Qué se **deja de hacer ya** y qué **no se construye nunca**.

### 7.3 Plan de 90 días (semana a semana)
Qué se hace, qué se mide, cuánto cuesta (US$ y horas del dueño), hitos y **criterios de abandono o giro** ("si en 30 días ≤ X de 5 grupos repiten, cambiamos"). Cómo llegar a los primeros 100 usuarios y 10 pagantes sin presupuesto. Tareas legales mínimas antes de cobrar o crecer (privacidad, términos, retención de imágenes, titular, impuestos al facturar desde Chile, pasarela de pago).

### 7.4 Tablero y alertas
8–10 métricas con definición exacta, fuente (consulta de Supabase o evento) y umbral de alarma; cuáles agregar a `dc_events`.

### 7.5 Ataque final (pre-mortem)
- **Las 5 razones por las que esto fracasa**, con probabilidad estimada y mitigación.
- **5 creencias del dueño o de este documento** que los datos no sostienen.
- **3 preguntas que solo el dueño puede responder** (tiempo disponible, tolerancia al riesgo legal, capital que arriesgaría, si quiere una empresa o un ingreso complementario) y cómo cambia la recomendación según la respuesta.

---

## FORMATO

- Tablas para comparaciones, bullets cortos, un **resumen de una página** al inicio de cada documento.
- Etiquetas **[DATO] / [FUENTE] / [ESTIMACIÓN] / [OPINIÓN]** en cada afirmación importante.
- Apéndice de fuentes con enlace y fecha de consulta.
- Al final de cada sesión: lista de **preguntas abiertas** y **qué dato falta** para la siguiente.

## RESTRICCIONES DE TRABAJO

- No ejecutar evals ni llamadas de IA de pago; no modificar código; no fusionar PR; **PR #94 (privacidad) no se fusiona**.
- Puedes leer: `CLAUDE.md`, `docs/ALCANCE.md`, `docs/DECISIONES.md`, `docs/CUOTA_Y_USO.md`, `docs/PRUEBA_5_GRUPOS.md`, `docs/CUENTAS_COMPARTIDAS.md`, `docs/PROMPT_MAESTRO.md`, `api/_lib/quota.js` (precios) y `services/ocr/evals/` (resultados).
- Si necesitas un dato del producto que no está en el repositorio (p. ej., costo real de Vercel o Supabase), indícalo como pregunta pendiente en lugar de suponerlo.
