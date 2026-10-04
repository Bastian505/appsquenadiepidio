# Auditoría de producto — DiviCuenta (4 de octubre de 2026)

Hecha siguiendo `PROMPT_AUDITORIA.md`. Estados de evidencia: ✅ verificado (lo medí o probé) · 🔎 inferido · ❓ no verificado · 💭 opinión.

---

## 1. Veredicto ejecutivo

**Etapa real:** prototipo avanzado y técnicamente sólido, **todavía no listo para un lanzamiento público**. La parte difícil (leer boletas de 30 países con ~89 % de acierto, cuentas compartidas en vivo con permisos probados, cierre de pagos) funciona. Lo que falta no es más funciones: es **proteger el gasto, cumplir lo mínimo de privacidad, poder medir, y comprobar con personas reales que el flujo se entiende**.

Los 3 hallazgos que más importan:

1. **El gasto en IA está desprotegido (Crítico).** Cualquiera que conozca la dirección puede llamar al lector de boletas; el "secreto compartido" de la app no está activo en producción y el límite por IP vive en memoria. El tope de gasto en Anthropic sigue pendiente. Un abuso no cuesta tu tiempo, cuesta tu dinero.
2. **No hay privacidad ni retención definidas (Alto).** La app maneja fotos de boletas (viajan a un proveedor externo), nombres de terceros y datos de transferencia; no existe política de privacidad ni términos, y **nada borra las cuentas vencidas** (se vencen a las 24 h pero las filas quedan para siempre).
3. **No se puede saber si funciona (Alto).** Cero métricas de uso, cero monitoreo de errores. Hoy el único sensor eres tú probando con tu teléfono.

Lo mejor que tiene: pruebas automáticas serias (SQL con 56 comprobaciones de seguridad, flujos de dos teléfonos, 97 boletas reales de evaluación), base de datos con permisos bien diseñados, y una app liviana y rápida.

---

## 2. Cuadro de calificación (1 = grave, 5 = sólido)

| Área | Nota | Justificación | Evidencia |
|---|---|---|---|
| Producto y propuesta | 3,5 | Problema real y flujo corto; diferenciación **no validada** con usuarios ni contra competidores | 💭 / ❓ |
| UX y flujo | 3,5 | Flujo de 4 pasos claro, invitado sin registro; fricción y confusión en modo compartido detectadas en tus pruebas; sin "sacar otra foto" | ✅ (sesiones de prueba) |
| Accesibilidad | 2 | axe-core: contraste grave en las 10 pantallas medidas; objetivos táctiles de 23–36 px | ✅ |
| Confiabilidad de la IA | 3,5 | 89 % de las 97 boletas cuadran; falla en fotos torcidas; depende de un solo proveedor | ✅ (con sesgo, ver H-IA1) |
| Ingeniería y pruebas | 4 | Pruebas amplias y CI; app en un solo archivo, v1 duplicada | ✅ |
| Seguridad — base de datos | 4,5 | RLS probado, tokens aleatorios, bloqueo por fuerza bruta | ✅ |
| Seguridad — API y entorno | 2 | Endpoints sin autenticación efectiva, límites débiles, sin tope de gasto, CDN sin integridad | ✅ / 🔎 |
| Privacidad y legal | 1,5 | Sin política ni términos, sin borrado, fotos a terceros sin aviso | ✅ |
| Rendimiento | 4 | 89 KB y 7 solicitudes; la espera real es el escaneo (≈6–18 s) | ✅ |
| Datos y observabilidad | 1 | Sin analítica, sin monitoreo de errores, sin alertas | ✅ |
| Escalabilidad y costos | 2,5 | Costo por escaneo bajo pero sin cuotas; consultas cada 2 s por cliente | ✅ / 🔎 |
| Global e idiomas | 2 | 48 países de reglas y 46 monedas, pero la interfaz solo está en español | ✅ |
| Salida al mercado | 1,5 | Sin canal, sin retención, sin modelo de ingresos probado, sin medición | ✅ |

**Calificación global (💭): 2,8 / 5.** Un buen prototipo con buena ingeniería y varios huecos de producto y negocio, no de código.

---

## 3. Hallazgos

### Seguridad y abuso

