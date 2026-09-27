-- Profile banner image, and version counters so image URLs can be cached forever
-- (a new upload gets a new URL).
alter table profiles add column if not exists banner_url text;
alter table profiles add column if not exists avatar_version int not null default 0;
alter table profiles add column if not exists banner_version int not null default 0;
