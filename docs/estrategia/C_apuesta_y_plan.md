# Sesión C · La apuesta, el modelo de negocio y el plan (Fases 5, 6 y 7)

Fecha: 2026-10-22 · Lee `A_diagnostico_y_mercado.md` y `B_diferenciacion_y_retencion.md` (fuentes con la misma numeración).
Etiquetas: **[DATO]** repo · **[FUENTE n]** · **[ESTIMACIÓN]** con rango · **[OPINIÓN]**.
Tipo de cambio usado: **US$1 = CLP 920** **[ESTIMACIÓN: dólar observado de agosto de 2026 entre 911 y 936, FUENTE 43]**; UF ≈ CLP 41.000 (sep-2026, FUENTE 43). Cálculos reproducibles en el texto (supuestos explícitos).

---

## Resumen de una página

**La recomendación:** convertir DiviCuenta en el **"Pase de viaje"**: un **pago único de CLP 3.990 por grupo y por viaje** (≈US$4,3) que junta todas las boletas del viaje, en cualquier país y moneda, y al final dice quién le paga a quién con el mínimo de transferencias. **Segmento:** grupos de 3–8 amigos o familia chilenos que viajan, organizados por WhatsApp. **País:** Chile (cobro en pesos con Flow). **Métrica norte:** viajes pagados que llegan a "todos a mano".

**Por qué esta y no otra:**
- Es la única idea que **cobra el día 0** sin pedir que la gente vuelva cada semana: el problema de frecuencia deja de ser mortal (B, Fase 4).
- Usa la ventaja que sí es nuestra (boletas extranjeras con reglas locales y verificación contra el total) **justo donde importa** (A, 2.3).
- Hay precedentes de gente pagando por pases de grupo: Settle Up US$9,99 por 2 semanas, Kittysplit ≈€3 por grupo, Trip Pass de Splitwise [FUENTE 1, 12, 13].
- En la matriz con los pesos del dueño, el **API para empresas (3,3)** y el **Pase de viaje (3,2)** quedan **empatados** (dentro del error de puntuar 1–5). Por la regla del dueño, **gana la que cobra antes**: el pase se puede vender **esta semana** con un enlace de pago y sin código; el API exige construir llaves y cobro, y que una empresa evalúe e integre (semanas o meses), con un dueño no técnico dando soporte.

**Los 5 números que más pesan:**
1. **≈US$2,0 de margen por pase vendido** (CLP 3.990 − IVA − Flow − IA − costo de los usuarios gratis, con 2 % de conversión). Con 0,5 % de conversión es **negativo (−US$1,6)**: lo gratis hay que acotarlo.
2. **≈25 pases al mes para cubrir los costos fijos** (≈US$51/mes: Vercel Pro obligatorio para cobrar US$20 [FUENTE 21] + dominio + contador estimado US$30). Sin contador: ≈11 pases.
3. **≈2 % de conversión típica** en apps freemium (contra ≈11 % con muro de pago fuerte) [FUENTE 39]: por eso se cobra por ocasión y no por suscripción.
4. **0,6–1,2 ¢ de dólar por boleta** [DATO]: la IA no es el problema; el problema es que alguien pague.
5. **US$200–300 millones de ingreso anual** se necesitarían para valer US$1.000 millones con los múltiplos de software de 2026 (3,4–4,7 veces los ingresos) [FUENTE 36]. El líder regional de rendición de gastos (Rindegastos) tiene ≈192 mil usuarios [FUENTE 20]; Expensify, con US$142 M de ingresos, vale bajo US$0,25 mil millones [FUENTE 35]. **No hay camino creíble a unicornio**; lo realista es un **ingreso complementario** (≈US$130/mes con 100 pases al mes; ≈US$1.700/mes con 1.000).

**Qué se deja ya:** más reglas/boletas de evaluación sin fallos de usuarios reales, "ser mundial", grupos permanentes con identidad, restaurantes, bot de WhatsApp pagado, cobro integrado.
**Qué se mata en 30 días:** si con ≥20 grupos que viajan contactados no se vende **ni un pase**, se para el pase y se prueba el API (plan B) o se deja como hobby.

---

## FASE 5 · Evaluación con puntaje (matriz)

Pesos del dueño: Frecuencia 20 % · Rentabilidad desde el día 1 20 % · Disposición a pagar 10 % · Foso 10 % · Costo/tiempo de construir 10 % · Costo de adquirir/contagio 10 % · Riesgo legal (invertido: 5 = bajo riesgo) 10 % · Encaje con lo existente 5 % · Métrica norte 5 %.

| # | Concepto | Frec | Rent d1 | DAP | Foso | Constr | CAC | Legal | Encaje | Norte | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | (B) API lector verificado | 5 | 3 | 3 | 2 | 4 | 2 | 3 | 5 | 1 | **3,30** |
| 1 | (A) Pase de viaje | 2 | 4 | 4 | 3 | 3 | 3 | 3 | 4 | 4 | **3,20** |
| 17 | Turistas en Chile vía hostales (canal del pase) | 2 | 3 | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 2,90 |
| 6 | Pase de evento | 2 | 3 | 2 | 2 | 4 | 3 | 3 | 5 | 4 | 2,85 |
| 16 | Rendición personal de gastos | 4 | 3 | 3 | 1 | 3 | 2 | 3 | 3 | 1 | 2,80 |
| 15 | Almuerzo de oficina | 5 | 1 | 1 | 1 | 3 | 3 | 4 | 4 | 3 | 2,75 |
| 13 | Guía de propinas por país (SEO) | 1 | 2 | 1 | 3 | 4 | 5 | 5 | 5 | 1 | 2,70 |
| 12 | Asignar hablando | 2 | 2 | 1 | 2 | 4 | 3 | 4 | 5 | 3 | 2,60 |
| 7 | Gastos del hogar | 4 | 1 | 2 | 1 | 3 | 2 | 4 | 2 | 1 | 2,35 |
| 5 | **(E) Grupos con saldos** | 4 | 1 | 2 | 1 | 2 | 2 | 3 | 3 | 3 | **2,30** |
| 8b | (C) Bot de WhatsApp / foco Latam | 2 | 2 | 2 | 2 | 2 | 4 | 2 | 3 | 3 | 2,30 |
| 10 | Marca blanca billeteras | 4 | 1 | 3 | 2 | 2 | 1 | 2 | 4 | 2 | 2,30 |
| 11 | Lector del timbre SII | 2 | 1 | 1 | 2 | 3 | 3 | 5 | 4 | 1 | 2,25 |
| 9 | Cobro integrado | 2 | 2 | 2 | 2 | 1 | 3 | 1 | 3 | 5 | 2,10 |
| 14 | Wrapped / social | 2 | 1 | 1 | 2 | 3 | 4 | 3 | 3 | 1 | 2,10 |
| 19 | Afiliados con reservas | 2 | 2 | 1 | 1 | 3 | 2 | 4 | 2 | 1 | 2,05 |
| 4 | (D) Restaurantes, QR en la mesa | 4 | 1 | 3 | 1 | 1 | 1 | 2 | 2 | 2 | 2,00 |
| 18 | Datos agregados de precios | 1 | 1 | 2 | 3 | 2 | 1 | 1 | 3 | 1 | 1,50 |

