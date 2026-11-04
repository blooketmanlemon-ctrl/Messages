-- CHATLY FEATURE PACK: REACTIONS, GROUP POLLS, AND PINNED MESSAGES
-- Voice messages reuse the existing private/group attachment tables and chat-media bucket.
-- Online/away presence uses Supabase Realtime Presence and does not need a table.
-- Run once in Supabase SQL Editor. Safe to rerun.

-- ------------------------------------------------------------
-- 1. MESSAGE REACTIONS (private and group messages)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type text NOT NULL CHECK (message_type IN ('direct','group')),
  message_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('❤️','😂','😭','🔥','👍','😮','🎉','💀')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_reactions_scope_check CHECK (
    (message_type = 'direct' AND conversation_id IS NOT NULL AND group_id IS NULL)
    OR
    (message_type = 'group' AND group_id IS NOT NULL AND conversation_id IS NULL)
  ),
  CONSTRAINT chat_message_reactions_unique UNIQUE (message_type,message_id,user_id,emoji)
);

CREATE INDEX IF NOT EXISTS chat_message_reactions_message_idx
ON public.chat_message_reactions(message_type,message_id);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.chat_message_reactions TO authenticated;

DROP POLICY IF EXISTS "Chat members can view message reactions" ON public.chat_message_reactions;
CREATE POLICY "Chat members can view message reactions"
ON public.chat_message_reactions FOR SELECT TO authenticated
USING (
  (message_type = 'direct' AND EXISTS (
    SELECT 1 FROM public.direct_messages dm
    JOIN public.conversations c ON c.id = dm.conversation_id
    WHERE dm.id = message_id AND dm.conversation_id = chat_message_reactions.conversation_id
      AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
  ))
  OR
  (message_type = 'group' AND EXISTS (
    SELECT 1 FROM public.chat_group_messages gm
    WHERE gm.id = message_id AND gm.group_id = chat_message_reactions.group_id
      AND public.chatly_is_group_member(gm.group_id)
  ))
);

DROP POLICY IF EXISTS "Chat members can add their own message reactions" ON public.chat_message_reactions;
CREATE POLICY "Chat members can add their own message reactions"
ON public.chat_message_reactions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    (message_type = 'direct' AND EXISTS (
      SELECT 1 FROM public.direct_messages dm
      JOIN public.conversations c ON c.id = dm.conversation_id
      WHERE dm.id = message_id AND dm.conversation_id = chat_message_reactions.conversation_id
        AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
    ))
    OR
    (message_type = 'group' AND EXISTS (
      SELECT 1 FROM public.chat_group_messages gm
      WHERE gm.id = message_id AND gm.group_id = chat_message_reactions.group_id
        AND public.chatly_is_group_member(gm.group_id)
    ))
  )
);

DROP POLICY IF EXISTS "Users can remove their own message reactions" ON public.chat_message_reactions;
CREATE POLICY "Users can remove their own message reactions"
ON public.chat_message_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. GROUP POLLS
-- Poll prompt is represented in the chat timeline by a marker message.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_group_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  message_id uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 240),
  options jsonb NOT NULL CHECK (
    jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6
  ),
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_group_polls_group_created_idx
ON public.chat_group_polls(group_id,created_at DESC);

ALTER TABLE public.chat_group_polls ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_polls TO authenticated;

DROP POLICY IF EXISTS "Group members can view polls" ON public.chat_group_polls;
CREATE POLICY "Group members can view polls"
ON public.chat_group_polls FOR SELECT TO authenticated
USING (public.chatly_is_group_member(group_id));

DROP POLICY IF EXISTS "Group members can create polls as themselves" ON public.chat_group_polls;
CREATE POLICY "Group members can create polls as themselves"
ON public.chat_group_polls FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.chatly_is_group_member(group_id));

DROP POLICY IF EXISTS "Poll creators can close their polls" ON public.chat_group_polls;
CREATE POLICY "Poll creators can close their polls"
ON public.chat_group_polls FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND public.chatly_is_group_member(group_id))
WITH CHECK (created_by = auth.uid() AND public.chatly_is_group_member(group_id));

DROP POLICY IF EXISTS "Poll creators can delete their polls" ON public.chat_group_polls;
CREATE POLICY "Poll creators can delete their polls"
ON public.chat_group_polls FOR DELETE TO authenticated
USING (created_by = auth.uid() AND public.chatly_is_group_member(group_id));

CREATE TABLE IF NOT EXISTS public.chat_group_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.chat_group_polls(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL CHECK (option_index >= 0 AND option_index <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id,user_id)
);

CREATE INDEX IF NOT EXISTS chat_group_poll_votes_group_idx
ON public.chat_group_poll_votes(group_id,poll_id);

