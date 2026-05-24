-- Per-user app preferences blob (city, tracked team, hidden events, saved
-- news, scratchpad, habits, …) synced across devices. Stored as JSONB on
-- the existing user_settings row so no extra table/policy is needed.

alter table user_settings add column if not exists prefs jsonb not null default '{}'::jsonb;
