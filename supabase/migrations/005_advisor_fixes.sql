-- Fixes for Supabase security/performance advisor findings.

-- ==================== 1. Lock down function EXECUTE privileges ====================
-- Security-definer functions were callable by anon via /rest/v1/rpc/*.
-- Internal checks made them safe, but defense-in-depth: anon gets nothing,
-- and trigger-only functions are not callable by anyone through the API.

revoke execute on all functions in schema public from public, anon;

revoke execute on function
  public.handle_new_user(),
  public.member_before_insert(),
  public.program_after_insert(),
  public.income_before_insert(),
  public.audit_row(),
  public.audit_row_simple(),
  public.assert_not_frozen(),
  public.program_freeze_guard(),
  public.sync_padmin_flag()
from authenticated;

-- future functions: no default execute for public/anon
alter default privileges in schema public revoke execute on functions from public, anon;

-- ==================== 2. Pin search_path on remaining function ====================

create or replace function public.default_perms(p_role text) returns jsonb
language sql immutable set search_path = public as $$
  select case p_role
    when 'committee_admin' then '{"view_money":true,"collect":true,"expense":true,"approve":true,"coupons":true,"tasks":true}'::jsonb
    when 'treasurer'       then '{"view_money":true,"collect":true,"expense":true,"approve":true,"coupons":true,"tasks":true}'::jsonb
    when 'collector'       then '{"view_money":false,"collect":true,"expense":true,"approve":false,"coupons":true,"tasks":false}'::jsonb
    when 'member'          then '{"view_money":false,"collect":false,"expense":true,"approve":false,"coupons":false,"tasks":false}'::jsonb
    else                        '{"view_money":true,"collect":false,"expense":false,"approve":false,"coupons":true,"tasks":false}'::jsonb
  end
$$;

-- ==================== 3. Init-plan pattern for the remaining flagged policies ====================

create or replace function public.my_created_orgs() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.organizations where created_by = auth.uid();
$$;

create or replace function public.my_member_orgs() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.organization_id
    from public.program_members pm
    join public.programs p on p.id = pm.program_id
    join public.committees c on c.id = p.committee_id
   where pm.profile_id = auth.uid();
$$;

create or replace function public.my_managed_committees() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.committees c
    join public.organizations o on o.id = c.organization_id
   where o.created_by = auth.uid();
$$;

create or replace function public.my_managed_programs() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.programs p
    join public.committees c on c.id = p.committee_id
    join public.organizations o on o.id = c.organization_id
   where o.created_by = auth.uid();
$$;

revoke execute on function public.my_created_orgs(), public.my_member_orgs(),
  public.my_managed_committees(), public.my_managed_programs() from public, anon;

drop policy orgs_select on public.organizations;
create policy orgs_select on public.organizations for select using (
  created_by = (select auth.uid())
  or (select public.is_padmin())
  or id in (select public.my_member_orgs())
);
drop policy orgs_insert on public.organizations;
create policy orgs_insert on public.organizations for insert with check (
  (select auth.uid()) is not null and created_by = (select auth.uid())
);
drop policy orgs_update on public.organizations;
create policy orgs_update on public.organizations for update using (
  created_by = (select auth.uid()) or (select public.is_padmin())
);

drop policy committees_select on public.committees;
create policy committees_select on public.committees for select using (
  (select public.is_padmin())
  or organization_id in (select public.my_created_orgs())
  or organization_id in (select public.my_member_orgs())
);
drop policy committees_write on public.committees;
create policy committees_write on public.committees for insert with check (
  created_by = (select auth.uid())
  and (organization_id in (select public.my_created_orgs()) or (select public.is_padmin()))
);
drop policy committees_update on public.committees;
create policy committees_update on public.committees for update using (
  organization_id in (select public.my_created_orgs()) or (select public.is_padmin())
);

drop policy programs_select on public.programs;
create policy programs_select on public.programs for select using (
  (select public.is_padmin())
  or id in (select public.my_member_programs())
  or committee_id in (select public.my_managed_committees())
);
drop policy programs_insert on public.programs;
create policy programs_insert on public.programs for insert with check (
  created_by = (select auth.uid())
  and (committee_id in (select public.my_managed_committees()) or (select public.is_padmin()))
);
drop policy programs_update on public.programs;
create policy programs_update on public.programs for update using (
  (select public.is_padmin())
  or id in (select public.my_role_programs(array['committee_admin']))
);

drop policy members_insert on public.program_members;
create policy members_insert on public.program_members for insert with check (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin']))
  or program_id in (select public.my_managed_programs())
);
drop policy members_update on public.program_members;
create policy members_update on public.program_members for update using (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin']))
);
drop policy members_delete on public.program_members;
create policy members_delete on public.program_members for delete using (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin']))
);

drop policy tasks_insert on public.committee_tasks;
create policy tasks_insert on public.committee_tasks for insert with check (
  (program_id in (select public.my_perm_programs('tasks')) and created_by = (select auth.uid()))
  or (select public.is_padmin())
);
drop policy tasks_update on public.committee_tasks;
create policy tasks_update on public.committee_tasks for update using (
  (select public.is_padmin())
  or program_id in (select public.my_perm_programs('tasks'))
  or assignee_member_id in (select id from public.program_members
                             where profile_id = (select auth.uid()))
);

-- ==================== 4. Remaining useful FK indexes ====================

create index if not exists idx_income_area on public.income_entries (area_id) where area_id is not null;
create index if not exists idx_expenses_head_fk on public.expenses (head_id);
create index if not exists idx_expenses_advance on public.expenses (advance_id) where advance_id is not null;
create index if not exists idx_houses_area on public.houses (area_id) where area_id is not null;
create index if not exists idx_tasks_assignee on public.committee_tasks (assignee_member_id) where assignee_member_id is not null;
create index if not exists idx_books_assigned on public.coupon_books (assigned_member_id) where assigned_member_id is not null;
create index if not exists idx_handovers_from on public.cash_handovers (from_profile);
create index if not exists idx_budget_head on public.budget_items (head_id) where head_id is not null;
