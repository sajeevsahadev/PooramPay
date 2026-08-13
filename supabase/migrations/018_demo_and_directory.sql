-- 018: a shared demo club anyone can try, plus a public club directory.

alter table public.programs add column if not exists is_demo boolean not null default false;
alter table public.organizations add column if not exists is_demo boolean not null default false;

-- Join the shared demo: adds the caller to the demo committee (finance tier =
-- sees all money, can record & approve, but cannot delete or manage). Returns
-- the demo program id so the client can switch to it.
create or replace function public.join_demo()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_committee uuid; v_program uuid; v_email text;
begin
  select p.id, p.committee_id into v_program, v_committee
    from public.programs p where p.is_demo order by p.created_at limit 1;
  if v_program is null then raise exception 'NO_DEMO'; end if;
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then raise exception 'NOT_SIGNED_IN'; end if;
  insert into public.committee_members (committee_id, profile_id, email, tier)
  values (v_committee, auth.uid(), v_email, 'finance')
  on conflict (committee_id, email) do nothing;
  return v_program;
end $$;

-- Leave the demo: removes the caller's demo membership (their projected
-- program_members rows are cleared by the existing trigger).
create or replace function public.leave_demo()
returns void language plpgsql security definer set search_path = public as $$
declare v_committee uuid; v_email text;
begin
  select p.committee_id into v_committee
    from public.programs p where p.is_demo order by p.created_at limit 1;
  if v_committee is null then return; end if;
  select lower(email) into v_email from public.profiles where id = auth.uid();
  delete from public.committee_members where committee_id = v_committee and email = v_email;
end $$;

-- Public club directory for "find clubs near you" — non-sensitive fields only,
-- readable by any signed-in user (the real orgs table stays member-scoped).
create or replace function public.public_org_directory()
returns table (id uuid, name text, org_type text, place text, district text,
               state text, country text, logo_url text)
language sql stable security definer set search_path = public as $$
  select id, name, org_type, place, district, state, country, logo_url
    from public.organizations
   where coalesce(is_demo, false) = false
   order by name;
$$;

grant execute on function public.join_demo(), public.leave_demo(),
  public.public_org_directory() to authenticated;
