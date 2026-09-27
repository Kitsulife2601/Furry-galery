-- "Interessiert" (+1) / "Nicht interessiert" (-1) from the post's ⋯ menu; the feed learns from it.
create table if not exists post_feedback (
  user_id text not null,
  post_id int not null references posts(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
