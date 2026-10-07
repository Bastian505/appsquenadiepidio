-- Buenas prácticas de Postgres/Supabase (revisión de las tablas de cuentas compartidas). No cambia qué puede hacer cada persona: solo cuánto cuesta decidirlo.
-- 1. Reglas de seguridad (RLS): auth.uid() envuelto en (select ...) para que Postgres lo calcule UNA vez por consulta y no una vez por fila.
-- 2. Índices que faltaban en columnas que se usan para borrar en cascada y para decidir permisos; se quita uno redundante.
-- 3. La función de "última modificación" fija su search_path (la revisión de seguridad de Supabase lo pide para toda función).

alter policy dc_bills_select on public.dc_bills using (host_id = (select auth.uid()) or public.dc_is_member(id));
alter policy dc_bills_insert on public.dc_bills with check (host_id = (select auth.uid()));
alter policy dc_bills_update on public.dc_bills using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
alter policy dc_bills_delete on public.dc_bills using (host_id = (select auth.uid()));

alter policy dc_members_select on public.dc_bill_members using (user_id = (select auth.uid()) or public.dc_is_member(bill_id) or public.dc_is_host(bill_id));
alter policy dc_members_update on public.dc_bill_members using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy dc_members_delete on public.dc_bill_members using (user_id = (select auth.uid()) or public.dc_is_host(bill_id));

-- Índices: dc_bill_members(user_id) lo usan las reglas y dc_is_member; dc_claims(member_id) acelera borrar un miembro (cascada);
-- dc_bills(created_at) sirve al borrado automático de cuentas viejas. dc_claims(bill_id) ya está cubierto por la clave primaria (bill_id, member_id, item_id).
create index if not exists dc_bill_members_user_idx on public.dc_bill_members (user_id);
create index if not exists dc_claims_member_idx on public.dc_claims (member_id);
create index if not exists dc_bills_created_idx on public.dc_bills (created_at);
drop index if exists public.dc_claims_bill_idx;

create or replace function public.dc_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
