-- Portfolio: cross-device sync via Supabase.
-- holdings: per-symbol position; snapshots: total-value time series for the chart.

create table if not exists portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  shares numeric not null check (shares > 0),
  cost_basis numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, symbol)
);

create index if not exists portfolio_holdings_user_idx on portfolio_holdings(user_id);

create table if not exists portfolio_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  value numeric not null,
  created_at timestamptz default now(),
  primary key (user_id, date)
);

alter table portfolio_holdings  enable row level security;
alter table portfolio_snapshots enable row level security;

drop policy if exists "portfolio_holdings_owner"  on portfolio_holdings;
create policy "portfolio_holdings_owner" on portfolio_holdings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "portfolio_snapshots_owner" on portfolio_snapshots;
create policy "portfolio_snapshots_owner" on portfolio_snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists portfolio_holdings_updated_at on portfolio_holdings;
create trigger portfolio_holdings_updated_at before update on portfolio_holdings
  for each row execute function set_updated_at();