### Justificación por celda (los conceptos que deciden; el resto, en una línea)

**(B) API:** Frec 5: el cliente que integra manda lecturas todos los días · Rent 3: margen ≈50 % por cliente (US$14,6 de US$29), pero el primer cliente tarda **[ESTIMACIÓN 30–90 días]** · DAP 3: el mercado paga US$0,04–0,08 por recibo [FUENTE 14, 15, 16], pero Textract/Google ≈US$0,01 por página [FUENTE 18] · Foso 2: lo propio son reglas + set de prueba; un equipo con dinero lo replica en semanas · Constr 4: el lector ya existe; faltan llaves, límites, cobro, documentación (20–40 h) · CAC 2: venta directa, uno a uno · Legal 3: contrato y acuerdo de tratamiento de datos con cada cliente · Encaje 5: es exactamente lo construido · Norte 1: no mueve "cuentas pagadas sin corrección".

**(A) Pase de viaje:** Frec 2: viajes 1–3 al año (pero uso diario durante el viaje) · Rent 4: cobra por adelantado, ≈US$2 de margen por pase, enlace de Flow sin costo fijo [FUENTE 23] · DAP 4: precedentes pagados de pase por grupo [FUENTE 12, 13, 1] · Foso 3: lectura de boletas extranjeras con reglas locales y verificación contra el total; Apple solo en EE. UU. [FUENTE 9] · Constr 3: grupo temporal + saldo neto + moneda (60–120 h) · CAC 3: contagio dentro del grupo; viajeros dispersos · Legal 3: cobrar exige términos, política e inicio de actividades · Encaje 4: reusa cuenta compartida, "Soy yo", cobros pendientes · Norte 4: el cierre "todos a mano" es el producto.

**(E) Grupos con saldos:** Frec 4: pisos y parejas, semanal · Rent 1: freemium ≈2 % [FUENTE 39], primer pago tras meses de uso · DAP 2: Tricount gratis sin límites [FUENTE 5] · Foso 1: Splitwise/Tricount ya hacen saldos · Constr 2: identidad entre cuentas, avisos, historial (150–300 h) · CAC 2: hay que sacar a la gente de Splitwise/Tricount · Legal 3: guarda más datos personales por más tiempo · Encaje 3: "cobros pendientes" es el germen · Norte 3.

**Resto, en una línea:** Turistas vía hostales = mismo pase con otro canal (comisión 20–30 % [ESTIMACIÓN]) · Pase de evento: pagar por una sola cena cuesta más que por un viaje [OPINIÓN] · Rendición personal: Rindegastos ya incluye IA y WhatsApp desde UF 0,05 [FUENTE 19] · Almuerzo de oficina: diario, pero nadie paga por dividir un almuerzo · Guía de propinas: excelente canal gratis, no es producto · Voz: comodidad, no hábito · Hogar: sin boleta de restaurante, competidor gratis · Bot WhatsApp: verificación de Meta y costo por plantilla [FUENTE 25] · Marca blanca: venta a bancos de 6–12 meses [ESTIMACIÓN] · Timbre SII: trae el total, no el detalle (verificar) · Cobro integrado: regulado por la Ley Fintec [FUENTE 42] · Wrapped: lúdico, sin pago · Afiliados: volumen enorme · Restaurantes: el POS ya tiene los ítems y Justo ya lo hace [FUENTE 28]; Sunday se retiró del 60 % de sus mercados [FUENTE 34] · Datos de precios: choca con la Ley 21.719 y con la promesa de no guardar boletas.

### Ranking, finalistas y por qué murieron los demás
- **Finalistas:** **(1) Pase de viaje** (fusionado con pase de evento y canal de hostales: es el mismo producto con dos ocasiones y un canal más), **(2) API lector verificado**, **(3) Rendición personal de gastos**. Además, **(E) Grupos con saldos** entra a la Fase 6 como **control**, para que pierda (o gane) con números, como pidió el dueño.
- **Murieron:** los de alta frecuencia sin pago (almuerzo, hogar, wrapped); los regulados o de venta larga (cobro integrado, restaurantes, marca blanca); los que no aportan valor (timbre SII: no trae los ítems); los riesgosos (datos de precios). La guía de propinas y la voz **sobreviven como piezas** del pase (canal y comodidad), no como apuestas.

### Sensibilidad a los pesos
| Pesos | 1º | 2º | 3º |
|---|---|---|---|
| Dueño (base) | API 3,30 | Pase de viaje 3,20 | Hostales 2,90 |
| "Manda la frecuencia" (35/10/10/10/10/10/5/5/5) | API 3,60 | Almuerzo de oficina 3,20 | Rendición 2,95 ≈ Pase 2,95 |
| "Manda el dinero" (10/35/15/10/10/5/10/0/5) | **Pase 3,45** | API 3,05 | Hostales 2,95 |
| Todos iguales | **Pase 3,33** | API 3,11 | Pase de evento 3,11 |

**Lectura:** el pase y el API están siempre arriba. El API gana solo si la frecuencia pesa más que el dinero; el objetivo del dueño dice lo contrario ("manda la rentabilidad"). **Grupos con saldos (E) nunca entra a los 3 primeros** con ningún juego de pesos.

---

## FASE 6 · Modelo de negocio y economía unitaria

### 6.1 Ficha de modelos (misma ficha para todos)

