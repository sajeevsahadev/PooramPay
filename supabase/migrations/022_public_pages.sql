-- PUBLIC PAGES / SEO LAYER (folder method: poorampay.com/c/<org-slug>)
-- Additive only: new columns, unique slug, anon-readable RPCs that return ONLY
-- opt-in + already-published data. Base-table RLS is untouched; writes go through
-- committee-admin-checked SECURITY DEFINER RPCs so no column grants are needed.

alter table public.organizations add column if not exists slug text;
alter table public.organizations add column if not exists cover_url text;   -- club banner photo
alter table public.programs      add column if not exists is_public boolean not null default false;
alter table public.programs      add column if not exists group_photo_url text; -- "conducted by" committee photo

-- unique, collision-free slug generator (ASCII kebab; falls back for non-latin names)
create or replace function public.gen_org_slug(p_name text, p_id uuid)
returns text language plpgsql set search_path = public as $$
declare base text; cand text; n int := 1;
begin
  base := lower(regexp_replace(regexp_replace(coalesce(p_name,''), '[^a-zA-Z0-9]+', '-', 'g'),
                               '(^-+|-+$)', '', 'g'));
  if base is null or base = '' then base := 'club'; end if;
  base := left(base, 40);
  cand := base;
  while exists (select 1 from public.organizations where slug = cand and id <> p_id) loop
    n := n + 1; cand := base || '-' || n;
  end loop;
  return cand;
end $$;

-- backfill slugs row-by-row so each new slug sees the previous assignments
do $$
declare r record;
begin
  for r in select id, name from public.organizations where slug is null loop
    update public.organizations set slug = public.gen_org_slug(r.name, r.id) where id = r.id;
  end loop;
end $$;

create unique index if not exists idx_org_slug on public.organizations (slug) where slug is not null;
create index if not exists idx_programs_public on public.programs (is_public) where is_public;

-- ============ PUBLIC READ (granted to anon) ============
-- One club's public page: identity + every public&published program's stored
-- snapshot (no live scan) + signatories + the committee team (name/position/photo
-- only — never email or phone). Returns null unless the club has >=1 public page.
create or replace function public.public_committee_page(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  with org as (
    select * from public.organizations
     where slug = p_slug and coalesce(is_demo, false) = false
  ),
  pubprogs as (
    select p.* from public.programs p
      join public.committees c on c.id = p.committee_id
      join org o on o.id = c.organization_id
     where p.is_public = true and p.results_published = true
  ),
  team as (
    select distinct on (lower(cm.email))
           coalesce(cm.display_name, pr.nickname, pr.full_name, initcap(split_part(cm.email,'@',1))) as name,
           cpos.label as position, pr.avatar_url as avatar_url, cpos.sort_order as sort_order
      from public.committee_members cm
      join public.committees c on c.id = cm.committee_id
      join org o on o.id = c.organization_id
      left join public.committee_positions cpos on cpos.id = cm.position_id
      left join public.profiles pr on lower(pr.email) = lower(cm.email)
     order by lower(cm.email), cpos.sort_order nulls last
  )
  select case
    when (select id from org) is null or not exists (select 1 from pubprogs) then null
    else jsonb_build_object(
      'org', (select jsonb_build_object(
                'name', o.name, 'org_type', o.org_type, 'place', o.place,
                'district', o.district, 'state', o.state, 'country', o.country,
                'logo_url', o.logo_url, 'cover_url', o.cover_url, 'slug', o.slug) from org o),
      'programs', coalesce((select jsonb_agg(jsonb_build_object(
                'name', pp.name, 'year', pp.year, 'snapshot', pp.results_snapshot,
                'group_photo_url', pp.group_photo_url, 'published_at', pp.results_published_at,
                'signoffs', coalesce((select jsonb_agg(jsonb_build_object(
                       'name', coalesce(sp.nickname, sp.full_name), 'role', s.role_at_signing)
                       order by s.signed_at)
                     from public.program_signoffs s
                     left join public.profiles sp on sp.id = s.profile_id
                     where s.program_id = pp.id), '[]'::jsonb))
              order by pp.year desc) from pubprogs pp), '[]'::jsonb),
      'committee', coalesce((select jsonb_agg(jsonb_build_object(
                'name', t.name, 'position', t.position, 'avatar_url', t.avatar_url)
              order by t.sort_order nulls last, t.name) from team t), '[]'::jsonb))
  end;
$$;

-- Directory of public clubs (optionally by district)
create or replace function public.public_directory(p_district text default null)
returns table (slug text, name text, org_type text, place text, district text, state text, logo_url text)
language sql stable security definer set search_path = public as $$
  select distinct o.slug, o.name, o.org_type, o.place, o.district, o.state, o.logo_url
    from public.organizations o
    join public.committees c on c.organization_id = o.id
    join public.programs p on p.committee_id = c.id
   where o.slug is not null and coalesce(o.is_demo, false) = false
     and p.is_public = true and p.results_published = true
     and (p_district is null or lower(coalesce(o.district,'')) = lower(p_district))
   order by o.name;
$$;

grant execute on function public.public_committee_page(text) to anon, authenticated;
grant execute on function public.public_directory(text) to anon, authenticated;

-- ============ ADMIN WRITE (committee admin, via RPC) ============
-- Toggle a program's public page; ensure the club has a slug when first published.
create or replace function public.set_public_page(p_program uuid, p_is_public boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_committee uuid; v_org uuid; v_slug text;
begin
  select committee_id into v_committee from public.programs where id = p_program;
  if v_committee is null then raise exception 'NO_PROGRAM'; end if;
  if not (public.is_padmin() or public.is_committee_admin(v_committee)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.programs set is_public = p_is_public where id = p_program;
  select organization_id into v_org from public.committees where id = v_committee;
  select slug into v_slug from public.organizations where id = v_org;
  if p_is_public and v_slug is null then
    v_slug := public.gen_org_slug((select name from public.organizations where id = v_org), v_org);
    update public.organizations set slug = v_slug where id = v_org;
  end if;
  return v_slug;
end $$;

-- Save the club cover photo and the program's committee ("conducted by") photo.
-- null = leave unchanged; '' = clear.
create or replace function public.save_public_page_media(p_program uuid, p_cover_url text, p_group_photo_url text)
returns void language plpgsql security definer set search_path = public as $$
declare v_committee uuid; v_org uuid;
begin
  select committee_id into v_committee from public.programs where id = p_program;
  if v_committee is null then raise exception 'NO_PROGRAM'; end if;
  if not (public.is_padmin() or public.is_committee_admin(v_committee)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select organization_id into v_org from public.committees where id = v_committee;
  if p_cover_url is not null then
    update public.organizations set cover_url = nullif(p_cover_url, '') where id = v_org;
  end if;
  if p_group_photo_url is not null then
    update public.programs set group_photo_url = nullif(p_group_photo_url, '') where id = p_program;
  end if;
end $$;

grant execute on function public.set_public_page(uuid, boolean) to authenticated;
grant execute on function public.save_public_page_media(uuid, text, text) to authenticated;
