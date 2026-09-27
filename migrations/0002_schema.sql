-- VELA: adult photo gallery + profiles
create table if not exists profiles (
  user_id text primary key,
  display_name text not null,
  handle text not null unique,
  bio text not null default '',
  birthdate date not null,
  relationship_status text not null default 'single',
  avatar_url text,
  background_id text not null default 'midnight',
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_handle_idx on profiles (handle);

create table if not exists posts (
  id serial primary key,
  user_id text not null,
  image_url text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists posts_user_id_idx on posts (user_id);
create index if not exists posts_created_at_idx on posts (created_at desc);

create table if not exists likes (
  user_id text not null,
  post_id int not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists likes_post_id_idx on likes (post_id);

create table if not exists follows (
  follower_id text not null,
  following_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);
create index if not exists follows_following_id_idx on follows (following_id);

insert into profiles (user_id, display_name, handle, bio, birthdate, relationship_status, avatar_url, background_id, created_at)
values
  ('seed-mira',  'Mira Sol',   'mira',  'Licht, Stoffe, Dämmerung. Fotografin in Berlin.',           '1998-04-12', 'single',       '/seed/mira.jpg',  'midnight', '2026-03-01T10:00:00Z'),
  ('seed-jonas', 'Jonas Hart', 'jonas', 'Architektur und Wege. Unterwegs, selten still.',            '1994-09-03', 'taken',        '/seed/jonas.jpg', 'ember',    '2026-03-08T10:00:00Z'),
  ('seed-amira', 'Amira Noor', 'amira', 'Nachtfarben. Stadt als Bühne.',                             '2000-01-22', 'open',         '/seed/amira.jpg', 'harbor',   '2026-04-02T10:00:00Z'),
  ('seed-luca',  'Luca Voss',  'luca',  'Räume, in denen Staub tanzt. Stillleben und Lofts.',        '1996-11-08', 'single',       '/seed/luca.jpg',  'studio',   '2026-04-18T10:00:00Z'),
  ('seed-sofia', 'Sofia Berg', 'sofia', 'Straßen, Jahreszeiten, Mäntel. Immer zu Fuß.',              '1992-06-17', 'taken',        '/seed/sofia.jpg', 'fog',      '2026-05-09T10:00:00Z'),
  ('seed-noah',  'Noah Klein', 'noah',  'Zwischen den Bildern. Museen, Musik, schwarze Stoffe.',    '1998-12-01', 'complicated',  '/seed/noah.jpg',  'paper',    '2026-06-12T10:00:00Z')
on conflict (user_id) do nothing;

insert into posts (id, user_id, image_url, caption, created_at)
values
  (1, 'seed-mira',  '/seed/post-rooftop.jpg', 'Dämmerung über der Stadt. Der Wind hat recht.',           '2026-09-22T19:10:00Z'),
  (2, 'seed-mira',  '/seed/mira.jpg',         'Studio. Kein Filter, nur Licht von links.',                '2026-09-18T11:40:00Z'),
  (3, 'seed-jonas', '/seed/post-village.jpg', 'Weißer Stein, spätes Licht. Die Treppe reicht.',           '2026-09-21T16:05:00Z'),
  (4, 'seed-jonas', '/seed/jonas.jpg',        'Nachmittag, Leinen, kein Termin.',                         '2026-09-14T13:20:00Z'),
  (5, 'seed-amira', '/seed/post-alley.jpg',   'Nasse Straße, offene Nacht.',                              '2026-09-23T22:48:00Z'),
  (6, 'seed-amira', '/seed/amira.jpg',        'Gold an den Ohren, Stadt im Rücken.',                      '2026-09-16T21:15:00Z'),
  (7, 'seed-luca',  '/seed/post-loft.jpg',    'Staub im Nachmittag. Ich habe nichts verschoben.',         '2026-09-20T15:33:00Z'),
  (8, 'seed-luca',  '/seed/luca.jpg',         'Fensterwetter. Das reicht heute.',                         '2026-09-12T09:50:00Z'),
  (9, 'seed-sofia', '/seed/sofia.jpg',        'Herbst bleibt länger, wenn man langsam geht.',             '2026-09-19T17:02:00Z'),
  (10,'seed-noah',  '/seed/noah.jpg',         'Im Raum zwischen den Bildern.',                            '2026-09-17T14:27:00Z')
on conflict (id) do nothing;

select setval('posts_id_seq', (select coalesce(max(id), 1) from posts));

insert into likes (user_id, post_id) values
  ('seed-jonas', 1), ('seed-amira', 1), ('seed-luca', 1), ('seed-sofia', 1),
  ('seed-mira', 3),  ('seed-amira', 3), ('seed-noah', 3),
  ('seed-mira', 5),  ('seed-jonas', 5), ('seed-luca', 5), ('seed-noah', 5),
  ('seed-sofia', 7), ('seed-mira', 7),
  ('seed-amira', 9), ('seed-jonas', 9),
  ('seed-luca', 10), ('seed-mira', 10), ('seed-sofia', 2)
on conflict do nothing;

insert into follows (follower_id, following_id) values
  ('seed-mira', 'seed-jonas'),
  ('seed-mira', 'seed-amira'),
  ('seed-jonas', 'seed-mira'),
  ('seed-jonas', 'seed-sofia'),
  ('seed-amira', 'seed-mira'),
  ('seed-amira', 'seed-noah'),
  ('seed-luca', 'seed-mira'),
  ('seed-luca', 'seed-jonas'),
  ('seed-sofia', 'seed-amira'),
  ('seed-noah', 'seed-luca'),
  ('seed-noah', 'seed-mira')
on conflict do nothing;
