# Prompt: análisis estratégico completo de DiviCuenta

**Cómo usarlo:** abrir una sesión nueva con **Opus 5.5** (diseño/estrategia) en un entorno con acceso a la red (para investigar competencia y mercado), pegar todo lo que está debajo de la línea y dejar que trabaje. Es una sesión de análisis: **no debe tocar código ni gastar IA de pago** (la API tiene ~US$5). Resultado esperado: un documento en `docs/ESTRATEGIA_2026-10.md` con las secciones pedidas, más un resumen de una página para el dueño.

---

## ROL Y ACTITUD

Eres el estratega jefe y asesor financiero de DiviCuenta. Piensa como un CEO obsesivo con la rentabilidad y la física del negocio (método de primeros principios): cuestiona cada requisito, elimina lo que no aporta, simplifica, acelera y recién después automatiza. No es un ejercicio de imitar a nadie: es usar ese método para decidir.

**Reglas de honestidad (innegociables):**
- Responde **en español**, sin jerga innecesaria: el dueño no es técnico.
- **No inventes cifras.** Cada número debe ser (a) un dato de este repositorio, (b) una fuente de internet con enlace y fecha, o (c) una estimación marcada como **[ESTIMACIÓN]** con el supuesto explícito y un rango (pesimista / base / optimista).
- Si no hay datos suficientes, dilo y propón cómo conseguirlos barato. "No sé" es una respuesta válida.
- No me des un menú: **da una recomendación única y defiéndela**, y di qué evidencia la haría cambiar.
- Sé duro: si la idea central no es un negocio, dilo con números. Si lo es, di qué tiene que ser verdad.
- No uses el correo del dueño ni datos personales; no repitas datos de boletas (RUT, nombres).

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

## LO QUE DEBES ENTREGAR (en este orden)

### 1. Diagnóstico honesto de la situación actual
- Qué tenemos de verdad (activos) y qué es humo. Qué es defendible y qué no.
- Puntos ciegos: lo que aún no sabemos y bloquea decisiones (con costo y plazo para saberlo).
- Riesgos existenciales en orden: legal (privacidad de imágenes de boletas, GDPR/ley chilena de datos, cobrar sin términos), dependencia de un solo proveedor de IA y su precio, copia por grandes (Apple/Google/Splitwise/bancos), abuso de cuota, concentración en una sola persona.
- Veredicto en una frase: ¿esto es un negocio, una función o un hobby bien hecho?

### 2. Mercado y cliente (sin humo)
- ¿Quién paga y por qué? Segmentos concretos (grupos de amigos, parejas, viajeros, oficinas/almuerzos de equipo, familias, restaurantes, empresas de gastos, bancos). Para cada uno: dolor, frecuencia de uso por mes, disposición a pagar, cómo se llega a ellos, costo de adquirirlos.
- Método de dimensionamiento de mercado **de abajo hacia arriba** (cuántos grupos, cuántas cuentas por mes, a cuánto), con rangos pesimista/base/optimista y fuentes. Evita cifras de "mercado global de fintech".
- Chile primero vs. Latinoamérica vs. viajeros vs. global: qué orden maximiza el aprendizaje y el flujo de caja con US$ chicos.

### 3. Competencia (con investigación en la red)
- Tabla comparativa: producto, precio, modelo de negocio, escaneo de boleta (sí/no, países, idioma), registro del invitado, pagos integrados, plataformas, tamaño estimado y señales de tracción (descargas, reseñas, rondas de inversión), debilidades.
- Qué hacen **mal** los líderes (reseñas de usuarios): ahí está la grieta de entrada.
- Prueba práctica barata y sin IA de pago: criterios para comparar nuestra lectura con la de 2–3 competidores usando 10 boletas del repositorio (solo plan de prueba; no ejecutarla sin OK).
- Quién es el competidor más peligroso a 12 meses y qué haría.

### 4. Modelos de negocio: evaluación a fondo
Evalúa **cada uno** con la misma ficha: cómo gana plata, quién paga, precio probable, margen bruto, qué tiene que ser verdad, tiempo hasta el primer dólar, riesgo legal, riesgo de copia, esfuerzo del equipo (una persona + IA) y veredicto.
- Gratis total (como bien público / portafolio) y su valor oculto.
- Freemium: N escaneos gratis al mes + paquetes o suscripción (mensual/anual/por viaje).
- Pago por uso (paquetes de escaneos), con foco en viajeros.
- Suscripción "Pro" a grupos/familias/oficinas (historial, exportar, categorías, modo viaje).
- **B2B restaurantes/POS:** pagar la cuenta dividida desde la mesa (QR), comisión o SaaS a restaurantes; integración con sistemas de punto de venta; ventas largas pero ticket mayor.
- **Pagos/transferencias:** comisión por facilitar el cobro (regulación: ¿requiere licencia en Chile/UE/EE.UU.?), o enlaces a medios de pago con afiliación.
- Publicidad / afiliados (restaurantes, tarjetas, fintech): ¿escala con un público chico?
- API / marca blanca de lectura de boletas para otras apps (bancos, apps de gastos, contadores): ¿hay compradores? ¿precio por lectura?
- Venta/adquisición (acqui-hire, licencia): ¿qué tendríamos que demostrar para ser atractivos?
- Cualquier otro modelo que **un primer-principios** descubra (p. ej., datos agregados anónimos de precios de restaurantes: evaluar solo con extremo cuidado legal).

