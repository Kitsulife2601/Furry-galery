-- Moderation: banned profiles are hidden and cannot post, like or comment.
alter table profiles add column if not exists banned_at timestamptz;
-- Reports can be dismissed by an admin without deleting the post.
alter table reports add column if not exists resolved_at timestamptz;

-- Comments under posts.
create table if not exists comments (
  id serial primary key,
  post_id int not null references posts(id) on delete cascade,
  user_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_id_idx on comments (post_id, created_at);

-- Categories on posts (see POST_TAGS in src/lib/vela/types.ts).
alter table posts add column if not exists tags text[] not null default '{}';
create index if not exists posts_tags_idx on posts using gin (tags);