| Modelo | Cómo gana / quién paga | Precio | Margen | Qué tiene que ser verdad | Primer dólar | Riesgo legal | Copia | Esfuerzo |
|---|---|---|---|---|---|---|---|---|
| Gratis | Nadie | 0 | Negativo | — | Nunca | Bajo | — | — |
| Freemium + suscripción (Grupos, Rendición) | El usuario frecuente | CLP 2.790–2.990/mes | ≈US$0,5 por pagante/mes con 2 % de conversión | >2 % convierte y se queda | 2–4 meses | Medio | Alta | Alto |
| **Pago por paquete / pase (viajeros)** | El organizador, una vez | **CLP 3.990/viaje** | **≈US$2,0/pase** | ≥2 % de anfitriones activos o ≥15 % de viajes creados compran | **≤30 días (preventa)** | Medio | Media | Medio |
| Suscripción de grupo/familia/oficina | Un pagador por grupo | US$3–5/mes | Bajo | El grupo vive meses | Meses | Medio | Alta | Alto |
| B2B restaurantes / POS | Restaurante (SaaS o comisión) | — | — | Integración con POS; competir con Justo | 6–12 meses | Alto (pagos) | Ya existe | Muy alto |
| Comisión por pagos | Quien paga su parte | 1–3 % | Bajo | Licencia/registro (Ley Fintec) | >12 meses | Alto | Billeteras gratis | Muy alto |
| Afiliados / publicidad | Anunciantes | — | Ínfimo a esta escala | Cientos de miles de usuarios | Lejano | Bajo | — | Bajo |
| **API / marca blanca** | Empresas | US$29/mes por 1.000 lecturas | ≈US$14,6/cliente/mes (50 %) | Hay compradores que prefieren calidad verificada a hacerlo ellos | 30–90 días | Medio (contratos) | Alta | Medio + soporte |
| Adquisición o licencia | Un comprador (Splitwise, bunq, billeteras, Rindegastos/Visma) | Venta única | — | Tracción o tecnología única | Sin plazo | Bajo | — | Bajo |

### 6.2 Costo por boleta, por usuario y por grupo, con 3 mezclas (y QR)

| Mezcla | Costo por boleta | Fuente |
|---|---|---|
| Haiku 5.5 solo | 0,1–0,7 ¢ | [DATO] `CLAUDE.md` |
| **Haiku + cascada a Sonnet (producción)** | **0,57–1,2 ¢ promedio**; 2–2,8 ¢ cuando relee Sonnet (IN, ID, EG, SY) | [DATO] `CLAUDE.md` |
| Cascada + reintentos (`OCR_RETRY`) | +0,1–0,2 ¢ promedio **[ESTIMACIÓN: una llamada extra en el ~5 % que no cuadra]**; sin mejora medida → **no usar** | [DATO] DECISIONES 2026-10-03 |
| Lectura por timbre/QR | ≈0 ¢, pero **solo da el total** (verificar), no sirve para dividir por ítem | [FUENTE 45] + [OPINIÓN] |

| Unidad | Supuesto | Costo de IA |
|---|---|---|
| Usuario gratis activo | 2 lecturas/mes × 1,2 ¢ | **2,4 ¢/mes** |
| Usuario al tope de cuota | 30 lecturas/mes | US$0,17–0,84/mes [DATO prompt] |
| Grupo de viaje (pase) | 25 boletas (pesimista 60 × 2,8 ¢) | **US$0,30** (pesimista US$1,68) |
| Cliente API | 1.000 lecturas | US$12 (rango US$6–28) |

### 6.3 Tabla "dinero desde el día 1" (por mes)

Supuestos comunes: IVA 19 % incluido en precios en pesos; Flow 2,89 % + IVA = 3,44 % del bruto, sin costo fijo [FUENTE 23]; costos fijos = Vercel Pro US$20 [FUENTE 21] + dominio ≈US$1,25 + contador **[ESTIMACIÓN US$30, rango 0–55]** = **US$51,25/mes**; con 1.000 pagantes (o 100 clientes API) se suma Supabase Pro US$25 [FUENTE 22] + ≈US$20 de uso extra; impuesto a la renta **[ESTIMACIÓN 10 % de la utilidad positiva; consultar contador]**. "IA" incluye el costo de los usuarios gratis que hay por cada pagante (conversión base 2 %, 2 lecturas/mes cada uno).

**Finalista 1 · Pase de viaje (CLP 3.990, ≈US$4,34)** — margen por pase **US$2,02**
| Pases/mes | Ingreso bruto | Sin IVA | Flow | IA (propia + gratis) | Fijos | **Ganancia neta** |
|---|---|---|---|---|---|---|
| 1 | US$4,3 | 3,6 | 0,1 | 1,5 | 51,25 | **−US$49** |
| 10 | 43,4 | 36,4 | 1,5 | 14,8 | 51,25 | **−US$31** |
| 100 | 433,7 | 364,5 | 14,9 | 147,6 | 51,25 | **+US$136** |
| 1.000 | 4.337 | 3.644,5 | 149,2 | 1.476 | 96,25 | **+US$1.731** |
Equilibrio: **≈25 pases/mes** (≈11 sin contador). Mes de equilibrio **[ESTIMACIÓN base]**: 3 pases en el mes 1 (preventa), 8 en el 2, 15 en el 3, 25–30 hacia el **mes 5–7**; pesimista: nunca; optimista: mes 3.

**Finalista 2 · API (US$29/mes por 1.000 lecturas; cobro con Lemon Squeezy 5 % + US$0,50, +1,5 % tarjetas internacionales según terceros [FUENTE 24])** — margen por cliente **US$14,6**
| Clientes | Ingreso | Comisión | IA | Fijos | **Ganancia neta** |
|---|---|---|---|---|---|
| 1 | US$29 | 2,4 | 12 | 51,25 | **−US$37** |
| 10 | 290 | 24 | 120 | 51,25 | **+US$85** |
| 100 | 2.900 | 239 | 1.200 | 96,25 | **+US$1.229** |
| 1.000 | 29.000 | 2.385 | 12.000 | 96,25 | **+US$13.067** |
Equilibrio: **≈3,5 clientes**. IVA: venta a empresas extranjeras podría ser exportación de servicios (verificar con contador). Mes de equilibrio **[ESTIMACIÓN]**: base mes 6–12; pesimista nunca (nadie compra); optimista mes 3. **Soporte técnico no incluido** en los costos (el dueño no es técnico).

**Finalista 3 · Rendición personal (CLP 2.990/mes, 30 lecturas)** — margen por pagante **US$0,50** (2 % de conversión)
| Pagantes | Ingreso | **Ganancia neta** |
|---|---|---|
| 1 | US$3,2 | −US$51 |
| 10 | 32,5 | −US$46 |
| 100 | 325 | **−US$2** |
| 1.000 | 3.250 | +US$359 |
Equilibrio: **≈104 pagantes** (≈5.200 usuarios activos gratis con 2 %).

