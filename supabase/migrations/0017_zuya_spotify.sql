-- Spotify "listening now" for Zuya. Refresh tokens live in a policy-less
-- table (service-role only, like the Google tokens) so neither partner can
-- read the other's token. A boolean on zuya_members drives the UI.

create table if not exists zuya_spotify_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  spotify_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table zuya_spotify_tokens enable row level security; -- no policies: service-role only

drop trigger if exists zuya_spotify_tokens_updated_at on zuya_spotify_tokens;
create trigger zuya_spotify_tokens_updated_at before update on zuya_spotify_tokens
  for each row execute function set_updated_at();

alter table zuya_members add column if not exists spotify_connected boolean not null default false;
