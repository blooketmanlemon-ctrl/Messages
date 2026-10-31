-- CHATLY READ RECEIPTS + CHAT MEDIA UPLOAD REPAIR
-- Run once in Supabase SQL Editor.
-- Requires the existing Chatly conversations, direct_messages,
-- chat_groups, chat_group_members and chat_group_messages tables.

-- Create the private media bucket if it does not already exist.
-- Existing bucket settings are preserved when the bucket already exists.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', false, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 52428800;

-- Secure access to private-conversation attachments.
-- Expected object path: <conversation-uuid>/<uploader-user-uuid>/<file>
CREATE OR REPLACE FUNCTION public.chatly_direct_media_access(
  p_path text,
  p_user_id uuid,
  p_require_owner boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_parts text[];
  v_conversation_id uuid;
BEGIN
  v_parts := storage.foldername(p_path);
  IF COALESCE(array_length(v_parts, 1), 0) < 2 THEN
    RETURN false;
  END IF;
  IF v_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF p_require_owner AND v_parts[2] <> p_user_id::text THEN
    RETURN false;
  END IF;
  v_conversation_id := v_parts[1]::uuid;
  RETURN EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = v_conversation_id
      AND (c.user_one = p_user_id OR c.user_two = p_user_id)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.chatly_direct_media_access(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chatly_direct_media_access(text, uuid, boolean) TO authenticated;

DROP POLICY IF EXISTS "Chatly direct participants can read direct media" ON storage.objects;
CREATE POLICY "Chatly direct participants can read direct media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND public.chatly_direct_media_access(name, auth.uid(), false)
);

DROP POLICY IF EXISTS "Chatly direct participants can upload direct media" ON storage.objects;
CREATE POLICY "Chatly direct participants can upload direct media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND public.chatly_direct_media_access(name, auth.uid(), true)
);

DROP POLICY IF EXISTS "Chatly users can delete their own direct media" ON storage.objects;
CREATE POLICY "Chatly users can delete their own direct media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND public.chatly_direct_media_access(name, auth.uid(), true)
);

-- Per-message read receipts for direct and group messages.
CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  message_id uuid NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('direct', 'group')),
  reader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, message_type, reader_id)
);

CREATE INDEX IF NOT EXISTS chat_message_reads_reader_idx
ON public.chat_message_reads(reader_id, read_at DESC);

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.chat_message_reads TO authenticated;

DROP POLICY IF EXISTS "Chat participants can view message read receipts" ON public.chat_message_reads;
CREATE POLICY "Chat participants can view message read receipts"
ON public.chat_message_reads FOR SELECT TO authenticated
USING (
  (
    message_type = 'direct'
    AND EXISTS (
      SELECT 1
      FROM public.direct_messages dm
      JOIN public.conversations c ON c.id = dm.conversation_id
      WHERE dm.id = chat_message_reads.message_id
        AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
    )
  )
  OR
  (
    message_type = 'group'
    AND EXISTS (
      SELECT 1
      FROM public.chat_group_messages gm
      WHERE gm.id = chat_message_reads.message_id
        AND public.chatly_is_group_member(gm.group_id)
    )
  )
);

DROP POLICY IF EXISTS "Users can mark incoming direct messages as read" ON public.chat_message_reads;
CREATE POLICY "Users can mark incoming direct messages as read"
ON public.chat_message_reads FOR INSERT TO authenticated
WITH CHECK (
  reader_id = auth.uid()
  AND message_type = 'direct'
  AND EXISTS (
    SELECT 1
    FROM public.direct_messages dm
    JOIN public.conversations c ON c.id = dm.conversation_id
    WHERE dm.id = chat_message_reads.message_id
      AND dm.sender_id <> auth.uid()
      AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
  )
);

DROP POLICY IF EXISTS "Group members can mark incoming group messages as read" ON public.chat_message_reads;
CREATE POLICY "Group members can mark incoming group messages as read"
ON public.chat_message_reads FOR INSERT TO authenticated
WITH CHECK (
  reader_id = auth.uid()
  AND message_type = 'group'
  AND EXISTS (
    SELECT 1
    FROM public.chat_group_messages gm
    WHERE gm.id = chat_message_reads.message_id
      AND gm.sender_id <> auth.uid()
      AND public.chatly_is_group_member(gm.group_id)
  )
);

-- Enable Realtime delivery of new read receipts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_message_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads;
  END IF;
END;
$$;
