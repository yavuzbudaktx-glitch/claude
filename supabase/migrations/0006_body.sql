-- Per-user body tracker: weight history, calorie goal + today's intake,
-- and the two-day workout plan. Stored as a single JSONB blob per user
-- and synced across devices.

create table if not exists body_profile (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table body_profile enable row level security;

drop policy if exists "body_profile_owner" on body_profile;
create policy "body_profile_owner" on body_profile for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
