-- 017: budget item notes, a "Consumables" expense head, and organization logos.

-- ---- budget notes ----
alter table public.budget_items add column if not exists notes text;

-- ---- organization logo ----
alter table public.organizations add column if not exists logo_url text;

-- public bucket for org logos (small images, shown across the app)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists logos_insert on storage.objects;
drop policy if exists logos_update on storage.objects;
drop policy if exists logos_delete on storage.objects;
drop policy if exists logos_select on storage.objects;
create policy logos_insert on storage.objects for insert to authenticated with check (bucket_id = 'logos');
create policy logos_update on storage.objects for update to authenticated using (bucket_id = 'logos');
create policy logos_delete on storage.objects for delete to authenticated using (bucket_id = 'logos');
create policy logos_select on storage.objects for select to public using (bucket_id = 'logos');

-- ---- "Consumables" expense head ----
-- new programs: rebuild default heads with Consumables inserted after Snacks & food
create or replace function public.program_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  insert into public.program_members
    (program_id, profile_id, email, display_name, role, permissions)
  select new.id, cm.profile_id, cm.email, cm.display_name, cm.role, cm.permissions
    from public.committee_members cm
   where cm.committee_id = new.committee_id
  on conflict (program_id, email) do nothing;

  select email into v_email from public.profiles where id = new.created_by;
  insert into public.program_members (program_id, profile_id, email, role)
  values (new.id, new.created_by, v_email, 'committee_admin')
  on conflict (program_id, email) do nothing;

  insert into public.program_counters (program_id) values (new.id) on conflict do nothing;
  insert into public.expense_heads (program_id, name, name_ml, is_default, sort_order) values
    (new.id, 'Programme cost',   'പരിപാടി ചെലവ്',     true, 1),
    (new.id, 'Coupon prizes',    'കൂപ്പൺ സമ്മാനങ്ങൾ', true, 2),
    (new.id, 'Light & sound',    'ലൈറ്റ് & സൗണ്ട്',    true, 3),
    (new.id, 'Snacks & food',    'ലഘുഭക്ഷണം',         true, 4),
    (new.id, 'Consumables',      'ഉപഭോഗ സാധനങ്ങൾ',   true, 5),
    (new.id, 'Transportation',   'യാത്രാ ചെലവ്',       true, 6),
    (new.id, 'Police & licence', 'പോലീസ് & ലൈസൻസ്',   true, 7),
    (new.id, 'Administration',   'ഭരണച്ചെലവ്',         true, 8),
    (new.id, 'Other',            'മറ്റുള്ളവ',          true, 9);
  return new;
end $$;

-- existing programs: add Consumables where it isn't already present
insert into public.expense_heads (program_id, name, name_ml, is_default, sort_order)
select p.id, 'Consumables', 'ഉപഭോഗ സാധനങ്ങൾ', true, 5
  from public.programs p
 where not exists (
   select 1 from public.expense_heads e
    where e.program_id = p.id and e.name = 'Consumables');
