# Sesión A · Diagnóstico honesto y mercado (Fases 1 y 2)

Fecha: 2026-10-22 · Autor: Claude (Opus 5.5), como estratega · Lee esto antes de B y C.
Etiquetas: **[DATO]** = del repositorio · **[FUENTE n]** = ver apéndice (consultado el 2026-10-22) · **[ESTIMACIÓN]** = supuesto con rango · **[OPINIÓN]** = juicio mío.

---

## Resumen de una página

1. **Lo que hay es real y está bien hecho, pero hoy es una función, no un negocio.** La lectura de boletas de muchos países con verificación contra el total impreso funciona y es barata (≈0,6–1,2 ¢ de dólar por boleta) **[DATO]**. Pero no hay un solo peso de ingreso, ni métricas de uso, ni términos, ni política de privacidad publicada **[DATO]**.
2. **Corrección de cifras internas:** el prompt habla de "211+ boletas de ~46 países". En el repositorio (rama `docs/prompt-estrategia` y `main`) hay **197 boletas de 43 países** en `fixtures/manifest.json` y **48 perfiles de país** en `core/country-rules.js` **[DATO]**. Los sets "14 ciegas (CN, KR, DE, JP, HK, TW, FR, IT)" y "13 prioritarias (CL, MX, PE, PT, AU, NZ)" **no están en el repositorio** (no hay boletas de CN, HK, TW, FR, PT, AU ni NZ en el manifest) **[DATO]**: no los uso como evidencia hasta que se suban.
3. **Leer boletas ya no diferencia.** Splitwise Pro lo hace (solo de pago) **[FUENTE 1]**; splitty dice "99 %+ de precisión" **[FUENTE 7]**; Apple lo trae en iOS 27, pero **solo en EE. UU.** y con Apple Cash **[FUENTE 9]**. Nuestra ventaja real y medible es otra: **boletas de otros países** (propina, servicio, IVA incluido, monedas, separadores) **y la verificación contra el total**. Eso pesa **cuando la boleta es extranjera**, es decir, **en viajes**.
4. **El problema central es la frecuencia y la disposición a pagar, no el costo.** El costo de IA por usuario es casi cero frente a cualquier precio. Lo difícil: dividir una cuenta de restaurante pasa pocas veces al mes **[ESTIMACIÓN]**, y el líder gratis (Tricount, 17–24 millones de usuarios, "100 % gratis, sin anuncios ni límites") **[FUENTE 5]** fija el precio de referencia en cero.
5. **Las cifras del mercado son pequeñas:** Splitwise, el líder de pago, levantó US$20 M en 2021 **[FUENTE 31]** y no publica ingresos; Settle Up tendría ≈50 mil descargas al mes y ≈US$6 mil de ingreso mensual (estimación de un tercero, débil) **[FUENTE 12]**, es decir, **≈12 centavos de dólar por descarga**.
6. **Gastos fijos ocultos antes de cobrar:** el plan gratis de Vercel **prohíbe uso comercial** **[FUENTE 21]**: cobrar obliga a pasar a Pro (US$20/mes). Supabase gratis pausa el proyecto tras una semana sin actividad y tope de 200 conexiones en vivo **[FUENTE 22]**.
7. **Riesgo legal más cercano:** la Ley 21.719 de datos personales entra en vigencia el **1-dic-2026** (hay proyecto para aplazarla a 2027) **[FUENTE 26]**. Las fotos de boletas pueden traer RUT o nombres, y se envían a un proveedor en EE. UU. Sin política, términos ni titular, **no se puede cobrar ni mostrar a desconocidos** (coincide con `docs/PRUEBA_5_GRUPOS.md`).
8. **Veredicto en una frase:** *hoy es una función excelente con forma de hobby serio; puede ser un ingreso complementario si encuentra una ocasión por la que la gente pague una vez (el viaje), y no hay evidencia de que pueda ser más que eso.*

---

## FASE 1 · Diagnóstico honesto

### 1.1 Activos reales vs. humo

