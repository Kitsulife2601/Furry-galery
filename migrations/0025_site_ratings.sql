-- Star rating of the site (pop-up for members who joined more than a week ago),
-- and the last site update each member has seen (the "Was ist neu" pop-up).
create table if not exists site_ratings (
  user_id text primary key,
  stars smallint not null check (stars between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles add column if not exists rating_prompt_later_at timestamptz;
alter table profiles add column if not exists updates_seen_at timestamptz;
