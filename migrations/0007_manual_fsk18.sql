-- FSK 18 unlocked by hand by the team (Discord /web-freischalten), independent of
-- the Discord account link. fsk18_manual_by holds the moderator's Discord name.
alter table profiles add column if not exists fsk18_manual_at timestamptz;
alter table profiles add column if not exists fsk18_manual_by text;