**Control · (E) Grupos con saldos (CLP 2.790/mes por grupo)** — margen por pagante **US$0,56**
| Pagantes | Ingreso | **Ganancia neta** |
|---|---|---|
| 1 | US$3,0 | −US$51 |
| 10 | 30,3 | −US$46 |
| 100 | 303 | +US$4 |
| 1.000 | 3.033 | +US$418 |
Equilibrio: **≈92 grupos pagando** (≈4.600 grupos activos). **E pierde con números:** necesita ~4 veces más clientes que el pase para cubrir lo mismo, cobra meses más tarde y requiere 150–300 h de construcción.

### 6.4 Diseño del cobro del pase (paso a paso)

1. **Gratis (siempre):** una cuenta suelta como hoy (foto, reparto, cierre, WhatsApp) con **tope de 3 lecturas al mes por anfitrión** (≈3,6 ¢ de costo máximo); ingreso a mano ilimitado. Los invitados no escanean por cuenta del anfitrión.
2. **Muro de pago (dónde aparece):** al tocar "Juntar varias cuentas en un viaje" o al agregar la **2ª cuenta** a un viaje. Texto: "Pase de viaje CLP 3.990 · 30 días · todo el grupo · hasta 60 boletas · saldo final y transferencias mínimas".
3. **Pago:** enlace de Flow (Webpay, débito, crédito, transferencia); al volver, el viaje queda activo. Al inicio (preventa) se activa **a mano**.
4. **Abuso:** el pase cubre 60 lecturas en 30 días (peor caso 60 × 2,8 ¢ = US$1,68, el pase sigue siendo positivo); después, ingreso a mano. Se mantienen el tope diario global y el límite de gasto en la consola de Anthropic [DATO `docs/CUOTA_Y_USO.md`].
5. **Regla para ajustar lo gratis:** el costo de los usuarios gratis por cada pase vendido no puede superar **25 % del precio sin IVA (≈US$0,91)**. Si la conversión real es menor a ≈1,5 %, se baja el tope gratis (de 3 a 1 lectura/mes).
6. **Devolución:** si el viaje no ocurre, se devuelve (Flow cobra CLP 202 + IVA por devolución [FUENTE 23]).

### 6.5 Tres precios por finalista (con ganancia esperada y cómo se prueban en 2 semanas)

| Finalista | Bajo | Medio | Alto | Cómo se prueba |
|---|---|---|---|---|
| Pase de viaje (margen por pase, conversión 2 %) | CLP 1.990 → US$0,27 | **CLP 3.990 → US$2,02** | CLP 6.990 → US$4,65 | Rotar el precio en la oferta de preventa (1 de cada 3 grupos ve cada precio); elegir el que maximiza precio × tasa de pago |
| API (margen por cliente/mes, 1.000 lecturas) | US$19 → US$5,3 | US$29 → US$14,6 | US$49 → US$33,3 | Página con 3 planes + "solicitar llave"; contar solicitudes por plan; cobrar el primero a mano |
| Rendición personal (margen por pagante) | CLP 1.990 → −US$0,37 | CLP 2.990 → US$0,50 | CLP 4.990 → US$2,25 | Botón de pago "falso" con los 3 precios |

### 6.6 Sensibilidad (pase a CLP 3.990, margen por pase)

| Escenario | Margen por pase |
|---|---|
| Base (IA 1,2 ¢, 25 boletas, conversión 2 %) | **US$2,02** |
| Precio de IA ×3 | **−US$0,93** |
| Precio de IA ÷5 | US$3,20 |
| Usuarios escanean ×3 (pagos y gratis) | **−US$0,93** |
| IA ×3 y escaneos ×3 | −US$9,79 |
| Conversión 0,5 % / 2 % / 5 % | **−US$1,58** / US$2,02 / US$2,74 |
| Recompra del organizador en 12 meses 10 % / 25 % / 40 % (valor de vida ≈ margen ÷ (1 − recompra)) | US$2,24 / US$2,69 / US$3,37 |
| (Control E) retención mensual de pagantes 10 % / 25 % / 40 % → valor de vida | US$0,62 / US$0,75 / US$0,93 |

**Lectura:** lo que rompe el negocio **no es lo que pagan los que pagan, sino lo gratis**. Si la IA sube ×3 o la gente escanea ×3, hay que bajar el tope gratis o subir el precio a CLP 6.990. La regla 6.4.5 lo controla.

### 6.7 CAC por canal **[ESTIMACIÓN; ninguna cifra verificada]**

| Canal | Costo por organizador que paga | Comentario |
|---|---|---|
| Boca a boca / red del dueño por WhatsApp | US$0 (tiempo del dueño: ≈20 min por venta) | Solo para los primeros 10–30 |
| Contagio dentro del grupo (k 0,06 / 0,32 / 1,0) | US$0 | Ver B, 4.4 |
| Guía de propinas por país (SEO) | US$0 en caja, 20–40 h; resultados en 2–6 meses | Construida con `core/country-rules.js` |
| Grupos de viaje en Facebook/Reddit/Instagram (orgánico) | US$0, 2–4 h/semana | Sin parecer spam |
| Anuncios en Instagram/TikTok | US$5–30 por pase pagado | No antes de tener conversión medida |
| Microinfluencers de viajes | CLP 50.000–300.000 por publicación | Pago por resultados con código |
| Hostales / agencias / operadores | 20–30 % del pase como comisión | Ver la lista de aliados (7.6) |

---

## FASE 7 · La apuesta, el plan y el ataque

### 7.1 Prueba del unicornio (honesta)

- **Ingreso necesario:** con múltiplos de software de 2026 de **3,4–4,7× ingresos** (mediana pública; 4,0× en ventas privadas) [FUENTE 36], valer US$1.000 millones exige **US$210–295 millones de ingreso anual**; con un múltiplo de crecimiento excepcional (10× **[ESTIMACIÓN]**), **US$100 millones**.
- **Con el pase** (margen ≈US$2 sobre US$3,6 sin IVA): US$100 M de ingreso = **≈28 millones de pases al año** (≈77 mil grupos pagando cada día). Para comparar: Tricount, gratis, tiene 17–24 millones de **usuarios** en total [FUENTE 5].
- **Negocio de US$10–50 M:** 2,8–14 millones de pases al año. Requiere toda la Latinoamérica viajera y un canal de adquisición pagado que funcione: **no hay evidencia**.
- **Comparables [FUENTE]:** Splitwise, el líder de pago, levantó US$20 M en 2021 y no publica ingresos [FUENTE 31]; bunq compró Tricount (5,4 M usuarios) por un monto no revelado [FUENTE 32]; Settle Up ≈US$6 mil al mes (estimación débil) [FUENTE 12].
- **Veredicto: "proyecto de ingreso complementario".** Con éxito razonable: **US$100–2.000 al mes de ganancia**. Subiría a "negocio sólido de US$1 M al año" solo si en 12 meses se cumplen **todas**: ≥1.000 pases/mes, ≥25 % de organizadores que recompran, un canal pagado con CAC < US$2 y ventas fuera de Chile.

