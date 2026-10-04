-- New clubs should be PRIVATE by default (opt in to discovery later via Setup).
-- Existing rows keep their current value (already true = public); only the default
-- for newly-created organizations changes.
alter table public.organizations alter column is_public set default false;
