-- El dueño de la cuenta puede marcar (y desmarcar) por cualquier miembro de SU cuenta.
-- Cada invitado sigue pudiendo tocar solo lo suyo, y nadie escribe en cuentas ajenas ni cerradas.

create or replace function public.dc_member_in_bill(p_member uuid, p_bill uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dc_bill_members m where m.id = p_member and m.bill_id = p_bill);
$$;

drop policy if exists dc_claims_insert on public.dc_claims;
create policy dc_claims_insert on public.dc_claims for insert to authenticated
  with check (
    public.dc_bill_open(bill_id)
    and (
      (public.dc_owns_member(member_id) and public.dc_is_member(bill_id))
      or (public.dc_is_host(bill_id) and public.dc_member_in_bill(member_id, bill_id))
    )
  );

drop policy if exists dc_claims_update on public.dc_claims;
create policy dc_claims_update on public.dc_claims for update to authenticated
  using (
    public.dc_bill_open(bill_id)
    and (public.dc_owns_member(member_id) or public.dc_is_host(bill_id))
  )
  with check (
    public.dc_owns_member(member_id)
    or (public.dc_is_host(bill_id) and public.dc_member_in_bill(member_id, bill_id))
  );
-- dc_claims_delete ya permitía al dueño de la cuenta borrar marcas de cualquiera.
