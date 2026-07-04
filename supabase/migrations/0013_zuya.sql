-- Zuya: a private couples hub for exactly two users (yavuz + zuleyha), living
-- at /zuya inside this app. Auth users are synthetic (`@zuya.local`), created
-- server-side via the Admin API. Shared-couple data is readable by both
-- members; writes are either owner-scoped (RLS) or service-role-only where a
-- server rule must hold (thought-counter cooldown, date-suggestion turns).

-- Shared trigger fn (idempotent so this migration applies standalone).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Members: auth uid -> username mapping; the source of truth for membership.
-- ---------------------------------------------------------------------------
create table if not exists zuya_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username in ('yavuz','zuleyha')),
  display_name text not null,
  status text not null default 'free',
  status_updated_at timestamptz,
  avatar_updated_at timestamptz,
  google_connected boolean not null default false,
  notif_prefs jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table zuya_members enable row level security;

-- Membership check used by every zuya policy. SECURITY DEFINER so policies on
-- zuya_members itself (and every other table) can call it without recursive
-- RLS evaluation.
create or replace function zuya_is_member()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from zuya_members where user_id = auth.uid());
$$;

drop policy if exists "zuya_members_select" on zuya_members;
create policy "zuya_members_select" on zuya_members for select
  using (zuya_is_member());

drop policy if exists "zuya_members_update_own" on zuya_members;
create policy "zuya_members_update_own" on zuya_members for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No insert/delete policies: rows are created only by the registration API
-- (service role).

drop trigger if exists zuya_members_updated_at on zuya_members;
create trigger zuya_members_updated_at before update on zuya_members
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Google refresh tokens: RLS enabled with ZERO policies — only the
-- service-role client (server API routes) can read or write, so partners can
-- never see each other's token. UI state lives in zuya_members.google_connected.
-- ---------------------------------------------------------------------------
create table if not exists zuya_google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  google_email text,
  scopes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table zuya_google_tokens enable row level security;

drop trigger if exists zuya_google_tokens_updated_at on zuya_google_tokens;
create trigger zuya_google_tokens_updated_at before update on zuya_google_tokens
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- "Thought about you" counter: one row per user per day. Mutations happen only
-- through the API route (service role) so the 5-minute cooldown is enforced
-- server-side and can't be bypassed from devtools.
-- ---------------------------------------------------------------------------
create table if not exists zuya_thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count int not null default 0,
  last_click_at timestamptz,
  unique (user_id, day)
);

alter table zuya_thoughts enable row level security;

drop policy if exists "zuya_thoughts_select" on zuya_thoughts;
create policy "zuya_thoughts_select" on zuya_thoughts for select
  using (zuya_is_member());

-- ---------------------------------------------------------------------------
-- Messages: cozy two-person chat. Clients write directly under RLS.
-- ---------------------------------------------------------------------------
create table if not exists zuya_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists zuya_messages_created_idx on zuya_messages (created_at desc);

alter table zuya_messages enable row level security;

drop policy if exists "zuya_messages_select" on zuya_messages;
create policy "zuya_messages_select" on zuya_messages for select
  using (zuya_is_member());

drop policy if exists "zuya_messages_insert" on zuya_messages;
create policy "zuya_messages_insert" on zuya_messages for insert
  with check (zuya_is_member() and sender_id = auth.uid());

-- Partner marks your messages read (sets read_at); trusted between two people.
drop policy if exists "zuya_messages_update" on zuya_messages;
create policy "zuya_messages_update" on zuya_messages for update
  using (zuya_is_member()) with check (zuya_is_member());

-- ---------------------------------------------------------------------------
-- Date suggestions: one row per proposal, turn-based counter-edit model.
-- `pending_from` is whose turn it is to respond. All writes go through the
-- API route (service role) so turn logic + Google Calendar writes hold.
-- ---------------------------------------------------------------------------
create table if not exists zuya_bucket_list (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 300),
  note text,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table zuya_bucket_list enable row level security;

drop policy if exists "zuya_bucket_select" on zuya_bucket_list;
create policy "zuya_bucket_select" on zuya_bucket_list for select
  using (zuya_is_member());

drop policy if exists "zuya_bucket_insert" on zuya_bucket_list;
create policy "zuya_bucket_insert" on zuya_bucket_list for insert
  with check (zuya_is_member() and created_by = auth.uid());

drop policy if exists "zuya_bucket_update" on zuya_bucket_list;
create policy "zuya_bucket_update" on zuya_bucket_list for update
  using (zuya_is_member()) with check (zuya_is_member());

drop policy if exists "zuya_bucket_delete" on zuya_bucket_list;
create policy "zuya_bucket_delete" on zuya_bucket_list for delete
  using (zuya_is_member());

drop trigger if exists zuya_bucket_list_updated_at on zuya_bucket_list;
create trigger zuya_bucket_list_updated_at before update on zuya_bucket_list
  for each row execute function set_updated_at();

