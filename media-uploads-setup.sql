-- CHATLY MEDIA UPLOADS: run this additional migration in Supabase SQL Editor.
-- It adds attachment metadata columns and a private Storage bucket for chat files.
-- Your existing Chatly conversations, messages, and call_signals are not recreated.

alter table public.direct_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 52428800, null)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = null;

-- Files are stored under: conversation_id / uploader_user_id / unique-filename
-- Only users who belong to that conversation can read the file or create a signed URL.
drop policy if exists "Chatly conversation members can view media" on storage.objects;
create policy "Chatly conversation members can view media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1
      from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_one = auth.uid() or c.user_two = auth.uid())
    )
  );

drop policy if exists "Chatly members can upload conversation media" on storage.objects;
create policy "Chatly members can upload conversation media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1
      from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_one = auth.uid() or c.user_two = auth.uid())
    )
  );

drop policy if exists "Chatly members can delete their uploaded conversation media" on storage.objects;
create policy "Chatly members can delete their uploaded conversation media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1
      from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_one = auth.uid() or c.user_two = auth.uid())
    )
  );

-- A 50 MB cap is applied by the Storage bucket configuration above.
