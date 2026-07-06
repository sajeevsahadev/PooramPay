-- PooramPay security: helpers, RLS, RPCs, views, storage

-- ==================== helper functions ====================

create or replace function public.is_padmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_platform_admin);
$$;

create or replace function public.is_member(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.program_members
                  where program_id = p_program and profile_id = auth.uid());
$$;

create or replace function public.has_role(p_program uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.program_members
                  where program_id = p_program and profile_id = auth.uid()
                    and role = any (p_roles));
$$;

create or replace function public.has_perm(p_program uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.program_members
                  where program_id = p_program and profile_id = auth.uid()
                    and (role = 'committee_admin' or coalesce((permissions ->> p_perm)::boolean, false)));
$$;

create or replace function public.org_visible(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_padmin()
      or exists (select 1 from public.organizations o where o.id = p_org and o.created_by = auth.uid())
      or exists (select 1
                   from public.program_members pm
                   join public.programs pr on pr.id = pm.program_id
                   join public.committees c on c.id = pr.committee_id
                  where c.organization_id = p_org and pm.profile_id = auth.uid());
$$;

create or replace function public.org_manageable(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_padmin()
      or exists (select 1 from public.organizations o where o.id = p_org and o.created_by = auth.uid());
$$;

-- keep profiles.is_platform_admin in sync with the email list
create or replace function public.sync_padmin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set is_platform_admin = true where email = lower(new.email);
    return new;
  else
    update public.profiles set is_platform_admin = false where email = lower(old.email);
    return old;
  end if;
end $$;

create trigger trg_sync_padmin
after insert or delete on public.platform_admin_emails
for each row execute function public.sync_padmin_flag();

-- freeze also locks membership changes
create trigger trg_frozen_members before insert or update or delete on public.program_members
for each row execute function public.assert_not_frozen();

-- ==================== enable RLS everywhere ====================

alter table public._migrations enable row level security;
alter table public.platform_admin_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.committees enable row level security;
alter table public.programs enable row level security;
alter table public.program_members enable row level security;
alter table public.program_counters enable row level security;
alter table public.expense_heads enable row level security;
alter table public.areas enable row level security;
alter table public.houses enable row level security;
alter table public.coupon_schemes enable row level security;
alter table public.coupon_books enable row level security;
alter table public.income_entries enable row level security;
alter table public.expenses enable row level security;
alter table public.fund_transfers enable row level security;
alter table public.cash_handovers enable row level security;
alter table public.bank_deposits enable row level security;
alter table public.budget_items enable row level security;
alter table public.committee_tasks enable row level security;
alter table public.audit_log enable row level security;

-- ==================== policies ====================

create policy padmin_emails_all on public.platform_admin_emails
  for all using (public.is_padmin()) with check (public.is_padmin());

create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.is_padmin()
  or exists (select 1 from public.program_members a
             join public.program_members b on a.program_id = b.program_id
             where a.profile_id = auth.uid() and b.profile_id = profiles.id)
);
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_padmin());

create policy orgs_select on public.organizations for select using (public.org_visible(id));
create policy orgs_insert on public.organizations for insert
  with check (auth.uid() is not null and created_by = auth.uid());
create policy orgs_update on public.organizations for update using (public.org_manageable(id));
create policy orgs_delete on public.organizations for delete using (public.is_padmin());

create policy committees_select on public.committees for select using (public.org_visible(organization_id));
create policy committees_write on public.committees for insert
  with check (public.org_manageable(organization_id) and created_by = auth.uid());
create policy committees_update on public.committees for update using (public.org_manageable(organization_id));
create policy committees_delete on public.committees for delete using (public.is_padmin());

create policy programs_select on public.programs for select using (
  public.is_padmin() or public.is_member(id)
  or exists (select 1 from public.committees c where c.id = committee_id and public.org_manageable(c.organization_id))
);
create policy programs_insert on public.programs for insert with check (
  created_by = auth.uid()
  and exists (select 1 from public.committees c where c.id = committee_id and public.org_manageable(c.organization_id))
);
create policy programs_update on public.programs for update using (
  public.is_padmin() or public.has_role(id, array['committee_admin'])
);
create policy programs_delete on public.programs for delete using (public.is_padmin());

create policy members_select on public.program_members for select using (
  public.is_padmin() or public.is_member(program_id)
);
create policy members_insert on public.program_members for insert with check (
  public.is_padmin() or public.has_role(program_id, array['committee_admin'])
  or exists (select 1 from public.programs p join public.committees c on c.id = p.committee_id
             where p.id = program_id and public.org_manageable(c.organization_id))
);
create policy members_update on public.program_members for update using (
  public.is_padmin() or public.has_role(program_id, array['committee_admin'])
);
create policy members_delete on public.program_members for delete using (
  public.is_padmin() or public.has_role(program_id, array['committee_admin'])
);

