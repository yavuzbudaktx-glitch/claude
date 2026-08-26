-- Dedupe ledger for scheduled push notifications.
--
-- The tick endpoint runs every few minutes and asks "what is due right now?".
-- Without a record of what already went out, a prayer time inside the tick
-- window would fire on every single tick. One row per (user, kind, slot) with a
-- unique constraint makes a repeat send a no-op: the insert simply conflicts.
--
-- `slot` is the thing being announced, not the time it was sent — e.g.
-- "2026-08-26:asr", "2026-08-26:tasks", or a fixture's kickoff timestamp — so
-- the same event can never be announced twice however often the tick runs.

create table if not exists push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  slot text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, slot)
);

create index if not exists push_log_user_sent_idx on push_log (user_id, sent_at desc);

alter table push_log enable row level security;

-- Only the owner can read their own history. Writes come from the tick
-- endpoint via the service key, which bypasses RLS.
drop policy if exists "push_log_select" on push_log;
create policy "push_log_select" on push_log for select
  using (auth.uid() = user_id);
