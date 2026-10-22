# Alcance de DiviCuenta

Documento corto para decidir **qué entra y qué no**. Si una idea no está aquí, se discute con evidencia antes de construirla.

## Qué hace hoy
1. Foto de la boleta (cualquier país/idioma/moneda) → ítems, impuestos, servicio, propina y total.
2. Verificación: la suma de ítems debe cuadrar con el total impreso; si no, se avisa y se ofrece corregir (incluye servicio/propina incluidos en el total).
3. Reparto: cada persona marca lo que consumió (un teléfono, o cuenta compartida en vivo con invitados anónimos). Extras proporcionales; propina por % o monto.
4. Cierre de pago: quién pagó y quién debe a quién; se puede compartir imagen del resumen.
5. Límite de uso por usuario y global, para controlar costo.

## Qué NO hace (todavía), a propósito
- **Modo viaje** (varios gastos acumulados en un grupo durante días).
- **Cuentas sin boleta** (gastos ingresados a mano como fuente principal).
- **Monedas distintas por persona / conversión de divisas.**
- **Pagos dentro de la app** (cobrar, transferir, integrar bancos).
- **Cuentas con correo/clave para invitados** (siguen anónimos).
- **App nativa** (se mantiene PWA).
- **Política de privacidad publicada**: pendiente de titular y revisión legal (PR #94).

## Evidencia necesaria para añadir algo de esa lista
Una función pasa a desarrollo solo si se cumplen **las tres**:
1. Al menos **5 grupos reales** la pidieron o la habrían usado, observados en uso, no supuestos.
2. Se puede medir su efecto en la métrica norte (abajo) o en retención.
3. No empeora la lectura de boletas ni el costo por escaneo.

## Métricas
- **Norte:** % de cuentas que llegan a "todos pagaron" **sin corrección manual**.
- **Calidad OCR:** % de boletas donde la suma cuadra con el total impreso; costo medio por escaneo (¢).
- **Crecimiento:** conversión invitado → anfitrión (invitado que luego abre su propia cuenta).

## Plan de 30 días
Validar con 5 grupos reales; medir las métricas anteriores; con Haiku 5.5 como modelo base y cascada a Sonnet 5.5 solo si los datos lo justifican (muestras pequeñas, con OK de costo). Cada hallazgo → un fixture nuevo en los evals.
