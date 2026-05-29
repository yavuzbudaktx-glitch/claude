-- Private Storage bucket for document blobs. Objects are keyed
-- 'documents/{user_id}/{document_id}'. Browser sessions may only touch objects
-- under their own user folder; sync agents go through service-role API routes.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Browser (authenticated) access scoped to the user's own folder.
drop policy if exists "documents_objects_select" on storage.objects;
create policy "documents_objects_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_objects_insert" on storage.objects;
create policy "documents_objects_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_objects_update" on storage.objects;
create policy "documents_objects_update" on storage.objects for update
  to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents_objects_delete" on storage.objects;
create policy "documents_objects_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
