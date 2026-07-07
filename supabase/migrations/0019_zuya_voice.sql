-- ---------------------------------------------------------------------------
-- Voice messages in the Zuya chat.
-- A message is now EITHER text (body) OR a voice clip (audio_path + duration).
-- ---------------------------------------------------------------------------
alter table zuya_messages add column if not exists audio_path text;
alter table zuya_messages add column if not exists audio_dur numeric;

-- `body` was NOT NULL with an inline length check; voice-only messages carry
-- no text, so relax it and require that a row has at least one kind of content.
alter table zuya_messages alter column body drop not null;
alter table zuya_messages drop constraint if exists zuya_messages_body_check;
alter table zuya_messages drop constraint if exists zuya_messages_content_check;
alter table zuya_messages add constraint zuya_messages_content_check check (
  (body is not null and char_length(body) between 1 and 2000)
  or (audio_path is not null)
);

-- Allow voice clips alongside avatars/board in the private `zuya` bucket.
drop policy if exists "zuya_objects_insert" on storage.objects;
create policy "zuya_objects_insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'zuya'
    and (
      (name like 'avatars/' || auth.uid()::text || '%')
      or (name like 'board/%' and zuya_is_member())
      or (name like 'voice/%' and zuya_is_member())
    )
  );
