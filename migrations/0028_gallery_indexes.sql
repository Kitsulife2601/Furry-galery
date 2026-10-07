-- Gallery: fast hashtag filters/suggestions and "Beliebt diese Woche" (recent likes).
create index if not exists posts_hashtags_gin_idx on posts using gin (hashtags);
create index if not exists likes_post_created_idx on likes (post_id, created_at);
