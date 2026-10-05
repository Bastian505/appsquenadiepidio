# Lanzamiento: qué falta y cómo agregar login con Google

Estado al 2026-10-05. Complementa `docs/auditoria/AUDITORIA_2026-10-04.md`.

## A. Para poder mostrarlo a desconocidos (bloqueantes)

| # | Qué | Quién | Estado |
|---|---|---|---|
| 1 | Política de privacidad y términos publicados, con titular y correo reales | Tú dices el nombre y el correo; yo lo publico | Redactadas; faltan 2 datos |
| 2 | Borrado automático de cuentas compartidas (30 días) y registro de uso (12 meses) | Tú ejecutas el SQL `20261008`; actívalo con pg_cron | Código listo |
| 3 | Cuota de lecturas + tope diario | SQL `20261007` + variables en Vercel (ver `docs/CUOTA_Y_USO.md`) | Código listo, **apagada** |
| 4 | Límite de gasto mensual en la consola de Anthropic | Tú, 5 minutos | Pendiente |
| 5 | Clave `ANTHROPIC_API_KEY` sin aviso "Needs Attention" en Vercel | Tú | Pendiente de revisar |
| 6 | `OCR_PROFILE_RETRY=1` en Vercel | Tú, 2 minutos | Pendiente de confirmar |
| 7 | **Dominio propio** (~10–15 USD/año) | Tú | Recomendado (ver abajo) |

## B. Para medir de verdad (lo siguiente que construiría)

- Registro de uso de lecturas: **hecho** (apagado hasta activar la cuota).
- Falta registrar, sin guardar contenido: ¿cuántas boletas se corrigen a mano? ¿se llegó a "cuánto paga cada uno"? ¿se compartió la cuenta? ¿se marcó un pago? Con eso se ve dónde se pierde la gente y si la lectura es suficientemente buena.
- Una página de métricas solo para ti (protegida), en vez de pegar consultas SQL.

## C. Calidad y confianza

- Accesibilidad: contraste de colores (azul `#5b8cff` y grises bajo 4,5:1) y botones de menos de 44 px.
- Quitar la versión vieja de la raíz (v1) y dejar v2 como única.
- Fijar versiones y firmas (SRI) de las librerías externas, y cabeceras de seguridad en Vercel.
- Más boletas de prueba: fotos malas, supermercados, Brasil, México, Perú, Colombia.

## D. Producto

- Modo viaje: varias boletas, varias monedas y saldo neto entre amigos.
- Conversión a tu moneda local (ya existe una línea con el tipo de cambio; falta el saldo por persona).
- Reparto de descuentos globales (parejo, o solo a quienes consumieron).

## E. Login con Google para el anfitrión

### Por qué
Una cuenta permanente da: cuota que no se reinicia al borrar el navegador, historial en varios dispositivos, usuarios reales para medir retención y una base para cobrar. Los invitados siguen entrando **sin registrarse**.

### Diseño (el que propongo implementar)
- Todos parten como usuarios anónimos (como hoy).
- Anónimo: **5 lecturas al mes**. Con Google: **30 al mes** (cifras ajustables con variables).
- Al agotar las 5, la app le ofrece al anfitrión "Continuar con Google" (nunca a un invitado).
- Se **vincula** la identidad Google a la sesión anónima (`supabase.auth.linkIdentity({ provider: 'google' })`): conserva el mismo identificador, el historial y las cuentas compartidas. No se crea un usuario nuevo.
- Con Google se guarda el correo y el nombre público que Google entrega. La política de privacidad debe actualizarse **antes** de activarlo (texto abajo).

### Lo que tienes que configurar tú (yo no puedo)
1. **Google Cloud Console** → nuevo proyecto → *APIs y servicios* → *Pantalla de consentimiento de OAuth* (tipo Externo): nombre de la app, correo de soporte, enlaces a la política y a los términos, y el dominio. Alcances: solo `openid`, `email`, `profile` (no requieren revisión de Google).
2. *Credenciales* → *Crear ID de cliente OAuth* → *Aplicación web*. En **URI de redireccionamiento autorizados** pega: `https://kozakmufitkepgpxctxu.supabase.co/auth/v1/callback`.
3. **Supabase** → *Authentication* → *Providers* → *Google* → pega el ID y el secreto del cliente y activa.
4. Supabase → *Authentication* → *URL Configuration* → *Site URL* y *Redirect URLs*: la dirección de la app.
5. Supabase → *Authentication* → *Sign In / Providers* → activa **"Allow manual linking"** (necesario para convertir al usuario anónimo).

### Advertencia sobre el dominio
Hoy la app vive en `yporqueno.vercel.app`, un subdominio que no es tuyo. Google puede no aceptarlo como dominio autorizado de la pantalla de consentimiento (no puedes verificar su propiedad), y el aviso de "app no verificada" asusta a los usuarios. **Un dominio propio resuelve esto** y además da confianza, correo de contacto propio (`privacidad@tudominio`) y enlaces estables. Lo recomiendo antes de activar Google.

### Sección que se agrega a la política de privacidad al activar Google
> **Si inicias sesión con Google.** Recibimos de Google tu correo electrónico, tu nombre y la foto de perfil pública, solo para identificar tu cuenta, mantener tu historial y aplicar tus límites de uso. No recibimos tu contraseña ni accedemos a tu correo, contactos ni archivos. Estos datos se guardan en nuestra base de datos (Supabase) mientras tengas cuenta y se eliminan si nos pides cerrarla. Puedes revocar el acceso en tu cuenta de Google en cualquier momento.

Y agregar "Google" a la lista de quienes reciben datos (la prueba `tests/check-legal.mjs` obliga a declarar cualquier servicio nuevo).

## F. Antes de publicar la política

1. Reemplazar `{{TITULAR}}` y `{{CORREO}}` en `v2/privacidad.html` y `v2/terminos.html`.
2. Correr `LEGAL_FINAL=1 node tests/check-legal.mjs` (falla si queda algún marcador).
3. **Que la lea un abogado.** Está escrita en lenguaje simple y ajustada a lo que el código hace hoy, pero no es asesoría legal. Chile tiene la Ley 19.628 y una nueva ley de protección de datos personales (Ley 21.719) que entra en vigencia en diciembre de 2026: conviene confirmar con un abogado qué obligaciones adicionales aplican.
