-- CHATLY STUDIO: SHARED STICKER / GIF MESSAGE REACTIONS
-- Personal sticker libraries and bubble styling are stored locally in each browser.
-- Sticker reactions are shared with chat participants through this table and a private bucket.
-- Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.chat_message_sticker_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type text NOT NULL CHECK (message_type IN ('direct','group')),
  message_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_key text NOT NULL CHECK (char_length(sticker_key) BETWEEN 1 AND 80),
  storage_path text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  sticker_name text NOT NULL DEFAULT 'Sticker' CHECK (char_length(sticker_name) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_sticker_reactions_scope_check CHECK (
    (message_type = 'direct' AND conversation_id IS NOT NULL AND group_id IS NULL)
    OR
    (message_type = 'group' AND group_id IS NOT NULL AND conversation_id IS NULL)
  ),
  CONSTRAINT chat_message_sticker_reactions_unique
    UNIQUE (message_type,message_id,user_id,sticker_key)
);

CREATE INDEX IF NOT EXISTS chat_message_sticker_reactions_message_idx
ON public.chat_message_sticker_reactions(message_type,message_id,created_at);

ALTER TABLE public.chat_message_sticker_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.chat_message_sticker_reactions TO authenticated;

DROP POLICY IF EXISTS "Chat participants can view sticker reactions" ON public.chat_message_sticker_reactions;
CREATE POLICY "Chat participants can view sticker reactions"
ON public.chat_message_sticker_reactions FOR SELECT TO authenticated
USING (
  (
    message_type = 'direct'
    AND EXISTS (
      SELECT 1 FROM public.direct_messages dm
      JOIN public.conversations c ON c.id = dm.conversation_id
      WHERE dm.id = message_id
        AND dm.conversation_id = chat_message_sticker_reactions.conversation_id
        AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
    )
  )
  OR
  (
    message_type = 'group'
    AND EXISTS (
      SELECT 1 FROM public.chat_group_messages gm
      WHERE gm.id = message_id
        AND gm.group_id = chat_message_sticker_reactions.group_id
        AND public.chatly_is_group_member(gm.group_id)
    )
  )
);

DROP POLICY IF EXISTS "Chat participants can add own sticker reactions" ON public.chat_message_sticker_reactions;
CREATE POLICY "Chat participants can add own sticker reactions"
ON public.chat_message_sticker_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND storage_path LIKE COALESCE(conversation_id,group_id)::text || '/' || auth.uid()::text || '/%'
  AND (
    (
      message_type = 'direct'
      AND EXISTS (
        SELECT 1 FROM public.direct_messages dm
        JOIN public.conversations c ON c.id = dm.conversation_id
        WHERE dm.id = message_id
          AND dm.conversation_id = chat_message_sticker_reactions.conversation_id
          AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
      )
    )
    OR
    (
      message_type = 'group'
      AND EXISTS (
        SELECT 1 FROM public.chat_group_messages gm
        WHERE gm.id = message_id
          AND gm.group_id = chat_message_sticker_reactions.group_id
          AND public.chatly_is_group_member(gm.group_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can remove their own sticker reactions" ON public.chat_message_sticker_reactions;
CREATE POLICY "Users can remove their own sticker reactions"
ON public.chat_message_sticker_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- A separate private bucket keeps sticker reaction files isolated from normal attachments.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('chatly-stickers','chatly-stickers',false,10485760,ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif'];

CREATE OR REPLACE FUNCTION public.chatly_sticker_storage_access(
  p_path text,
  p_user_id uuid,
  p_require_owner boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope_text text;
  v_owner_text text;
  v_scope_id uuid;
BEGIN
  v_scope_text := split_part(p_path,'/',1);
  v_owner_text := split_part(p_path,'/',2);
  IF v_scope_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF v_owner_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF p_require_owner AND v_owner_text <> p_user_id::text THEN
    RETURN false;
  END IF;
  v_scope_id := v_scope_text::uuid;
  RETURN EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = v_scope_id AND (c.user_one = p_user_id OR c.user_two = p_user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.chat_groups g
    WHERE g.id = v_scope_id AND public.chatly_is_group_member(g.id)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.chatly_sticker_storage_access(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chatly_sticker_storage_access(text,uuid,boolean) TO authenticated;

DROP POLICY IF EXISTS "Chat participants can read shared sticker reactions" ON storage.objects;
CREATE POLICY "Chat participants can read shared sticker reactions"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chatly-stickers'
  AND public.chatly_sticker_storage_access(name,auth.uid(),false)
);

DROP POLICY IF EXISTS "Chat users can upload their own sticker reactions" ON storage.objects;
CREATE POLICY "Chat users can upload their own sticker reactions"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chatly-stickers'
  AND public.chatly_sticker_storage_access(name,auth.uid(),true)
);

DROP POLICY IF EXISTS "Chat users can delete their own sticker reactions" ON storage.objects;
CREATE POLICY "Chat users can delete their own sticker reactions"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chatly-stickers'
  AND public.chatly_sticker_storage_access(name,auth.uid(),true)
);

ALTER TABLE public.chat_message_sticker_reactions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_message_sticker_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_sticker_reactions;
  END IF;
END;
$$;
