-- Cuota de escaneos por usuario y registro de uso real (sin guardar nada de la boleta: ni imagen ni ítems).
-- El servidor (api/scan-receipt.js) llama a estas funciones con la sesión anónima del usuario:
--   1. dc_consume_scan(): antes de leer la boleta. Reserva un escaneo, o dice que se acabó la cuota del mes / el tope diario global.
--   2. dc_finish_scan(): al terminar. Anota país, modelo, si la suma cuadró y el costo estimado. Si falló, devuelve el escaneo (no cuenta).
-- Nadie puede leer ni escribir la tabla directamente: solo estas funciones (y tú, desde el editor SQL de Supabase).

create table if not exists public.dc_scan_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'started' check (status in ('started', 'ok', 'failed')),
  country     text check (country is null or char_length(country) <= 8),
  model       text check (model is null or char_length(model) <= 64),
  cuadra      boolean,
  cost_cents  numeric(9, 3),
  n_items     integer
);
create index if not exists dc_scan_log_user_month on public.dc_scan_log (user_id, created_at);
create index if not exists dc_scan_log_day on public.dc_scan_log (created_at);

alter table public.dc_scan_log enable row level security;
revoke all on public.dc_scan_log from anon, authenticated;   -- sin políticas: solo las funciones de abajo la tocan

-- Reserva un escaneo. p_user_limit = escaneos por mes por usuario (0 = sin límite); p_global_daily = tope diario de toda la app (0 = sin tope).
create or replace function public.dc_consume_scan(p_user_limit integer, p_global_daily integer default 0)
returns table (out_scan_id uuid, out_allowed boolean, out_reason text, out_used integer, out_limit integer)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_used integer; v_today integer; v_id uuid;
begin
  if v_uid is null then
    return query select null::uuid, false, 'no_auth'::text, 0, p_user_limit; return;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));   -- un escaneo a la vez por usuario: no se pasan del límite abriendo muchos en paralelo

  select count(*) into v_used from public.dc_scan_log
   where user_id = v_uid and status <> 'failed' and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  if p_user_limit > 0 and v_used >= p_user_limit then
    return query select null::uuid, false, 'user_month'::text, v_used, p_user_limit; return;
  end if;

  if p_global_daily > 0 then
    select count(*) into v_today from public.dc_scan_log
     where status <> 'failed' and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    if v_today >= p_global_daily then
      return query select null::uuid, false, 'global_day'::text, v_used, p_user_limit; return;
    end if;
  end if;

  insert into public.dc_scan_log (user_id) values (v_uid) returning id into v_id;
  return query select v_id, true, null::text, v_used + 1, p_user_limit;
end $$;
revoke all on function public.dc_consume_scan(integer, integer) from public;
grant execute on function public.dc_consume_scan(integer, integer) to authenticated;

-- Cierra un escaneo reservado. Solo el mismo usuario puede cerrar el suyo, y una sola vez.
create or replace function public.dc_finish_scan(
  p_scan_id uuid, p_ok boolean, p_country text default null, p_model text default null,
  p_cuadra boolean default null, p_cost_cents numeric default null, p_items integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.dc_scan_log
     set status = case when p_ok then 'ok' else 'failed' end, finished_at = now(),
         country = left(p_country, 8), model = left(p_model, 64), cuadra = p_cuadra,
         cost_cents = p_cost_cents, n_items = p_items
   where id = p_scan_id and user_id = auth.uid() and status = 'started';
end $$;
revoke all on function public.dc_finish_scan(uuid, boolean, text, text, boolean, numeric, integer) from public;
grant execute on function public.dc_finish_scan(uuid, boolean, text, text, boolean, numeric, integer) to authenticated;
