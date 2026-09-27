-- Reports about a whole profile (from the ⋯ menu on the profile page).
create table if not exists profile_reports (
  id serial primary key,
  profile_user_id text not null,
  reporter_id text not null,
  reason text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (profile_user_id, reporter_id)
);
create index if not exists profile_reports_open_idx on profile_reports (profile_user_id) where resolved_at is null;
