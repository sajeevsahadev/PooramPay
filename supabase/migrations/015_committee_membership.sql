-- 015: Committee-scoped membership + extensible positions.
--
-- People are now managed at the COMMITTEE level (committee_members), with a
-- position (an extensible label) that maps to an access TIER. The tier drives
-- the existing role + permissions machinery. committee_members is the source of
-- truth; it is PROJECTED into program_members (one row per program), so every
-- existing RLS policy, view, finance RPC and AppContext check keeps working
-- unchanged. Access is committee-wide: a member reaches every (non-frozen)
-- program under the committee, current and future.

-- ==================== tier -> role + permissions ====================
-- Tiers: admin (full leadership), finance (sees all, records/approves),
--        own (sees only their own), released (sees only published results),
--        viewer (read-only).

create or replace function public.tier_role(p_tier text) returns text
language sql immutable set search_path = public as $$
  select case p_tier
    when 'admin'    then 'committee_admin'
    when 'finance'  then 'treasurer'
    when 'own'      then 'collector'
    when 'released' then 'member'
    else                 'viewer'
  end
$$;

-- p_view_all only matters for the 'own' tier: it lets a committee member see all
-- committee finances (flips view_money) while still not being able to edit/manage.
create or replace function public.tier_perms(p_tier text, p_view_all boolean default false)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when p_view_all and p_tier = 'own'
      then jsonb_set(public.default_perms('collector'), '{view_money}', 'true')
    else public.default_perms(public.tier_role(p_tier))
  end
$$;

-- ==================== positions (extensible pick-list) ====================

create table if not exists public.committee_positions (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  label text not null,
  label_ml text,
  tier text not null default 'own'
    check (tier in ('admin','finance','own','released','viewer')),
  is_default boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  unique (committee_id, label)
);
create index if not exists idx_cpos_committee on public.committee_positions (committee_id);

-- ==================== committee members (source of truth) ====================

create table if not exists public.committee_members (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  profile_id uuid references public.profiles (id),
  email text not null,
  display_name text,
  position_id uuid references public.committee_positions (id) on delete set null,
  position_label text,
  tier text not null default 'own'
    check (tier in ('admin','finance','own','released','viewer')),
  view_all_money boolean not null default false,
  role text not null default 'member'
    check (role in ('committee_admin','treasurer','collector','member','viewer')),
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (committee_id, email)
);
create index if not exists idx_cmem_committee on public.committee_members (committee_id);
create index if not exists idx_cmem_profile on public.committee_members (profile_id);

-- role + permissions are always derived from the position's tier (+ view toggle)
create or replace function public.committee_member_derive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(new.email);
  if new.profile_id is null then
    select id into new.profile_id from public.profiles where email = new.email;
  end if;
  -- a chosen position supplies the label + tier
  if new.position_id is not null then
    select label, tier into new.position_label, new.tier
      from public.committee_positions where id = new.position_id;
  end if;
  new.role := public.tier_role(new.tier);
  new.permissions := public.tier_perms(new.tier, new.view_all_money);
  return new;
end $$;

create trigger trg_cmem_derive before insert or update on public.committee_members
for each row execute function public.committee_member_derive();

-- ==================== projection into program_members ====================
-- committee_members -> program_members for every NON-FROZEN program in the
-- committee (frozen programs are read-only forever and must not be touched).

create or replace function public.project_committee_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.program_members
    (program_id, profile_id, email, display_name, role, permissions)
  select p.id, new.profile_id, new.email, new.display_name, new.role, new.permissions
    from public.programs p
   where p.committee_id = new.committee_id and p.status <> 'frozen'
  on conflict (program_id, email) do update
    set role         = excluded.role,
        permissions  = excluded.permissions,
        profile_id   = coalesce(excluded.profile_id, public.program_members.profile_id),
        display_name = coalesce(excluded.display_name, public.program_members.display_name);
  return new;
end $$;

create trigger trg_cmem_project after insert or update on public.committee_members
for each row execute function public.project_committee_member();

-- removing a committee member clears their projected program_members rows,
-- first releasing FK references that would otherwise block/orphan.
create or replace function public.unproject_committee_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  select array_agg(pm.id) into v_ids
    from public.program_members pm
    join public.programs p on p.id = pm.program_id
   where p.committee_id = old.committee_id and p.status <> 'frozen'
     and pm.email = old.email;
  if v_ids is not null then
    update public.coupon_books   set assigned_member_id = null where assigned_member_id = any(v_ids);
    update public.committee_tasks set assignee_member_id = null where assignee_member_id = any(v_ids);
    delete from public.program_members where id = any(v_ids);
  end if;
  return old;
end $$;

create trigger trg_cmem_unproject after delete on public.committee_members
for each row execute function public.unproject_committee_member();

-- ==================== new programs inherit the committee team ====================
-- Redefine program_after_insert (originally in 001) to also copy committee_members.

create or replace function public.program_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  -- inherit the committee's whole team
  insert into public.program_members
    (program_id, profile_id, email, display_name, role, permissions)
  select new.id, cm.profile_id, cm.email, cm.display_name, cm.role, cm.permissions
    from public.committee_members cm
   where cm.committee_id = new.committee_id
  on conflict (program_id, email) do nothing;

  -- the creator is always a committee admin of the program
  select email into v_email from public.profiles where id = new.created_by;
  insert into public.program_members (program_id, profile_id, email, role)
  values (new.id, new.created_by, v_email, 'committee_admin')
  on conflict (program_id, email) do nothing;

  insert into public.program_counters (program_id) values (new.id) on conflict do nothing;
  insert into public.expense_heads (program_id, name, name_ml, is_default, sort_order) values
    (new.id, 'Programme cost',   'പരിപാടി ചെലവ്', true, 1),
    (new.id, 'Coupon prizes',    'കൂപ്പൺ സമ്മാനങ്ങൾ', true, 2),
    (new.id, 'Light & sound',    'ലൈറ്റ് & സൗണ്ട്', true, 3),
    (new.id, 'Snacks & food',    'ലഘുഭക്ഷണം', true, 4),
    (new.id, 'Transportation',   'യാത്രാ ചെലവ്', true, 5),
    (new.id, 'Police & licence', 'പോലീസ് & ലൈസൻസ്', true, 6),
    (new.id, 'Administration',   'ഭരണച്ചെലവ്', true, 7),
    (new.id, 'Other',            'മറ്റുള്ളവ', true, 8);
  return new;
