-- In-app notifications: likes, comments, follows and "System" messages from moderation.
create table if not exists notifications (
  id serial primary key,
  user_id text not null,
  kind text not null,          -- like | comment | follow | system
  actor_id text,               -- who did it (null for system messages)
  post_id int references posts(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