ALTER TABLE public.chat_group_poll_votes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_poll_votes TO authenticated;

DROP POLICY IF EXISTS "Group members can view poll votes" ON public.chat_group_poll_votes;
CREATE POLICY "Group members can view poll votes"
ON public.chat_group_poll_votes FOR SELECT TO authenticated
USING (public.chatly_is_group_member(group_id));

DROP POLICY IF EXISTS "Group members can vote in open polls" ON public.chat_group_poll_votes;
CREATE POLICY "Group members can vote in open polls"
ON public.chat_group_poll_votes FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.chatly_is_group_member(group_id)
  AND EXISTS (
    SELECT 1 FROM public.chat_group_polls p
    WHERE p.id = poll_id AND p.group_id = chat_group_poll_votes.group_id
      AND p.is_closed = false
      AND option_index < jsonb_array_length(p.options)
  )
);

DROP POLICY IF EXISTS "Users can change their vote in open polls" ON public.chat_group_poll_votes;
CREATE POLICY "Users can change their vote in open polls"
ON public.chat_group_poll_votes FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.chatly_is_group_member(group_id))
WITH CHECK (
  user_id = auth.uid() AND public.chatly_is_group_member(group_id)
  AND EXISTS (
    SELECT 1 FROM public.chat_group_polls p
    WHERE p.id = poll_id AND p.group_id = chat_group_poll_votes.group_id
      AND p.is_closed = false
      AND option_index < jsonb_array_length(p.options)
  )
);

DROP POLICY IF EXISTS "Users can remove their vote" ON public.chat_group_poll_votes;
CREATE POLICY "Users can remove their vote"
ON public.chat_group_poll_votes FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.chatly_is_group_member(group_id));

-- ------------------------------------------------------------
-- 3. PINNED MESSAGES (private and group conversations)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_message_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type text NOT NULL CHECK (message_type IN ('direct','group')),
  message_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_pins_scope_check CHECK (
    (message_type = 'direct' AND conversation_id IS NOT NULL AND group_id IS NULL)
    OR
    (message_type = 'group' AND group_id IS NOT NULL AND conversation_id IS NULL)
  ),
  CONSTRAINT chat_message_pins_unique UNIQUE (message_type,message_id)
);

CREATE INDEX IF NOT EXISTS chat_message_pins_direct_idx
ON public.chat_message_pins(conversation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS chat_message_pins_group_idx
ON public.chat_message_pins(group_id,created_at DESC);

ALTER TABLE public.chat_message_pins ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.chat_message_pins TO authenticated;

DROP POLICY IF EXISTS "Chat members can view pinned messages" ON public.chat_message_pins;
CREATE POLICY "Chat members can view pinned messages"
ON public.chat_message_pins FOR SELECT TO authenticated
USING (
  (message_type = 'direct' AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
  ))
  OR
  (message_type = 'group' AND public.chatly_is_group_member(group_id))
);

DROP POLICY IF EXISTS "Chat members can pin messages" ON public.chat_message_pins;
CREATE POLICY "Chat members can pin messages"
ON public.chat_message_pins FOR INSERT TO authenticated
WITH CHECK (
  pinned_by = auth.uid()
  AND (
    (message_type = 'direct' AND EXISTS (
      SELECT 1 FROM public.direct_messages dm
      JOIN public.conversations c ON c.id = dm.conversation_id
      WHERE dm.id = message_id AND dm.conversation_id = chat_message_pins.conversation_id
        AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
    ))
    OR
    (message_type = 'group' AND EXISTS (
      SELECT 1 FROM public.chat_group_messages gm
      WHERE gm.id = message_id AND gm.group_id = chat_message_pins.group_id
        AND public.chatly_is_group_member(gm.group_id)
    ))
  )
);

DROP POLICY IF EXISTS "Chat members can unpin messages" ON public.chat_message_pins;
CREATE POLICY "Chat members can unpin messages"
ON public.chat_message_pins FOR DELETE TO authenticated
USING (
  (message_type = 'direct' AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
  ))
  OR
  (message_type = 'group' AND public.chatly_is_group_member(group_id))
);

-- ------------------------------------------------------------
-- 4. REALTIME PUBLICATION
-- ------------------------------------------------------------
ALTER TABLE public.chat_message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_group_polls REPLICA IDENTITY FULL;
ALTER TABLE public.chat_group_poll_votes REPLICA IDENTITY FULL;
ALTER TABLE public.chat_message_pins REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_message_reactions','chat_group_polls','chat_group_poll_votes','chat_message_pins'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- NOTE: Online/away/offline uses Supabase Realtime Presence.
-- Voice messages use MediaRecorder + the existing chat-media bucket.
-- Neither needs an additional SQL table.
-- ------------------------------------------------------------
