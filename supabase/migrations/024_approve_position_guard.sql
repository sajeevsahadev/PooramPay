-- Peer-review hardening: when approving a join request, only accept a position
-- that belongs to the request's own committee (ignore a cross-committee id and
-- fall back to the default volunteer tier).
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

  -- position must belong to THIS committee, else treat as unset
  select tier into v_tier from public.committee_positions
   where id = p_position_id and committee_id = v_committee;
  if v_tier is null then p_position_id := null; end if;
  v_tier := coalesce(v_tier, 'released');

  insert into public.committee_members (committee_id, profile_id, email, position_id, tier)
  values (v_committee, v_profile, v_email, p_position_id, v_tier)
  on conflict (committee_id, email)
    do update set position_id = excluded.position_id, tier = excluded.tier, profile_id = excluded.profile_id;

  update public.join_requests
     set status = 'approved', position_id = p_position_id, decided_by = auth.uid(), decided_at = now()
   where id = p_request;
end $$;
