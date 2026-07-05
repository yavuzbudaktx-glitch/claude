-- Web-push subscriptions for Zuya. One row per device per user (a phone, a
-- laptop…). The server sends notifications to the partner's rows when a
-- message or date suggestion arrives.

create table if not exists zuya_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create index if not exists zuya_push_subs_user_idx on zuya_push_subs (user_id);

alter table zuya_push_subs enable row level security;

drop policy if exists "zuya_push_select" on zuya_push_subs;
create policy "zuya_push_select" on zuya_push_subs for select
  using (auth.uid() = user_id);

drop policy if exists "zuya_push_insert" on zuya_push_subs;
create policy "zuya_push_insert" on zuya_push_subs for insert
  with check (auth.uid() = user_id);

drop policy if exists "zuya_push_delete" on zuya_push_subs;
create policy "zuya_push_delete" on zuya_push_subs for delete
  using (auth.uid() = user_id);
