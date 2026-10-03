-- Unirse eligiendo tu nombre de la lista que armó el anfitrión (como en la versión anterior de la app).
-- Requiere 20261002_shared_bills.sql. Aplicar en: Supabase → SQL Editor → pegar (sin comentarios si molestan) → Run. Es idempotente.

-- La lista de personas y lo que el anfitrión ya les marcó viven en la cuenta (solo el anfitrión la escribe).
alter table public.dc_bills add column if not exists people jsonb not null default '[]'::jsonb;
alter table public.dc_bills add column if not exists pre_assigns jsonb not null default '{}'::jsonb;

-- Qué nombre de la lista eligió cada miembro. Un nombre solo lo puede tener una persona.
alter table public.dc_bill_members add column if not exists person_key text;
create unique index if not exists dc_bill_members_person_uq
  on public.dc_bill_members (bill_id, person_key) where person_key is not null;

-- Antes de entrar, el invitado solo tiene el link: esta función le muestra la lista de nombres
-- (y cuáles ya están tomados) sin darle acceso a la cuenta. Comparte el freno de fuerza bruta de dc_join_bill.
create or replace function public.dc_peek_bill(p_token text)
returns table (out_restaurant text, out_currency text, out_people jsonb, out_taken text[])
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_bill public.dc_bills%rowtype; v_fails int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select count(*) into v_fails from public.dc_join_attempts
    where user_id = auth.uid() and tried_at > now() - interval '10 minutes';
  if v_fails >= 20 then raise exception 'TOO_MANY_ATTEMPTS' using errcode = '53400'; end if;

  select * into v_bill from public.dc_bills b
    where b.share_token = p_token and b.status = 'open' and b.expires_at > now();
  if not found then
    insert into public.dc_join_attempts (user_id) values (auth.uid());
    return;
  end if;
  return query select v_bill.restaurant, v_bill.currency, v_bill.people,
    coalesce((select array_agg(m.person_key) from public.dc_bill_members m
              where m.bill_id = v_bill.id and m.person_key is not null), '{}'::text[]);
end;
$$;
revoke all on function public.dc_peek_bill(text) from public;
grant execute on function public.dc_peek_bill(text) to authenticated;

-- Entrar: con p_person se elige un nombre de la lista (el nombre lo pone el servidor, no el cliente);
-- sin p_person se entra con el nombre escrito. Lo que el anfitrión ya había marcado para esa persona pasa a sus marcas.
drop function if exists public.dc_join_bill(text, text);
create or replace function public.dc_join_bill(p_token text, p_name text, p_person text default null)
returns table (out_bill_id uuid, out_member_id uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_bill uuid; v_member uuid; v_fails int; v_name text; v_people jsonb; v_pre jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select count(*) into v_fails from public.dc_join_attempts
    where user_id = auth.uid() and tried_at > now() - interval '10 minutes';
  if v_fails >= 20 then raise exception 'TOO_MANY_ATTEMPTS' using errcode = '53400'; end if;

  select b.id, b.people, b.pre_assigns into v_bill, v_people, v_pre from public.dc_bills b
    where b.share_token = p_token and b.status = 'open' and b.expires_at > now();
  if v_bill is null then
    -- Vacío (no excepción) para que el intento quede registrado; ver 20261002_shared_bills.sql.
    insert into public.dc_join_attempts (user_id) values (auth.uid());
    return;
  end if;

  v_name := p_name;
  if p_person is not null then
    select e->>'name' into v_name from jsonb_array_elements(v_people) e where e->>'id' = p_person limit 1;
    if v_name is null then raise exception 'PERSON_UNKNOWN' using errcode = '22023'; end if;
    if exists (select 1 from public.dc_bill_members m
               where m.bill_id = v_bill and m.person_key = p_person and m.user_id <> auth.uid()) then
      raise exception 'NAME_TAKEN' using errcode = '23505';
    end if;
  end if;
  if v_name is null or char_length(trim(v_name)) = 0 then raise exception 'NAME_REQUIRED' using errcode = '22023'; end if;

  insert into public.dc_bill_members (bill_id, user_id, name, person_key)
    values (v_bill, auth.uid(), left(trim(v_name), 24), p_person)
    on conflict (bill_id, user_id) do update set name = excluded.name, person_key = excluded.person_key
    returning id into v_member;

  if p_person is not null and v_pre ? p_person then
    insert into public.dc_claims (bill_id, member_id, item_id, units)
      select v_bill, v_member, e.key,
             case when jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric >= 1 then (e.value #>> '{}')::int end
      from jsonb_each(v_pre -> p_person) e
      on conflict do nothing;
  end if;

  return query select v_bill, v_member;
end;
$$;
revoke all on function public.dc_join_bill(text, text, text) from public;
grant execute on function public.dc_join_bill(text, text, text) to authenticated;
