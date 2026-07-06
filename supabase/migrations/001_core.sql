-- PooramPay core schema
-- Conventions: all money tables carry soft-delete columns and are audit-logged.
-- Hard DELETE is never granted on financial tables.

-- ==================== profiles ====================

create table public.platform_admin_emails (
  email text primary key,
  added_at timestamptz not null default now()
);
insert into public.platform_admin_emails (email) values ('sajeevsahadev@gmail.com');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  language text not null default 'en',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, is_platform_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    exists (select 1 from public.platform_admin_emails where lower(email) = lower(new.email))
  )
  on conflict (id) do nothing;
  -- link pending committee invitations created before this user signed up
  update public.program_members
     set profile_id = new.id
   where profile_id is null and lower(email) = lower(new.email);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ==================== organization structure ====================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null default 'temple'
    check (org_type in ('temple','church','mosque','college','cultural','other')),
  place text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.committees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  name text not null,
  year int not null,
  status text not null default 'active' check (status in ('active','frozen')),
  opening_balance numeric(14,2) not null default 0,
  weekly_amount numeric(14,2),           -- weekly house subscription amount, if used
  total_weeks int not null default 52,
  frozen_at timestamptz,
  frozen_by uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.program_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  profile_id uuid references public.profiles (id),
  email text not null,
  display_name text,
  role text not null default 'member'
    check (role in ('committee_admin','treasurer','collector','member','viewer')),
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (program_id, email)
);

create or replace function public.default_perms(p_role text) returns jsonb
language sql immutable as $$
  select case p_role
    when 'committee_admin' then '{"view_money":true,"collect":true,"expense":true,"approve":true,"coupons":true,"tasks":true}'::jsonb
    when 'treasurer'       then '{"view_money":true,"collect":true,"expense":true,"approve":true,"coupons":true,"tasks":true}'::jsonb
    when 'collector'       then '{"view_money":false,"collect":true,"expense":true,"approve":false,"coupons":true,"tasks":false}'::jsonb
    when 'member'          then '{"view_money":false,"collect":false,"expense":true,"approve":false,"coupons":false,"tasks":false}'::jsonb
    else                        '{"view_money":true,"collect":false,"expense":false,"approve":false,"coupons":true,"tasks":false}'::jsonb
  end
$$;

create or replace function public.member_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(new.email);
  if new.permissions = '{}'::jsonb then
    new.permissions := public.default_perms(new.role);
  end if;
  if new.profile_id is null then
    select id into new.profile_id from public.profiles where email = new.email;
  end if;
  return new;
end $$;

create trigger trg_member_before_insert
before insert on public.program_members
for each row execute function public.member_before_insert();

-- the program creator automatically becomes a committee admin of it
create or replace function public.program_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = new.created_by;
  insert into public.program_members (program_id, profile_id, email, role)
  values (new.id, new.created_by, v_email, 'committee_admin')
  on conflict do nothing;
  insert into public.program_counters (program_id) values (new.id) on conflict do nothing;
  -- default expense heads
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

create table public.program_counters (
  program_id uuid primary key references public.programs (id) on delete cascade,
  next_receipt int not null default 1
);

create table public.expense_heads (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null,
  name_ml text,
  is_default boolean not null default false,
  sort_order int not null default 100
);

create trigger trg_program_after_insert
after insert on public.programs
for each row execute function public.program_after_insert();

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null,
  assigned_member_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.houses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  area_id uuid references public.areas (id) on delete set null,
  name text not null,
  owner_name text,
  phone text,
  in_subscription boolean not null default false,  -- part of the weekly collection scheme
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

-- ==================== coupons ====================

