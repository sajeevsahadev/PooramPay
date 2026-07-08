-- Areas can be deactivated (hidden from new collection) and deleted only when
-- empty. A register entry inside an area blocks deletion — inactivate instead.

alter table public.areas add column if not exists is_active boolean not null default true;

-- prevent deleting an area that still holds register entries
create or replace function public.assert_area_empty()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.houses where area_id = old.id) then
    raise exception 'AREA_NOT_EMPTY';
  end if;
  return old;
end $$;

drop trigger if exists trg_area_empty on public.areas;
create trigger trg_area_empty before delete on public.areas
for each row execute function public.assert_area_empty();