create table if not exists zuya_date_suggestions (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references auth.users(id) on delete cascade,
  pending_from uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','cancelled')),
  title text not null check (length(title) between 1 and 200),
  day date not null,
  start_at timestamptz not null,
  end_at timestamptz,
  place text,
  note text,
  bucket_item_id uuid references zuya_bucket_list(id) on delete set null,
  history jsonb not null default '[]',
  gcal_event_ids jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists zuya_dates_status_idx on zuya_date_suggestions (status, day);

alter table zuya_date_suggestions enable row level security;

drop policy if exists "zuya_dates_select" on zuya_date_suggestions;
create policy "zuya_dates_select" on zuya_date_suggestions for select
  using (zuya_is_member());

-- Writes: service role only (API enforces turn logic).

drop trigger if exists zuya_dates_updated_at on zuya_date_suggestions;
create trigger zuya_dates_updated_at before update on zuya_date_suggestions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications: per-recipient. A member may insert one FOR the partner
-- (that's the point), but only the recipient can read/mark it.
-- ---------------------------------------------------------------------------
create table if not exists zuya_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists zuya_notifications_user_idx on zuya_notifications (user_id, created_at desc);

alter table zuya_notifications enable row level security;

drop policy if exists "zuya_notifications_select" on zuya_notifications;
create policy "zuya_notifications_select" on zuya_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "zuya_notifications_insert" on zuya_notifications;
create policy "zuya_notifications_insert" on zuya_notifications for insert
  with check (zuya_is_member());

drop policy if exists "zuya_notifications_update" on zuya_notifications;
create policy "zuya_notifications_update" on zuya_notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Daily question, answered blind: you can only see the partner's answer for a
-- day once you've answered that day yourself — enforced IN RLS, so the data
-- never even reaches the other client early.
-- ---------------------------------------------------------------------------
create table if not exists zuya_daily_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  question_idx int not null,
  answer text not null check (length(answer) between 1 and 4000),
  created_at timestamptz default now(),
  unique (user_id, day)
);

alter table zuya_daily_answers enable row level security;

create or replace function zuya_answered(d date)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from zuya_daily_answers
    where user_id = auth.uid() and day = d
  );
$$;

drop policy if exists "zuya_answers_select" on zuya_daily_answers;
create policy "zuya_answers_select" on zuya_daily_answers for select
  using (user_id = auth.uid() or (zuya_is_member() and zuya_answered(day)));

drop policy if exists "zuya_answers_insert" on zuya_daily_answers;
create policy "zuya_answers_insert" on zuya_daily_answers for insert
  with check (zuya_is_member() and user_id = auth.uid());

-- No update/delete: answers are immutable for clean reveal semantics.

-- ---------------------------------------------------------------------------
-- Wordle race results: same blind pattern — partner's board is invisible
-- until you've recorded your own result for that day.
-- ---------------------------------------------------------------------------
create table if not exists zuya_wordle_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  guesses int not null check (guesses between 0 and 6),  -- 0 = failed
  time_ms int not null default 0,
  board jsonb not null default '[]',
  created_at timestamptz default now(),
  unique (user_id, day)
);

alter table zuya_wordle_results enable row level security;

create or replace function zuya_wordle_done(d date)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from zuya_wordle_results
    where user_id = auth.uid() and day = d
  );
$$;

drop policy if exists "zuya_wordle_select" on zuya_wordle_results;
create policy "zuya_wordle_select" on zuya_wordle_results for select
  using (user_id = auth.uid() or (zuya_is_member() and zuya_wordle_done(day)));

drop policy if exists "zuya_wordle_insert" on zuya_wordle_results;
create policy "zuya_wordle_insert" on zuya_wordle_results for insert
  with check (zuya_is_member() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private `zuya` bucket. Avatars live at 'avatars/{user_id}...'.
-- Members can read all zuya objects; each user writes only their own avatar.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('zuya', 'zuya', false)
on conflict (id) do nothing;

drop policy if exists "zuya_objects_select" on storage.objects;
create policy "zuya_objects_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'zuya' and zuya_is_member());

drop policy if exists "zuya_objects_insert" on storage.objects;
create policy "zuya_objects_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'zuya'
    and (storage.foldername(name))[1] = 'avatars'
    and name like 'avatars/' || auth.uid()::text || '%'
  );

drop policy if exists "zuya_objects_update" on storage.objects;
create policy "zuya_objects_update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'zuya'
    and (storage.foldername(name))[1] = 'avatars'
    and name like 'avatars/' || auth.uid()::text || '%'
  )
  with check (
    bucket_id = 'zuya'
    and (storage.foldername(name))[1] = 'avatars'
    and name like 'avatars/' || auth.uid()::text || '%'
  );

drop policy if exists "zuya_objects_delete" on storage.objects;
create policy "zuya_objects_delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'zuya'
    and (storage.foldername(name))[1] = 'avatars'
    and name like 'avatars/' || auth.uid()::text || '%'
  );

-- ---------------------------------------------------------------------------
-- Realtime: add the live tables to the publication (idempotent).
-- postgres_changes respects RLS, so payloads are already scoped per user.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'zuya_members', 'zuya_thoughts', 'zuya_messages', 'zuya_date_suggestions',
    'zuya_notifications', 'zuya_daily_answers', 'zuya_bucket_list', 'zuya_wordle_results'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