end $$;

-- ==================== new committees get defaults + creator ====================

create or replace function public.committee_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  insert into public.committee_positions (committee_id, label, label_ml, tier, is_default, sort_order)
  values
    (new.id, 'President',        'പ്രസിഡന്റ്',      'admin',    true, 1),
    (new.id, 'Secretary',        'സെക്രട്ടറി',       'admin',    true, 2),
    (new.id, 'Treasurer',        'ട്രഷറർ',          'admin',    true, 3),
    (new.id, 'Committee Member', 'കമ്മിറ്റി അംഗം',   'own',      true, 4),
    (new.id, 'Volunteer',        'വോളന്റിയർ',        'released', true, 5)
  on conflict (committee_id, label) do nothing;

  select email into v_email from public.profiles where id = new.created_by;
  if v_email is not null then
    insert into public.committee_members (committee_id, profile_id, email, position_id, tier)
    select new.id, new.created_by, v_email, cp.id, 'admin'
      from public.committee_positions cp
     where cp.committee_id = new.id and cp.label = 'President'
    on conflict (committee_id, email) do nothing;
  end if;
  return new;
end $$;

create trigger trg_committee_after_insert after insert on public.committees
for each row execute function public.committee_after_insert();

-- ==================== RLS ====================

alter table public.committee_positions enable row level security;
alter table public.committee_members  enable row level security;

create or replace function public.is_committee_admin(p_committee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.committee_members
                  where committee_id = p_committee and profile_id = auth.uid()
                    and role = 'committee_admin');
$$;

create or replace function public.committee_visible(p_committee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_padmin()
      or exists (select 1 from public.committees c
                  where c.id = p_committee and public.org_visible(c.organization_id));
$$;

create or replace function public.committee_manageable(p_committee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_padmin()
      or public.is_committee_admin(p_committee)
      or exists (select 1 from public.committees c
                  where c.id = p_committee and public.org_manageable(c.organization_id));
$$;

grant execute on function
  public.is_committee_admin(uuid),
  public.committee_visible(uuid),
  public.committee_manageable(uuid)
to authenticated;

create policy cpos_select on public.committee_positions for select using (public.committee_visible(committee_id));
create policy cpos_insert on public.committee_positions for insert with check (public.committee_manageable(committee_id));
create policy cpos_update on public.committee_positions for update using (public.committee_manageable(committee_id));
create policy cpos_delete on public.committee_positions for delete using (public.committee_manageable(committee_id));

create policy cmem_select on public.committee_members for select using (public.committee_visible(committee_id));
create policy cmem_insert on public.committee_members for insert with check (public.committee_manageable(committee_id));
create policy cmem_update on public.committee_members for update using (public.committee_manageable(committee_id));
create policy cmem_delete on public.committee_members for delete using (public.committee_manageable(committee_id));

-- ==================== backfill existing data ====================
-- Seed default positions for committees that predate the trigger.
insert into public.committee_positions (committee_id, label, label_ml, tier, is_default, sort_order)
select c.id, v.label, v.label_ml, v.tier, true, v.sort
  from public.committees c
  cross join (values
    ('President',        'പ്രസിഡന്റ്',      'admin',    1),
    ('Secretary',        'സെക്രട്ടറി',       'admin',    2),
    ('Treasurer',        'ട്രഷറർ',          'admin',    3),
    ('Committee Member', 'കമ്മിറ്റി അംഗം',   'own',      4),
    ('Volunteer',        'വോളന്റിയർ',        'released', 5)
  ) as v(label, label_ml, tier, sort)
on conflict (committee_id, label) do nothing;

-- Roll existing per-program members up to the committee, taking the HIGHEST
-- privilege a person holds across the committee's programs (never a demotion).
-- position_id is left NULL so committee_member_derive keeps the mapped tier as-is
-- (each old role maps to the tier with identical role+permissions, so nobody's
-- power changes — except a rare cross-program upgrade to their highest role).
with role_rank(role, rnk) as (
  values ('committee_admin',1),('treasurer',2),('collector',3),('member',4),('viewer',5)
),
best as (
  select p.committee_id,
         lower(pm.email) as email,
         min(rr.rnk)     as best_rnk,
         (array_agg(pm.profile_id)   filter (where pm.profile_id   is not null))[1] as profile_id,
         (array_agg(pm.display_name) filter (where pm.display_name is not null))[1] as display_name
    from public.program_members pm
    join public.programs p on p.id = pm.program_id
    join role_rank rr on rr.role = pm.role
   group by p.committee_id, lower(pm.email)
)
insert into public.committee_members
  (committee_id, email, display_name, profile_id, tier, view_all_money)
select b.committee_id, b.email, b.display_name, b.profile_id,
       case rr.role
         when 'committee_admin' then 'admin'
         when 'treasurer'       then 'finance'
         when 'collector'       then 'own'
         when 'member'          then 'released'
         else                        'viewer'
       end as tier,
       false
  from best b
  join role_rank rr on rr.rnk = b.best_rnk
on conflict (committee_id, email) do nothing;
