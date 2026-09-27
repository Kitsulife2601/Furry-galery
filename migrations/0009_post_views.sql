-- "Für dich": which posts a member has looked at, feeding the personal ranking.
create table if not exists post_views (
  user_id text not null,
  post_id int not null references posts(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists post_views_post_id_idx on post_views (post_id);