| Activo | ¿Real? | ¿Defendible? | Evidencia |
|---|---|---|---|
| Lector de boletas con reglas por país (48 perfiles) y reconciliación aritmética (`recon()`, reglas "cargo ya incluido" y "signo cambiado") | **Real** | **Poco**: el modelo es el mismo para todos; lo propio son las reglas y el set de prueba | [DATO] `core/country-rules.js`, `api/scan-receipt.js`, DECISIONES 2026-10-22 |
| Set de evaluación: 197 boletas reales de 43 países, transcritas a mano | **Real** | **Medio**: copiar las reglas es fácil, juntar y etiquetar 200 boletas cuesta semanas | [DATO] `services/ocr/evals/fixtures/manifest.json` |
| Calidad medida: 25 variadas → 96 % cuadra, ~0,7 ¢; 32 de la web → 30/32 cuadran (94 %), 1,22 ¢, y 32/32 tras dos reglas deterministas | **Real** | — | [DATO] `CLAUDE.md`, DECISIONES |
| Costo por boleta ≈0,57–1,2 ¢ promedio; 2–2,8 ¢ cuando relee Sonnet | **Real** | No es foso (cualquiera paga el mismo precio a Anthropic) | [DATO] `CLAUDE.md`, `api/_lib/quota.js` |
| Cuenta compartida en vivo, invitados sin registrarse (sesión anónima + RLS) | **Real** | **No**: Tab, divídelo, SPLIIT y otros lo hacen | [DATO] `docs/CUENTAS_COMPARTIDAS.md`; [FUENTE 8] |
| "Cobros pendientes" + recordatorio por WhatsApp | **Real, pero frágil**: vive en un solo teléfono (45 días, hasta 30 cuentas) | No | [DATO] `v2/app.js` línea ~253 |
| Inicio de sesión del anfitrión con Google | **Decidido pero no está en v2** (no aparece en `v2/app.js` ni `v2/sync.js`) | — | [DATO] búsqueda en el código |
| Métricas de embudo (`dc_events`, `dc_scan_log`) | **Programadas, sin datos de personas** | — | [DATO] `docs/CUOTA_Y_USO.md` |
| Uso real | **Humo por ahora**: un hermano y un par de amigos, sin métricas ni entrevistas | — | [DATO] encargo del dueño |
| "211+ boletas, ~46 países", "14/14 ciegas", "13/13 prioritarias" | **No verificable en el repo** | — | [DATO] ver resumen, punto 2 |
| Inglés | En rama sin fusionar (`feat/idioma-ingles`) | — | [DATO] prompt |

### 1.2 Puntos ciegos que bloquean decisiones

| Punto ciego | Por qué bloquea | Cómo resolverlo barato | Costo | Plazo |
|---|---|---|---|---|
| ¿Alguien vuelve a usarla sin que se lo pidan? | Sin repetición no hay negocio de consumo | Conversación con hermano/amigos (preguntas en 2.7) + consultas SQL + prueba de 5 grupos | US$0 · ~4 h del dueño | 1–3 semanas |
| ¿Alguien pagaría, y por qué ocasión? | Es la meta financiera | Botón de pago "falso" (intención) y preventa con enlace de Flow | US$0 (Flow cobra solo si hay venta) | 2 semanas |
| ¿Cómo leen los competidores las mismas boletas? | Decide si "leemos mejor" es verdad | Plan de comparación sin IA de pago (2.6) | US$0–5 (pruebas gratis) · 3–4 h | 1 semana |
| ¿Cuánto cuesta cobrar legalmente desde Chile? | Fija el costo fijo mínimo | Una consulta a un contador (IVA, inicio de actividades, boleta electrónica) | **[ESTIMACIÓN]** CLP 0–50.000 una vez | 1 semana |
| ¿Qué dice un abogado sobre fotos de boletas + IA en EE. UU.? | Requisito para mostrar a desconocidos y cobrar | Revisión del borrador del PR #94 por un abogado | **[ESTIMACIÓN]** CLP 150.000–600.000 una vez | 2–3 semanas |
| Costo real de Vercel y Supabase hoy | Fija el punto de equilibrio | Mirar los paneles de facturación (no está en el repo) | US$0 | 1 día |
| ¿Cuántos chilenos viajan en grupo al año? | Tamaño del segmento recomendado en C | Estadísticas de turismo emisivo (Subsecretaría de Turismo / INE): no las encontré | US$0 | 1 día |

