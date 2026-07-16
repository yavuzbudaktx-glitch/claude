-- ---------------------------------------------------------------------------
-- "Anlık" — Zuya's BeReal. Once a day, at a random moment between 8 AM and
-- noon (America/Chicago), both partners get a push telling them to take a
-- dual-camera (front + back) photo. Each posts one composite image per day;
-- the partner's photo is HIDDEN (server-enforced, same blind-reveal pattern
-- as zuya_answered / zuya_wordle_done in 0013) until you've posted yours.
--
--   zuya_bereal_posts — one row per member per day; image in the private
--                       `zuya` storage bucket under bereal/<day>/<uid>.jpg.
--   zuya_bereal_days  — service-role-only scheduler state: the day's random
--                       target minute and whether the push already went out.
-- ---------------------------------------------------------------------------

create table if not exists zuya_bereal_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  storage_key text not null,
  caption text check (caption is null or length(caption) <= 200),
  created_at timestamptz default now(),
  unique (user_id, day)
);

alter table zuya_bereal_posts enable row level security;

-- "Have I posted for day d?" — SECURITY DEFINER so the select policy below
-- can consult the table without recursing through RLS.
create or replace function zuya_bereal_posted(d date)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from zuya_bereal_posts
    where user_id = auth.uid() and day = d
  );
$$;

-- "Has my PARTNER posted for day d?" — lets the client show the 'they took
-- theirs, take yours to reveal it' teaser without exposing the row itself.
create or replace function zuya_bereal_partner_posted(d date)
returns boolean
language sql stable security definer set search_path = public as $$
  select zuya_is_member() and exists (
    select 1 from zuya_bereal_posts
    where user_id <> auth.uid() and day = d
  );
$$;

-- Blind reveal: you always see your own row; the partner's row only becomes
-- visible once you've posted that day yourself.
drop policy if exists "zuya_bereal_select" on zuya_bereal_posts;
create policy "zuya_bereal_select" on zuya_bereal_posts for select
  using (user_id = auth.uid() or (zuya_is_member() and zuya_bereal_posted(day)));

drop policy if exists "zuya_bereal_insert" on zuya_bereal_posts;
create policy "zuya_bereal_insert" on zuya_bereal_posts for insert
  with check (zuya_is_member() and user_id = auth.uid());

-- Update own row so a retake can UPSERT (atomic) instead of delete+insert
-- (which could lose the post if the insert half failed).
drop policy if exists "zuya_bereal_update" on zuya_bereal_posts;
create policy "zuya_bereal_update" on zuya_bereal_posts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "zuya_bereal_delete" on zuya_bereal_posts;
create policy "zuya_bereal_delete" on zuya_bereal_posts for delete
  using (user_id = auth.uid());

-- Scheduler state: RLS on, NO policies — only the service role (the tick
-- endpoint) reads/writes it.
create table if not exists zuya_bereal_days (
  day date primary key,
  target_minute int not null,           -- minutes after local midnight
  notified_at timestamptz,
  created_at timestamptz default now()
);
alter table zuya_bereal_days enable row level security;

-- ---------------------------------------------------------------------------
-- Storage. Keys are strictly bereal/<YYYY-MM-DD>/<uid>.jpg.
--   insert: each member writes ONLY their own bereal file (plus the existing
--           avatars/board/voice cases from 0013/0019).
--   update: needed for retakes — supabase-js `upsert: true` UPDATEs the
--           existing object, and 0013's update policy only covered avatars/,
--           so retakes would fail RLS without this.
--   select: bereal/ objects follow the same blind reveal as the table — your
--           own file always, the partner's only after you've posted that day.
-- ---------------------------------------------------------------------------

drop policy if exists "zuya_objects_select" on storage.objects;
create policy "zuya_objects_select" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'zuya'
    and zuya_is_member()
    and (
      name not like 'bereal/%'
      or name like 'bereal/%/' || auth.uid()::text || '.jpg'
      or (
        name ~ '^bereal/[0-9]{4}-[0-9]{2}-[0-9]{2}/'
        and zuya_bereal_posted(split_part(name, '/', 2)::date)
      )
    )
  );

drop policy if exists "zuya_objects_insert" on storage.objects;
create policy "zuya_objects_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'zuya'
    and (
      (name like 'avatars/' || auth.uid()::text || '%')
      or (name like 'board/%' and zuya_is_member())
      or (name like 'voice/%' and zuya_is_member())
      or (name like 'bereal/%/' || auth.uid()::text || '.jpg' and zuya_is_member())
    )
  );

drop policy if exists "zuya_objects_update" on storage.objects;
create policy "zuya_objects_update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'zuya'
    and (
      (name like 'avatars/' || auth.uid()::text || '%')
      or (name like 'bereal/%/' || auth.uid()::text || '.jpg' and zuya_is_member())
    )
  )
  with check (
    bucket_id = 'zuya'
    and (
      (name like 'avatars/' || auth.uid()::text || '%')
      or (name like 'bereal/%/' || auth.uid()::text || '.jpg' and zuya_is_member())
    )
  );

-- Realtime so the partner's post appears live.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table zuya_bereal_posts';
  exception when duplicate_object then
    null;
  end;
end $$;
