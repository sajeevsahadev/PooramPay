-- 016: Let committee admins (and org owners) RENAME and DELETE organizations,
-- committees and programs. Previously delete was platform-admin only.
--
-- Frozen programs stay protected: only a platform admin can delete a frozen
-- program, whether directly or via a committee/organization cascade delete. This
-- keeps the "freeze = read-only forever" guarantee intact.

create or replace function public.assert_program_deletable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'frozen' and not public.is_padmin() then
    raise exception 'CANNOT_DELETE_FROZEN: this program is frozen; only a platform administrator can delete it';
  end if;
  return old;
end $$;

create trigger trg_program_deletable before delete on public.programs
for each row execute function public.assert_program_deletable();

-- ---- rename (update) ----
-- committee admins can rename their committee (org owners/padmin already could)
drop policy if exists committees_update on public.committees;
create policy committees_update on public.committees for update using (
  public.org_manageable(organization_id) or public.is_committee_admin(id)
);
-- organizations_update stays org_manageable (owner/padmin);
-- programs_update already allows committee_admin + padmin.

-- ---- delete ----
drop policy if exists orgs_delete on public.organizations;
create policy orgs_delete on public.organizations for delete using (
  public.org_manageable(id)
);

drop policy if exists committees_delete on public.committees;
create policy committees_delete on public.committees for delete using (
  public.is_padmin() or public.is_committee_admin(id) or public.org_manageable(organization_id)
);

drop policy if exists programs_delete on public.programs;
create policy programs_delete on public.programs for delete using (
  public.is_padmin()
  or public.has_role(id, array['committee_admin'])
  or exists (select 1 from public.committees c
              where c.id = committee_id and public.org_manageable(c.organization_id))
);
