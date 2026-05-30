-- Sync agents authenticate with per-device bearer tokens (NOT OAuth cookies).
-- We store only sha256(token); the raw token is shown to the user once at
-- creation. sync_cursor is the highest documents.rev the device has processed.

-- Redefined idempotently so this migration also applies standalone (see 0008).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text,                            -- 'macos','windows','linux','ios','android'
  token_hash text not null,                 -- sha256 of the device token
  sync_cursor bigint not null default 0,
  last_seen_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (token_hash)
);

create index if not exists devices_user_idx on devices(user_id);

alter table devices enable row level security;

drop policy if exists "devices_owner" on devices;
create policy "devices_owner" on devices for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists devices_updated_at on devices;
create trigger devices_updated_at before update on devices
  for each row execute function set_updated_at();
