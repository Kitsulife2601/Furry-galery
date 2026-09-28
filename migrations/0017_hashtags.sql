-- #hashtags from captions — the "Für dich" feed learns from them like categories.
alter table posts add column if not exists hashtags text[] not null default '{}';
update posts
set hashtags = array(
  select distinct lower(m[1]) from regexp_matches(caption, '#([[:alnum:]_]{2,30})', 'g') as m
)
where caption like '%#%';
