-- Pruebas de seguridad de las cuentas compartidas (supabase/migrations/20261002_shared_bills.sql).
-- Pregunta que responde cada una: ¿puede alguien hacer algo que NO debería?
-- Se corre con tests/check-sql.sh contra un Postgres local. Imprime OK/FALLA y un resumen final.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create table test_failures (label text);
create table ctx (k text primary key, v text);   -- ids compartidos entre bloques

create function note(label text, got boolean, want boolean default true) returns void
language plpgsql as $$ begin
  if got is not distinct from want then raise notice '  OK   %', label;
  else raise warning '  FALLA %  (esperaba %, obtuvo %)', label, want, coalesce(got::text, 'null');
       insert into test_failures values (label);
  end if;
end $$;

-- Corre un comando como un usuario dado y dice si FUE RECHAZADO (true = rechazado).
create function denied(u text, sql text) returns boolean
language plpgsql as $$
declare rows int;
begin
  perform set_config('request.jwt.claim.sub', u, true);
  set local role authenticated;
  execute sql; get diagnostics rows = row_count;
  reset role;
  return rows = 0;   -- RLS no lanza error en UPDATE/DELETE: simplemente no afecta filas
exception when others then
  reset role; return true;
end $$;

create function as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, true); set local role authenticated; end $$;

create function get(k text) returns text language sql stable as $$ select v from ctx where k = $1 $$;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),   -- anfitrión
  ('22222222-2222-2222-2222-222222222222'),   -- invitado
  ('33333333-3333-3333-3333-333333333333'),   -- extraño
  ('55555555-5555-5555-5555-555555555555'),   -- invitado que elige "Tiano" de la lista
  ('66666666-6666-6666-6666-666666666666');   -- invitada que elige "Ana" de la lista

\echo '── El anfitrión crea su cuenta ──'
begin;
  select as_user('11111111-1111-1111-1111-111111111111');
  insert into ctx
    select 'bill', out_bill_id::text from dc_create_bill('Rodrigo', 'MYR');
  insert into ctx select 'token', share_token from dc_bills where id = get('bill')::uuid;
  insert into ctx select 'host_member', id::text from dc_bill_members where bill_id = get('bill')::uuid;
  update dc_bills set items = '[{"id":"1","name":"Pizza","price":100,"qty":2}]'::jsonb where id = get('bill')::uuid;
  select note('anfitrión crea y edita su cuenta',
    (select items->0->>'name' = 'Pizza' from dc_bills where id = get('bill')::uuid));
  select note('el token son 22 caracteres base64url, sin relleno "="', (select get('token') ~ '^[A-Za-z0-9_-]{22}$'));
  reset role;
commit;

\echo '── Un extraño no ve nada ──'
begin;
  select as_user('33333333-3333-3333-3333-333333333333');
  select note('extraño no ve la cuenta', (select count(*) = 0 from dc_bills));
  select note('extraño no ve los miembros', (select count(*) = 0 from dc_bill_members));
  reset role;
commit;

\echo '── Token inválido y fuerza bruta ──'
begin;
  select as_user('33333333-3333-3333-3333-333333333333');
  select note('token inventado no devuelve ninguna cuenta',
    (select count(*) = 0 from dc_join_bill('token-inventado-aaaa', 'Intruso')));
  reset role;
  -- 20 intentos fallidos y el siguiente queda bloqueado
  do $$ declare i int; begin
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    for i in 1..25 loop
      begin perform dc_join_bill('malo-' || i, 'x'); exception when others then null; end;
    end loop;
  end $$;
  select note('se registran los intentos fallidos',
    (select count(*) >= 20 from dc_join_attempts where user_id = '33333333-3333-3333-3333-333333333333'));
  -- Con el contador pasado de 20, incluso el token BUENO debe quedar bloqueado
  select note('tras 20 intentos fallidos queda bloqueado (ni con el token bueno entra)',
    denied('33333333-3333-3333-3333-333333333333', format($$select dc_join_bill(%L, 'Intruso')$$, get('token'))));
commit;