**S-1 · Crítico · Gasto en IA abierto a cualquiera.** ✅ + 🔎
- `core/config.js:12` trae `APP_SHARED_SECRET: 'CHANGE_ME_TO_MATCH_VERCEL_ENV_VAR'`. Los escaneos funcionan en producción con ese valor, lo que indica que la variable del servidor **no está definida** y la verificación está apagada (`api/_lib/guard.js`: solo exige el secreto si existe la variable). 🔎
- Aunque estuviera activo, el secreto viaja en el navegador: solo frena bots genéricos.
- El límite de uso es por IP y en memoria (`guard.js` y `api/scan-receipt.js:37-46`: 8 por minuto, "best-effort"): se reinicia con cada instancia de Vercel y no es global.
- Cada llamada admite imágenes de hasta 4 MB (`scan-receipt.js:648`).
- **Impacto:** quien encuentre la URL puede gastar tu saldo de Anthropic sin que nadie lo note. El tope de gasto mensual en Anthropic sigue pendiente (lo anotaste tú).
- **Recomendación:** (1) hoy: fijar un tope de gasto en Anthropic y alerta de uso; (2) exigir en cada función un **token de sesión de Supabase** (ya hay sesión anónima en el cliente; la función verifica el JWT), lo que obliga a tener una sesión y permite cuotas por usuario; (3) cuota diaria por usuario/IP en almacenamiento compartido (Upstash/Vercel KV); (4) alerta cuando el gasto del día supera un umbral. **Esfuerzo:** S para (1), M para (2)–(4).

**S-2 · Alto · Scripts de terceros sin integridad ni versión fija.** ✅
- `v2/index.html:26` carga `@supabase/supabase-js@2` desde jsDelivr (versión flotante, sin `integrity`); `v2/app.js:229` carga el generador de QR desde cdnjs; los tipos de cambio salen de `open.er-api.com` y de jsDelivr (`v2/app.js:860-861`).
- **Impacto:** si ese paquete se compromete, el atacante ejecuta código en la app con acceso a la sesión de todos los usuarios. Además, sin conexión la parte compartida no funciona porque esos archivos no se guardan.
- **Recomendación:** fijar versión exacta, añadir `integrity` o servir los archivos desde el propio dominio. **Esfuerzo:** S.