create policy heads_select on public.expense_heads for select using (
  public.is_padmin() or public.is_member(program_id));
create policy heads_write on public.expense_heads for insert with check (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy heads_update on public.expense_heads for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy heads_delete on public.expense_heads for delete using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());

create policy areas_select on public.areas for select using (
  public.is_padmin() or public.is_member(program_id));
create policy areas_write on public.areas for insert with check (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy areas_update on public.areas for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy areas_delete on public.areas for delete using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());

create policy houses_select on public.houses for select using (
  public.is_padmin() or public.is_member(program_id));
create policy houses_insert on public.houses for insert with check (
  public.has_perm(program_id, 'collect') or public.is_padmin());
create policy houses_update on public.houses for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy houses_delete on public.houses for delete using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());

create policy schemes_select on public.coupon_schemes for select using (
  public.is_padmin() or (public.is_member(program_id) and public.has_perm(program_id, 'coupons')));
create policy schemes_write on public.coupon_schemes for insert with check (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy schemes_update on public.coupon_schemes for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy schemes_delete on public.coupon_schemes for delete using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());

create policy books_select on public.coupon_books for select using (
  public.is_padmin() or (public.is_member(program_id) and public.has_perm(program_id, 'coupons')));
create policy books_insert on public.coupon_books for insert with check (
  public.has_role(program_id, array['committee_admin','treasurer']) or public.is_padmin());
create policy books_update on public.coupon_books for update using (
  public.has_role(program_id, array['committee_admin','treasurer']) or public.is_padmin());
-- no delete policy: books are never removed once issued

create policy income_select on public.income_entries for select using (
  public.is_padmin()
  or public.has_role(program_id, array['committee_admin','treasurer'])
  or public.has_perm(program_id, 'view_money')
  or collected_by = auth.uid() or created_by = auth.uid()
);
create policy income_insert on public.income_entries for insert with check (
  (public.has_perm(program_id, 'collect') and collected_by = auth.uid() and created_by = auth.uid())
  or public.has_role(program_id, array['committee_admin','treasurer'])
  or public.is_padmin()
);
create policy income_update on public.income_entries for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin()
);
-- no delete policy: financial records cannot be hard-deleted

create policy expenses_select on public.expenses for select using (
  public.is_padmin()
  or public.has_role(program_id, array['committee_admin','treasurer'])
  or public.has_perm(program_id, 'view_money')
  or claimant = auth.uid() or created_by = auth.uid()
);
create policy expenses_insert on public.expenses for insert with check (
  (public.has_perm(program_id, 'expense') and kind = 'claim'
     and claimant = auth.uid() and created_by = auth.uid() and status = 'pending')
  or public.has_role(program_id, array['committee_admin','treasurer'])
  or public.is_padmin()
);
create policy expenses_update on public.expenses for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin()
);
-- no delete policy

create policy transfers_select on public.fund_transfers for select using (
  public.is_padmin()
  or public.has_role(program_id, array['committee_admin','treasurer'])
  or public.has_perm(program_id, 'view_money')
);
create policy transfers_insert on public.fund_transfers for insert with check (
  public.has_role(program_id, array['committee_admin','treasurer']) or public.is_padmin());
create policy transfers_update on public.fund_transfers for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
-- no delete policy

create policy handovers_select on public.cash_handovers for select using (
  public.is_padmin()
  or public.has_role(program_id, array['committee_admin','treasurer'])
  or public.has_perm(program_id, 'view_money')
  or from_profile = auth.uid()
);
-- created and confirmed only through RPCs (security definer)

create policy deposits_select on public.bank_deposits for select using (
  public.is_padmin()
  or public.has_role(program_id, array['committee_admin','treasurer'])
  or public.has_perm(program_id, 'view_money')
);
create policy deposits_write on public.bank_deposits for insert with check (
  public.has_role(program_id, array['committee_admin','treasurer']) or public.is_padmin());
create policy deposits_update on public.bank_deposits for update using (
  public.has_role(program_id, array['committee_admin','treasurer']) or public.is_padmin());
create policy deposits_delete on public.bank_deposits for delete using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());

create policy budget_select on public.budget_items for select using (
  public.is_padmin() or public.is_member(program_id));
create policy budget_insert on public.budget_items for insert with check (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy budget_update on public.budget_items for update using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());
create policy budget_delete on public.budget_items for delete using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());

create policy tasks_select on public.committee_tasks for select using (
  public.is_padmin() or public.is_member(program_id));
