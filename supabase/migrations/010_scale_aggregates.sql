-- Load testing at 2M rows exposed that the aggregate VIEWS group the whole
-- income_entries table before the program filter applies (no predicate
-- pushdown through GROUP BY / LEFT JOIN), causing full seq scans:
--   dashboard finance 3.2s, income-by-type 2.1s, 14-day sparkline 34s,
--   cash-in-hand 8s — all at only 2M rows.
-- Fix: program-scoped SQL functions that filter FIRST (indexed), so cost is
-- O(rows-in-this-program) instead of O(whole-table). Security invoker => RLS
-- still applies. The old views are kept for the rare admin "all programs" view.

-- covering index so "distinct house_id for a program" is an index-only scan
create index if not exists idx_income_prog_house
  on public.income_entries (program_id, house_id)
  where deleted_at is null and house_id is not null;

create or replace function public.program_finance(p_program uuid)
returns table (
  program_id uuid, opening_balance numeric, income_total numeric, income_cash numeric,
  income_noncash numeric, expense_total numeric, expense_cash numeric, expense_noncash numeric,
  payable_total numeric, pending_claims bigint, cash_to_bank numeric, bank_to_cash numeric,
  cash_balance numeric, bank_balance numeric
) language sql stable set search_path = public as $$
  with i as (
    select sum(amount) total,
           sum(amount) filter (where mode = 'cash') cash,
           sum(amount) filter (where mode <> 'cash') noncash
      from public.income_entries where program_id = p_program and deleted_at is null
  ), e as (
    select sum(amount) filter (where status = 'paid') total,
           sum(amount) filter (where status = 'paid' and mode = 'cash') cash,
           sum(amount) filter (where status = 'paid' and mode <> 'cash') noncash,
           sum(amount) filter (where status = 'approved') payable,
           count(*) filter (where status = 'pending') pending
      from public.expenses where program_id = p_program and deleted_at is null
  ), t as (
    select sum(amount) filter (where direction = 'cash_to_bank') c2b,
           sum(amount) filter (where direction = 'bank_to_cash') b2c
      from public.fund_transfers where program_id = p_program and deleted_at is null
  )
  select p.id, p.opening_balance,
    coalesce(i.total,0), coalesce(i.cash,0), coalesce(i.noncash,0),
    coalesce(e.total,0), coalesce(e.cash,0), coalesce(e.noncash,0),
    coalesce(e.payable,0), coalesce(e.pending,0),
    coalesce(t.c2b,0), coalesce(t.b2c,0),
    coalesce(i.cash,0) - coalesce(e.cash,0) - coalesce(t.c2b,0) + coalesce(t.b2c,0),
    p.opening_balance + coalesce(i.noncash,0) - coalesce(e.noncash,0)
      + coalesce(t.c2b,0) - coalesce(t.b2c,0)
  from public.programs p, i, e, t
  where p.id = p_program;
$$;

create or replace function public.income_by_type(p_program uuid)
returns table (entry_type text, total numeric, cnt bigint)
language sql stable set search_path = public as $$
  select entry_type, sum(amount), count(*)
    from public.income_entries
   where program_id = p_program and deleted_at is null
   group by entry_type;
$$;

create or replace function public.expense_by_head(p_program uuid)
returns table (head_id uuid, total numeric, cnt bigint)
language sql stable set search_path = public as $$
  select head_id, sum(amount), count(*)
    from public.expenses
   where program_id = p_program and deleted_at is null and status = 'paid'
   group by head_id;
$$;

create or replace function public.income_by_day(p_program uuid, p_since date)
returns table (entry_date date, total numeric)
language sql stable set search_path = public as $$
  select entry_date, sum(amount)
    from public.income_entries
   where program_id = p_program and deleted_at is null and entry_date >= p_since
   group by entry_date
   order by entry_date;
$$;

create or replace function public.program_my_cash(p_program uuid, p_user uuid)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(amount), 0)
    from public.income_entries
   where program_id = p_program and collected_by = p_user
     and mode = 'cash' and handed_over = false and deleted_at is null;
$$;

grant execute on function
  public.program_finance(uuid),
  public.income_by_type(uuid),
  public.expense_by_head(uuid),
  public.income_by_day(uuid, date),
  public.program_my_cash(uuid, uuid)
to authenticated;