### 1.3 Riesgos existenciales (ordenados por probabilidad × daño) [OPINIÓN con evidencia]

| # | Riesgo | Probabilidad | Daño | Evidencia | Mitigación |
|---|---|---|---|---|---|
| 1 | **Nadie paga** por dividir cuentas (referencia de precio = gratis) | Alta | Fatal para el negocio | Tricount gratis sin límites [FUENTE 5]; Mercado Pago "Amigos" sin comisión [FUENTE 11]; Tenpo "dividir gastos" [FUENTE 30]; conversión típica de freemium ≈2 % [FUENTE 39] | Cobrar por una **ocasión** (viaje) y no por la función; probar con preventa antes de construir |
| 2 | **Baja frecuencia** → la gente olvida la app | Alta | Alto | Retención a 30 días en apps de finanzas ≈4–7 % (fuentes secundarias) [FUENTE 38] | Modelo de pago único que no depende de retención; reengancharse en la próxima ocasión |
| 3 | **Legal**: fotos con datos personales, envío a EE. UU., cobrar sin términos | Media | Alto (multas hasta 20.000 UTM según fuentes secundarias; régimen de amonestación para pymes el primer año) | [FUENTE 26] | Política + términos + titular antes de cobrar o abrir a desconocidos; no guardar imágenes (ya no se guardan: `docs/CUOTA_Y_USO.md`) |
| 4 | **Copia por grandes** | Media | Medio | Apple iOS 27 (solo EE. UU.) [FUENTE 9]; Splitwise "Itemize" (EE. UU./Reino Unido) [FUENTE 41]; Justo ya divide la cuenta por QR en restaurantes chilenos [FUENTE 28] | No competir en "foto → ítems"; competir donde ellos no llegan (boletas extranjeras, Android, sin cuenta bancaria común) |
| 5 | **Dependencia de Anthropic** (precio, políticas, caídas) | Media | Medio | Precio ×3 vuelve negativo el margen del pase con uso alto (ver C, sensibilidad) | El set de evaluación permite medir y cambiar de proveedor en días; cuota y tope global ya existen |
| 6 | **Abuso de cuota** | Baja–media | Bajo (acotado) | Identidad anónima: borrar datos = cuota nueva [DATO] `docs/CUOTA_Y_USO.md` | Tope diario global + límite de gasto en la consola de Anthropic; para el pase, la cuota va atada al pago |
| 7 | **Concentración en una persona no técnica** | Alta | Alto | [DATO] equipo = dueño + asistentes de IA | Elegir un modelo sin soporte técnico 24/7 (descarta B2B con SLA como primera apuesta) |
| 8 | Infraestructura gratis no apta para cobrar | Cierta | Bajo | Vercel Hobby = no comercial [FUENTE 21] | Presupuestar US$20/mes desde el primer cobro |

### 1.4 Veredicto

**Función bien hecha (y hobby serio), todavía no negocio.** Puede llegar a **ingreso complementario** si se cumple una condición que hoy no está probada: que grupos paguen una vez por cerrar las cuentas de un viaje o evento. [OPINIÓN]

---

## FASE 2 · Mercado y competencia

### 2.1 Segmentos concretos

Ninguna cifra de frecuencia o disposición a pagar por segmento está medida: todas son **[ESTIMACIÓN]** (pesimista / base / optimista) hasta tener entrevistas.

