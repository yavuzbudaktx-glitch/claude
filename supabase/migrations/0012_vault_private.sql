-- Doc Anywhere v2: favorites, hidden private vault, and per-user private PIN.

-- Mark items as favorite (pinned) and/or hidden (only visible after the user
-- unlocks the private vault with their PIN).
alter table vault_items add column if not exists favorite boolean not null default false;
alter table vault_items add column if not exists hidden boolean not null default false;

create index if not exists vault_items_user_hidden_idx on vault_items(user_id, hidden);

-- Per-user private-vault PIN. Stored as a SHA-256 hex hash (never plaintext).
-- The presence of a row means the user has set up a private vault.
create table if not exists vault_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz default now()
);

alter table vault_private enable row level security;

drop policy if exists "vault_private_owner" on vault_private;
create policy "vault_private_owner" on vault_private for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
