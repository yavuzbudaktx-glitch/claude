-- ---------------------------------------------------------------------------
-- Watch-together list: a shared queue of movies/shows you both add to, mark
-- watched, and rate. Ratings are per-person, keyed by user_id in jsonb.
-- ---------------------------------------------------------------------------
create table if not exists zuya_watchlist (
  id uuid primary key default gen_random_uuid(),
  added_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'movie',           -- 'movie' | 'show'
  watched boolean not null default false,
  watched_at timestamptz,
  ratings jsonb not null default '{}',           -- { "<user_id>": 1..5 }
  created_at timestamptz default now()
);

create index if not exists zuya_watchlist_idx on zuya_watchlist (watched, created_at desc);

alter table zuya_watchlist enable row level security;

drop policy if exists "zuya_watchlist_select" on zuya_watchlist;
create policy "zuya_watchlist_select" on zuya_watchlist for select
  using (zuya_is_member());

drop policy if exists "zuya_watchlist_insert" on zuya_watchlist;
create policy "zuya_watchlist_insert" on zuya_watchlist for insert
  with check (zuya_is_member() and added_by = auth.uid());

drop policy if exists "zuya_watchlist_update" on zuya_watchlist;
create policy "zuya_watchlist_update" on zuya_watchlist for update
  using (zuya_is_member()) with check (zuya_is_member());

drop policy if exists "zuya_watchlist_delete" on zuya_watchlist;
create policy "zuya_watchlist_delete" on zuya_watchlist for delete
  using (zuya_is_member());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table zuya_watchlist';
  exception when duplicate_object then null;
  end;
end $$;