| Segmento | Dolor | Veces/mes que aparece la necesidad (con boleta) | Disposición a pagar | Cómo llegar | CAC estimado |
|---|---|---|---|---|---|
| Parejas | Bajo (se compensa "a ojo") | 2 / 4 / 8 | Muy baja | — | — |
| Compañeros de piso | Medio (cuentas del hogar, sin boleta de restaurante) | 1 / 3 / 6 | Baja (Splitwise/Tricount gratis) | Boca a boca | US$0–2 |
| Amigos que salen seguido | Medio en grupos ≥5 | 0,5 / 1,5 / 4 | Muy baja por cena | WhatsApp | US$0–1 |
| **Viajeros en grupo** (amigos, familia) | **Alto**: muchas boletas, monedas y reglas de propina distintas, cuentas abiertas por días | Durante el viaje: 2 / 5 / 10 boletas por día; viajes 0,5 / 1 / 3 por año | **Media**: hay precedentes de "pase por viaje" pagado [FUENTE 12, 13, 1] | Contagio en el grupo, contenido de propinas por país, hostales/agencias | US$0–5 |
| Almuerzo de oficina | Bajo por evento, alta frecuencia | 4 / 8 / 20 | Muy baja | Contagio | US$0–1 |
| Familias | Bajo | 0,5 / 1 / 2 | Muy baja | — | — |
| Asados / fútbol | Medio (sin boleta: compras de supermercado) | 0,5 / 1 / 4 | Muy baja | WhatsApp | US$0–1 |
| Restaurantes | El POS ya tiene los ítems; no necesita leer la boleta | Diario | Media, pero venden POS grandes | Venta directa | **[ESTIMACIÓN]** US$100–1.000 por local |
| Empresas (rendición de gastos) | Alto (cumplimiento, reembolsos) | Semanal | Alta, pero ya servida (Rindegastos incluye lectura con IA y WhatsApp desde UF 0,05 por usuario/mes) [FUENTE 19] | Venta B2B | Alto |

### 2.2 Dimensionamiento de abajo hacia arriba (solo lo que se puede razonar)

- **Turistas extranjeros que llegaron a Chile en 2025: 6.004.567**, de ellos **2.856.441 argentinos** (hispanohablantes) [FUENTE 27].
- **[ESTIMACIÓN]** Supongamos que 40 % / 55 % / 70 % viaja en grupos de 3 o más con promedio de 4 personas → **0,6 / 0,8 / 1,1 millones de grupos al año** solo entre visitantes extranjeros en Chile. Falta el dato de chilenos que viajan (no lo encontré; pregunta pendiente).
- Si 0,1 % / 0,5 % / 2 % de esos grupos comprara un pase de CLP 3.990 (≈US$4,3): **≈600 / 4.000 / 22.000 pases al año → US$2,6 mil / US$17 mil / US$95 mil de ingreso bruto al año**.
- Lectura: incluso con optimismo, el mercado alcanzable desde Chile es de **ingreso complementario**, no de empresa grande. Para crecer haría falta toda la Latinoamérica hispanohablante viajera (ver C, 7.1).
- El "mercado de apps de dividir cuentas ≈US$0,6 mil millones en 2025" viene de informes de mercado poco fiables y no lo pude verificar en fuente primaria: **no lo uso**.

### 2.3 Competencia (verificada donde dice FUENTE)

