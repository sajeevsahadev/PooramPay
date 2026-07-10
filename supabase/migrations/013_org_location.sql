-- Organization location details (place already existed).
alter table public.organizations add column if not exists country text default 'India';
alter table public.organizations add column if not exists state text default 'Kerala';
alter table public.organizations add column if not exists district text default 'Thrissur';
