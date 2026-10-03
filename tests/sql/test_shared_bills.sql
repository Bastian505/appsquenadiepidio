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
  ('33333333-3333-3333-3333-333333333333');   -- extraño

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

\pset tuples_only off
select case when count(*) = 0 then '✓ todas las comprobaciones de seguridad pasaron'
            else '✗ FALLARON ' || count(*) || ': ' || string_agg(label, ' · ') end as resultado
from test_failures;
