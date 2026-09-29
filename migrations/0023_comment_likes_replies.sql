-- Comments: likes and one level of replies (parent_id points at the top-level comment).
alter table comments add column if not exists parent_id int references comments(id) on delete cascade;
create index if not exists comments_parent_id_idx on comments (parent_id);

create table if not exists comment_likes (
  user_id text not null,
  comment_id int not null references comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
create index if not exists comment_likes_comment_id_idx on comment_likes (comment_id);
