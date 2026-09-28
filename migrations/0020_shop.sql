-- Shop: "Pfoten" earned for time on the site, spent on backgrounds, frames, name styles and effects.
alter table profiles add column if not exists paws integer not null default 0;
alter table profiles add column if not exists paws_day date;
alter table profiles add column if not exists paws_today integer not null default 0;
alter table profiles add column if not exists paws_tick_at timestamptz;

create table if not exists shop_purchases (
  user_id text not null,
  kind text not null,
  item_id text not null,
  price integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

-- Head start: 20 Pfoten for every day someone has already been active.
update profiles p
set paws = p.paws + 20 * d.n
from (select user_id, count(*)::int as n from active_days group by user_id) d
where d.user_id = p.user_id and p.paws = 0;
