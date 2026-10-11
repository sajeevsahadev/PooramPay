-- Committee UPI for digital collections. The UPI id is a payment address the
-- club already shares publicly; stored at org level, set by committee admins.
alter table public.organizations add column if not exists upi_id text;
alter table public.organizations add column if not exists upi_name text;

create or replace function public.set_org_upi(p_org uuid, p_upi_id text, p_upi_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_padmin() or exists (
      select 1 from public.committees c
       where c.organization_id = p_org and public.is_committee_admin(c.id))) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.organizations
     set upi_id = nullif(trim(p_upi_id), ''), upi_name = nullif(trim(p_upi_name), '')
   where id = p_org;
end $$;

grant execute on function public.set_org_upi(uuid, text, text) to authenticated;
