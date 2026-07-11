-- Two-tier financial visibility:
--  * live totals stay with finance roles (view_money) during the program;
--  * at program end the committee digitally signs + publishes the final P&L and
--    remaining balance, which then becomes visible to all members.

alter table public.programs add column if not exists results_published boolean not null default false;
alter table public.programs add column if not exists results_published_at timestamptz;
alter table public.programs add column if not exists results_snapshot jsonb;

-- each committee admin's digital sign-off on the final accounts
create table if not exists public.program_signoffs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  role_at_signing text,
  signed_at timestamptz not null default now(),
  unique (program_id, profile_id)
);
create index if not exists idx_signoffs_program on public.program_signoffs (program_id);
alter table public.program_signoffs enable row level security;
create policy signoffs_select on public.program_signoffs for select to authenticated
  using ((select public.is_padmin()) or program_id in (select public.my_member_programs()));

-- viewers no longer see LIVE money — only published results + coupon status
create or replace function public.default_perms(p_role text) returns jsonb
language sql immutable set search_path = public as $$
  select case p_role
    when 'committee_admin' then '{"view_money":true,"collect":true,"expense":true,"approve":true,"coupons":true,"tasks":true}'::jsonb
    when 'treasurer'       then '{"view_money":true,"collect":true,"expense":true,"approve":true,"coupons":true,"tasks":true}'::jsonb
    when 'collector'       then '{"view_money":false,"collect":true,"expense":true,"approve":false,"coupons":true,"tasks":false}'::jsonb
    when 'member'          then '{"view_money":false,"collect":false,"expense":true,"approve":false,"coupons":false,"tasks":false}'::jsonb
    else                        '{"view_money":false,"collect":false,"expense":false,"approve":false,"coupons":true,"tasks":false}'::jsonb
  end
$$;

-- committee admin signs + publishes the final accounts (immutable snapshot)
create or replace function public.sign_and_publish_results(p_program uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_income numeric; v_expense numeric; v_open numeric;
begin
  select role into v_role from public.program_members
   where program_id = p_program and profile_id = auth.uid();
  if not (v_role = 'committee_admin' or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  select opening_balance into v_open from public.programs where id = p_program;
  select coalesce(sum(amount), 0) into v_income
    from public.income_entries where program_id = p_program and deleted_at is null;
  select coalesce(sum(amount), 0) into v_expense
    from public.expenses where program_id = p_program and deleted_at is null and status = 'paid';

  insert into public.program_signoffs (program_id, profile_id, role_at_signing)
  values (p_program, auth.uid(), coalesce(v_role, 'platform_admin'))
  on conflict (program_id, profile_id) do nothing;

  update public.programs
     set results_published = true,
         results_published_at = coalesce(results_published_at, now()),
         results_snapshot = jsonb_build_object(
           'opening_balance', v_open,
           'income_total', v_income,
           'expense_total', v_expense,
           'retained', v_open + v_income - v_expense,
           'published_at', now())
   where id = p_program;
end $$;

-- platform admin can re-open results if needed
create or replace function public.unpublish_results(p_program uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_padmin() then raise exception 'NOT_ALLOWED'; end if;
  update public.programs set results_published = false where id = p_program;
end $$;

grant execute on function public.sign_and_publish_results(uuid) to authenticated;
grant execute on function public.unpublish_results(uuid) to authenticated;
