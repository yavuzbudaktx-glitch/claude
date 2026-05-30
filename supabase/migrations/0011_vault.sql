-- The Vault: a personal encrypted cloud space for links, notes, passwords,
-- photos, files, and folders. Independent of the `documents` table (which backs
-- the desktop sync agent). Everything here is owner-scoped via RLS.

-- Shared trigger fn (idempotent so this migration applies standalone).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references vault_items(id) on delete cascade,  -- folder nesting
  kind text not null check (kind in ('folder','link','note','secret','file')),
  title text not null,
  url text,                       -- links
  body text,                      -- notes (plaintext)
  secret_ciphertext text,         -- passwords: AES-GCM blob, encrypted client-side
  storage_key text,               -- files: 'vault/{user_id}/{id}'
  mime text,
  size bigint not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vault_items_user_parent_idx on vault_items(user_id, parent_id);
create index if not exists vault_items_user_kind_idx   on vault_items(user_id, kind);

alter table vault_items enable row level security;

drop policy if exists "vault_items_owner" on vault_items;
create policy "vault_items_owner" on vault_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists vault_items_updated_at on vault_items;
create trigger vault_items_updated_at before update on vault_items
  for each row execute function set_updated_at();

-- Per-user master-password material. `salt` feeds PBKDF2; `verifier` is a known
-- value encrypted with the derived key, letting the client confirm the master
-- password is correct without ever storing it. The key itself never leaves the
-- browser.
create table if not exists vault_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  verifier text not null,
  created_at timestamptz default now()
);

alter table vault_keys enable row level security;

drop policy if exists "vault_keys_owner" on vault_keys;
create policy "vault_keys_owner" on vault_keys for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private Storage bucket for vault blobs, keyed 'vault/{user_id}/{item_id}'.
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

drop policy if exists "vault_objects_select" on storage.objects;
create policy "vault_objects_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "vault_objects_insert" on storage.objects;
create policy "vault_objects_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "vault_objects_update" on storage.objects;
create policy "vault_objects_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "vault_objects_delete" on storage.objects;
create policy "vault_objects_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