\echo '── El invitado entra con el token ──'
begin;
  select as_user('22222222-2222-2222-2222-222222222222');
  insert into ctx select 'guest_member', out_member_id::text from dc_join_bill(get('token'), 'Tiano');
  select note('invitado entra y ve la cuenta', (select count(*) = 1 from dc_bills where id = get('bill')::uuid));
  select note('invitado ve a los dos miembros', (select count(*) = 2 from dc_bill_members where bill_id = get('bill')::uuid));
  insert into dc_claims (bill_id, member_id, item_id, units)
    values (get('bill')::uuid, get('guest_member')::uuid, '1', 1);
  select note('invitado marca lo suyo', (select count(*) = 1 from dc_claims where member_id = get('guest_member')::uuid));
  reset role;
commit;

\echo '── Lo que el invitado NO puede hacer ──'
begin;
  select note('invitado no edita la boleta',
    denied('22222222-2222-2222-2222-222222222222',
      format($$update dc_bills set items = '[]'::jsonb, tip = null where id = %L$$, get('bill'))));
  select note('invitado no marca en nombre de otro',
    denied('22222222-2222-2222-2222-222222222222',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '1', 5)$$, get('bill'), get('host_member'))));
  select note('invitado no borra marcas ajenas',
    denied('22222222-2222-2222-2222-222222222222',
      format($$delete from dc_claims where member_id = %L$$, get('host_member'))));
  select note('invitado no cambia el token del link',
    denied('22222222-2222-2222-2222-222222222222',
      format($$update dc_bills set share_token = 'otro' where id = %L$$, get('bill'))));
  select note('invitado no borra la cuenta',
    denied('22222222-2222-2222-2222-222222222222', format($$delete from dc_bills where id = %L$$, get('bill'))));
  select note('invitado no se cuela en otra cuenta inventando la membresía',
    denied('22222222-2222-2222-2222-222222222222',
      format($$insert into dc_bill_members (bill_id, user_id, name) values (%L, '33333333-3333-3333-3333-333333333333', 'Falso')$$, get('bill'))));
commit;

\echo '── El extraño tampoco toca las marcas ──'
begin;
  select as_user('33333333-3333-3333-3333-333333333333');
  select note('extraño no ve las marcas', (select count(*) = 0 from dc_claims));
  reset role;
  select note('extraño no inserta marcas',
    denied('33333333-3333-3333-3333-333333333333',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '1', 1)$$, get('bill'), get('guest_member'))));
commit;

\echo '── El anfitrión sí manda ──'
begin;
  select as_user('11111111-1111-1111-1111-111111111111');
  select note('anfitrión ve las marcas de todos', (select count(*) = 1 from dc_claims where bill_id = get('bill')::uuid));
  reset role;
commit;

\echo '── Unirse eligiendo el nombre de la lista ──'
begin;
  select as_user('11111111-1111-1111-1111-111111111111');
  update dc_bills set
    people = '[{"id":"1","name":"Rodrigo"},{"id":"2","name":"Tiano"},{"id":"3","name":"Ana"}]'::jsonb,
    pre_assigns = '{"3":{"1":null}}'::jsonb
    where id = get('bill')::uuid;
  reset role;
  select as_user('55555555-5555-5555-5555-555555555555');
  select note('antes de entrar se ve la lista de nombres (3) sin ser miembro',
    (select jsonb_array_length(out_people) = 3 from dc_peek_bill(get('token'))));
  select note('y sin ser miembro no se ve la cuenta', (select count(*) = 0 from dc_bills));
  select note('un token inventado no muestra nada', (select count(*) = 0 from dc_peek_bill('inventado-xxxxxxxxxxxx')));
  insert into ctx select 'tiano_member', out_member_id::text from dc_join_bill(get('token'), 'HACKER', '2');
  select note('el nombre lo pone el servidor, no el cliente',
    (select name = 'Tiano' from dc_bill_members where id = get('tiano_member')::uuid));
  reset role;
  select note('un nombre ya tomado no se puede elegir de nuevo',
    denied('66666666-6666-6666-6666-666666666666', format($$select dc_join_bill(%L, 'Otro', '2')$$, get('token'))));
  select note('un nombre que no está en la lista se rechaza',
    denied('66666666-6666-6666-6666-666666666666', format($$select dc_join_bill(%L, 'Otro', '99')$$, get('token'))));
  select as_user('66666666-6666-6666-6666-666666666666');
  insert into ctx select 'ana_member', out_member_id::text from dc_join_bill(get('token'), 'x', '3');
  select note('lo que el anfitrión ya había marcado para Ana pasa a sus marcas',
    (select count(*) = 1 from dc_claims where member_id = get('ana_member')::uuid and item_id = '1'));
  select note('la lista muestra los nombres tomados',
    (select out_taken @> array['2','3'] from dc_peek_bill(get('token'))));
  reset role;
  select note('un miembro no puede quedarse con el nombre de otro cambiando su fila',
    denied('66666666-6666-6666-6666-666666666666',
      format($$update dc_bill_members set person_key = '2' where id = %L$$, get('ana_member'))));
