-- Live location sharing for Zuya. Each member reports their own GPS while the
-- app is open and the toggle is on; the partner sees it live on a map. One row
-- per user, upserted. Private to the two members via RLS.

create table if not exists zuya_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision,
  lng double precision,
  accuracy double precision,
  sharing boolean not null default false,
  updated_at timestamptz default now()
);

alter table zuya_locations enable row level security;

drop policy if exists "zuya_loc_select" on zuya_locations;
create policy "zuya_loc_select" on zuya_locations for select
  using (zuya_is_member());

drop policy if exists "zuya_loc_insert" on zuya_locations;
create policy "zuya_loc_insert" on zuya_locations for insert
  with check (zuya_is_member() and user_id = auth.uid());

drop policy if exists "zuya_loc_update" on zuya_locations;
create policy "zuya_loc_update" on zuya_locations for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists zuya_locations_updated_at on zuya_locations;
create trigger zuya_locations_updated_at before update on zuya_locations
  for each row execute function set_updated_at();

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table zuya_locations';
  exception when duplicate_object then null;
  end;
end $$;
