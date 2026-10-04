-- A club can be public (discoverable & joinable in "Find clubs") or private.
-- Default public to preserve current discoverability; admins can switch to private.
alter table public.organizations add column if not exists is_public boolean not null default true;

-- directory now lists only public, non-demo clubs
create or replace function public.public_org_directory()
returns table (id uuid, name text, org_type text, place text, district text,
               state text, country text, logo_url text,
               gps_lat double precision, gps_lng double precision)
language sql stable security definer set search_path = public as $$
  select id, name, org_type, place, district, state, country, logo_url, gps_lat, gps_lng
    from public.organizations
   where coalesce(is_demo, false) = false and is_public = true
   order by name;
$$;

-- committee admin toggles whether the club is discoverable
create or replace function public.set_org_listed(p_org uuid, p_is_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_padmin() or exists (
      select 1 from public.committees c
       where c.organization_id = p_org and public.is_committee_admin(c.id))) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.organizations set is_public = p_is_public where id = p_org;
end $$;

-- requests only allowed to public, non-demo clubs
create or replace function public.request_to_join(p_org uuid, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_committee uuid; v_email text;
begin
  if not exists (select 1 from public.organizations
                  where id = p_org and is_public = true and coalesce(is_demo, false) = false) then
    raise exception 'NOT_PUBLIC';
  end if;
  select id into v_committee from public.committees
   where organization_id = p_org order by created_at limit 1;
  if v_committee is null then raise exception 'NO_COMMITTEE'; end if;
  select lower(email) into v_email from public.profiles where id = auth.uid();
  if v_email is null then raise exception 'NOT_SIGNED_IN'; end if;

  if exists (select 1 from public.committee_members
              where committee_id = v_committee and lower(email) = v_email) then
    return 'member';
  end if;
  if exists (select 1 from public.join_requests
              where committee_id = v_committee and lower(email) = v_email and status = 'pending') then
    return 'pending';
  end if;

  insert into public.join_requests (committee_id, profile_id, email, message)
  values (v_committee, auth.uid(), v_email, nullif(p_message, ''));
  return 'pending';
end $$;

grant execute on function public.set_org_listed(uuid, boolean) to authenticated;
