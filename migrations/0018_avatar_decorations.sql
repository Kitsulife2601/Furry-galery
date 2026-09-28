-- Discord-style avatar decorations and profile effects (ids from src/lib/vela/decorations.ts).
alter table profiles add column if not exists avatar_decoration text;
alter table profiles add column if not exists profile_effect text;
