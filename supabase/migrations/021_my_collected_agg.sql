-- Dashboard's "collected by me" figure (shown to collectors without view_money)
-- was fetching every income row the user collected and summing in the browser.
-- Replace with a server-side SUM scoped to (program, collector) — a collector's
-- own rows are indexed by idx_income_collected_by, so this stays cheap at scale.
create or replace function public.program_my_collected(p_program uuid, p_user uuid)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(amount), 0)
    from public.income_entries
   where program_id = p_program and collected_by = p_user and deleted_at is null;
$$;

grant execute on function public.program_my_collected(uuid, uuid) to authenticated;
