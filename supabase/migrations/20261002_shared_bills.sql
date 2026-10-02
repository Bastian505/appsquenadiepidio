-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  Cuentas compartidas de DiviCuenta v2                                     ║
-- ║  Diseño y decisiones: docs/CUENTAS_COMPARTIDAS.md                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Qué hace: una cuenta (dc_bills) pertenece a su anfitrión; los invitados entran con un token
-- que viaja en el link, se vuelven miembros (dc_bill_members) y marcan lo suyo (dc_claims).
-- Todo el control de acceso vive aquí, en la base de datos: la app no puede saltárselo.
--
-- ANTES DE APLICAR: Authentication → Sign In / Providers → "Allow anonymous sign-ins" activado.
-- Aplicar en: Supabase → SQL Editor → pegar completo → Run. Es idempotente (se puede repetir).

-- ── Extensiones ──────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── Tablas ───────────────────────────────────────────────────────────────────
create table if not exists public.dc_bills (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Token del link: 22 caracteres base64url (~128 bits). No se puede adivinar.
  share_token  text not null unique default replace(replace(encode(gen_random_bytes(16), 'base64'), '/', '_'), '+', '-'),
  restaurant   text,
  currency     text not null default 'CLP',
  country_code text,
  items        jsonb not null default '[]'::jsonb,
  tip          jsonb,
  receipt_total numeric(14,2),
  status       text not null default 'open' check (status in ('open', 'closed')),
  expires_at   timestamptz not null default now() + interval '24 hours',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists dc_bills_host_idx on public.dc_bills (host_id, created_at desc);

create table if not exists public.dc_bill_members (
  id         uuid primary key default gen_random_uuid(),
  bill_id    uuid not null references public.dc_bills(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 24),
  color      text,
  joined_at  timestamptz not null default now(),
  unique (bill_id, user_id)
);
create index if not exists dc_bill_members_bill_idx on public.dc_bill_members (bill_id);

create table if not exists public.dc_claims (
  bill_id   uuid not null references public.dc_bills(id) on delete cascade,
  member_id uuid not null references public.dc_bill_members(id) on delete cascade,
  item_id   text not null,
  -- null = comparte la línea completa; un número = esas unidades del ítem.
  units     int check (units is null or units > 0),
  updated_at timestamptz not null default now(),
  primary key (bill_id, member_id, item_id)
);
create index if not exists dc_claims_bill_idx on public.dc_claims (bill_id);

-- Intentos de entrar con un token inválido (para frenar a quien pruebe tokens al azar).
create table if not exists public.dc_join_attempts (
  user_id uuid not null,
  tried_at timestamptz not null default now()
);
create index if not exists dc_join_attempts_idx on public.dc_join_attempts (user_id, tried_at desc);

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- Se usan dentro de las políticas. SECURITY DEFINER para que consultar la membresía no vuelva a
-- disparar RLS (evita recursión infinita entre dc_bills y dc_bill_members).
create or replace function public.dc_is_member(p_bill uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dc_bill_members m where m.bill_id = p_bill and m.user_id = auth.uid());
$$;

create or replace function public.dc_is_host(p_bill uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dc_bills b where b.id = p_bill and b.host_id = auth.uid());
$$;

create or replace function public.dc_owns_member(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dc_bill_members m where m.id = p_member and m.user_id = auth.uid());
$$;

create or replace function public.dc_bill_open(p_bill uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dc_bills b where b.id = p_bill and b.status = 'open' and b.expires_at > now());
$$;

create or replace function public.dc_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists dc_bills_touch on public.dc_bills;
create trigger dc_bills_touch before update on public.dc_bills
  for each row execute function public.dc_touch();
drop trigger if exists dc_claims_touch on public.dc_claims;
create trigger dc_claims_touch before update on public.dc_claims
  for each row execute function public.dc_touch();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Sin política = denegado. Lo que no aparece aquí, no se puede hacer.
alter table public.dc_bills         enable row level security;
alter table public.dc_bill_members  enable row level security;
alter table public.dc_claims        enable row level security;
alter table public.dc_join_attempts enable row level security;  -- nadie accede directo

-- dc_bills: la leen sus miembros; la crea y la cambia solo el anfitrión.
drop policy if exists dc_bills_select on public.dc_bills;
create policy dc_bills_select on public.dc_bills for select to authenticated
  using (host_id = auth.uid() or public.dc_is_member(id));

drop policy if exists dc_bills_insert on public.dc_bills;
create policy dc_bills_insert on public.dc_bills for insert to authenticated
  with check (host_id = auth.uid());

drop policy if exists dc_bills_update on public.dc_bills;
create policy dc_bills_update on public.dc_bills for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists dc_bills_delete on public.dc_bills;
create policy dc_bills_delete on public.dc_bills for delete to authenticated
  using (host_id = auth.uid());

-- dc_bill_members: los ven los miembros de esa cuenta. Cada uno maneja su fila;
-- el anfitrión puede quitar a cualquiera. Entrar se hace con dc_join_bill (abajo), no con insert.
drop policy if exists dc_members_select on public.dc_bill_members;
create policy dc_members_select on public.dc_bill_members for select to authenticated
  using (user_id = auth.uid() or public.dc_is_member(bill_id) or public.dc_is_host(bill_id));

drop policy if exists dc_members_update on public.dc_bill_members;
create policy dc_members_update on public.dc_bill_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists dc_members_delete on public.dc_bill_members;
create policy dc_members_delete on public.dc_bill_members for delete to authenticated
  using (user_id = auth.uid() or public.dc_is_host(bill_id));

-- dc_claims: las ven todos los miembros (para ver quién marcó qué), pero cada uno solo
-- puede tocar las suyas, y solo mientras la cuenta esté abierta.
drop policy if exists dc_claims_select on public.dc_claims;
create policy dc_claims_select on public.dc_claims for select to authenticated
  using (public.dc_is_member(bill_id) or public.dc_is_host(bill_id));

drop policy if exists dc_claims_insert on public.dc_claims;
create policy dc_claims_insert on public.dc_claims for insert to authenticated
  with check (public.dc_owns_member(member_id) and public.dc_is_member(bill_id) and public.dc_bill_open(bill_id));

drop policy if exists dc_claims_update on public.dc_claims;
create policy dc_claims_update on public.dc_claims for update to authenticated
  using (public.dc_owns_member(member_id) and public.dc_bill_open(bill_id))
  with check (public.dc_owns_member(member_id));

drop policy if exists dc_claims_delete on public.dc_claims;
create policy dc_claims_delete on public.dc_claims for delete to authenticated
  using (public.dc_owns_member(member_id) or public.dc_is_host(bill_id));

-- ── Entrar con el token ──────────────────────────────────────────────────────
-- Un invitado aún no es miembro, así que no puede leer la cuenta para comprobar el token.
-- Esta función corre con permisos elevados pero solo valida y crea la membresía.
create or replace function public.dc_join_bill(p_token text, p_name text)
returns table (out_bill_id uuid, out_member_id uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_bill uuid; v_member uuid; v_fails int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select count(*) into v_fails from public.dc_join_attempts
    where user_id = auth.uid() and tried_at > now() - interval '10 minutes';
  if v_fails >= 20 then raise exception 'TOO_MANY_ATTEMPTS' using errcode = '53400'; end if;

  select b.id into v_bill from public.dc_bills b
    where b.share_token = p_token and b.status = 'open' and b.expires_at > now();

  if v_bill is null then
    -- Token inválido: se registra el intento y se devuelve VACÍO (no se lanza excepción).
    -- Si lanzáramos una excepción, Postgres desharía también este insert y el contador
    -- de intentos nunca subiría: quien prueba tokens al azar quedaría sin freno.
    -- El cliente interpreta "sin filas" como token inválido o cuenta cerrada/expirada.
    insert into public.dc_join_attempts (user_id) values (auth.uid());
    return;
  end if;

  insert into public.dc_bill_members (bill_id, user_id, name)
    values (v_bill, auth.uid(), left(trim(p_name), 24))
    on conflict (bill_id, user_id) do update set name = excluded.name
    returning id into v_member;

  return query select v_bill, v_member;
end;
$$;

revoke all on function public.dc_join_bill(text, text) from public;
grant execute on function public.dc_join_bill(text, text) to authenticated;

-- El anfitrión entra a su propia cuenta sin token (al crearla ya queda como miembro).
create or replace function public.dc_create_bill(p_name text, p_currency text default 'CLP')
returns table (out_bill_id uuid, out_member_id uuid, out_share_token text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_bill uuid; v_member uuid; v_token text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  insert into public.dc_bills (host_id, currency) values (auth.uid(), p_currency)
    returning id, dc_bills.share_token into v_bill, v_token;
  -- (el token lo genera el DEFAULT de la columna)
  insert into public.dc_bill_members (bill_id, user_id, name)
    values (v_bill, auth.uid(), left(trim(coalesce(p_name, 'Yo')), 24))
    returning id into v_member;
  return query select v_bill, v_member, v_token;
end;
$$;

revoke all on function public.dc_create_bill(text, text) from public;
grant execute on function public.dc_create_bill(text, text) to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Las políticas de arriba también valen aquí: nadie recibe cambios de cuentas ajenas.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.dc_bills; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.dc_bill_members; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.dc_claims; exception when duplicate_object then null; end;
  end if;
end $$;
