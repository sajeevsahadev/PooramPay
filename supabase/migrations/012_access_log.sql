-- Login/session audit: who signed in, from what IP/device/location, into which
-- club. Visible ONLY to platform (super) admins, newest first, for security.

create table if not exists public.access_log (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  email text,
  ip text,
  user_agent text,
  device text,
  city text,
  region text,
  country text,
  program_id uuid references public.programs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_access_log_time on public.access_log (created_at desc);
create index if not exists idx_access_log_profile on public.access_log (profile_id);

alter table public.access_log enable row level security;

-- a user may record only their own login event
create policy access_insert on public.access_log for insert to authenticated
  with check (profile_id = (select auth.uid()));

-- only platform admins can read the access log
create policy access_select on public.access_log for select to authenticated
  using ((select public.is_padmin()));

-- (no update/delete policies: the access log is append-only)