| Producto | Precio | Modelo | Escaneo de boletas · idiomas | Invitado | Pagos integrados | Plataformas | Tracción | Debilidad |
|---|---|---|---|---|---|---|---|---|
| **Splitwise** | Gratis con tope de **4 gastos/día** y anuncios; Pro: compras en App Store EE. UU. de US$2,99–4,99/mes y US$29,99–39,99/año; los planes anuales incluyen 1 **"Trip Pass"** de 30 días para un grupo de viaje [FUENTE 1, 2, 3] | Freemium + suscripción | **Solo Pro** escanea e itemiza [FUENTE 1]; "Itemize" lanzado en EE. UU. y Reino Unido [FUENTE 41]; web en 13+ idiomas | Requiere cuenta | Importar tarjeta solo en EE. UU. [FUENTE 2] | iOS, Android, web | Android 10M+ descargas, 4,0 con 195 mil reseñas; iOS EE. UU. 4,0 con 29 mil [FUENTE 3, 4]; US$20 M Serie A (2021), US$90 mil millones divididos [FUENTE 31] | Quejas fuertes por el tope diario y los anuncios [FUENTE 40] |
| **Tricount** (bunq) | **100 % gratis, sin anuncios ni límites** [FUENTE 5, 6] | Lo financia el banco bunq (cuentas y tarjetas) | Adjuntar foto; no itemiza [OPINIÓN, no verificado] | Link | Con cuenta bunq | iOS, Android, web | "17 millones" (ficha en inglés) / "más de 24 millones" (ficha en español), 4,7 con 195.788 valoraciones [FUENTE 5]; bunq lo compró en 2022 con 5,4 M usuarios, precio no revelado [FUENTE 32] | No lee ítems |
| **splitty** | 3 divisiones gratis; US$9,99/año o US$24,99 de por vida [FUENTE 7] | Pago único/anual | Sí; declara "99 %+"; **solo inglés** | Amigos no necesitan la app (piden por Venmo) | Venmo | Solo iOS | 4,6 con **83** valoraciones [FUENTE 7] | Pequeña; EE. UU.; Venmo no sirve en Latinoamérica |
| **Tab** (bring10) | Gratis | Sin modelo claro | Sí | **Todos necesitan la app** [FUENTE 8] | No | iOS, Android | Android 3,3 con 717 reseñas [FUENTE 8] | Fricción, abandonada [OPINIÓN] |
| **Plates** (Splitwise) | Gratis | — | Ítems a mano (no escanea, según la ficha citada) [FUENTE 41] | — | — | iOS | — | Manual |
| **Settle Up** | US$3,99/mes, US$19,99/año; **"Group Premium" US$9,99 (2 semanas), US$14,99 (1 mes), US$39,99, de por vida US$149,99** [FUENTE 12] | Suscripción + pase por grupo | Fotos de recibos (Premium) | Link de solo lectura | No | iOS, Android | ≈50 mil descargas/mes y ≈US$6 mil/mes (estimación de Adapty, débil) [FUENTE 12] | Ingreso por descarga bajísimo |
| **Kittysplit** | Gratis hasta 9 personas; **≈€3 por "Kitty", pago único, beneficia a todo el grupo** [FUENTE 13] | Pase por grupo | Subir recibos (de pago) | Sin registro, en el navegador | No | Web | — | Sin lectura de ítems |
| **SplitterUp / SPLIIT / Checkify / divídelo / SplitMe** | Mayormente gratis | — | Escaneo gratis (afirmado por ellos) | — | — | — | No pude verificar tracción; "SplitMe (Chile)" y "dividelo.cl" **no aparecieron** en búsquedas [FUENTE 46] | Clones; sin datos |
| **Mercado Pago "Amigos"** | Sin comisión con saldo o débito [FUENTE 11] | Billetera | **No lee boletas** (no encontré evidencia) | Requiere cuenta MP | **Sí** | App MP | Masiva [OPINIÓN] | Reparto por total, no por ítem |
| **Tenpo** | Transferencias gratis entre usuarios; "dividir gastos con tus amigos" [FUENTE 30] | Billetera | No | Requiere Tenpo | Sí | App | — | Igual |
| **Piggy** (Argentina) | — | "Controlá gastos, tarjetas y cuentas compartidas" | — | — | — | — | Solo aparece en un directorio [FUENTE 44]: **no confirmé** que los amigos no necesiten la app | Sin verificar |
| **Apple (iOS 27)** | Gratis | Sistema operativo | Escanea con Visual Intelligence e itemiza, reparte impuesto y propina | Pide Apple Cash | Apple Cash | iPhone compatible | **Solo EE. UU.**: Apple Cash solo en EE. UU. y el escaneo "Only available in the U.S." [FUENTE 9, 10] | Fuera de EE. UU. no existe; un amigo con Android rompe el flujo |
| **Google / Gemini** | — | — | No encontré función equivalente de dividir por ítems | — | — | — | — | — |
| **Justo** (POS Chile) | No publicado | POS para restaurantes | No necesita leer: tiene los ítems | Cada comensal paga por QR en la mesa [FUENTE 28] | Sí | Restaurante | — | Solo en locales con Justo |

