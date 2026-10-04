-- Find-a-club → request to join → committee admin approves with a role.
-- Additive; all writes go through committee-admin-checked SECURITY DEFINER RPCs.

-- club location captured at creation (used for "near me" sorting)
alter table public.organizations add column if not exists gps_lat double precision;
alter table public.organizations add column if not exists gps_lng double precision;

-- a user's request to join a club's committee
create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  position_id uuid references public.committee_positions (id) on delete set null,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_jr_committee_status on public.join_requests (committee_id, status);
create index if not exists idx_jr_profile on public.join_requests (profile_id);
-- at most one open request per person per committee
create unique index if not exists idx_jr_one_pending
  on public.join_requests (committee_id, email) where status = 'pending';

alter table public.join_requests enable row level security;
-- no direct policies: all access via the SECURITY DEFINER RPCs below.

-- directory now also carries the club's GPS (null-safe) for distance sorting
-- (drop first: return type changes from the 018 version)
drop function if exists public.public_org_directory();
create or replace function public.public_org_directory()
returns table (id uuid, name text, org_type text, place text, district text,
               state text, country text, logo_url text,
               gps_lat double precision, gps_lng double precision)
language sql stable security definer set search_path = public as $$
  select id, name, org_type, place, district, state, country, logo_url, gps_lat, gps_lng
    from public.organizations
   where coalesce(is_demo, false) = false
   order by name;
$$;

-- caller asks to join a club (its first committee). Idempotent; blocks if already a member.
create or replace function public.request_to_join(p_org uuid, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_committee uuid; v_email text;
begin
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

-- caller's own requests (for the "your requests" list)
create or replace function public.my_join_requests()
returns table (request_id uuid, org_id uuid, org_name text, logo_url text,
               status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select jr.id, o.id, o.name, o.logo_url, jr.status, jr.created_at
    from public.join_requests jr
    join public.committees c on c.id = jr.committee_id
    join public.organizations o on o.id = c.organization_id
   where jr.profile_id = auth.uid()
   order by jr.created_at desc;
$$;

-- pending requests an admin can act on (optionally scoped to one committee)
create or replace function public.pending_join_requests(p_committee uuid default null)
returns table (request_id uuid, committee_id uuid, org_name text, name text,
               email text, avatar_url text, message text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select jr.id, jr.committee_id, o.name,
         coalesce(pr.nickname, pr.full_name, initcap(split_part(jr.email,'@',1))),
         jr.email, pr.avatar_url, jr.message, jr.created_at
    from public.join_requests jr
    join public.committees c on c.id = jr.committee_id
    join public.organizations o on o.id = c.organization_id
    left join public.profiles pr on pr.id = jr.profile_id
   where jr.status = 'pending'
     and (public.is_padmin() or public.is_committee_admin(jr.committee_id))
     and (p_committee is null or jr.committee_id = p_committee)
   order by jr.created_at;
$$;

-- approve: add the user to the committee with the chosen position/tier
create or replace function public.approve_join_request(p_request uuid, p_position_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_committee uuid; v_email text; v_profile uuid; v_tier text;
begin
  select committee_id, lower(email), profile_id into v_committee, v_email, v_profile
    from public.join_requests where id = p_request and status = 'pending';
  if v_committee is null then raise exception 'NO_REQUEST'; end if;
  if not (public.is_padmin() or public.is_committee_admin(v_committee)) then
    raise exception 'NOT_ALLOWED';
  end if;

  select tier into v_tier from public.committee_positions where id = p_position_id;
  v_tier := coalesce(v_tier, 'released');  -- default volunteer-level access

  insert into public.committee_members (committee_id, profile_id, email, position_id, tier)
  values (v_committee, v_profile, v_email, p_position_id, v_tier)
  on conflict (committee_id, email)
    do update set position_id = excluded.position_id, tier = excluded.tier, profile_id = excluded.profile_id;

  update public.join_requests
     set status = 'approved', position_id = p_position_id, decided_by = auth.uid(), decided_at = now()
   where id = p_request;
end $$;

create or replace function public.reject_join_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_committee uuid;
begin
  select committee_id into v_committee from public.join_requests where id = p_request and status = 'pending';
  if v_committee is null then raise exception 'NO_REQUEST'; end if;
  if not (public.is_padmin() or public.is_committee_admin(v_committee)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.join_requests
     set status = 'rejected', decided_by = auth.uid(), decided_at = now()
   where id = p_request;
end $$;

grant execute on function
  public.public_org_directory(),
  public.request_to_join(uuid, text),
  public.my_join_requests(),
  public.pending_join_requests(uuid),
  public.approve_join_request(uuid, uuid),
  public.reject_join_request(uuid)
to authenticated;