**S-3 · Medio-Alto · Sin cabeceras de seguridad.** ✅ (en el repositorio) / ❓ (en producción)
- `vercel.json` solo configura la duración máxima de una función. No hay CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy` ni `Permissions-Policy`. No pude consultar producción desde este entorno.
- **Impacto:** la app se puede incrustar en otro sitio (clickjacking) y no hay defensa extra contra inyección. El código usa `esc()` en los textos de otros usuarios, lo cual es bueno (✅), pero la CSP sería la segunda barrera.
- **Recomendación:** añadir cabeceras en `vercel.json` (CSP restringida a tu dominio, Supabase y los CDN que queden). **Esfuerzo:** S–M (hay que probar que no rompa nada).

**S-4 · Medio · Sin cuotas por usuario anónimo ni limpieza de datos.** ✅
- `dc_create_bill` no limita cuántas cuentas crea cada sesión; `items` de la cuenta es un JSON sin tope de tamaño; crear usuarios anónimos solo está frenado por los límites por defecto de Supabase (❓ no los verifiqué).
- No existe ningún trabajo que borre cuentas, miembros, marcas ni intentos fallidos vencidos: `expires_at` solo impide usarlas (`20261002_shared_bills.sql:29`).
- **Impacto:** crecimiento indefinido de la base y retención eterna de nombres y datos de pago. **Corrección a lo dicho antes:** al presentar el cierre de pagos dije que los datos "se borran con la cuenta"; hoy **la cuenta no se borra nunca**.
- **Recomendación:** tarea programada (`pg_cron` o Edge Function) que borre cuentas vencidas hace más de N días, tope de tamaño para `items`/`pay_info`, y cuota de cuentas por usuario. **Esfuerzo:** M.

**S-5 · Medio · Telemetría de lecturas sin aviso.** ✅ (código) / ❓ (si está activa)
- `api/scan-receipt.js:855+` guarda en Supabase cada lectura (respuesta del modelo con el nombre del restaurante e ítems) si hay variables de entorno de Supabase en el servidor. No se informa al usuario.
- **Recomendación:** decidir si se conserva, informarlo en la política y definir cuánto tiempo se guarda. **Esfuerzo:** S.

### Privacidad y cumplimiento

**P-1 · Alto · Sin política de privacidad, términos ni aviso de fotos.** ✅
- No hay páginas legales ni mención en la app (búsqueda en `v2/`). Las fotos van a Anthropic para leerlas; las boletas pueden mostrar terminaciones de tarjeta, nombres o direcciones; se guardan nombres de amigos (datos de terceros) y alias bancarios.
- **Impacto:** bloquea publicar en tiendas de aplicaciones y expone a quejas o a normativa de protección de datos (Chile, UE, etc.). ❓ No verifiqué la normativa aplicable ni las condiciones de retención de datos de Anthropic: **hay que revisarlas** antes de afirmar algo al usuario.
- **Recomendación:** política y términos simples (qué se envía, a quién, cuánto se guarda), un aviso corto antes del primer escaneo y borrado automático (S-4). **Esfuerzo:** M (la parte legal conviene revisarla con alguien que sepa).

### Producto y UX

**U-1 · Medio · Sin salida buena cuando la lectura sale mal.** ✅
- Con la foto torcida el modelo desplaza columnas; la app avisa que "los ítems no cuadran", pero no sugiere sacar otra foto ni ayuda a corregir la línea dudosa. Pasó con la boleta griega, la de Palermo y la de Fudo (454.800 contra 461.400).
- **Recomendación:** aviso "saca otra foto más derecha" con un botón, y que la IA pregunte una sola cosa cuando sabe que dudó (ya guardamos confianza y evidencia por ítem). **Esfuerzo:** S–M.

**U-2 · Medio · Modo compartido: curva de aprendizaje alta.** ✅
- En tus pruebas hubo cuatro confusiones distintas: dónde ingresar el nombre, quién puede marcar por quién, cómo se reparten unidades y por qué una línea "se pasaba". Se arreglaron una a una, pero indican que **la pantalla no se explica sola**.
- **Recomendación:** una primera vez guiada de 3 pasos y textos de apoyo en la pantalla ("Rodrigo marca por sí mismo; tú puedes marcar por todos"). Mejor aún: probar con 5 personas que no hayan visto la app y anotar dónde se atascan. **Esfuerzo:** M.

**U-3 · Medio · Última escritura gana en marcas simultáneas.** ✅
- Si dos personas tocan la misma línea a la vez, queda la última y el otro lo ve en ~2 s; no se avisa del cambio. Aceptable para una mesa, pero genera dudas ("¿se me borró?").
- **Recomendación:** mostrar "Tiano acaba de cambiar esto" o un aviso breve. **Esfuerzo:** S.

**U-4 · Bajo · Sin historial ni grupos.** 💭 Cada cuenta es de un solo uso, y no hay motivo para volver. La PWA instalable ayuda, pero no hay "mis cuentas anteriores".

**U-5 · Medio · Un solo idioma de interfaz.** ✅ Toda la interfaz está en español aunque se lean boletas de 30 países; para un producto "global" es un techo de crecimiento. 💭 Priorizar inglés y portugués cuando haya señal de demanda, no antes.

### Accesibilidad

**A-1 · Alto · Contraste insuficiente.** ✅ (axe-core 4.x, WCAG 2 A/AA, 390 px, claro y oscuro)
- 56 elementos con contraste insuficiente en las 10 pantallas medidas. Ejemplos: botón principal blanco sobre `#5b8cff` = **3,16:1** (mínimo 4,5); texto secundario `#8b91a0` sobre `#f6f7f9` = **2,94:1**; los campos de precio y cantidad de la revisión, **2,83:1**.
- **Recomendación:** oscurecer el azul del botón principal y el gris de texto secundario; son pocas variables de color. **Esfuerzo:** S.

**A-2 · Medio · Objetivos táctiles pequeños.** ✅ Medidos en 390 px: botones de ←/✕ de 40×40; "Quitar" 64×36; los chips de personas para marcar (la acción principal) de **34 px de alto**; los campos de precio de **23 px**. La guía de iOS pide 44 px. Impacto: errores al marcar, sobre todo con dedos grandes o en movimiento. **Esfuerzo:** S.

**A-3 · Bajo · Atributo ARIA mal usado.** ✅ El indicador de pasos usa `aria-label` en un elemento sin rol (`aria-prohibited-attr`, 8 pantallas). **Esfuerzo:** S.

