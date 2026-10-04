-- Cierre de pagos: datos para transferir (los escribe el anfitrión) y quién ya pagó.
-- Nada de esto mueve dinero: son notas dentro de la cuenta, visibles solo para sus miembros y borradas con ella.

alter table public.dc_bills add column if not exists pay_info text;
alter table public.dc_bills drop constraint if exists dc_bills_pay_info_len;
alter table public.dc_bills add constraint dc_bills_pay_info_len check (pay_info is null or char_length(pay_info) <= 400);

alter table public.dc_bill_members add column if not exists paid_at timestamptz;

-- Marcar "ya pagó": la propia persona, o el anfitrión (por ejemplo si le pagaron en efectivo). Solo con la cuenta abierta.
create or replace function public.dc_set_paid(p_member uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_bill uuid;
begin
  select m.bill_id into v_bill from public.dc_bill_members m
   where m.id = p_member and (m.user_id = auth.uid() or public.dc_is_host(m.bill_id));
  if v_bill is null or not public.dc_bill_open(v_bill) then
    raise exception 'NO_PERMITIDO';
  end if;
  update public.dc_bill_members set paid_at = case when p_paid then now() else null end where id = p_member;
end $$;
revoke all on function public.dc_set_paid(uuid, boolean) from public;
grant execute on function public.dc_set_paid(uuid, boolean) to authenticated;
