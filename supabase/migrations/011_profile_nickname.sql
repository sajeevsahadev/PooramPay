-- User-chosen nickname, visible to co-members. Distinct from full_name (from
-- Google) and from the per-program display_name an admin may set.
alter table public.profiles add column if not exists nickname text;

-- let users edit their own nickname (column-level grant, same pattern as before)
grant update (full_name, phone, language, avatar_url, nickname) on public.profiles to authenticated;