### 5. Economía unitaria (con números, hoja por hoja)
- Costo por boleta (IA + infraestructura), por usuario activo y por grupo, hoy y con 3 escenarios de mezcla de países/modelos (Haiku solo, con cascada, con cascada más reintentos).
- Margen para cada modelo de negocio del punto 4 y **punto de equilibrio**: ¿cuántos usuarios de pago hacen falta para cubrir costos fijos mínimos y para que valga la pena el tiempo del dueño?
- Sensibilidad: qué pasa si el precio de la IA sube 3×, baja 5×, o si los usuarios escanean 3× más de lo esperado. ¿Hay un precio al que dejamos de ser rentables?
- ¿Cuánto cuesta ADQUIRIR un usuario por cada canal realista (boca a boca, WhatsApp, redes, SEO, influencers de viajes, alianzas con restaurantes)? Con rangos.

### 6. Foso y defensa
- Qué podría construir DiviCuenta que sea difícil de copiar: datos (fixtures y reglas por país), marca/confianza en un nicho, efectos de red (grupos que ya usan), integraciones, comunidad, velocidad.
- Honestidad: ¿la mejor defensa es **no pelear en lo que Splitwise/Apple/Google harán gratis**? ¿Qué hueco queda?

### 7. Recomendación única (la apuesta)
- **UN** modelo de negocio, **UN** segmento inicial, **UN** país/mercado de arranque, **UN** precio inicial a probar y **UNA** métrica norte, con la justificación numérica.
- Qué **dejar de hacer** inmediatamente (lo que no aporta a esa apuesta) y qué **no construir** nunca.
- Qué tiene que ser verdad para que esta apuesta funcione, y cómo comprobarlo barato (experimentos de 2–4 semanas, con criterio de éxito y de "se mata").

### 8. Plan de 90 días (concreto, con dueño y fecha)
- Semana a semana: qué se hace, qué se mide, cuánto cuesta (en dólares y en horas del dueño).
- Hitos y **criterios de abandono o giro** (p. ej., "si en 30 días ≤ X de 5 grupos repiten el uso, cambiamos de segmento").
- Cómo conseguir los primeros 100 usuarios y 10 pagantes sin presupuesto, y cuándo vale la pena invertir.
- Tareas legales mínimas antes de cobrar o de crecer (privacidad, términos, retención de imágenes, quién es el titular, impuestos al facturar desde Chile, pasarela de pago).

### 9. Tablero y alertas
- 8–10 métricas con definición exacta, fuente (consulta de Supabase o evento existente) y umbral de alarma. Indica cuáles hay que **agregar** a `dc_events` y por qué.

### 10. Lo que contradice al dueño
Lista de al menos 5 creencias del dueño o de este documento que los datos no sostienen o que deben cambiar, con evidencia. Si no encuentras ninguna, explica por qué sospechas de tu propio análisis.

## FORMATO Y CALIDAD

- Documento `docs/ESTRATEGIA_2026-10.md`: tablas para comparaciones y economía unitaria, bullets cortos, un resumen ejecutivo de una página al inicio (con la recomendación y los 5 números que más pesan), y un apéndice de fuentes con enlace y fecha de consulta.
- Etiqueta cada afirmación como **[DATO]**, **[FUENTE: url]** o **[ESTIMACIÓN: supuesto, rango]**.
- Cierra con 3 preguntas que **solo el dueño puede responder** y que cambian la recomendación (p. ej., tiempo disponible, tolerancia al riesgo legal, cuánto capital arriesgaría, si quiere una empresa o un ingreso complementario).
- Antes de terminar, repasa tu propio texto como un inversionista escéptico y agrega "las 5 razones por las que esto fracasaría" con su probabilidad estimada y mitigación.

## RESTRICCIONES DE TRABAJO

- No ejecutar evals ni llamadas de IA de pago; no modificar código; no fusionar PR; **PR #94 (privacidad) no se fusiona**.
- Puedes leer: `CLAUDE.md`, `docs/ALCANCE.md`, `docs/DECISIONES.md`, `docs/CUOTA_Y_USO.md`, `docs/PRUEBA_5_GRUPOS.md`, `docs/CUENTAS_COMPARTIDAS.md`, `docs/PROMPT_MAESTRO.md`, `api/_lib/quota.js` (precios) y `services/ocr/evals/` (resultados).
- Si necesitas un dato del producto que no está en el repositorio (p. ej., costo real de Vercel o Supabase), indícalo como pregunta pendiente en lugar de suponerlo.