commit;

\echo '── El anfitrión marca por los demás (y solo en su cuenta) ──'
begin;
  select as_user('33333333-3333-3333-3333-333333333333');
  insert into ctx select 'bill2', out_bill_id::text from dc_create_bill('Extraño', 'MYR');
  insert into ctx select 'member2', id::text from dc_bill_members where bill_id = get('bill2')::uuid;
  reset role;
commit;
begin;
  select note('anfitrión marca por el invitado',
    not denied('11111111-1111-1111-1111-111111111111',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '3', 1)$$, get('bill'), get('guest_member'))));
  select note('anfitrión cambia las unidades del invitado',
    not denied('11111111-1111-1111-1111-111111111111',
      format($$update dc_claims set units = 2 where member_id = %L and item_id = '3'$$, get('guest_member'))));
  select note('el invitado puede corregir lo que marcó el anfitrión',
    not denied('22222222-2222-2222-2222-222222222222',
      format($$update dc_claims set units = 1 where member_id = %L and item_id = '3'$$, get('guest_member'))));
  select note('el invitado puede quitar la marca que puso el anfitrión',
    not denied('22222222-2222-2222-2222-222222222222',
      format($$delete from dc_claims where member_id = %L and item_id = '3'$$, get('guest_member'))));
  select note('anfitrión no marca por un miembro de otra cuenta',
    denied('11111111-1111-1111-1111-111111111111',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '3', 1)$$, get('bill'), get('member2'))));
  select note('anfitrión no escribe en una cuenta ajena',
    denied('11111111-1111-1111-1111-111111111111',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '3', 1)$$, get('bill2'), get('member2'))));
  select note('el invitado sigue sin poder marcar por el anfitrión',
    denied('22222222-2222-2222-2222-222222222222',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '3', 1)$$, get('bill'), get('host_member'))));
  select note('el extraño no marca por nadie de esta cuenta',
    denied('33333333-3333-3333-3333-333333333333',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '3', 1)$$, get('bill'), get('guest_member'))));
commit;

