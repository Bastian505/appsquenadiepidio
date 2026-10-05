-- Borrado automático de datos viejos (para que lo que dice la política de privacidad sea verdad).
--   · Cuentas compartidas (dc_bills y todo lo que cuelga de ellas): a los 30 días de creadas.
--   · Registro de uso de lecturas (dc_scan_log): a los 12 meses. No contiene boletas, solo país, modelo, costo y si cuadró.
-- Corre todos los días a las 03:15 UTC si la extensión pg_cron está activa en tu proyecto de Supabase
-- (Dashboard → Database → Extensions → pg_cron → Enable). Si no está, la función igual queda creada y puedes ejecutarla a mano: select public.dc_purge_old();

create or replace function public.dc_purge_old(p_bill_days integer default 30, p_scan_months integer default 12)
returns table (out_bills integer, out_scans integer)
language plpgsql security definer set search_path = public as $$
declare v_bills integer; v_scans integer;
begin
  -- Los miembros, marcas y pagos se borran en cascada con la cuenta (ver 20261002_shared_bills.sql).
  with d as (delete from public.dc_bills where created_at < now() - make_interval(days => p_bill_days) returning 1)
    select count(*) into v_bills from d;
  with d as (delete from public.dc_scan_log where created_at < now() - make_interval(months => p_scan_months) returning 1)
    select count(*) into v_scans from d;
  return query select v_bills, v_scans;
end $$;
revoke all on function public.dc_purge_old(integer, integer) from public, anon, authenticated;   -- solo tú (administrador) o el programador interno

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'dc_purge_old';
    perform cron.schedule('dc_purge_old', '15 3 * * *', 'select public.dc_purge_old()');
    raise notice 'Borrado automático programado: todos los días 03:15 UTC.';
  else
    raise notice 'pg_cron no está activo: actívalo en Database → Extensions y vuelve a correr esta migración, o ejecuta select public.dc_purge_old(); a mano de vez en cuando.';
  end if;
end $$;
