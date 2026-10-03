# Cuentas compartidas (v2) — diseño

Objetivo: el anfitrión escanea la boleta y comparte un link o QR; cada invitado abre ese link en
su propio teléfono, marca lo que consumió y todos ven los totales actualizarse en vivo.

## Principios
1. **Cero fricción para el invitado**: entra con el link, sin registrarse. Supabase le da una
   identidad anónima automática (`auth.uid()` estable en ese teléfono).
2. **Nada abierto por defecto**: todas las tablas con RLS; sin políticas públicas de lectura.
   Hoy cualquiera con un id de sesión puede leer y *editar* sesiones ajenas; aquí no.
3. **El token es la llave, y no se adivina**: 22 caracteres aleatorios (~128 bits). Quien tiene el
   link entra; quien no, no. Expira (24 h por defecto) y el anfitrión puede cerrarla.
4. **Cada quien manda sobre lo suyo**: un invitado solo puede crear, cambiar o borrar *sus propias*
   marcas. No puede tocar las de otro ni los ítems. Esto lo impone la base de datos, no la app.
5. **El anfitrión manda sobre la boleta**: ítems, propina, cerrar la cuenta.

## Tablas
| Tabla | Para qué | Quién lee | Quién escribe |
|---|---|---|---|
| `dc_bills` | La cuenta: moneda, restaurante, ítems (jsonb), propina, estado, token, expiración | miembros | solo el anfitrión (`host_id`) |
| `dc_bill_members` | Quién está en la cuenta: nombre, color, `user_id` | miembros | cada uno su propia fila; el anfitrión puede quitar a cualquiera |
| `dc_claims` | Qué marcó cada uno: `(bill_id, member_id, item_id, units)` | miembros | solo el dueño de la fila |

- La boleta queda en `dc_bills.items` (jsonb) porque se lee y escribe completa, y evita una tabla
  más con RLS. Las marcas sí son filas: cambian mucho, por persona, y necesitan permisos finos.
- `units = null` significa "comparte la línea completa"; un número reparte unidades.

## Entrar con el token
Un invitado todavía no es miembro, así que no puede leer la cuenta para "ver si el token calza".
Se resuelve con una función en la base de datos (`dc_join_bill(token, nombre)`) que corre con
permisos elevados pero **solo** hace esto: valida el token, que no haya expirado y que la cuenta
esté abierta; crea (o devuelve) la fila del miembro con `auth.uid()`; devuelve el `bill_id`.
No expone nada más, y el token nunca se compara desde el cliente.

Protección contra adivinar tokens: la función registra cada intento fallido por usuario
(`dc_join_attempts`) y bloquea tras 20 en 10 minutos. Con un token inválido **devuelve vacío en
vez de lanzar un error**: si lanzara una excepción, Postgres desharía también el registro del
intento y el contador nunca subiría (lo descubrió la prueba `tests/sql/test_shared_bills.sql`).

## Tiempo real
Supabase Realtime sobre `dc_bills`, `dc_bill_members` y `dc_claims`, filtrado por `bill_id`.
Las políticas RLS también aplican a Realtime, así que nadie recibe cambios de cuentas ajenas.

## Qué NO resuelve esto
- Dos personas marcando la misma unidad a la vez: la última gana. Para una cuenta de restaurante
  es aceptable; si pasa, se ve en pantalla al instante.
- El anfitrión pierde el teléfono: la cuenta queda sin dueño (se podrá transferir más adelante).
- Historial entre dispositivos: necesita cuenta real (Google), que viene después.

## Unirse eligiendo tu nombre (migración 20261004)

El anfitrión arma la lista de personas; al abrir el link, el invitado ve esa lista y toca su nombre ("Soy yo"). Quien no está en la lista escribe el suyo.

- `dc_bills.people` guarda la lista (solo la escribe el anfitrión) y `dc_bills.pre_assigns` lo que el anfitrión ya marcó a quienes aún no entran.
- `dc_peek_bill(token)` deja ver la lista y los nombres ya tomados **sin** ser miembro (comparte el freno de fuerza bruta con `dc_join_bill`).
- `dc_join_bill(token, nombre, persona)` con `persona`: el nombre lo pone el servidor, un nombre solo lo toma una persona (`NAME_TAKEN`) y las marcas previas del anfitrión pasan a las marcas del invitado.
- Quien ya entró marca lo suyo desde su teléfono; el anfitrión no lo cambia por él.
- El teléfono consulta la cuenta cada 4 s y al volver a la pestaña, porque el tiempo real se corta cuando el teléfono suspende la página.

## El anfitrión marca por los demás (migración 20261005)

El dueño de la cuenta puede marcar, cambiar unidades y desmarcar por cualquier miembro de **su** cuenta (útil si alguien no tiene batería o no quiere entrar). Cada invitado sigue pudiendo corregir lo suyo; si dos tocan a la vez gana el último y el otro lo ve en ~4 s. Los permisos están en `dc_claims_insert/update` (y `delete`, que ya existía) y se prueban en `tests/sql/test_shared_bills.sql`: un invitado no marca por otro, nadie escribe en cuentas ajenas ni cerradas.
