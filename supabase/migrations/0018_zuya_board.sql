-- "Panomuz" — a shared Pinterest-style board for Zuya. Each pin is an image
-- (uploaded to the zuya bucket, or an external URL) with an optional caption.
-- Both partners can pin and remove.

create table if not exists zuya_board (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  storage_key text,   -- path in the `zuya` bucket, for uploaded images
  image_url text,     -- or an external image URL
  caption text,
  created_at timestamptz default now()
);

create index if not exists zuya_board_created_idx on zuya_board (created_at desc);

alter table zuya_board enable row level security;

drop policy if exists "zuya_board_select" on zuya_board;
create policy "zuya_board_select" on zuya_board for select using (zuya_is_member());

drop policy if exists "zuya_board_insert" on zuya_board;
create policy "zuya_board_insert" on zuya_board for insert
  with check (zuya_is_member() and created_by = auth.uid());

drop policy if exists "zuya_board_delete" on zuya_board;
create policy "zuya_board_delete" on zuya_board for delete using (zuya_is_member());

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table zuya_board';
  exception when duplicate_object then null;
  end;
end $$;

-- Allow board images alongside avatars in the private `zuya` bucket.
drop policy if exists "zuya_objects_insert" on storage.objects;
create policy "zuya_objects_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'zuya'
    and (
      (name like 'avatars/' || auth.uid()::text || '%')
      or (name like 'board/%' and zuya_is_member())
    )
  );

drop policy if exists "zuya_objects_delete" on storage.objects;
create policy "zuya_objects_delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'zuya'
    and (
      (name like 'avatars/' || auth.uid()::text || '%')
      or (name like 'board/%' and zuya_is_member())
    )
  );