**Lectura [OPINIÓN]:** los líderes de consumo regalan lo básico (Tricount) o cobran por "sin límites" (Splitwise). Los únicos precedentes de pago que encajan con una necesidad poco frecuente son **los pases por grupo o viaje**: Settle Up (US$9,99 por 2 semanas), Kittysplit (€3 por grupo) y el Trip Pass de 30 días de Splitwise.

### 2.4 Las grietas: qué odian los usuarios de los líderes

- **Splitwise:** el tope de 3–4 gastos diarios en la versión gratis, anuncios de 10 segundos y "nag screens"; usuarios antiguos dicen que se van a Excel [FUENTE 40] (reseñas de Trustpilot de fines de 2023 y un blog de 2026; evidencia débil pero repetida).
- **Escaneo como muro de pago:** en Splitwise escanear e itemizar es solo Pro [FUENTE 1]; los demás miembros ven el resultado pero no pueden escanear.
- **Apple:** "basta un usuario de Android o alguien sin Apple Cash en una mesa de seis para volver a la calculadora" (blog de un competidor, marketing) [FUENTE 10b]; la limitación a EE. UU. sí está en la fuente oficial [FUENTE 9].
- **Tab:** obliga a que todos instalen la app [FUENTE 8].
- **Billeteras:** requieren que todos tengan cuenta en la misma billetera [FUENTE 11, 30].

### 2.5 ¿Cómo se ve la frecuencia en esas apps? (evidencia, no suposición)

- Nadie publica frecuencia de uso. Lo más cercano:
  - Splitwise puso un tope de 4 gastos/día porque hay usuarios que registran más; los que lo usan como libro del hogar o de viaje lo usan **a diario** [FUENTE 1, 40].
  - Settle Up: ≈US$0,12 de ingreso por descarga mensual (estimación débil) [FUENTE 12] sugiere que casi nadie paga.
  - Retención a 30 días en apps de finanzas: ≈4–7 % (fuentes secundarias que citan AppsFlyer/Adjust) [FUENTE 38].
- **Qué los hace volver** (por diseño de los productos, [OPINIÓN]): la **deuda abierta** (saldo que no está a cero), los **gastos recurrentes** del hogar y el **viaje en curso**. Una cena aislada no crea retorno.

### 2.6 Plan de comparación sin IA de pago (solo el plan)

**Objetivo:** saber si "leemos mejor boletas extranjeras" es verdad, con las mismas boletas, sin gastar saldo de API.

**Competidores (3):**
1. **Splitwise Pro** (prueba gratis de 7 días según un tercero [FUENTE 47]; cancelar antes de que cobre).
2. **splitty** (3 escaneos gratis [FUENTE 7]; usar 3 boletas; las otras 7 solo si el dueño decide pagar US$9,99).
3. **Una app gratuita "con IA"** disponible en Chile en Android (SPLIIT Pro o "Scan & Split Bill – OCR Check", 4,6 con 1.097 reseñas en Google Play [FUENTE 7b]).
- Apple iOS 27 queda fuera: solo funciona en EE. UU. [FUENTE 9].

**Las 10 boletas** (de `services/ocr/evals/fixtures/`, con la verdad ya transcrita en `manifest.json`): 2 de Chile (propina sugerida), `AR/palermo-inclinada-9320` (foto torcida), 1 de México, `PE/isolina-barranco` (servicio ya incluido), 1 de Brasil (cupom fiscal), `DE/lidl-berlin-pfand` (líneas negativas), 1 de Japón (sin decimales), `TH/three-monkeys-svc-vat` (servicio + IVA) y 1 de EE. UU. (impuesto aparte). **Ojo:** son fotos de terceros, solo para uso interno; mostrarlas en pantalla para fotografiarlas está bien, publicarlas no.

**Método:** mostrar cada imagen a pantalla completa en un computador, fotografiarla con el teléfono desde cada app, en el mismo orden y con la misma luz.

