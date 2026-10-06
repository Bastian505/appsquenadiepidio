-- Métricas de uso del embudo (sin contenido): qué pasos da la gente en la app, para saber dónde se pierde y qué tan buena es la lectura.
-- Solo se aceptan eventos de una lista cerrada, con datos chicos (números, banderas, códigos de país/moneda). Nunca ítems, nombres ni precios.
-- Nadie puede leer ni escribir la tabla directamente: solo dc_track_event() (y tú, desde el editor SQL de Supabase).

create table if not exists public.dc_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  event      text not null,
  props      jsonb not null default '{}'::jsonb
);
create index if not exists dc_events_event_day on public.dc_events (event, created_at);
create index if not exists dc_events_user_day on public.dc_events (user_id, created_at);
alter table public.dc_events enable row level security;
revoke all on public.dc_events from anon, authenticated;

create or replace function public.dc_track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  if p_event is null or p_event not in ('scan_ok', 'scan_fail', 'mismatch_shown', 'mismatch_fix', 'retake', 'review_done', 'split_viewed', 'shared', 'paid', 'all_paid') then return; end if;
  if p_props is null or jsonb_typeof(p_props) <> 'object' or length(p_props::text) > 400 then p_props := '{}'::jsonb; end if;
  -- Tope por usuario y día: una app rota o un abuso no llenan la tabla.
  if (select count(*) from public.dc_events where user_id = v_uid and created_at > now() - interval '1 day') >= 300 then return; end if;
  insert into public.dc_events (user_id, event, props) values (v_uid, p_event, p_props);
end $$;
revoke all on function public.dc_track_event(text, jsonb) from public;
grant execute on function public.dc_track_event(text, jsonb) to authenticated;
