-- Interests picked right after sign-up (TikTok-style) — they steer the "Für dich" feed.
alter table profiles add column if not exists interests text[] not null default '{}';
alter table profiles add column if not exists interests_asked_at timestamptz;