**Qué anotar por app y boleta (planilla):**
| Criterio | Cómo se mide |
|---|---|
| Ítems exactos | nº de ítems con nombre y precio iguales al `manifest.json` / total de ítems |
| ¿La suma cuadra con el total impreso? | sí / no / diferencia |
| Impuesto, servicio y propina | ¿los detectó y los trató bien? (incluido vs. aparte) |
| Moneda y separadores | ¿leyó bien `1.234,56` y la moneda? |
| Toques hasta el reparto final | contar |
| ¿Pidió cuenta o instalar a los demás? | sí / no |
| Tiempo foto → resultado | segundos |

**Nuestra columna:** usar los resultados ya medidos en las evals de esas mismas boletas (sin gastar). Si el dueño quiere repetirlas en la app real: **10 boletas × 0,7–2,8 ¢ ≈ 7–28 ¢ de saldo de API → requiere su OK explícito antes.**
**Costo total:** US$0 (o US$9,99 si se compra splitty) y 3–4 horas del dueño. **Decisión que habilita:** si no leemos claramente mejor en boletas extranjeras (≥10 puntos de ítems exactos), el argumento "leemos cualquier país" no sirve para vender y se elimina del mensaje.

### 2.7 Conversación con el hermano y los amigos (preguntas exactas) y consultas SQL

**No explicar nada antes. Por WhatsApp o en persona, 10 minutos, anotar las frases textuales.**
1. "¿Cuándo fue la última vez que la usaste y qué estaban pagando? (dónde, cuántos eran, quién pagó)".
2. "Desde esa vez, ¿hubo otra cuenta compartida en la que **no** la usaste? ¿Por qué no?".
3. "¿Qué hicieron justo después de ver cuánto debía cada uno? (transferencia, efectivo, 'la próxima pago yo', nada)".
4. "Si mañana te vas de viaje con 4 amigos, ¿cómo llevarían las cuentas? ¿Pagarías **CLP 3.990 una vez por el viaje** para que la app junte todas las boletas y diga al final quién le paga a quién? Sí / no / depende de qué".
5. "¿Qué fue lo más molesto o confuso? Muéstrame dónde".

**Consultas que el dueño debe correr en Supabase → SQL Editor** (están en `docs/CUOTA_Y_USO.md`; solo lectura, no cuestan nada):
- "Resumen por mes" de `dc_scan_log` (lecturas, usuarios distintos, costo, % que cuadra).
- "Por país".
- "Los 10 usuarios que más usan".
- "Lecturas por día (últimos 14)".
- "Embudo de los últimos 30 días" de `dc_events`.
- "% que cuadró sola", "Cuando no cuadra: ¿cómo lo arregla la gente?", "¿Cuántos sacan otra foto?", "Por qué falla la lectura".
Si alguna tabla no existe, es que la migración (`20261007_scan_quota.sql` o `20261009_events.sql`) no se ejecutó: **ese ya es un hallazgo** (sin migración no hay datos ni cuota real).

---

## Preguntas abiertas y datos que faltan para la Sesión B

1. Resultados de las consultas SQL y de la conversación con hermano/amigos (¿hubo una segunda vez sin pedirla?).
2. ¿Están ejecutadas las migraciones de cuota y eventos en producción? ¿`SCAN_QUOTA_PER_MONTH` está activo?
3. Gasto real en Vercel/Supabase/Anthropic del último mes (paneles de facturación).
4. Subir al repo los sets "14 ciegas" y "13 prioritarias" o dejar de citarlos.
5. Turismo emisivo de Chile (chilenos que viajan al año).
6. Precisión real de los competidores (plan 2.6).

---

## Apéndice de fuentes (todas consultadas el 2026-10-22)

