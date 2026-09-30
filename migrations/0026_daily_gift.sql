-- Once-a-day "Tagespfote" so opening the gallery is worth it, separate from the minute cap.
alter table profiles add column if not exists gift_day date;