create table public.coupon_schemes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null,
  price numeric(14,2) not null check (price > 0),
  total_coupons int not null check (total_coupons > 0),
  coupons_per_book int not null default 25 check (coupons_per_book > 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.coupon_books (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references public.coupon_schemes (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  book_no text not null,
  coupons_count int not null,
  holder_name text not null,
  holder_phone text,
  assigned_member_id uuid references public.program_members (id),
  sold_count int not null default 0,
  returned_count int not null default 0,
  status text not null default 'issued'
    check (status in ('issued','partly','settled','returned')),
  issued_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  unique (scheme_id, book_no)
);

-- ==================== money: income ====================

create table public.income_entries (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  entry_type text not null check (entry_type in
    ('house','coupon','subscription','interest','ad_brochure','ad_stage','donation')),
  amount numeric(14,2) not null check (amount > 0),
  mode text not null default 'cash' check (mode in ('cash','upi','bank')),
  entry_date date not null default current_date,
  receipt_no int,
  area_id uuid references public.areas (id) on delete set null,
  house_id uuid references public.houses (id) on delete set null,
  payer_name text,
  coupon_book_id uuid references public.coupon_books (id) on delete set null,
  subscription_week int,
  collected_by uuid not null references public.profiles (id),
  handed_over boolean not null default false,  -- cash passed to treasurer
  handover_id uuid,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text
);

create index idx_income_program on public.income_entries (program_id, entry_date);
create index idx_income_house on public.income_entries (house_id) where house_id is not null;
create index idx_income_book on public.income_entries (coupon_book_id) where coupon_book_id is not null;

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
  -- UPI/bank money never sits in anyone's hand
  if new.mode <> 'cash' then new.handed_over := true; end if;
  return new;
end $$;

create trigger trg_income_before_insert
before insert on public.income_entries
for each row execute function public.income_before_insert();

-- ==================== money: expenses ====================

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  head_id uuid not null references public.expense_heads (id),
  kind text not null default 'wallet'
    check (kind in ('wallet','claim','advance','advance_settlement')),
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  event_day int,
  vendor_name text,
  description text,
  bill_url text,
  mode text not null default 'cash' check (mode in ('cash','upi','bank')),
  claimant uuid references public.profiles (id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','paid')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  reject_reason text,
  paid_at timestamptz,
  paid_by uuid references public.profiles (id),
  advance_id uuid references public.expenses (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text
);

create index idx_expenses_program on public.expenses (program_id, expense_date);
create index idx_expenses_status on public.expenses (program_id, status);

-- ==================== money movement ====================

create table public.fund_transfers (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  direction text not null check (direction in ('cash_to_bank','bank_to_cash')),
  amount numeric(14,2) not null check (amount > 0),
  transfer_date date not null default current_date,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  delete_reason text
);

create table public.cash_handovers (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  from_profile uuid not null references public.profiles (id),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','confirmed')),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.bank_deposits (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  kind text not null default 'savings' check (kind in ('savings','fd','rd')),
  bank_name text not null,
  account_ref text,
  principal numeric(14,2) not null default 0,
  interest_rate numeric(5,2),
  start_date date,
  maturity_date date,
  is_closed boolean not null default false,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ==================== budget ====================

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  side text not null check (side in ('income','expense')),
  income_type text,                      -- matches income_entries.entry_type when side=income
  head_id uuid references public.expense_heads (id) on delete cascade,
  planned numeric(14,2) not null default 0,
  unique (program_id, side, income_type, head_id)
);

-- ==================== tasks ====================

create table public.committee_tasks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  title text not null,
  description text,
  assignee_member_id uuid references public.program_members (id) on delete set null,
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  due_date date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==================== audit ====================

create table public.audit_log (
  id bigint generated always as identity primary key,
  program_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null,
  actor uuid,
  at timestamptz not null default now(),
  before jsonb,
  after jsonb
);
create index idx_audit_program on public.audit_log (program_id, at desc);

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text; v_before jsonb; v_after jsonb; v_pid uuid; v_rid uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert'; v_after := to_jsonb(new);
    v_pid := new.program_id; v_rid := new.id;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old); v_after := to_jsonb(new);
    v_pid := new.program_id; v_rid := new.id;
    if old.deleted_at is null and new.deleted_at is not null then v_action := 'delete';
    elsif old.deleted_at is not null and new.deleted_at is null then v_action := 'restore';
    else v_action := 'update'; end if;
  else
    v_action := 'hard_delete'; v_before := to_jsonb(old);
    v_pid := old.program_id; v_rid := old.id;
  end if;
  insert into public.audit_log (program_id, table_name, record_id, action, actor, before, after)
  values (v_pid, tg_table_name, v_rid, v_action, auth.uid(), v_before, v_after);
  return coalesce(new, old);
end $$;

-- audit triggers on tables having deleted_at semantics or financial relevance
create trigger trg_audit_income after insert or update or delete on public.income_entries
for each row execute function public.audit_row();
create trigger trg_audit_expenses after insert or update or delete on public.expenses
for each row execute function public.audit_row();
create trigger trg_audit_transfers after insert or update or delete on public.fund_transfers
for each row execute function public.audit_row();

-- generic audit for tables without deleted_at (uses plain update action)
create or replace function public.audit_row_simple()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_rid uuid;
begin
  if tg_op = 'DELETE' then v_pid := old.program_id; v_rid := old.id;
  else v_pid := new.program_id; v_rid := new.id; end if;
  insert into public.audit_log (program_id, table_name, record_id, action, actor, before, after)
  values (v_pid, tg_table_name, v_rid, lower(tg_op), auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger trg_audit_books after insert or update or delete on public.coupon_books
for each row execute function public.audit_row_simple();
create trigger trg_audit_handovers after insert or update or delete on public.cash_handovers
for each row execute function public.audit_row_simple();
create trigger trg_audit_members after insert or update or delete on public.program_members
for each row execute function public.audit_row_simple();

-- ==================== freeze & soft-delete guards ====================

create or replace function public.assert_not_frozen()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_status text;
begin
  v_pid := coalesce(new.program_id, old.program_id);
  select status into v_status from public.programs where id = v_pid;
  if v_status = 'frozen' then
    raise exception 'PROGRAM_FROZEN: this program is frozen and read-only';
  end if;
  -- soft delete requires a reason
  if tg_op = 'UPDATE' and to_jsonb(new) ? 'deleted_at' then
    if (to_jsonb(new)->>'deleted_at') is not null and coalesce(to_jsonb(new)->>'delete_reason','') = '' then
      raise exception 'DELETE_REASON_REQUIRED';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_frozen_income before insert or update or delete on public.income_entries
for each row execute function public.assert_not_frozen();
create trigger trg_frozen_expenses before insert or update or delete on public.expenses
for each row execute function public.assert_not_frozen();
create trigger trg_frozen_transfers before insert or update or delete on public.fund_transfers
for each row execute function public.assert_not_frozen();
create trigger trg_frozen_books before insert or update or delete on public.coupon_books
for each row execute function public.assert_not_frozen();
create trigger trg_frozen_handovers before insert or update or delete on public.cash_handovers
for each row execute function public.assert_not_frozen();
create trigger trg_frozen_tasks before insert or update or delete on public.committee_tasks
for each row execute function public.assert_not_frozen();

-- unfreezing is reserved for platform administrators
create or replace function public.program_freeze_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'frozen' and new.status = 'active' then
    if not exists (select 1 from public.profiles where id = auth.uid() and is_platform_admin) then
      raise exception 'ONLY_PLATFORM_ADMIN_CAN_UNFREEZE';
    end if;
  end if;
  if old.status = 'active' and new.status = 'frozen' then
    new.frozen_at := now();
    new.frozen_by := auth.uid();
  end if;
  return new;
end $$;

create trigger trg_program_freeze before update on public.programs
for each row execute function public.program_freeze_guard();
