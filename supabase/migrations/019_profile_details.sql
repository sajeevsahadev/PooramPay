-- Richer user profile: short description/bio, date of birth, gender and country.
-- avatar_url already exists (001) and is already covered by the update grant (011);
-- the profile picture is stored there as a compressed data URL from the client.

alter table public.profiles add column if not exists description   text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists gender        text;
alter table public.profiles add column if not exists country       text;

-- keep gender to a known set (nullable = not specified)
alter table public.profiles drop constraint if exists profiles_gender_chk;
alter table public.profiles add constraint profiles_gender_chk
  check (gender is null or gender in ('male', 'female', 'other'));

-- let users edit their own new fields (column-level grant, same pattern as 011)
grant update (full_name, phone, language, avatar_url, nickname,
              description, date_of_birth, gender, country)
  on public.profiles to authenticated;