### 7.1-bis · Camino a unicornio con lo que ya tenemos (sección pedida por el dueño)

**Pregunta:** ¿qué complemento apoyaría el valor que ya tenemos, o qué podría llevar DiviCuenta a unicornio?

**Primero, los activos verificados en el repositorio** (corrijo cifras donde no calzan):
| Activo declarado | Lo que dice el repo |
|---|---|
| (1) Lector de "~46 países" con reglas locales y verificación aritmética | **Sí**, con matiz: 48 perfiles de país en `core/country-rules.js`, **43 países con boletas de prueba**; reconciliación con reglas deterministas [DATO] |
| (2) "211+ boletas etiquetadas" | **197** en `fixtures/manifest.json` [DATO]; las demás no están en el repo |
| (3) Costo ≈0,6–1,2 ¢ vs ~8 ¢ de Veryfi | **Sí** [DATO]; Veryfi US$0,08 con mínimo de US$500/mes [FUENTE 14]; ojo: Textract/Google ≈1 ¢ por página [FUENTE 18] y cualquiera paga a Anthropic lo mismo que nosotros |
| (4) Invitados sin registro en cuenta compartida en vivo | **Sí** [DATO] |
| (5) Español e inglés | Inglés en rama **sin fusionar** [DATO] |
| (6) Cobros pendientes + WhatsApp | **Sí**, guardado solo en el teléfono del anfitrión [DATO] |
| (7) PWA sin tienda | **Sí** [DATO]; ventaja para cobrar (sin comisión de tienda), desventaja para ser descubierta |

**Regla de cálculo para todos los caminos:** valoración de US$1.000 M ÷ múltiplo. Pesimista 3,4× (mediana pública mar-2026), base 5× (≈ mediana de fines de 2025 [FUENTE 36]), optimista 10× (crecimiento excepcional, [ESTIMACIÓN]) → **ingreso anual necesario: US$294 M / US$200 M / US$100 M**.

| Camino | Qué implica para llegar a US$100–294 M/año | Qué tendría que ser verdad | Foso | Quién ya está | Primer experimento de 30 días | Ganancia desde el día 1 |
|---|---|---|---|---|---|---|
| **(a) API / infraestructura de lectura de boletas para Latinoamérica** (contabilidad, pymes, facturación, bancos, billeteras, viajes) | A US$0,02–0,05 por lectura: **2.000–15.000 millones de lecturas al año**. Fetch, la mayor app de recibos de EE. UU., acumulaba ≈2.000 millones de recibos en total en 2022 [FUENTE 33] | Que las empresas paguen por "lectura verificada" en vez de usar un modelo de IA directo (0,1–0,7 ¢) o Textract/Google (≈1 ¢); que la factura electrónica (en Chile, México y Brasil los documentos entre empresas ya vienen estructurados) no reduzca la necesidad a boletas de consumo [OPINIÓN] | Bajo–medio: reglas + set de prueba se copian en semanas | Veryfi (≈US$12 M levantados), Mindee (US$16–24 M), Taggun, Tabscanner, Klippa (no verifiqué), Textract, Google [FUENTE 14–18, 37] | Página con la exactitud por país + 15 contactos de la lista 7.6; meta: 3 pruebas con llave y 1 cliente que pague US$29 | **Sí por cliente** (US$14,6/mes), negativa hasta ≈4 clientes |
| **(b) Gastos de pymes y equipos** (rendición, reembolsos, almuerzos de oficina) | A US$3 por usuario/mes: **2,8–8,2 millones de usuarios pagando** | Ganarle a un líder ya instalado con IA y WhatsApp | Bajo | **Rindegastos** (Visma): 5.963 clientes, 192 mil usuarios, 23 países, UF 0,05–0,2 por usuario/mes [FUENTE 19, 20] → **[ESTIMACIÓN]** ≈US$5–20 M/año; **Expensify**: US$142 M de ingreso en 2025, pérdida de US$21 M, valor bursátil US$90–235 M [FUENTE 35] | 30 contactos a contadores/pymes: ¿pagarían CLP 2.990/mes? | Negativa hasta ≈100 pagantes |
| **(c) "Dividir y pagar" embebido en restaurantes / POS / delivery** | Con una comisión de 0,5 % **[ESTIMACIÓN]** sobre lo pagado: **US$20.000–59.000 millones** pagados al año por la plataforma | Integraciones con POS, licencia de pagos, venta en terreno | Bajo (el POS tiene los datos) | **Justo** en Chile [FUENTE 28]; Fudo con QR de Mercado Pago [FUENTE 29]; **Sunday**: >US$140 M levantados, salió del 60 % de sus mercados [FUENTE 34]; Toast en EE. UU. | 10 conversaciones con restaurantes (sin construir) | No: meses de venta |
| **(d) Alianza de distribución con billeteras o bancos (B2B2C)** | Licencias de US$5–20 mil/mes por billetera **[ESTIMACIÓN]**: harían falta **≈400–4.900 billeteras** pagando; en Chile hay un puñado | Que Mercado Pago/MACH/Tenpo prefieran licenciar a construirlo (lo construyen en semanas) | Bajo | Mercado Pago "Amigos" [FUENTE 11], Tenpo [FUENTE 30] (sin lectura de ítems) | 3 conversaciones con producto de billeteras | No: ciclo de 6–12 meses |
| **(e) Fintech de cobro entre personas con WhatsApp como interfaz** | Las transferencias entre personas son **gratis** (Mercado Pago, Tenpo, Pix): la comisión tiende a 0; el ingreso vendría de crédito o saldo, lo que exige licencia y capital | Registro ante la CMF bajo la Ley Fintec [FUENTE 42], capital de millones, equipo | Medio si se logra la licencia | Bancos, billeteras | Ninguno barato | No |
| **(f) Datos agregados y anónimos de precios/consumo** | El único comparable de "datos de recibos" que llegó a unicornio es **Fetch**: US$2.500 M de valoración en 2022 con **13 millones de usuarios activos** [FUENTE 33], vendiendo a marcas de consumo masivo | Millones de boletas al mes con consentimiento; hoy **no se guardan** ítems ni imágenes [DATO]; Ley 21.719 [FUENTE 26] | Alto si se tuviera escala | Fetch (EE. UU.), paneles de consumo | No recomendado sin abogado | No |
| **(g1) Infraestructura de gastos de viaje para agencias/OTAs** | Igual que (a) | Que agencias como Cocha o Despegar quieran ofrecer "cuentas del viaje" a grupos | Medio | Splitwise Trip Pass [FUENTE 1] | 2 conversaciones con agencias | No |
| **(g2) Vender el set de evaluación como benchmark** | Imposible a esa escala | — y **las fotos son de terceros**: solo uso interno (`CLAUDE.md`) | — | — | No hacer | No |
| **(g3) Venta de la tecnología a un actor grande** (Splitwise, bunq, Visma/Rindegastos, billeteras) | No es unicornio; **[ESTIMACIÓN]** US$50–500 mil si hay tracción | Tracción visible | — | — | — | Única |

