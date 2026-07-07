-- Pinterest OAuth for the shared board feed. Refresh tokens live in a
-- policy-less table (service-role only, like Spotify/Google) so neither
-- partner can read the other's token. A boolean on zuya_members drives the UI.
create table if not exists zuya_pinterest_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  pinterest_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table zuya_pinterest_tokens enable row level security; -- no policies: service-role only

drop trigger if exists zuya_pinterest_tokens_updated_at on zuya_pinterest_tokens;
create trigger zuya_pinterest_tokens_updated_at before update on zuya_pinterest_tokens
  for each row execute function set_updated_at();

alter table zuya_members add column if not exists pinterest_connected boolean not null default false;
