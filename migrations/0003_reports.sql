-- VELA: user reports on posts (notice-and-action). One report per user and post.
create table if not exists reports (
  id serial primary key,
  post_id int not null references posts(id) on delete cascade,
  reporter_id text not null,
  reason text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);
create index if not exists reports_post_id_idx on reports (post_id);
