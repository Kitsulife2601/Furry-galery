-- Feedback and wishes from members, handled by the team.
create table if not exists feedback (
  id serial primary key,
  user_id text not null,
  kind text not null,           -- wish | bug | praise | other
  body text not null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists feedback_created_idx on feedback (created_at desc);

-- Site updates published by admins (changelog, System notification, Discord #updates).
create table if not exists announcements (
  id serial primary key,
  title text not null,
  body text not null,
  created_by text,
  created_at timestamptz not null default now()
);

-- Reason shown on a banned profile (and in the ban notice).
alter table profiles add column if not exists ban_reason text;
