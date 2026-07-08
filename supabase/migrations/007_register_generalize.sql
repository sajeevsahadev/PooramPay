-- Generalize beyond temples: any organization type, configurable payer register
-- ("houses" for temples, "members" for clubs, etc.), contact master data with
-- GPS, and one-click copy of the register into next year's program.

-- broader organization types
alter table public.organizations drop constraint organizations_org_type_check;
alter table public.organizations add constraint organizations_org_type_check
  check (org_type in ('temple','church','mosque','college','cultural','club',
                      'association','political','other'));

-- what one entry in the payer register is called, per program
alter table public.programs add column if not exists unit_label text not null default 'house'
  check (unit_label in ('house','member','family','shop','unit'));

-- register master data
alter table public.houses add column if not exists email text;
alter table public.houses add column if not exists gps_lat double precision;
alter table public.houses add column if not exists gps_lng double precision;

-- collectors build the master data in the field: let them update register
-- entries (previously committee_admin only)
drop policy houses_update on public.houses;
create policy houses_update on public.houses for update using (
  program_id in (select public.my_perm_programs('collect'))
  or program_id in (select public.my_role_programs(array['committee_admin']))
  or (select public.is_padmin())
);

-- copy areas + register from one program to another (same committee),
-- so each new year starts with last year's master data
create or replace function public.copy_register(p_from uuid, p_to uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_from public.programs; v_to public.programs; v_count int := 0;
  r record; v_new_area uuid; v_area_map jsonb := '{}';
begin
  select * into v_from from public.programs where id = p_from;
  select * into v_to from public.programs where id = p_to;
  if v_from is null or v_to is null then raise exception 'NOT_FOUND'; end if;
  if not (public.has_role(p_to, array['committee_admin']) or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_from.committee_id <> v_to.committee_id and not public.is_padmin() then
    raise exception 'DIFFERENT_COMMITTEE';
  end if;
  if v_to.status = 'frozen' then raise exception 'PROGRAM_FROZEN'; end if;

  for r in select * from public.areas where program_id = p_from loop
    insert into public.areas (program_id, name)
    values (p_to, r.name)
    returning id into v_new_area;
    v_area_map := v_area_map || jsonb_build_object(r.id::text, v_new_area::text);
  end loop;

  insert into public.houses
    (program_id, area_id, name, owner_name, phone, email, gps_lat, gps_lng,
     in_subscription, sort_order)
  select p_to,
         case when h.area_id is not null and v_area_map ? h.area_id::text
              then (v_area_map ->> h.area_id::text)::uuid end,
         h.name, h.owner_name, h.phone, h.email, h.gps_lat, h.gps_lng,
         h.in_subscription, h.sort_order
    from public.houses h
   where h.program_id = p_from;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.copy_register(uuid, uuid) from public, anon;
