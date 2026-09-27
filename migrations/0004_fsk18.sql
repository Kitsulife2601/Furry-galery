-- FSK18 posts, unlocked by a verified role in the community Discord.
alter table profiles add column if not exists discord_id text;
alter table profiles add column if not exists discord_username text;
alter table profiles add column if not exists fsk18_verified_at timestamptz;
alter table profiles add column if not exists fsk18_checked_at timestamptz;
create unique index if not exists profiles_discord_id_idx
  on profiles (discord_id) where discord_id is not null;

-- preview_url: a tiny (~16px) thumbnail, the only image unverified viewers ever get.
alter table posts add column if not exists nsfw boolean not null default false;
alter table posts add column if not exists preview_url text;

-- Search by name / handle.
create index if not exists profiles_display_name_lower_idx on profiles (lower(display_name));
