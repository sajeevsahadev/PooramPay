-- Fix: INSERT ... RETURNING on organizations failed because org_visible()
-- reads the table via a subquery that cannot see the row inserted in the
-- same statement. Check the created_by column directly.
drop policy orgs_select on public.organizations;
create policy orgs_select on public.organizations for select using (
  created_by = auth.uid() or public.org_visible(id)
);
