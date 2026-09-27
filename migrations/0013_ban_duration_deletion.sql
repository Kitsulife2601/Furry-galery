-- Temporary bans lift themselves at banned_until; profiles can be scheduled for deletion.
alter table profiles add column if not exists banned_until timestamptz;
alter table profiles add column if not exists delete_at timestamptz;