create policy tasks_insert on public.committee_tasks for insert with check (
  (public.has_perm(program_id, 'tasks') and created_by = auth.uid()) or public.is_padmin());
create policy tasks_update on public.committee_tasks for update using (
  public.is_padmin()
  or public.has_perm(program_id, 'tasks')
  or assignee_member_id in (select id from public.program_members
                            where program_id = committee_tasks.program_id and profile_id = auth.uid())
);
create policy tasks_delete on public.committee_tasks for delete using (
  public.has_role(program_id, array['committee_admin']) or public.is_padmin());

-- everyone in the program can read the audit trail: transparency by design
create policy audit_select on public.audit_log for select using (
  public.is_padmin() or (program_id is not null and public.is_member(program_id))
);

-- ==================== RPCs ====================

create or replace function public.approve_expense(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare vexp public.expenses;
begin
  select * into vexp from public.expenses where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_perm(vexp.program_id, 'approve') or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if vexp.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  if p_approve then
    update public.expenses set status = 'approved', approved_by = auth.uid(), approved_at = now()
     where id = p_id;
  else
    if coalesce(p_reason, '') = '' then raise exception 'REASON_REQUIRED'; end if;
    update public.expenses set status = 'rejected', approved_by = auth.uid(), approved_at = now(),
           reject_reason = p_reason
     where id = p_id;
  end if;
end $$;

create or replace function public.pay_expense(p_id uuid, p_mode text default 'cash')
returns void language plpgsql security definer set search_path = public as $$
declare vexp public.expenses;
begin
  select * into vexp from public.expenses where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_perm(vexp.program_id, 'approve') or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if vexp.status <> 'approved' then raise exception 'NOT_APPROVED'; end if;
  update public.expenses set status = 'paid', paid_at = now(), paid_by = auth.uid(), mode = p_mode
   where id = p_id;
end $$;

create or replace function public.record_coupon_remit(
  p_book uuid, p_amount numeric, p_sold int, p_mode text default 'cash', p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare vbook public.coupon_books; vprice numeric; vid uuid; vtotal_remitted numeric;
begin
  select * into vbook from public.coupon_books where id = p_book;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_perm(vbook.program_id, 'collect')
          or public.has_role(vbook.program_id, array['committee_admin','treasurer'])
          or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select price into vprice from public.coupon_schemes where id = vbook.scheme_id;

  insert into public.income_entries
    (program_id, entry_type, amount, mode, coupon_book_id, payer_name, collected_by, created_by, notes)
  values
    (vbook.program_id, 'coupon', p_amount, p_mode, p_book, vbook.holder_name, auth.uid(), auth.uid(), p_notes)
  returning id into vid;

  update public.coupon_books
     set sold_count = least(coupons_count, sold_count + greatest(p_sold, 0))
   where id = p_book;

  select coalesce(sum(amount), 0) into vtotal_remitted
    from public.income_entries
   where coupon_book_id = p_book and deleted_at is null;

  update public.coupon_books
     set status = case
        when vtotal_remitted >= sold_count * vprice and sold_count > 0 then
          case when sold_count >= coupons_count - returned_count then 'settled' else 'partly' end
        else 'partly' end
   where id = p_book;
  return vid;
end $$;

create or replace function public.create_handover(p_program uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare vamount numeric; vid uuid;
begin
  if not public.is_member(p_program) then raise exception 'NOT_ALLOWED'; end if;
  select coalesce(sum(amount), 0) into vamount
    from public.income_entries
   where program_id = p_program and collected_by = auth.uid()
     and mode = 'cash' and handed_over = false and handover_id is null and deleted_at is null;
  if vamount <= 0 then raise exception 'NOTHING_TO_HANDOVER'; end if;
  insert into public.cash_handovers (program_id, from_profile, amount)
  values (p_program, auth.uid(), vamount) returning id into vid;
  update public.income_entries set handover_id = vid
   where program_id = p_program and collected_by = auth.uid()
     and mode = 'cash' and handed_over = false and handover_id is null and deleted_at is null;
  return vid;
end $$;

create or replace function public.confirm_handover(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare vh public.cash_handovers;
begin
  select * into vh from public.cash_handovers where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_perm(vh.program_id, 'approve') or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if vh.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  update public.cash_handovers set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_id;
  update public.income_entries set handed_over = true where handover_id = p_id;
end $$;

create or replace function public.cancel_handover(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare vh public.cash_handovers;
begin
  select * into vh from public.cash_handovers where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (vh.from_profile = auth.uid() or public.has_perm(vh.program_id, 'approve') or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  if vh.status <> 'pending' then raise exception 'ALREADY_CONFIRMED'; end if;
  update public.income_entries set handover_id = null where handover_id = p_id;
  delete from public.cash_handovers where id = p_id;
end $$;

create or replace function public.soft_delete_record(p_table text, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare vpid uuid;
begin
  if coalesce(p_reason, '') = '' then raise exception 'REASON_REQUIRED'; end if;
  if p_table not in ('income_entries','expenses','fund_transfers') then
    raise exception 'INVALID_TABLE';
  end if;
  execute format('select program_id from public.%I where id = $1', p_table) into vpid using p_id;
  if vpid is null then raise exception 'NOT_FOUND'; end if;
  if not (public.has_role(vpid, array['committee_admin']) or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  execute format(
    'update public.%I set deleted_at = now(), deleted_by = $2, delete_reason = $3 where id = $1 and deleted_at is null',
    p_table) using p_id, auth.uid(), p_reason;
end $$;

create or replace function public.restore_record(p_table text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare vpid uuid;
begin
  if p_table not in ('income_entries','expenses','fund_transfers') then
    raise exception 'INVALID_TABLE';
  end if;
  execute format('select program_id from public.%I where id = $1', p_table) into vpid using p_id;
  if not (public.has_role(vpid, array['committee_admin']) or public.is_padmin()) then
    raise exception 'NOT_ALLOWED';
  end if;
  execute format(
    'update public.%I set deleted_at = null, deleted_by = null, delete_reason = null where id = $1',
    p_table) using p_id;
end $$;

-- ==================== views ====================

create or replace view public.v_program_finance with (security_invoker = true) as
select
  p.id as program_id,
  p.opening_balance,
  coalesce(i.total, 0) as income_total,
  coalesce(i.cash, 0) as income_cash,
  coalesce(i.noncash, 0) as income_noncash,
  coalesce(e.total, 0) as expense_total,
  coalesce(e.cash, 0) as expense_cash,
  coalesce(e.noncash, 0) as expense_noncash,
  coalesce(e.payable, 0) as payable_total,
  coalesce(e.pending_count, 0) as pending_claims,
  coalesce(t.c2b, 0) as cash_to_bank,
  coalesce(t.b2c, 0) as bank_to_cash,
  coalesce(i.cash, 0) - coalesce(e.cash, 0) - coalesce(t.c2b, 0) + coalesce(t.b2c, 0) as cash_balance,
  p.opening_balance + coalesce(i.noncash, 0) - coalesce(e.noncash, 0)
    + coalesce(t.c2b, 0) - coalesce(t.b2c, 0) as bank_balance
from public.programs p
left join (
  select program_id,
         sum(amount) as total,
         sum(amount) filter (where mode = 'cash') as cash,
         sum(amount) filter (where mode <> 'cash') as noncash
    from public.income_entries where deleted_at is null group by program_id
) i on i.program_id = p.id
left join (
  select program_id,
         sum(amount) filter (where status = 'paid') as total,
         sum(amount) filter (where status = 'paid' and mode = 'cash') as cash,
         sum(amount) filter (where status = 'paid' and mode <> 'cash') as noncash,
         sum(amount) filter (where status = 'approved') as payable,
         count(*) filter (where status = 'pending') as pending_count
    from public.expenses where deleted_at is null group by program_id
) e on e.program_id = p.id
left join (
  select program_id,
         sum(amount) filter (where direction = 'cash_to_bank') as c2b,
         sum(amount) filter (where direction = 'bank_to_cash') as b2c
    from public.fund_transfers where deleted_at is null group by program_id
) t on t.program_id = p.id;

create or replace view public.v_coupon_books with (security_invoker = true) as
select
  b.*,
  s.name as scheme_name,
  s.price,
  b.sold_count * s.price as sold_value,
  coalesce(r.remitted, 0) as remitted,
  b.sold_count * s.price - coalesce(r.remitted, 0) as outstanding
from public.coupon_books b
join public.coupon_schemes s on s.id = b.scheme_id
left join (
  select coupon_book_id, sum(amount) as remitted
    from public.income_entries
   where deleted_at is null and coupon_book_id is not null
   group by coupon_book_id
) r on r.coupon_book_id = b.id;

create or replace view public.v_my_cash with (security_invoker = true) as
select program_id, collected_by, sum(amount) as cash_holding
  from public.income_entries
 where mode = 'cash' and handed_over = false and handover_id is null and deleted_at is null
 group by program_id, collected_by;

-- ==================== storage ====================

insert into storage.buckets (id, name, public)
values ('bills', 'bills', false)
on conflict (id) do nothing;

create policy bills_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bills');
create policy bills_select on storage.objects for select to authenticated
  using (bucket_id = 'bills');
