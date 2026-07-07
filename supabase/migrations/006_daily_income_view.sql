-- Daily income aggregate for dashboard sparkline (covered by idx_income_program).
create or replace view public.v_income_by_day with (security_invoker = true) as
select program_id, entry_date, sum(amount) as total, count(*) as cnt
  from public.income_entries
 where deleted_at is null
 group by program_id, entry_date;
