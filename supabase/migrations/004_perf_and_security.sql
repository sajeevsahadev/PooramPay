-- Performance for millions of transactions + security hardening.
--
-- Performance strategy:
--  1. Composite/partial indexes on every hot query path (all filtered by program_id).
--  2. RLS policies rewritten to the "hashed IN-subquery" pattern: set-returning
--     SECURITY DEFINER functions evaluated ONCE per query instead of a function
--     call per row, and auth.uid() wrapped in (select ...) so the planner treats
--     it as an init-plan constant. This is the difference between a per-row
--     function storm and a single hashed semi-join on large scans.
--  3. Aggregate views so reports never pull raw rows to the client.
--
-- Security hardening (peer review findings):
--  A. profiles: privilege escalation — any user could UPDATE their own
--     is_platform_admin flag. Fixed with column-level grants.
--  B. storage: any authenticated user could read/write any committee's bills.
--     Fixed with per-program folder policies.
--  C. audit_log was readable by members without the view_money permission,
--     leaking amounts. Now requires view_money (viewers have it by default).
--  D. income insert could spoof handed_over=true to hide held cash. The
--     trigger now forces handed_over/handover_id server-side.

-- ==================== helper functions (hashed subquery pattern) ====================

create or replace function public.my_member_programs() returns setof uuid
language sql stable security definer set search_path = public as $$
  select program_id from public.program_members where profile_id = auth.uid();
$$;

create or replace function public.my_role_programs(p_roles text[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select program_id from public.program_members
   where profile_id = auth.uid() and role = any (p_roles);
$$;

create or replace function public.my_perm_programs(p_perm text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select program_id from public.program_members
   where profile_id = auth.uid()
     and (role = 'committee_admin' or coalesce((permissions ->> p_perm)::boolean, false));
$$;

-- ==================== indexes ====================

-- RLS hot path: membership lookups by profile
create index if not exists idx_members_profile on public.program_members (profile_id, program_id);
create index if not exists idx_members_program_profile on public.program_members (program_id, profile_id);

-- income: dashboards/lists (created_at), reports (entry_type), weekly grid,
-- collector cash-in-hand, handover confirmation, per-user visibility
create index if not exists idx_income_prog_created on public.income_entries (program_id, created_at desc) where deleted_at is null;
create index if not exists idx_income_prog_type on public.income_entries (program_id, entry_type) where deleted_at is null;
create index if not exists idx_income_collector_cash on public.income_entries (collected_by, program_id)
  where mode = 'cash' and handed_over = false and deleted_at is null;
create index if not exists idx_income_handover on public.income_entries (handover_id) where handover_id is not null;
create index if not exists idx_income_collected_by on public.income_entries (collected_by);
create index if not exists idx_income_created_by on public.income_entries (created_by);

create index if not exists idx_expenses_prog_created on public.expenses (program_id, created_at desc) where deleted_at is null;
create index if not exists idx_expenses_claimant on public.expenses (claimant) where claimant is not null;
create index if not exists idx_expenses_created_by on public.expenses (created_by);
create index if not exists idx_expenses_head on public.expenses (program_id, head_id) where deleted_at is null;

create index if not exists idx_transfers_program on public.fund_transfers (program_id) where deleted_at is null;
create index if not exists idx_handovers_program on public.cash_handovers (program_id, status);
create index if not exists idx_books_program on public.coupon_books (program_id);
create index if not exists idx_books_scheme on public.coupon_books (scheme_id);
create index if not exists idx_schemes_program on public.coupon_schemes (program_id);
create index if not exists idx_houses_program on public.houses (program_id, area_id);
create index if not exists idx_areas_program on public.areas (program_id);
create index if not exists idx_tasks_program on public.committee_tasks (program_id, status);
create index if not exists idx_budget_program on public.budget_items (program_id);
create index if not exists idx_heads_program on public.expense_heads (program_id);
create index if not exists idx_committees_org on public.committees (organization_id);
create index if not exists idx_programs_committee on public.programs (committee_id);
create index if not exists idx_orgs_created_by on public.organizations (created_by);
create index if not exists idx_deposits_program on public.bank_deposits (program_id);

-- ==================== rewritten RLS policies ====================

-- profiles: avoid per-row join storm; hash the co-member set once
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = (select auth.uid())
  or (select public.is_padmin())
  or id in (select pm.profile_id from public.program_members pm
             where pm.program_id in (select public.my_member_programs()))
);

-- profiles: column-level protection against privilege escalation
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = (select auth.uid()) or (select public.is_padmin()))
  with check (id = (select auth.uid()) or (select public.is_padmin()));
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, language, avatar_url) on public.profiles to authenticated;

drop policy income_select on public.income_entries;
create policy income_select on public.income_entries for select using (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or program_id in (select public.my_perm_programs('view_money'))
  or collected_by = (select auth.uid())
  or created_by = (select auth.uid())
);
drop policy income_insert on public.income_entries;
create policy income_insert on public.income_entries for insert with check (
  (program_id in (select public.my_perm_programs('collect'))
     and collected_by = (select auth.uid()) and created_by = (select auth.uid()))
  or program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or (select public.is_padmin())
);
drop policy income_update on public.income_entries;
create policy income_update on public.income_entries for update using (
  program_id in (select public.my_role_programs(array['committee_admin']))
  or (select public.is_padmin())
);

