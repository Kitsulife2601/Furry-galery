-- Video posts: the file lives in Vercel Blob; image_url keeps a poster frame
-- (used for grids, previews and the FSK 18 blur).
alter table posts add column if not exists video_url text;