**A-4 · ❓** No probé lector de pantalla, navegación por teclado ni tamaño de letra del sistema, y no encontré `prefers-reduced-motion` en el CSS (💭 menor).

### Confiabilidad de la IA

**IA-1 · Medio · La cifra de 89 % es útil pero optimista.** ✅
- Las 97 boletas de evaluación son las que tú y yo fuimos juntando, muchas de ellas porque habían fallado, y las reglas por país las afiné mirando esas mismas boletas. Eso significa que el número mide bien la regresión (que no empeore) pero **no sabemos la precisión real con boletas nuevas**.
- Resultados repetidos de la misma configuración dieron 86, 87 y 87 de 97: la variabilidad entre corridas es de ±1–2 boletas.
- **Recomendación:** reservar un conjunto de boletas que no se usen para ajustar reglas y medir contra él; ir sumando las de usuarios reales con su permiso. **Esfuerzo:** M.

**IA-2 · Medio · Tipos de falla conocidos.** ✅ Las 10 boletas que no cuadran son: fotos inclinadas o con columnas desfasadas (Albania, Grecia, Palermo), líneas negativas omitidas (Lidl: envases devueltos) y casos sueltos (Bert's Bar, Château Frontenac). Haiku, probado de verdad, **cuadró 63 %**, así que no es alternativa para fotos.

**IA-3 · Medio · Un solo proveedor y latencia.** ✅
- Si Anthropic cae o se acaba el saldo, la lectura devuelve `503 SCAN_UNAVAILABLE` con aviso para ingresar a mano (bien resuelto), pero no hay alerta ni segundo proveedor. Cada escaneo tarda de 6 a 18 s en las pruebas.
- **Recomendación:** alerta de errores 503 y, más adelante, un plan B. **Esfuerzo:** S (alerta) / L (segundo proveedor).

**IA-4 · Bajo · Costo.** 🔎 Cada escaneo cuesta unos 1,3 centavos de dólar (cálculo mío con el uso por llamada: ~1.500 tokens de entrada, ~4.700 en caché y ~500 de salida; precios que conozco, sin comprobar contra tu factura). Con 10.000 escaneos al mes, unos US$130. No es el problema; sí lo es no tener tope ni cuotas (S-1).

### Ingeniería

**E-1 · Medio · Dos copias de la versión anterior siguen publicadas.** ✅ `index.html` (171 KB) en la raíz y `apps/divicuenta/index.html` (150 KB) siguen en producción; la raíz del sitio **sirve la versión 1**, sin cuentas compartidas, PWA ni los arreglos recientes. Un arreglo de seguridad hay que hacerlo en tres sitios.
- **Recomendación:** redirigir la raíz a `/v2/`, observar unos días y borrar las dos copias. **Esfuerzo:** S.

**E-2 · Medio · Todo `v2/app.js` es un solo archivo de 924 líneas con estado global.** ✅ Funciona y está bien probado, pero cada función nueva lo hace más difícil de mantener. 💭 No lo reescribiría ahora; separar en módulos (pantallas, cuentas compartidas, cobro) cuando entre una persona más al proyecto.

**E-3 · Bajo · Orden del repositorio.** ✅ Hay dos archivos `results.*.json` de evaluaciones dentro del repositorio, el `README` está vacío y `style.css` en la raíz es de la versión 1. **Esfuerzo:** S.

**E-4 · Medio · Brechas de prueba.** ✅ Lo que sí hay: 56 comprobaciones SQL de seguridad, 45 de dos teléfonos, 24 del flujo v2, 26 de punta a punta, 24+24+17+5 de lógica, 6 de instalación, 11 de voz, y el conjunto de evaluación de boletas. Lo que no hay: pruebas en teléfonos reales (el problema del selector de fotos en Chrome del iPhone solo apareció a mano), accesibilidad en CI, carga ni pruebas visuales. **Recomendación:** añadir axe-core a CI (ya está medido y funciona). **Esfuerzo:** S.

### Rendimiento

**R-1 · ✅ Bien.** 89 KB transferidos, 7 solicitudes, primera pintura en ~64 ms en red local. Sin servidor de compilación y sin librerías pesadas. Con la red real, lo que pesa es el escaneo, no la carga.

**R-2 · Medio · Consultas cada 2 s por cliente.** ✅ + 🔎
- Cada teléfono en una cuenta compartida hace 3 consultas cada 2 s (1,5 por segundo). Con 100 personas conectadas a la vez serían ~150 por segundo. ❓ No verifiqué los límites del plan de Supabase.
- **Recomendación:** una sola consulta que devuelva todo, y/o hacer que el tiempo real funcione bien. **Esfuerzo:** M.

### Datos y observabilidad

**D-1 · Alto · Sin medición.** ✅ No hay analítica de producto ni monitoreo de errores (solo un registro local de errores en el teléfono). No sabes cuántos links se abren, cuántos invitados entran, cuántas cuentas se terminan ni cuántos escaneos fallan. La alerta `SCAN_UNAVAILABLE` existe como línea de registro pero **nadie la recibe**.
- **Recomendación:** 6 eventos mínimos (escaneo iniciado/terminado/no cuadra, link compartido, invitado entró, cuenta cerrada con pagos) sin datos personales, más un monitor de errores y una alerta de gasto. **Esfuerzo:** M.

### Salida al mercado

**M-1 · Alto · Diferenciación y mercado sin validar.** 💭 / ❓
- **Actualización (competencia investigada, ver `COMPETENCIA_2026-10-04.md`):** hay decenas de apps que leen boletas (Tab, Splitwise Pro, Checkify, Divvy, SplitBill AI…), competidores en español casi idénticos (divídelo, Splitea) y, desde el 14 de septiembre de 2026, **Apple Wallet en iOS 27** lee boletas y reparte ítems. Leer boletas no es una ventaja; la diferenciación hay que apoyarla en boletas de cualquier país medidas, sin registro y cobro, y comprobarla con una prueba contra 3 competidores.
- Lo que sostiene la propuesta es "foto → todos marcan → se cobra". **Corrección a lo que dije antes:** afirmé que otras apps exigen escribir cada gasto a mano; **no verifiqué los competidores**, y algunas ya leen boletas. La ventaja a defender es leer boletas de cualquier país con reglas locales y el flujo en vivo con cobro, y eso hay que comprobarlo contra alternativas reales.
- **Recomendación:** probar 3 apps competidoras con las mismas 5 boletas, anotar diferencias, y escribir en una línea por qué alguien elegiría esta.

**M-2 · Medio · Crecimiento y retención solo en hipótesis.** 💭 El link de invitado es el motor de difusión natural, pero no está medido; y no hay motivo de regreso (U-4). **Sin modelo de ingresos probado:** las ideas (pase por viaje, límites gratis) siguen siendo supuestos.

---

## 4. Lo que está bien hecho (no romper)

- **Permisos de base de datos diseñados y probados** (✅ 56 comprobaciones: invitados, extraños, otra cuenta, cuenta cerrada, fuerza bruta de tokens).
- **Cero fricción para el invitado:** entra con un link, sin registrarse.
- **Una sola fuente de verdad** para monedas, reglas por país y reparto, compartida por servidor, navegador y pruebas.
- **El repartir exacto:** la suma de las cuentas siempre es igual al total (método del mayor resto).
- **Honestidad de la lectura:** la app avisa cuando la suma no cuadra en vez de ocultarlo.
- **Pruebas que atrapan errores reales** (encontraron el bloqueo de intentos, ítems que desaparecían, reconexión perdida, tope de unidades).
- **Registro de decisiones** (`docs/DECISIONES.md`) con motivo y evidencia.
- **Evaluaciones medibles** y comparación de modelos con el modelo realmente usado (tras corregir un error propio de medición, ver más abajo).
- **Interfaz liviana** y ya instalable como app.

## 5. Lo que no pude verificar

| Tema | Cómo comprobarlo |
|---|---|
| Cabeceras HTTP y estado real de producción (sin acceso de red desde este entorno) | `curl -I https://yporqueno.vercel.app/v2/` y revisar variables en el panel de Vercel |
| Si `APP_SHARED_SECRET` está definido en Vercel | Panel de Vercel → Environment Variables (S-1 es una inferencia) |
| Si la telemetría `ocr_runs` está activa | Revisar si `SUPABASE_URL` y la clave existen en Vercel y si hay filas en la tabla |
| Normativa de privacidad aplicable y retención de datos de Anthropic | Consultar con alguien legal y leer las condiciones del proveedor |
| Competidores | Probar 3 apps con las mismas boletas |
| Lector de pantalla, teclado, tamaño de letra del sistema | Probar con VoiceOver / TalkBack |
| Límites y costos del plan de Supabase | Revisar el panel de uso y precios |
| Conducta con muchos usuarios a la vez | Prueba de carga con simulación |
| Si los teléfonos reales dan los mismos resultados que las pruebas (hubo un caso: Chrome del iPhone) | Pruebas manuales en 3 modelos de teléfono |

## 6. Plan priorizado

**Esta semana (proteger y poder ver):**
1. **Tope de gasto y alerta de uso en Anthropic.** Impacto: evita el peor caso. Esfuerzo: S. Listo cuando: existe un límite mensual y llega un aviso al superar la mitad.
2. **Redirigir la raíz a `/v2/` y retirar la versión 1** tras unos días. Impacto: un solo producto que proteger. Esfuerzo: S.
3. **Arreglar contraste y tamaño táctil** (A-1, A-2, A-3) y poner axe-core en CI. Esfuerzo: S. Listo cuando: axe no reporta violaciones graves y los chips miden 44 px.
4. **Fijar versiones de scripts externos y añadir `integrity`** (S-2). Esfuerzo: S.
5. **Medición mínima y monitor de errores** (D-1). Esfuerzo: M.

**Próximas 2–4 semanas (confianza y legalidad):**
6. **Autenticar las funciones con la sesión de Supabase y poner cuotas diarias** (S-1). Esfuerzo: M.
7. **Política de privacidad, términos y aviso antes del primer escaneo** (P-1) y **borrado de cuentas vencidas** (S-4). Esfuerzo: M.
8. **Cabeceras de seguridad** (S-3). Esfuerzo: S–M.
9. **"Sacar otra foto" y pregunta de aclaración cuando la lectura dudó** (U-1). Esfuerzo: S–M.
10. **Primera vez guiada en modo compartido** y **prueba con 5 personas nuevas** (U-2). Esfuerzo: M.

**Siguientes 90 días (crecer con evidencia):**
11. Conjunto de boletas reservado para medir precisión real (IA-1).
12. Probar 3 competidores y definir la diferenciación en una línea (M-1).
13. Cuentas de grupo o historial si la retención lo pide (U-4); inglés y portugués si hay demanda (U-5).
14. Modelo de ingresos solo tras medir uso: botón "Pro" de lista de espera.
15. Consulta única en vez de tres cada 2 s, o tiempo real estable (R-2).

## 7. Decisiones que te tocan a ti

1. **¿Cuánto estás dispuesto a gastar al mes en IA como máximo?** (define el tope de S-1).
2. **¿Conservas la telemetría de lecturas** (qué se guarda y por cuánto tiempo)? (S-5).
3. **¿Vas a publicar en tiendas de aplicaciones o solo como web instalable?** (cambia cuánto pesa P-1).
4. **¿A quién le haces probar la app la próxima semana?** Sin eso, ninguna otra mejora se puede validar.
5. **¿Quién revisa la política de privacidad y los términos?** Yo puedo escribir un borrador, no es asesoría legal.

## 8. Metodología y límites

- **Revisión de código** del repositorio en el commit de la rama `main` del 4 de octubre de 2026 (138 commits; ~3.000 líneas de código propio entre servidor y navegador, sin contar las dos copias de la versión 1).
- **Accesibilidad:** axe-core (reglas WCAG 2 A/AA y buenas prácticas) con Playwright sobre 5 pantallas (inicio, revisión, personas, asignar, resumen) en claro y oscuro, a 390 px; más medición de tamaño de objetivos táctiles.
- **Rendimiento:** medición local con Playwright (red local, sin CDN); no sustituye pruebas con red real.
- **Pruebas existentes** ejecutadas en CI y localmente (SQL contra Postgres, flujos de dos teléfonos, lógica) y evaluación real con 97 boletas y 3 modelos/configuraciones.
- **Corrección de un error propio:** una comparación anterior entre Haiku y Sonnet era inválida porque el flujo de la app ignoraba el modelo pedido (las dos corridas eran Sonnet). Se arregló: ahora cada evaluación imprime el modelo que respondió de verdad. Medido bien, Haiku cuadra 63 % contra ~89 % de Sonnet.
- **Límites:** sin acceso de red a producción desde este entorno; sin pruebas con usuarios; sin teléfonos reales; las cifras de costo son estimaciones mías con precios que conozco, no con tu factura.
