-- Count repeat views: how often each member looked at a post (upload statistics).
alter table post_views add column if not exists view_count integer not null default 1;
