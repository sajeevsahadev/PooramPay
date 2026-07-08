-- Only guard DIRECT area deletes. When a whole program/committee/org is deleted,
-- areas cascade-delete (trigger depth > 1) and must be allowed through.
create or replace function public.assert_area_empty()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if exists (select 1 from public.houses where area_id = old.id) then
    raise exception 'AREA_NOT_EMPTY';
  end if;
  return old;
end $$;
