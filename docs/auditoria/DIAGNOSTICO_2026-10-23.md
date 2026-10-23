# Diagnóstico completo — DiviCuenta (23 de octubre de 2026)

Actualiza `AUDITORIA_2026-10-04.md`. Estados de evidencia: ✅ verificado hoy (lo corrí o lo leí en el código) · 🔎 inferido · ❓ no pude verificar · 💭 opinión.

---

## 1. Veredicto en una página

**Etapa real:** producto técnicamente sólido y bastante más maduro que hace 19 días, **pero todavía sin una sola prueba con usuarios reales y sin permiso legal para mostrarlo a desconocidos**. Las 3 cosas que más importan no son funciones nuevas:

1. **Nadie ha usado la app de verdad fuera de usted, su hermano y unos amigos.** Todo lo que sabemos de calidad sale de boletas de laboratorio. El experimento que decide si esto es un producto (`docs/PRUEBA_5_GRUPOS.md`) sigue sin hacerse. 💭 Es el hallazgo más importante y no cuesta plata.
2. **Lectura de boletas: muy buena, pero con un tipo de error que no se ve.** Hoy cuadran 92–96 % de las boletas nuevas a ~0,8–1,2¢ cada una. El riesgo ya no es "no cuadra" (la app avisa), sino **"cuadra y está mal"** (columnas desfasadas, país/moneda equivocados, nombres de cargos sin reconocer). Un reparto con ítems mal leídos que suman bien es el peor caso porque nadie lo nota.
3. **Protección de gasto y privacidad siguen a medias.** La cuota existe en el código, pero **no puedo confirmar que esté encendida en producción**; no hay cabeceras de seguridad; el "secreto" de la app sigue siendo un texto de relleno; y la política de privacidad sigue en borrador (#94).

**Calificación global (💭): 3,4 / 5** (era 2,8 el 4 de octubre). Sube por accesibilidad, medición, cuota, borrado, idioma y evals; no sube más porque el producto sigue sin validarse con gente.

---

## 2. Qué tenemos hoy (inventario ✅)

| Pieza | Estado |
|---|---|
| App v2 (PWA, JS sin framework) | `v2/app.js` 1.249 líneas + `sync.js` 259 + `styles.css` 307; instalable, claro/oscuro; BUILD `2026-10-22.b` en `main` |
| Lógica compartida | `core/` ≈ 880 líneas: reparto exacto, 49 monedas, reglas de 48 países (`country-rules.js` 651 líneas) |
| Servidor | `api/scan-receipt.js` 1.198 líneas (lectura + reconciliación + cascada Haiku→Sonnet), `translate`, `assign`, cuota |
| Base de datos | 9 migraciones Supabase: cuentas compartidas con RLS, cierre de pagos, cuota y uso, eventos de embudo |
| Pruebas (todas verdes hoy ✅) | reconciliación 57 · costos 33 · cuota 20 · reintento 5 · reparto 44+40 · asignar 17 · monedas 48 países/49 monedas · cascada 5 · e2e v2 70 · cuentas compartidas 49 · app instalable 6 · voz 11 · arranque sin CDN · **accesibilidad 20 pantallas sin violaciones** · SQL de seguridad en CI |
| Evals de boletas | **221 boletas / 62 países** (197 en `main`; 24 nuevas en rama sin PR); harness con flujo completo de la app |
| Idioma | Inglés listo en rama `feat/idioma-ingles` (162 textos, pruebas de paridad) — sin PR |
| Costo medido | 0,7–1,2¢ por boleta; países con servicio e impuesto aparte pasan por Sonnet (≈2–2,8¢) |

---

## 3. Cuadro de notas (1 = grave, 5 = sólido) — comparado con el 4 de octubre

| Área | 4 oct | Hoy | Por qué |
|---|---|---|---|
| Producto y propuesta | 3,5 | 3,5 | Sin cambio: sigue **sin validar con usuarios** |
| UX y flujo | 3,5 | 3,5 | Aviso "Corregí la lectura" y confirmación de país mejoran; falta primera vez guiada y "sacar otra foto" |
| Accesibilidad | 2 | **4** | ✅ axe: 20 pantallas sin violaciones, claro y oscuro (antes 56 de contraste) |
| Confiabilidad de la IA | 3,5 | **4** | ✅ 92–96 % cuadra en boletas nuevas (antes 89 % en las que ya conocíamos); pero ver sección 4 |
| Ingeniería y pruebas | 4 | 4 | ~460 chequeos y CI amplio; `app.js` sigue en un solo archivo; 30+ ramas sin limpiar |
| Seguridad — base de datos | 4,5 | 4,5 | RLS probado; sin cambios |
| Seguridad — API y entorno | 2 | **2,5** | Cuota por usuario y tope global existen en código; secreto y cabeceras siguen igual; ❓ encendido en producción |
| Privacidad y legal | 1,5 | 2 | Borrador de política + borrado automático escritos, **no fusionados** (#94) |
| Rendimiento | 4 | 4 | Sin cambios; la espera real es el escaneo (3–15 s) |
| Datos y observabilidad | 1 | **3** | ✅ eventos de embudo y registro de uso (`dc_events`, `dc_scan_log`) — ❓ si las migraciones están aplicadas |
| Escalabilidad y costos | 2,5 | 3 | Consulta periódica bajó a ~8 s con tiempo real; costo por boleta 4× menor con Haiku |
| Global e idiomas | 2 | 3 | Reglas de 48 países; inglés listo pero sin fusionar |
| Salida al mercado | 1,5 | 1,5 | Sin canal, sin retención medida, sin ingresos |

---

## 4. Lectura de boletas (el corazón del producto)

### 4.1 Lo medido (Haiku 5.5 + cascada Sonnet 5.5, flujo completo)
| Set | Boletas | Cuadran | Costo/boleta |
|---|---|---|---|
| 25 variadas | 25 | 96 % | ~0,7¢ |
| Web 2026-10-22 (VN, PH, KE, RU, SE, PE, MX…) | 32 | 94 % (30/32; las 2 fallas se corrigieron con reglas exactas) | 1,22¢ |
| **Países faltantes (23/10)** | 24 | **92 % (22/24)**, ítems 93 %, país 23/24 | **0,80¢** (≈19¢ total) |
| 13 prioritarios (CL, MX, PE, PT, AU, NZ) | 13 | medidas el 22/10; 1 falla real (Rosa Negra: propina impresa) y 1 error mío de etiqueta (Majestic) | — |
| 14 "ciegas" (CN, KR, DE, JP, HK, TW, FR, IT — #115) | 14 | **100 % (14/14)**, ítems 97 %, país 13/14 | 0,98¢ |
| 13 "complicados" 2025-26 (IN, JP, PL, LK, PH, HK, IT, NG) | 13 | **85 % (11/13)**, ítems 91 % | 1,09¢ |

Fallos de las 13 "complicadas": `HK/cafe-boheme-2025` **rehusada** ("no es boleta": es una reimpresión con dedos sobre el ticket; ni Haiku ni la cascada la leyeron) e `IN/cafe-dotpe-token14` (un solo producto: omitió CGST y SGST 9 %, faltan 50 de 325). Además `PL/bar-ustka-2025` (pescado por peso) leyó bien la suma pero con ítems distintos, e `IT/nannarella` dejó el servicio como "Coperto".

⚠️ Honestidad sobre la cifra: sigue siendo un conjunto que nosotros armamos. Las "ciegas" y las de hoy se suman a mano y no se usaron para ajustar reglas, así que sirven más que las antiguas, pero **ninguna es una muestra aleatoria de lo que sacará la gente en un restaurante cualquiera**. El número real solo lo da el uso real.

### 4.2 Clases de fallo conocidas (hoy con ejemplos)
1. **"Cuadra pero está mal"** — columnas desfasadas por papel inclinado o foto lejana. Hoy: `RO/la-latina-orsova-2021` (letra diminuta): leyó nombres en italiano, **país IT y moneda EUR en vez de RON** y la suma "cuadró". Mitigación existente: R23 y cascada; **no hay forma determinista de detectarlo** salvo pedir al usuario confirmar país/moneda cuando el sello fiscal indica otra cosa. 💭 Esta es la clase más peligrosa.
2. **Cargo con signo o base equivocada** — `AE/guest-bill-dubai-2026`: el servicio 4 % quedó como −10,08 y se agregó encima el VAT del desglose (que ya estaba incluido). La regla de "signo cambiado" no alcanzó porque dos errores se mezclaron.
3. **Redondeo de caja** — `HU/trattoria-toscana-2023`: la suma da 23.877 vs 23.875 impresos (`Kerekítés −2 Ft`). **Corrección posterior:** no es un fallo de la app (la tolerancia del 3 % lo absorbe en silencio); solo el evaluador, que exige igualdad exacta, lo marca. Sin acción.
4. **Cargos con nombre local no reconocido** — `Apkalpošana 10%` (Letonia) y `BACSIS` (Rumania) llegan con el nombre original; la app los trata como plato en vez de servicio/propina, y el reparto cambia. R22 pide renombrar, pero el modelo barato no siempre lo hace. 💭 Solución barata: ampliar `EXTRA_RE` en `core/split.js` con las palabras de servicio/propina de más idiomas (letón, rumano, húngaro `Szervizdíj`, checo, búlgaro…).
5. **Boletas que no son de restaurante** (`KR/namsan-cablecar`): rechazadas como "no es boleta"; problema conocido.
6. **Latencia sin diagnosticar** ❓: el 23/10 una boleta de Dhaka "no cargó" y la segunda fue inmediata. Hipótesis: arranque en frío o llamada lenta al modelo (timeout de 50 s, función de 60 s, el cliente aborta a los 75 s). No hay registro de tiempos; propuse medirlos (necesita una columna en Supabase).

### 4.3 Qué NO sabemos
- Precisión con boletas de usuarios reales (0 datos).
- Comparación con competidores (nunca se probaron 3 apps con las mismas boletas). 💭 La afirmación "leemos cualquier boleta de cualquier país en tiempo real" **no está medida contra nadie**; hoy lo defendible es "lee boletas de 62 países con reglas locales y verificación".
- Costo con tráfico real y variación entre Haiku/Sonnet en producción.

---

## 5. Seguridad, privacidad y legal

### 5.1 Estado de los hallazgos del 4 de octubre
| Id | Hallazgo | Hoy |
|---|---|---|
| S-1 | Gasto en IA abierto | 🟡 **Parcial.** Cuota por usuario/mes y tope global existen (`api/_lib/quota.js`), **pero solo se activan con `SCAN_QUOTA_PER_MONTH`** y falla abierta. `guard.js` sigue sin exigir secreto si falta la variable y `core/config.js` aún dice `CHANGE_ME_TO_MATCH_VERCEL_ENV_VAR` ✅. ❓ No sé si el tope de gasto de Anthropic existe. |
| S-2 | Scripts de terceros sin versión fija ni integridad | 🔴 **Abierto** ✅: `supabase-js@2` flotante (`v2/index.html:27`), QR desde cdnjs (`app.js:487`), tipos de cambio de `open.er-api.com`. La app ya arranca aunque falle la CDN (probado). |
| S-3 | Cabeceras de seguridad | 🔴 **Abierto** ✅: `vercel.json` solo tiene `maxDuration`. |
| S-4 | Sin limpieza de datos | 🟡 Escrita (`20261008_purge_old_data.sql`) pero **en el borrador #94, no desplegada**. Las cuentas siguen sin borrarse. |
| S-5 | Telemetría de lecturas | 🟡 Documentado en `CUOTA_Y_USO.md` (no guarda boleta ni ítems); falta decirlo en la política. |
| P-1 | Sin política ni términos | 🔴 **Abierto**: borrador #94 (faltan titular, correo y revisión legal). |
| E-1 | Versión 1 sigue publicada | 🔴 **Abierto** ✅: `index.html` y `apps/divicuenta/index.html` siguen en el repo y la raíz sirve la v1. |
| D-1 | Sin medición | 🟢 Resuelto en código (eventos + registro de uso); ❓ migraciones aplicadas. |
| A-1/2/3 | Accesibilidad | 🟢 **Resuelto** (axe 20/20). |

### 5.2 Riesgo nuevo desde el 4 de octubre
- **Datos de terceros en el repo (fixtures):** hay ~220 fotos de boletas de otras personas (Tripadvisor, Reddit, Google). Están en un repositorio; si algún día se hace público, **no pueden salir**. Ya está dicho en `CLAUDE.md` ("solo fixtures internos"); falta una salvaguarda técnica (un chequeo de CI que bloquee publicar el repo o un `.gitignore` de carpetas si se separa).
- **Muchas ramas abiertas (30+) y 5 PR abiertos** con trabajo valioso sin fusionar (ver 7). Un cambio de seguridad hoy habría que hacerlo en varios sitios.

---

## 6. Producto, mercado y negocio (opinión honesta 💭)

- **Mercado de dividir cuentas para consumidores:** pequeño, saturado y en vías de ser gratis (Apple Wallet lee boletas desde iOS 27; decenas de apps lo hacen). Mi lectura honesta, ya dicha: **no es un camino a "unicornio"**; sí puede ser **ingreso complementario** si se acota bien.
- **Lo único defendible hoy:** (a) lectura de boletas de muchos países con reglas locales (servicio, IVA incluido, propina sugerida, redondeo), (b) verificación aritmética exacta, (c) flujo en vivo sin registro para invitados, (d) un conjunto de 221 boletas reales para no empeorar. Eso es un **activo técnico**, no todavía un negocio.
- **Camino recomendado (una sola recomendación):** ejecutar `PRUEBA_5_GRUPOS.md` **antes** de construir nada más. Si ≥4 de 5 grupos llegan a "todos pagaron", ≥3 sin corregir y ≥3 la reutilizan → recién ahí pensar en el "Pase de viaje" (pago por viaje, no suscripción) y en inglés/portugués. Si casi nadie la usa dos veces, **replantear el producto** antes de gastar más en OCR.
- **Lo que sobra por ahora:** más países y más boletas ya tienen rendimiento decreciente; cada boleta nueva enseña menos que un grupo real usando la app.

---

## 7. Orden del trabajo (ramas y PR)

**PR abiertos:** #115 (14 boletas ciegas, sin medir), #106 (fixture mal etiquetado), #102 (Egipto/servicio, sin medir con IA real), #98 (The Mule, total cortado, sin medir), #94 (privacidad, **no fusionar**).

**Ramas con trabajo valioso sin PR:** `feat/idioma-ingles` (inglés), `fixtures/paises-faltantes` (24 boletas, medidas hoy), `fixtures/prioritarios` (13), `fixtures/complicados-2025-2026` (13), `fix/auto-round-y-boletas-bd` (Auto Round + 6 de Bangladesh), `docs/prompt-estrategia` (estrategia). Más ~25 ramas viejas `feat/*` ya fusionadas o abandonadas.

**Conflicto previsible:** varias ramas de fixtures tocan el mismo `manifest.json` y `CLAUDE.md`; conviene fusionarlas **una por una**, rebasando entre cada una.

**Higiene pendiente:** `README.md` tiene una sola línea; dos copias de la v1; `docs/auditoria/` mezcla fechas.

---

## 8. Los 5 riesgos que más pueden hacer daño

1. **Un abuso de la API de pago** (S-1) mientras no haya tope en Anthropic y variables en Vercel verificadas.
2. **Lanzar a desconocidos sin política de privacidad** (P-1) — bloquea tiendas y expone a quejas.
3. **"Cuadra pero está mal"** en producción: un grupo paga mal y no confía más.
4. **Construir en el vacío**: seguir mejorando OCR sin ver a ningún grupo usarla.
5. **Fotos de terceros en el repositorio** si algún día se abre o se comparte.

---

## 9. Plan priorizado (con qué modelo)

**Esta semana (gratis o casi):**
1. Revisar en Vercel/Anthropic/Supabase y marcar ✓ (usted, 10 min): `SCAN_QUOTA_PER_MONTH` y `SCAN_GLOBAL_DAILY_LIMIT` definidos · tope de gasto mensual en Anthropic · `APP_SHARED_SECRET` · migraciones `20261007` y `20261009` aplicadas. *(Sonnet 5.5 si hay que escribir algo.)*
2. **Hacer la prueba de 5 grupos** (sin código; usar `PRUEBA_5_GRUPOS.md` con familia/amigos, avisando lo de la foto).
3. Fusionar, una por una, las ramas sin PR que ya pasaron pruebas: inglés, fixtures. *(Sonnet 5.5.)*

**2–4 semanas (confianza y calidad):**
4. ✅ **Hecho el 23/10** (rama `fix/redondeo-caja-y-cargos-locales`): servicio con signo menos + IVA ya incluido (caso 2) y nombres de servicio/IVA en más idiomas (caso 4), con tests; sin tocar el prompt. Pendiente: el caso de la boleta rehusada (reimpresión/dedos) y el de un solo producto con impuestos omitidos.
5. Aviso de "confirma país y moneda" cuando el sello fiscal no coincide (caso 1 de 4.2). *(Opus 5.5 para el diseño; Sonnet 5.5 para el código.)*
6. Cabeceras de seguridad y versiones fijas de scripts con `integrity` (S-2, S-3). *(Sonnet 5.5; ojo con no romper la PWA.)*
7. Registro de tiempos de lectura + aviso "tarda más de lo normal" (4.2.6). *(Sonnet 5.5.)*
8. Política de privacidad: titular, correo y revisión legal → recién ahí fusionar #94. *(No es tarea de código.)*

**90 días (solo con evidencia):**
9. Medir todo el conjunto (221 boletas ≈ US$1,8–2,7) tras cada cambio de reglas. *(Pide OK de costo cada vez.)*
10. Prueba comparativa contra 2–3 competidores con las mismas 30 boletas.
11. Modelo de ingresos solo si la prueba de grupos da luz verde.

---

## 10. Decisiones que le tocan a usted

1. ~~¿Autoriza medir las 27 boletas?~~ **Hecho** (≈29¢ en total; resultados en 4.1).
2. ¿Quién será el **titular legal** y qué correo se usará en la política? (bloquea #94).
3. ¿Hace usted la **prueba de 5 grupos** esta semana? Sin eso, ninguna otra mejora se puede validar.
4. ¿Apruebo fusionar las ramas de fixtures y el inglés (una a una, con PR), o prefiere revisarlas antes?
5. ¿Cuál es el **gasto máximo mensual en IA** que está dispuesto a tolerar? (define el tope).

---

## 11. Lo que no pude verificar

| Tema | Cómo comprobarlo |
|---|---|
| Variables de entorno de Vercel (cuota, secreto, modelo) | Panel de Vercel → Environment Variables |
| Tope de gasto en Anthropic | Consola de Anthropic → Limits |
| Migraciones aplicadas en Supabase | Supabase → Table Editor: ¿existen `dc_scan_log` y `dc_events`? |
| Cabeceras HTTP reales en producción | `curl -I https://yporqueno.vercel.app/v2/` |
| Latencia real en teléfonos y redes lentas | Prueba con 3 teléfonos; añadir registro de tiempos |
| Comparación con competidores | 30 boletas en 3 apps |
| Conducta con muchos usuarios simultáneos | Prueba de carga |

## 12. Metodología

Lectura del código de `main` (commit `7a114a6`), corrida local de todos los chequeos sin costo (sección 2), lectura de `docs/` y de los 5 PR abiertos, y una medición con IA real hoy: 24 boletas, Haiku 5.5 + cascada Sonnet 5.5, `pipeline=true`, ≈19¢. Límites: sin acceso a producción, sin usuarios reales, sin teléfonos físicos; las cifras de costo son estimaciones con los precios del código, no con la factura.