**Conclusión honesta:** **no hay un camino creíble a unicornio** desde estos activos. Ninguno de los caminos tiene foso: el corazón es un buen *prompt*, reglas por país y un set de prueba, que un equipo con dinero replica en semanas, y el costo de leer cae para todos a la vez. El camino "menos imposible" es **(a) infraestructura de lectura para Latinoamérica**, y su **eslabón más débil es la demanda con precio**: las empresas que más necesitan leer boletas (rendición de gastos) ya lo tienen resuelto con IA propia (Rindegastos incluye "Scanit 2.0" y WhatsApp [FUENTE 19]), y los precios de lectura bajan hacia 1 ¢. **Lo realista:** un negocio rentable **de decenas de miles de dólares al año** (pase de viaje) o, si el API encuentra un nicho, **de cientos de miles**. Ninguna cifra de este documento sostiene "N millones".

### 7.2 Recomendación única

| | |
|---|---|
| **Concepto** | **Pase de viaje**: grupo temporal de 30 días que junta todas las boletas, saldo neto en la moneda de casa, mínimo de transferencias, resumen para WhatsApp |
| **Segmento inicial** | Grupos de 3–8 amigos o familia **chilenos** que viajan (al extranjero o dentro de Chile), coordinados por WhatsApp |
| **País de arranque** | **Chile** (precio en pesos, Flow, red del dueño); segundo paso: argentinos y brasileños que visitan Chile (6 M de llegadas en 2025 [FUENTE 27]) |
| **Modelo** | **Pago único por adelantado** que paga el organizador; gratis acotado en dólares (6.4) |
| **Precio a probar** | **CLP 3.990** por viaje (≈US$4,3), probando además CLP 1.990 y 6.990 en la preventa |
| **Cobro paso a paso** | Ver 6.4: gratis = cuenta suelta con 3 lecturas/mes → muro al juntar la 2ª cuenta en un viaje → enlace de Flow → viaje activo (a mano en la preventa) → 60 lecturas en 30 días → devolución si no hay viaje |
| **Métrica norte** | **Viajes pagados que llegan a "todos a mano"** por mes |
| **Ganancia del dueño por mes** | 10 pases: **−US$31** (−US$1 sin contador) · 100 pases: **+US$136** · 1.000 pases: **+US$1.731** |
| **Se deja de hacer ya** | Nuevas reglas de prompt y boletas de evaluación sin fallos de usuarios reales (la calidad ya cuadra 94–100 %) · ser "mundial" · grupos permanentes con identidad · asignar hablando · restaurantes · bot de WhatsApp pagado |
| **No se construye nunca** (salvo evidencia nueva) | Mover dinero entre personas dentro de la app · vender datos de boletas · app nativa antes de 1.000 pases/mes · publicidad en la app |

**Qué evidencia cambiaría la recomendación:** (1) 0 pases con ≥20 grupos que viajan → plan B: API; (2) si la conversación con hermano/amigos muestra que **sí** repiten cenas cada semana y piden saldos → revisar E; (3) si una empresa de la lista 7.6 ofrece pagar por el lector en la primera conversación → el API pasa adelante.

### 7.3 Plan de 90 días (semana a semana)

Costo en US$ de caja y horas del dueño. "Asistente" = sesión de Claude que programa.

| Sem. | Qué se hace | Qué se mide | US$ | Horas | Hito / criterio |
|---|---|---|---|---|---|
| 1 | Conversación con hermano y amigos (preguntas de A, 2.7). Correr las consultas SQL. Mirar facturación de Vercel/Supabase/Anthropic. Configurar límite de gasto en Anthropic | ¿Hubo una 2ª vez sin pedirla? ¿Viajan en grupo? | 0 | 4 | Datos reales por primera vez |
| 2 | **Legal mínimo, parte 1:** decidir titular (persona natural con inicio de actividades o SpA por "Empresa en un día"), consulta a contador (IVA, boleta electrónica del SII), completar el PR #94 con titular y correo **de contacto del proyecto** (no el personal) | Costo legal real | 0–55 | 4 | Saber cuánto cuesta cobrar |
| 3 | **Preventa del pase** (prototipo de B, 4.7): mensaje a ≥20 grupos que viajan en ≤60 días; enlace de Flow; 3 precios rotados. Prueba de 5 grupos en paralelo (`docs/PRUEBA_5_GRUPOS.md`) | Pagos / grupos contactados por precio | 0 (Flow cobra solo si hay venta) | 6 | **Primer peso** |
| 4 | Comparación con competidores (A, 2.6). Atender (en modo conserje) a quienes pagaron | Ítems exactos vs. 3 apps | 0–10 | 4 | ¿"Leemos mejor afuera" es verdad? |
| 5 | **Decisión día 30.** Si ≥3 pases pagados: construir. Si 0 con ≥20 grupos: parar y pasar a plan B. **Experimento de cobertura (3 h, sin construir):** página del API + 10 contactos de 7.6 | Pases, respuestas de empresas | 0 | 4 | **Criterio de abandono 1** |
| 6–8 | Asistente construye el viaje (grupo temporal, saldo neto, moneda de casa, cierre, muro de pago con Flow) — 60–120 h de asistente; casos en `check-split-core`, `e2e-v2` y `a11y-v2` como pide `CLAUDE.md`. **Legal parte 2:** publicar política y términos revisados por abogado antes de vender fuera del círculo cercano | Tests en verde | 20 (Vercel Pro) + abogado **[ESTIMACIÓN CLP 150–600 mil]** | 6/sem | Pase automático en producción |
| 9 | Guía de propinas: 5 países (Perú, Argentina, Brasil, México, EE. UU.) desde `core/country-rules.js` | Visitas de búsqueda | 0 | 3 | Canal gratis en marcha |
| 10 | 3 hostales/operadores en Santiago o Valparaíso con QR y comisión del 25 % | Pases por canal | 0–30 (impresión) | 4 | |
| 11 | Agregar eventos de 7.4 a `dc_events` (requiere migración) | Embudo del pase | 0 | 2 | |
| 12 | Revisión: precio ganador, conversión real, costo gratis por pase (regla 6.4.5) | Margen real | 0 | 2 | |
| 13 | **Decisión día 90** | — | — | 2 | **Criterio de abandono 2** |

