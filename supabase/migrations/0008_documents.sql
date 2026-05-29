-- Documents Anywhere: the logical file tree + blob metadata.
-- Blobs live in Supabase Storage keyed by document UUID; this table is the
-- source of truth for paths, hashes, versions, and the per-user sync cursor.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,                       -- logical path, e.g. 'Work/notes.md'
  content_hash text,                        -- sha256 hex; null for tombstones
  size bigint not null default 0,
  mime text,
  version integer not null default 1,       -- bumped on each content change
  deleted boolean not null default false,
  rev bigint not null,                      -- per-user monotonic cursor key
  storage_key text,                         -- documents/{user_id}/{id}
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, path)
);

create index if not exists documents_user_rev_idx  on documents(user_id, rev);
create index if not exists documents_user_path_idx on documents(user_id, path);

-- Per-user monotonic revision counter. next_user_rev(uid) atomically returns
-- the next rev for that user; used on every write to documents.
create table if not exists user_rev_counter (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_rev bigint not null default 0
);

create or replace function next_user_rev(uid uuid) returns bigint as $$
declare r bigint;
begin
  insert into user_rev_counter(user_id, last_rev) values (uid, 1)
    on conflict (user_id) do update set last_rev = user_rev_counter.last_rev + 1
    returning last_rev into r;
  return r;
end;
$$ language plpgsql;

alter table documents enable row level security;

drop policy if exists "documents_owner" on documents;
create policy "documents_owner" on documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists documents_updated_at on documents;
create trigger documents_updated_at before update on documents
  for each row execute function set_updated_at();
