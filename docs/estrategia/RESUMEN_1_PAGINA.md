# DiviCuenta: qué hacer ahora (resumen de una página)

22 de octubre de 2026 · Detalle en `A_diagnostico_y_mercado.md`, `B_diferenciacion_y_retencion.md` y `C_apuesta_y_plan.md`.

## La recomendación, en simple
**Cobrar una vez por viaje.** Un **"Pase de viaje" de CLP 3.990 por grupo** (≈US$4,3), que paga quien organiza. Junta todas las boletas del viaje, en cualquier país y moneda, y al final dice **quién le paga a quién** con el menor número de transferencias. Partimos con **grupos de amigos o familia chilenos que viajan**, coordinados por WhatsApp, y cobramos con un **enlace de pago de Flow**.

## Por qué esto y no otra cosa
- **Dividir una cena pasa pocas veces al mes**, y las apps grandes lo regalan (Tricount: gratis, sin límites, 17–24 millones de usuarios). Una suscripción mensual casi nadie la paga: en apps así, cerca del **2 %** de los usuarios termina pagando.
- **En un viaje la necesidad es diaria y la plata es más:** hay muchas boletas, otra moneda y otras reglas de propina. Ahí nuestra lectura de boletas de otros países **sí marca diferencia**. Apple lo hace **solo en EE. UU.**, y Splitwise cobra suscripción para escanear.
- Ya hay gente que paga por "pases de grupo" (Settle Up, Kittysplit, Splitwise): **el formato existe**.
- **Se puede vender esta misma semana**, sin programar: primero se vende (preventa) y después se construye.

## Los 5 números que más pesan
1. **≈US$2 de ganancia por cada pase vendido**, después de IVA, comisión de Flow, IA y el costo de los usuarios gratis. Si muy pocos compran (0,5 %), **se pierde plata por pase**: lo gratis tiene que tener tope.
2. **≈25 pases al mes cubren los costos fijos** (≈US$51/mes: para cobrar, el plan gratis de Vercel no sirve y hay que pagar US$20/mes; más dominio y contador). Sin contador, ≈11 pases.
3. **0,6–1,2 centavos de dólar por boleta leída:** la IA no es el problema. El problema es que alguien pague.
4. **Lo que gana el dueño al mes:** con 10 pases, −US$31 · con 100, **+US$136** · con 1.000, **+US$1.731**.
5. **US$200–300 millones de ingreso al año** harían falta para valer US$1.000 millones (unicornio). El líder chileno de rendición de gastos (Rindegastos) tiene unos 192 mil usuarios; Expensify factura US$142 millones al año y vale menos de US$250 millones en la bolsa.

## ¿Unicornio? La respuesta honesta
**No veo un camino creíble.** Revisé siete caminos más allá de "otra app de dividir cuentas": vender el lector a otras empresas, gastos de pymes, restaurantes, alianzas con billeteras, cobros por WhatsApp, datos de consumo y venta a un grande. Ninguno tiene una barrera que impida copiarlo: un equipo con dinero replica nuestro lector en semanas, y leer boletas sale cada vez más barato para todos. El menos imposible es **vender el lector como servicio en Latinoamérica**, y su punto más débil es que **quienes más lo necesitan ya lo tienen**. Lo realista es un **ingreso complementario** de cientos a pocos miles de dólares al mes si funciona.

## Qué hacer en los próximos 30 días
1. **Semana 1:** preguntarle al hermano y a los amigos 5 cosas concretas (están en el documento A) y correr las consultas de `docs/CUOTA_Y_USO.md` en Supabase.
2. **Semana 2:** averiguar con un contador cuánto cuesta cobrar legalmente y completar la política de privacidad (PR #94) con un titular y un correo **del proyecto**. Hasta que un abogado la revise, **no se fusiona**.
3. **Semana 3:** ofrecer el pase en preventa a **20 grupos que viajen en los próximos 2 meses**, con enlace de Flow.
4. **Semana 4:** comparar nuestra lectura con 3 apps usando 10 boletas del repositorio, sin gastar IA.
5. **Día 30:** si nadie pagó, **se para** y se prueba vender el lector a empresas (plan B) o se deja como hobby gratis. Si pagan 3 o más, se construye el pase.

## Qué dejar de hacer ya
Agregar reglas y boletas de prueba sin fallos de usuarios reales, intentar ser "mundial", grupos permanentes con registro, restaurantes, bot de WhatsApp pagado, cobros dentro de la app.

## Corrección importante
El repositorio tiene **197 boletas de prueba de 43 países**, no "211+ de 46". Los sets "14 de 14" y "13 de 13" que se citan no están en el repositorio. Hay que subirlos o dejar de usarlos como argumento.

## Lo que solo usted puede decidir
1. ¿Cuántas horas por semana tiene, y quiere una empresa o un ingreso extra?
2. ¿Cuánto está dispuesto a gastar en abogado y contador (≈US$200–700) antes de cobrar?
3. ¿Tiene un socio técnico o contactos en empresas que lean boletas? Si los tiene, vender el lector podría ser una mejor apuesta que el pase.