drop policy expenses_select on public.expenses;
create policy expenses_select on public.expenses for select using (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or program_id in (select public.my_perm_programs('view_money'))
  or claimant = (select auth.uid())
  or created_by = (select auth.uid())
);
drop policy expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert with check (
  (program_id in (select public.my_perm_programs('expense'))
     and kind = 'claim' and claimant = (select auth.uid())
     and created_by = (select auth.uid()) and status = 'pending')
  or program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or (select public.is_padmin())
);
drop policy expenses_update on public.expenses;
create policy expenses_update on public.expenses for update using (
  program_id in (select public.my_role_programs(array['committee_admin']))
  or (select public.is_padmin())
);

drop policy transfers_select on public.fund_transfers;
create policy transfers_select on public.fund_transfers for select using (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or program_id in (select public.my_perm_programs('view_money'))
);
drop policy transfers_insert on public.fund_transfers;
create policy transfers_insert on public.fund_transfers for insert with check (
  program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or (select public.is_padmin())
);
drop policy transfers_update on public.fund_transfers;
create policy transfers_update on public.fund_transfers for update using (
  program_id in (select public.my_role_programs(array['committee_admin']))
  or (select public.is_padmin())
);

drop policy handovers_select on public.cash_handovers;
create policy handovers_select on public.cash_handovers for select using (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or program_id in (select public.my_perm_programs('view_money'))
  or from_profile = (select auth.uid())
);

drop policy deposits_select on public.bank_deposits;
create policy deposits_select on public.bank_deposits for select using (
  (select public.is_padmin())
  or program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
  or program_id in (select public.my_perm_programs('view_money'))
);

-- audit log: transparency for everyone who can see money figures;
-- was: any member (leaked amounts to members without view_money)
drop policy audit_select on public.audit_log;
create policy audit_select on public.audit_log for select using (
  (select public.is_padmin())
  or (program_id is not null and (
    program_id in (select public.my_role_programs(array['committee_admin','treasurer']))
    or program_id in (select public.my_perm_programs('view_money'))
  ))
);

-- lighter tables: same pattern for consistency
drop policy members_select on public.program_members;
create policy members_select on public.program_members for select using (
  (select public.is_padmin()) or program_id in (select public.my_member_programs())
);

drop policy heads_select on public.expense_heads;
create policy heads_select on public.expense_heads for select using (
  (select public.is_padmin()) or program_id in (select public.my_member_programs())
);
drop policy areas_select on public.areas;
create policy areas_select on public.areas for select using (
  (select public.is_padmin()) or program_id in (select public.my_member_programs())
);
drop policy houses_select on public.houses;
create policy houses_select on public.houses for select using (
  (select public.is_padmin()) or program_id in (select public.my_member_programs())
);
drop policy houses_insert on public.houses;
create policy houses_insert on public.houses for insert with check (
  program_id in (select public.my_perm_programs('collect')) or (select public.is_padmin())
);
drop policy budget_select on public.budget_items;
create policy budget_select on public.budget_items for select using (
  (select public.is_padmin()) or program_id in (select public.my_member_programs())
);
drop policy tasks_select on public.committee_tasks;
create policy tasks_select on public.committee_tasks for select using (
  (select public.is_padmin()) or program_id in (select public.my_member_programs())
);
drop policy schemes_select on public.coupon_schemes;
create policy schemes_select on public.coupon_schemes for select using (
  (select public.is_padmin()) or program_id in (select public.my_perm_programs('coupons'))
);
drop policy books_select on public.coupon_books;
create policy books_select on public.coupon_books for select using (
  (select public.is_padmin()) or program_id in (select public.my_perm_programs('coupons'))
);

-- ==================== income trigger: server-side integrity ====================
-- Force receipt numbering AND cash-custody fields regardless of client payload.

create or replace function public.income_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.program_counters
     set next_receipt = next_receipt + 1
   where program_id = new.program_id
  returning next_receipt - 1 into new.receipt_no;
  if new.receipt_no is null then
    insert into public.program_counters (program_id, next_receipt) values (new.program_id, 2);
    new.receipt_no := 1;
  end if;
  -- cash custody cannot be spoofed by the client:
  -- cash starts in the collector's hands; UPI/bank goes straight to the bank
  new.handed_over := (new.mode <> 'cash');
  new.handover_id := null;
  return new;
end $$;

-- ==================== aggregate views for reports ====================

create or replace view public.v_income_by_type with (security_invoker = true) as
select program_id, entry_type, sum(amount) as total, count(*) as cnt
  from public.income_entries
 where deleted_at is null
 group by program_id, entry_type;

create or replace view public.v_expense_by_head with (security_invoker = true) as
select program_id, head_id, sum(amount) as total, count(*) as cnt
  from public.expenses
 where deleted_at is null and status = 'paid'
 group by program_id, head_id;

create or replace view public.v_coupon_totals with (security_invoker = true) as
select b.program_id,
       sum(b.sold_count * s.price) as sold_value,
       coalesce(sum(r.remitted), 0) as remitted,
       sum(b.sold_count * s.price) - coalesce(sum(r.remitted), 0) as outstanding
  from public.coupon_books b
  join public.coupon_schemes s on s.id = b.scheme_id
  left join (
    select coupon_book_id, sum(amount) as remitted
      from public.income_entries
     where deleted_at is null and coupon_book_id is not null
     group by coupon_book_id
  ) r on r.coupon_book_id = b.id
 group by b.program_id;

-- ==================== storage: per-program folder isolation ====================
-- was: any authenticated user could read/write every bill in the platform.

drop policy bills_insert on storage.objects;
drop policy bills_select on storage.objects;

create policy bills_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bills'
    and array_length(storage.foldername(name), 1) >= 1
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy bills_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      (select public.is_padmin())
      or public.is_member(((storage.foldername(name))[1])::uuid)
    )
  );
