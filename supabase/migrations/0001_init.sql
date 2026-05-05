-- Morning Dashboard schema

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due_date date,
  quadrant text not null check (quadrant in ('do','schedule','delegate','eliminate')),
  completed boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tasks_user_quadrant_idx on tasks(user_id, quadrant, completed);

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_refresh_token text,
  weather_lat numeric default 32.7767,
  weather_lon numeric default -96.7970,
  updated_at timestamptz default now()
);

alter table tasks enable row level security;
alter table user_settings enable row level security;

drop policy if exists "tasks_owner" on tasks;
create policy "tasks_owner" on tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_owner" on user_settings;
create policy "settings_owner" on user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

drop trigger if exists user_settings_updated_at on user_settings;
create trigger user_settings_updated_at before update on user_settings
  for each row execute function set_updated_at();