**Criterios de abandono o giro:**
- **Día 30:** 0 pases con ≥20 grupos que viajan contactados → parar el pase; probar API 30 días; si tampoco hay interés, DiviCuenta queda como hobby gratuito con cuota baja.
- **Día 60:** <10 pases acumulados → no invertir en canales pagados.
- **Día 90:** <15 pases en el último mes o margen real <US$1 por pase → parar o subir precio a CLP 6.990 y repetir 30 días.
- **Prueba de 5 grupos:** si ≤1 de 5 repite sin pedirlo y ninguno viaja, el producto de restaurante solo no tiene futuro comercial.

**Primeros 100 usuarios y 10 pagantes sin presupuesto:** 20–40 grupos de la red del dueño y de sus amigos (hermano incluido) + contagio dentro de cada grupo (4–6 personas por grupo ⇒ 100 usuarios ≈ 20 grupos) + grupos de viaje en redes + 3 hostales. Los 10 pagantes salen de la preventa y de los primeros viajes.

**Tareas legales mínimas antes de cobrar o crecer:** (1) titular definido e inicio de actividades en el SII; (2) boleta electrónica de servicios (sistema gratuito del SII) o venta a través de un comercio que la emita; (3) política de privacidad publicada (PR #94 completo + abogado) que diga que la foto se envía a un proveedor de IA en EE. UU. y **no se guarda**; (4) términos y condiciones con política de devolución y derechos del consumidor (Ley 19.496; verificar con abogado); (5) Vercel Pro (uso comercial) [FUENTE 21]; (6) cuenta de Flow; (7) límite de gasto en Anthropic; (8) preparar la Ley 21.719 (vigente desde el 1-dic-2026 salvo aplazamiento; primer año con amonestación para empresas pequeñas según fuentes secundarias [FUENTE 26]).

### 7.4 Tablero y alertas

| Métrica | Definición exacta | Fuente | Alarma |
|---|---|---|---|
| Viajes pagados que llegan a "todos a mano" (**norte**) | Pases con todos los miembros en "Ya pagó" ≤14 días después del cierre / mes | Nuevo evento `trip_closed` + `paid` | <60 % de los pases |
| Pases vendidos | nº de pagos confirmados por Flow / mes | Nuevo evento `pass_paid` | Baja 2 semanas seguidas |
| Conversión del muro | `pass_paid` / `pass_offer_shown` | Nuevos eventos | <5 % |
| Costo gratis por pase | Σ costo de lecturas de usuarios sin pase / pases del mes | `dc_scan_log.cost_cents` | >US$0,91 (regla 6.4.5) |
| Costo de IA por boleta | Promedio de `cost_cents` | `dc_scan_log` (consulta "Resumen por mes") | >1,5 ¢ |
| % que cuadra sola | `scan_ok` con `ok` / `scan_ok` | `dc_events` (consulta existente) | <90 % |
| Boletas por viaje | nº de cuentas por viaje pagado | Nuevo evento `trip_bill_added` | <5 |
| Invitado → organizador | % de miembros que luego crean un viaje propio en ≤90 días | `dc_bill_members` + `trip_created` | <2 % |
| Recompra del organizador | % de compradores con un 2º pase en 12 meses | `pass_paid` por usuario | <10 % a los 6 meses |
| Gasto diario total de IA | Σ `cost_cents` del día | `dc_scan_log` | >US$1/día sin ventas |

**Agregar a `dc_events`** (la lista de eventos está cerrada en la base; requiere una migración nueva, no la hago aquí): `pass_offer_shown`, `pass_checkout_click`, `pass_paid`, `trip_created`, `trip_bill_added`, `trip_closed`, `debt_settled`, `guest_to_host`.

### 7.5 Ataque final (pre-mortem)

**Las 5 razones por las que esto fracasa** [ESTIMACIÓN de probabilidad]
| # | Razón | Prob. | Mitigación |
|---|---|---|---|
| 1 | Los grupos no pagan ni CLP 1.990: "lo anotamos en el chat" | 45 % | Preventa antes de construir; matar en el día 30 |
| 2 | No hay suficientes viajes en la red del dueño para llegar a 25 pases/mes y ningún canal escala | 35 % | Guía de propinas (SEO) y hostales; aceptar que puede quedar en ingreso de bolsillo |
| 3 | El gratis cuesta más de lo que dejan los pases (conversión <1,5 % o IA más cara) | 20 % | Regla 6.4.5; bajar el tope gratis; subir precio |
| 4 | Un problema legal o de confianza (boleta con datos personales, reclamo) frena todo | 10 % | Política y términos antes de vender a desconocidos; no guardar imágenes |
| 5 | El dueño se queda sin tiempo o energía (dependencia de una persona) | 30 % | Plan de 2–6 h/semana; nada que exija soporte 24/7 |

**5 creencias del dueño o de estos documentos que los datos no sostienen**
1. **"Nuestra lectura de cualquier país es la ventaja."** Es buena, pero no es foso: el modelo es el mismo para todos y la competencia declara 99 %+ [FUENTE 7]; además, no está medido contra competidores (A, 2.6).
2. **"Tenemos 211+ boletas de ~46 países" y "14/14, 13/13".** El repo tiene **197 de 43**; los sets citados no están [DATO].
3. **"Se puede cobrar por escaneos o suscripción."** La referencia es gratis (Tricount, billeteras); freemium convierte ≈2 % [FUENTE 39, 5, 11].
4. **"Los invitados sin registro son la palanca de crecimiento."** No hay un solo dato de conversión invitado → anfitrión; el k estimado es 0,06–1,0 (B, 4.4).
5. **"Dividir una cuenta se usa seguido"** y **"Grupos con saldos es la mejor apuesta".** Una cena es ocasional; E necesita ≈92 grupos pagando para cubrir US$51/mes y cobra meses más tarde que el pase (6.3).

**3 preguntas que solo el dueño puede responder (y cómo cambian la recomendación)**
1. **¿Cuántas horas por semana puede dedicar durante 90 días, y quiere una empresa o un ingreso complementario?** <3 h → solo preventa + conserje, sin construir; 6+ h → el plan completo; "quiero empresa" → aceptar que haría falta otro producto o socio, porque este no escala a eso.
2. **¿Cuánto riesgo legal tolera y cuánto capital arriesgaría (abogado, contador, Vercel Pro)?** Si no quiere gastar ≈US$200–700 en lo legal → no cobrar a desconocidos; quedarse en preventa con conocidos o dejarlo gratis como hobby.
3. **¿Tiene acceso a un socio técnico o a empresas que lean boletas (contadores, rendición, billeteras)?** Si sí → el API (plan B) puede pasar a ser la apuesta, porque su margen por cliente es 7 veces el de un pase y necesita solo ≈4 clientes para cubrir los costos fijos.

### 7.6 Diez compradores o aliados potenciales concretos (para las hipótesis B y D)

Encaje **[OPINIÓN, no verificado con ellos]**. **Contacto:** siempre por canales públicos de la empresa (formulario, LinkedIn de producto o alianzas); **nunca** con el correo personal del dueño (usar un correo del proyecto).
| # | Empresa (país) | Hipótesis | Por qué podría interesar | Cómo contactarlos |
|---|---|---|---|---|
| 1 | **Rindegastos** (Chile, grupo Visma; 23 países) [FUENTE 19, 20] | B (y benchmark) | Ya lee con IA ("Scanit 2.0"); podría interesarle comparar exactitud en boletas extranjeras de viajes de negocio o reglas de propina/servicio por país | WhatsApp y formulario comercial publicados en su sitio; LinkedIn de su CEO/producto |
| 2 | **Nubox** (Chile, contabilidad pyme) | B | Captura de boletas de gastos de pymes | Formulario de alianzas / LinkedIn |
| 3 | **Defontana** (Chile, ERP pyme) | B | Igual que Nubox | Formulario / LinkedIn |
| 4 | **Bsale** (Chile, Perú, México: POS y documentos electrónicos) | B/D | Pymes con gastos; también restaurantes | Formulario / LinkedIn |
| 5 | **Buk** (Chile/Latam, RR. HH.) | B | Reembolsos de gastos de trabajadores | Formulario de partners |
| 6 | **Clara** (México/Brasil/Colombia, tarjetas corporativas) | B | Conciliar comprobantes con gastos de tarjeta | LinkedIn de producto / alianzas |
| 7 | **Tenpo** y **MACH** (billeteras, Chile) [FUENTE 30] | B (marca blanca, d) | Ya tienen "dividir gastos" por monto, no por ítem | LinkedIn de producto; equipos de alianzas |
| 8 | **Cocha** (agencia de viajes, Chile) | g1 / canal del pase | Viajes de grupo: "cuentas del viaje" como beneficio | Área de alianzas / LinkedIn |
| 9 | **Justo**, **Fudo**, **Toteat** (POS para restaurantes, Chile) [FUENTE 28, 29] | D | Probablemente **no compran** (tienen los ítems); preguntarles igual por "boletas de otros locales" o grupos grandes | Formularios comerciales |
| 10 | **Desarrolladores de apps de dividir cuentas** (SPLIIT Pro, SplitterUp, clones de las tiendas) | B | Necesitan leer boletas y hoy pagan a OpenAI/Anthropic directamente | Páginas de contacto, Reddit (r/SideProject), Product Hunt |

---

## Preguntas abiertas
1. Resultado de la preventa (semana 3) y de la conversación con hermano/amigos.
2. Costo legal y tributario real (contador y abogado).
3. ¿Está activa la cuota en producción (migraciones ejecutadas)?
4. Precisión de la competencia en boletas extranjeras (A, 2.6).
5. Turismo emisivo chileno (tamaño del segmento).
6. Formato oficial del timbre del SII (confirmar que no trae el detalle de ítems).

## Apéndice de fuentes nuevas (consultadas el 2026-10-22)
- 18. Textract y Google Document AI, ≈US$10 por 1.000 páginas (fuentes secundarias; verificar en las páginas oficiales): https://wring.co/blog/aws-textract-pricing-guide · https://cloud.google.com/document-ai/pricing
- 20. Portalinnova, cifras 2025 de Rindegastos: https://portalinnova.cl/?p=199326
- 24. Lemon Squeezy, comisión 5 % + 50¢: https://lemonsqueezy.com/help · recargos internacionales (tercero): https://dodopayments.com/blogs/lemonsqueezy-review
- 29. Fudo, QR dinámico: https://intercom.help/fudoapp/es/articles/11732028-qr-dinamico
- 33. SiliconANGLE, Fetch Rewards a US$2.500 M (2022): https://siliconangle.com/2022/04/07/mobile-shopping-rewards-startup-fetch-rewards-raises-240m-2-5b-valuation/
- 34b. Pulse 2.0, Sunday Serie B de US$21 M (nov-2025): https://pulse2.com/sunday-raises-21-million-series-b/
- 35. StockAnalysis, Expensify (EXFY): https://stockanalysis.com/stocks/EXFY
- 36. Múltiplos de software: Clouded Judgement 26-dic-2025 (4,7× mediana): https://cloudedjudgement.substack.com/p/clouded-judgement-122625-exuberance · Aventis Advisors (3,4× mar-2026): https://aventis-advisors.com/saas-valuation-multiples/
- 37. CB Insights, Veryfi y Mindee: https://www.cbinsights.com/company/veryfi/financials · https://www.cbinsights.com/company/mindee/financials
- 43. Dólar observado (agosto 2026) y UF (septiembre 2026), fuentes secundarias: https://portalinnova.cl/dolar-en-chile-hoy-lunes-10-de-agosto-de-2026-precio-oficial-del-banco-central/ · https://monedario.cl/uf-hoy/
