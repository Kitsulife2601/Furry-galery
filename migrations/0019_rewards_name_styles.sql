-- Rewards: every day someone uses the site counts; name styles are one of the rewards.
create table if not exists active_days (
  user_id text not null,
  day date not null,
  primary key (user_id, day)
);
alter table profiles add column if not exists name_style text;

-- Head start for existing members: days they joined, posted or commented.
insert into active_days (user_id, day)
select user_id, (created_at at time zone 'Europe/Berlin')::date from profiles
union
select user_id, (created_at at time zone 'Europe/Berlin')::date from posts
union
select user_id, (created_at at time zone 'Europe/Berlin')::date from comments
on conflict do nothing;