\echo '── Cierre de pagos ──'
begin;
  select note('el invitado marca que ya pagó',
    not denied('22222222-2222-2222-2222-222222222222', format($$select dc_set_paid(%L, true)$$, get('guest_member'))));
  select note('queda registrada la fecha', (select paid_at is not null from dc_bill_members where id = get('guest_member')::uuid));
  select note('el invitado no marca por el anfitrión',
    denied('22222222-2222-2222-2222-222222222222', format($$select dc_set_paid(%L, true)$$, get('host_member'))));
  select note('el extraño no marca pagos de esta cuenta',
    denied('33333333-3333-3333-3333-333333333333', format($$select dc_set_paid(%L, true)$$, get('guest_member'))));
  select note('el anfitrión puede desmarcar a un invitado (le pagó en efectivo, se equivocó, etc.)',
    not denied('11111111-1111-1111-1111-111111111111', format($$select dc_set_paid(%L, false)$$, get('guest_member'))));
  select note('y el invitado queda otra vez pendiente', (select paid_at is null from dc_bill_members where id = get('guest_member')::uuid));
  select note('el anfitrión no marca pagos de otra cuenta',
    denied('11111111-1111-1111-1111-111111111111', format($$select dc_set_paid(%L, true)$$, get('member2'))));
  select note('el anfitrión escribe los datos para transferir',
    not denied('11111111-1111-1111-1111-111111111111', format($$update dc_bills set pay_info = 'Alias: rodrigo.pagos' where id = %L$$, get('bill'))));
  select note('el invitado no cambia los datos de pago',
    denied('22222222-2222-2222-2222-222222222222', format($$update dc_bills set pay_info = 'Alias: estafa' where id = %L$$, get('bill'))));
  select as_user('22222222-2222-2222-2222-222222222222');
  select note('el invitado ve los datos para transferir',
    (select pay_info = 'Alias: rodrigo.pagos' from dc_bills where id = get('bill')::uuid));
  reset role;
  select as_user('33333333-3333-3333-3333-333333333333');
  select note('el extraño no ve los datos de pago', (select count(*) = 0 from dc_bills where id = get('bill')::uuid));
  reset role;
  select note('el texto de pago tiene tope de largo',
    denied('11111111-1111-1111-1111-111111111111', format($$update dc_bills set pay_info = repeat('x', 401) where id = %L$$, get('bill'))));
commit;

\echo '── Cuenta cerrada ──'
begin;
  select as_user('11111111-1111-1111-1111-111111111111');
  update dc_bills set status = 'closed' where id = get('bill')::uuid;
  reset role;
commit;
begin;
  select note('cerrada: el invitado ya no puede marcar',
    denied('22222222-2222-2222-2222-222222222222',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '9', 1)$$, get('bill'), get('guest_member'))));
  select note('cerrada: ya no se registran pagos',
    denied('22222222-2222-2222-2222-222222222222', format($$select dc_set_paid(%L, true)$$, get('guest_member'))));
  select note('cerrada: ni el anfitrión puede marcar por otros',
    denied('11111111-1111-1111-1111-111111111111',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '9', 1)$$, get('bill'), get('guest_member'))));
  insert into auth.users (id) values ('44444444-4444-4444-4444-444444444444');
  select as_user('44444444-4444-4444-4444-444444444444');
  select note('cerrada: nadie más puede entrar con el token',
    (select count(*) = 0 from dc_join_bill(get('token'), 'Tarde')));
  reset role;
  select as_user('22222222-2222-2222-2222-222222222222');
  select note('cerrada: el invitado todavía ve su cuenta', (select count(*) = 1 from dc_bills where id = get('bill')::uuid));
  reset role;
commit;

\echo '── Cuenta expirada ──'
begin;
  select as_user('11111111-1111-1111-1111-111111111111');
  update dc_bills set status = 'open', expires_at = now() - interval '1 minute' where id = get('bill')::uuid;
  reset role;
commit;
begin;
  select as_user('44444444-4444-4444-4444-444444444444');
  select note('expirada: no se puede entrar',
    (select count(*) = 0 from dc_join_bill(get('token'), 'Tarde')));
  reset role;
  select note('expirada: no se puede marcar',
    denied('22222222-2222-2222-2222-222222222222',
      format($$insert into dc_claims (bill_id, member_id, item_id, units) values (%L, %L, '8', 1)$$, get('bill'), get('guest_member'))));
commit;

\echo '── Sin sesión (sin auth.uid) no se puede nada ──'
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '', true);
  select note('anónimo sin sesión no ve cuentas', (select count(*) = 0 from dc_bills));
  reset role;
commit;