1. Splitwise Help Center, "What is Splitwise Pro?": https://kb.splitwise.com/pro/what-is-splitwise-pro
2. Splitwise, "Get Splitwise Pro!": https://www.splitwise.com/subscriptions/new
3. Splitwise en App Store (EE. UU.): https://apps.apple.com/us/app/splitwise/id458023433
4. Splitwise en Google Play: https://play.google.com/store/apps/details?id=com.Splitwise.SplitwiseMobile
5. Tricount en Google Play (en / es-AR): https://play.google.com/store/apps/details?id=com.tribab.tricount.android
6. Tricount: https://tricount.com/en-us/
7. splitty en App Store: https://apps.apple.com/us/app/splitty-split-bills-tip/id1499263885 · 7b. "Scan & Split Bill – OCR Check" en Google Play: https://play.google.com/store/apps/details?id=com.astepanov.mobile.splitcheck
8. Tab en App Store y Google Play: https://apps.apple.com/us/app/tab-the-simple-bill-splitter/id595068606 · https://play.google.com/store/apps/details?id=com.bring10.tab
9. Apple Support, "Split the bill with Apple Cash": https://support.apple.com/en-us/127565
10. Engadget, iOS 27 Wallet: https://www.engadget.com/2249069/apple-wallet-ios-27-update-how-to-split-bills-customize-passes/ · 10b. Finny (competidor, marketing): https://getfinny.app/blog/ios-27-wallet-money-features
11. Mercado Pago (blog México), función "Amigos": https://www.mercadopago.com.mx/blog/como-compartir-gastos-con-amistades
12. Settle Up en App Store: https://apps.apple.com/app/id737534985 · estimación de descargas/ingreso: https://adapty.io/paywall-library/settle-up/ (tercero, débil)
13. Kittysplit: https://www.kittysplit.com/en/tricount-alternative
19. Rindegastos, precios: https://rindegastos.com/es-cl/precios
21. Vercel, Hobby plan: https://vercel.com/docs/accounts/plans/hobby
22. Supabase, precios: https://supabase.com/pricing
26. Diario Constitucional, Ley 21.719 entra en vigor el 1 de diciembre: https://www.diarioconstitucional.cl/2026/06/12/la-ley-21-719-entra-en-vigor-el-1-de-diciembre-y-expone-vacios-en-regulacion-de-pequenas-empresas/ (multas: fuentes secundarias, verificar en BCN)
27. Chile Travel / Subsecretaría de Turismo, 2025: https://chile.travel/blog/noticias-de-la-industria-chile-termina-2025-con-mas-de-6-millones-de-turistas-extranjeros/
28. Chócale, Justo divide la cuenta por QR (26-dic-2025): https://chocale.cl/2025/12/nueva-solucion-permite-dividir-la-cuenta-en-restaurantes-y-pagar-solo-el-consumo-individual/
30. Tenpo en App Store (Chile): https://apps.apple.com/cl/app/tenpo-una-cuenta-muy-t%C3%BA/id1480047892
31. TechCrunch, Splitwise Serie A (2021): https://techcrunch.com/2021/04/28/splitwise-raises-20m-series-a-to-help-everyone-in-the-world-divvy-expenses
32. PYMNTS, bunq compra Tricount (2022): https://www.pymnts.com/acquisitions/2022/neobank-bunq-acquires-belgian-fintech-tricount-adding-5-4m-users/
38. Phiture, benchmarks de retención: https://phiture.com/mobilegrowthstack/managing-retention-rate-benchmarks-and-expectations/ (secundaria)
39. SaaStr sobre RevenueCat State of Subscription Apps: https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/ (secundaria)
40. Reseñas de Splitwise: https://ie.trustpilot.com/review/splitwise.com?page=2 · https://www.itvoice.in/splitwise-has-introduced-restrictions-on-the-number-of-free-expenses-users-can-add
41. The Paypers, Splitwise Itemize (EE. UU./Reino Unido): https://thepaypers.com/payments/news/splitwise-launches-itemize-receipt-splitting-feature-in-the-us-and-uk
44. Directorio argentino.dev (Piggy): https://argentino.dev/directorio/fintech (débil)
46. Búsquedas sin resultado para "SplitMe Chile" y "dividelo.cl" (WebSearch, 2026-10-22)
47. SplitterUp (competidor, marketing) sobre Splitwise Pro y prueba de 7 días: https://splitterup.app/blog/splitwise-pro-worth-it
