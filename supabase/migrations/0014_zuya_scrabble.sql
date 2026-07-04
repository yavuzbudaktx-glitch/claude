-- Kelimelik (Scrabble) game state for Zuya. One shared, turn-based game
-- between the two members. Trust-based: no dictionary check, both members can
-- write, turn order is enforced in the app. Realtime keeps the board in sync.

create table if not exists zuya_scrabble (
  id uuid primary key default gen_random_uuid(),
  board jsonb not null default '[]',   -- 225 cells: null | { l: "A", b: bool, u: user_id }
  bag jsonb not null default '[]',     -- remaining tiles, e.g. ["A","B","*"]
  racks jsonb not null default '{}',   -- { user_id: ["A","B",...] }
  scores jsonb not null default '{}',  -- { user_id: number }
  turn uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','done')),
  passes int not null default 0,
  last_move jsonb,                     -- { by, word, points, idxs }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table zuya_scrabble enable row level security;

drop policy if exists "zuya_scrabble_select" on zuya_scrabble;
create policy "zuya_scrabble_select" on zuya_scrabble for select
  using (zuya_is_member());

drop policy if exists "zuya_scrabble_insert" on zuya_scrabble;
create policy "zuya_scrabble_insert" on zuya_scrabble for insert
  with check (zuya_is_member());

drop policy if exists "zuya_scrabble_update" on zuya_scrabble;
create policy "zuya_scrabble_update" on zuya_scrabble for update
  using (zuya_is_member()) with check (zuya_is_member());

drop policy if exists "zuya_scrabble_delete" on zuya_scrabble;
create policy "zuya_scrabble_delete" on zuya_scrabble for delete
  using (zuya_is_member());

drop trigger if exists zuya_scrabble_updated_at on zuya_scrabble;
create trigger zuya_scrabble_updated_at before update on zuya_scrabble
  for each row execute function set_updated_at();

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table zuya_scrabble';
  exception when duplicate_object then null;
  end;
end $$;