\echo '── Cuota de escaneos y registro de uso ──'
begin;
  select as_user('55555555-5555-5555-5555-555555555555');
  select note('cuota: 1.er escaneo permitido (usa 1 de 2)', (select out_allowed and out_used = 1 from dc_consume_scan(2)));
  select note('cuota: 2.º escaneo permitido (usa 2 de 2)', (select out_allowed and out_used = 2 from dc_consume_scan(2)));
  select note('cuota: el 3.º se rechaza por el límite mensual', (select not out_allowed and out_reason = 'user_month' from dc_consume_scan(2)));
  select note('cuota: sin límite (0) siempre deja pasar', (select out_allowed from dc_consume_scan(0)));
  reset role;
  select note('cuota: no puede leer la tabla de uso directamente', denied('55555555-5555-5555-5555-555555555555', 'select * from dc_scan_log'));
  select note('cuota: no puede escribir en la tabla de uso directamente', denied('55555555-5555-5555-5555-555555555555', $$insert into dc_scan_log (user_id) values ('55555555-5555-5555-5555-555555555555')$$));
  select note('cuota: no puede borrar su historial', denied('55555555-5555-5555-5555-555555555555', 'delete from dc_scan_log'));
commit;
begin;
  -- Cada usuario tiene su propia cuota
  select as_user('66666666-6666-6666-6666-666666666666');
  select note('cuota: otro usuario parte de cero', (select out_allowed and out_used = 1 from dc_consume_scan(2)));
  reset role;
  insert into ctx values ('scan_b', (select id::text from dc_scan_log where user_id = '66666666-6666-6666-6666-666666666666' limit 1));
commit;
begin;
  -- Un usuario no puede cerrar el escaneo de otro
  select as_user('55555555-5555-5555-5555-555555555555');
  select dc_finish_scan(get('scan_b')::uuid, true, 'CL', 'm', true, 1.5, 3);
  reset role;
  select note('cuota: no puede cerrar el escaneo de otro usuario', (select status = 'started' from dc_scan_log where id = get('scan_b')::uuid));
commit;
begin;
  select as_user('66666666-6666-6666-6666-666666666666');
  select dc_finish_scan(get('scan_b')::uuid, true, 'CL', 'claude-sonnet-5-5', true, 1.234, 7);
  reset role;
  select note('registro: el dueño lo cierra con país, modelo, costo y si cuadró',
    (select status = 'ok' and country = 'CL' and model = 'claude-sonnet-5-5' and cuadra and cost_cents = 1.234 and n_items = 7 from dc_scan_log where id = get('scan_b')::uuid));
  select as_user('66666666-6666-6666-6666-666666666666');
  select dc_finish_scan(get('scan_b')::uuid, false, 'XX', 'otro', false, 99, 1);
  reset role;
  select note('registro: un escaneo ya cerrado no se puede reescribir', (select status = 'ok' and country = 'CL' from dc_scan_log where id = get('scan_b')::uuid));
commit;
begin;
  -- Un escaneo fallido se devuelve y no cuenta contra la cuota
  select as_user('77777777-7777-7777-7777-777777777777');
  select note('fallido: reserva el único escaneo (límite 1)', (select out_allowed from dc_consume_scan(1)));
  select note('fallido: con el cupo usado, se rechaza', (select not out_allowed from dc_consume_scan(1)));
  reset role;
  insert into ctx values ('scan_c', (select id::text from dc_scan_log where user_id = '77777777-7777-7777-7777-777777777777' limit 1));
  select as_user('77777777-7777-7777-7777-777777777777');
  select dc_finish_scan(get('scan_c')::uuid, false);
  select note('fallido: tras fallar, el cupo se devuelve y puede reintentar', (select out_allowed from dc_consume_scan(1)));
  reset role;
