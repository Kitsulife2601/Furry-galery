-- Team members added in the moderation panel, by Discord user id, website user id or handle.
create table if not exists team_members (
  ref_kind text not null,
  ref_value text not null,
  added_by text,
  created_at timestamptz not null default now(),
  primary key (ref_kind, ref_value)
);
