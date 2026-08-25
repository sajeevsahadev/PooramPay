-- Register pages (Areas, area detail) were pulling EVERY income_entries row for
-- the program just to mark which members had paid — O(all transactions), i.e.
-- millions of rows shipped to the browser. idx_income_prog_house (010) already
-- makes "distinct house_id for a program" an index-only scan; expose it as an
-- aggregate so the client fetches ~one row per paid member instead.
create or replace function public.program_paid_houses(p_program uuid)
returns table (house_id uuid)
language sql stable set search_path = public as $$
  select distinct house_id
    from public.income_entries
   where program_id = p_program and deleted_at is null and house_id is not null;
$$;

-- Profile photo for register members who are also app users (matched by email).
-- SECURITY DEFINER so a collector can see a teammate's avatar without broad read
-- access to profiles; guarded to the caller's own programs (or platform admin).
create or replace function public.program_member_avatars(p_program uuid)
returns table (house_id uuid, avatar_url text)
language sql stable security definer set search_path = public as $$
  select h.id, p.avatar_url
    from public.houses h
    join public.profiles p on lower(p.email) = lower(h.email)
   where h.program_id = p_program
     and h.email is not null
     and p.avatar_url is not null
     and (public.is_padmin() or p_program in (select public.my_member_programs()));
$$;

grant execute on function
  public.program_paid_houses(uuid),
  public.program_member_avatars(uuid)
to authenticated;