commit;
begin;
  -- Tope diario global (toda la app)
  insert into ctx values ('global_n', (select count(*)::text from dc_scan_log where status <> 'failed' and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'));
  select as_user('88888888-8888-8888-8888-888888888888');
  select note('tope global: en el tope exacto se rechaza', (select not out_allowed and out_reason = 'global_day' from dc_consume_scan(0, get('global_n')::int)));
  select note('tope global: con un cupo más se permite', (select out_allowed from dc_consume_scan(0, get('global_n')::int + 1)));
  reset role;
commit;
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '', true);
  select note('cuota: sin sesión se rechaza (no_auth)', (select not out_allowed and out_reason = 'no_auth' from dc_consume_scan(5)));
  reset role;
commit;

\echo '── Métricas de uso (eventos) ──'
begin;
  select as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  select dc_track_event('scan_ok', '{"c":"CL","n":6,"ok":true}');
  select dc_track_event('evento_inventado', '{"x":1}');
  select dc_track_event(null, '{}');
  select dc_track_event('review_done', ('{"x":"' || repeat('z', 500) || '"}')::jsonb);
  select dc_track_event('mismatch_shown', '[1,2]'::jsonb);
  reset role;
  select note('eventos: guarda uno válido con sus datos', (select count(*) = 1 from dc_events where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and event = 'scan_ok' and props->>'c' = 'CL'));
  select note('eventos: ignora los que no están en la lista (inventado y nulo)', (select count(*) = 0 from dc_events where event = 'evento_inventado' or event is null));
  select note('eventos: datos demasiado grandes se guardan vacíos', (select props = '{}'::jsonb from dc_events where event = 'review_done' and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
  select note('eventos: datos que no son un objeto se guardan vacíos', (select props = '{}'::jsonb from dc_events where event = 'mismatch_shown' and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
  select note('eventos: nadie lee la tabla desde la app', denied('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'select * from dc_events'));
  select note('eventos: nadie escribe directo en la tabla', denied('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', $$insert into dc_events (user_id, event) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'scan_ok')$$));
  select note('eventos: nadie borra su historial', denied('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'delete from dc_events'));
commit;
begin;
  -- Tope diario por usuario (300)
  select as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  select dc_track_event('paid', '{}') from generate_series(1, 320);
  reset role;
  select note('eventos: tope de 300 por usuario y día', (select count(*) = 300 from dc_events where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
  insert into ctx values ('events_before', (select count(*)::text from dc_events));
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '', true);
  select dc_track_event('scan_ok', '{}');
  reset role;
  select note('eventos: sin sesión no se guarda nada', (select count(*)::text = get('events_before') from dc_events));
commit;

\echo '── Buenas prácticas de Postgres ──'
select note('rendimiento: las reglas de dc_bills y dc_bill_members calculan auth.uid() una sola vez por consulta',
  (select count(*) = 7 and bool_and(coalesce(qual, '') || coalesce(with_check, '') ilike '%select auth.uid()%')
     from pg_policies where schemaname = 'public' and tablename in ('dc_bills', 'dc_bill_members') and policyname in ('dc_bills_select','dc_bills_insert','dc_bills_update','dc_bills_delete','dc_members_select','dc_members_update','dc_members_delete')));
select note('rendimiento: ninguna regla usa auth.uid() suelto (sin select)',
  (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename in ('dc_bills', 'dc_bill_members') and (coalesce(qual, '') || coalesce(with_check, '')) ~* '(?<!select )auth\.uid\(\)' and (coalesce(qual, '') || coalesce(with_check, '')) !~* 'select auth\.uid\(\)'));
select note('índices: están los de columnas usadas en reglas y cascadas',
  (select count(*) = 3 from pg_indexes where schemaname = 'public' and indexname in ('dc_bill_members_user_idx', 'dc_claims_member_idx', 'dc_bills_created_idx')));
select note('índices: el redundante de dc_claims(bill_id) ya no existe', (select count(*) = 0 from pg_indexes where schemaname = 'public' and indexname = 'dc_claims_bill_idx'));
select note('seguridad: toda función SECURITY DEFINER fija su search_path',
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')));
select note('seguridad: dc_touch fija su search_path', (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'dc_touch' and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')));
select note('seguridad: toda tabla dc_ tiene RLS activa',
  (select count(*) = 0 from pg_tables where schemaname = 'public' and tablename like 'dc\_%' and not rowsecurity));

\pset tuples_only off
select case when count(*) = 0 then '✓ todas las comprobaciones de seguridad pasaron'
            else '✗ FALLARON ' || count(*) || ': ' || string_agg(label, ' · ') end as resultado
from test_failures;
