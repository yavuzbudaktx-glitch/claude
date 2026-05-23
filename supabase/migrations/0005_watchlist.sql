-- Per-user watchlist of stock tickers, synced across devices.

create table if not exists watchlist (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  symbol     text        not null,
  position   int         not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create index if not exists watchlist_user_pos_idx
  on watchlist(user_id, position, created_at);

alter table watchlist enable row level security;

drop policy if exists "watchlist_owner" on watchlist;
create policy "watchlist_owner" on watchlist for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
