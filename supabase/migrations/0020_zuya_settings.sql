-- ---------------------------------------------------------------------------
-- Shared Zuya settings: a tiny key/value store both partners read & write.
-- Used first for the shared Pinterest board URL, but general-purpose.
-- ---------------------------------------------------------------------------
create table if not exists zuya_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table zuya_settings enable row level security;

drop policy if exists "zuya_settings_select" on zuya_settings;
create policy "zuya_settings_select" on zuya_settings for select
  using (zuya_is_member());

drop policy if exists "zuya_settings_insert" on zuya_settings;
create policy "zuya_settings_insert" on zuya_settings for insert
  with check (zuya_is_member());

drop policy if exists "zuya_settings_update" on zuya_settings;
create policy "zuya_settings_update" on zuya_settings for update
  using (zuya_is_member()) with check (zuya_is_member());

-- Realtime so a board change on one phone updates the other instantly.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table zuya_settings';
  exception when duplicate_object then null;
  end;
end $$;
