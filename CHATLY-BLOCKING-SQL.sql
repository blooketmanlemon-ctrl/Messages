-- CHATLY USER BLOCKING MIGRATION
-- Run once in Supabase SQL Editor.
-- Blocking applies to direct messages and one-to-one calls.
-- Existing messages remain readable. Shared group chats are not affected.

CREATE TABLE IF NOT EXISTS public.chat_user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT chat_user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS chat_user_blocks_blocked_id_idx
ON public.chat_user_blocks(blocked_id);

ALTER TABLE public.chat_user_blocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.chat_user_blocks TO authenticated;

DROP POLICY IF EXISTS "Users can view block relationships involving themselves"
ON public.chat_user_blocks;
CREATE POLICY "Users can view block relationships involving themselves"
ON public.chat_user_blocks FOR SELECT TO authenticated
USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

DROP POLICY IF EXISTS "Users can block other accounts"
ON public.chat_user_blocks;
CREATE POLICY "Users can block other accounts"
ON public.chat_user_blocks FOR INSERT TO authenticated
WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());

DROP POLICY IF EXISTS "Users can unblock accounts they blocked"
ON public.chat_user_blocks;
CREATE POLICY "Users can unblock accounts they blocked"
ON public.chat_user_blocks FOR DELETE TO authenticated
USING (blocker_id = auth.uid());

-- Security-definer helper so message/call triggers can check both directions
-- without exposing the block table to unrelated accounts.
CREATE OR REPLACE FUNCTION public.chatly_users_blocked(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_user_blocks b
    WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
       OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
  );
$$;

REVOKE ALL ON FUNCTION public.chatly_users_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Stop new private messages when either participant has blocked the other.
CREATE OR REPLACE FUNCTION public.chatly_reject_blocked_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_one uuid;
  v_user_two uuid;
BEGIN
  SELECT c.user_one, c.user_two
    INTO v_user_one, v_user_two
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '23503';
  END IF;

  IF public.chatly_users_blocked(v_user_one, v_user_two) THEN
    RAISE EXCEPTION 'This private conversation is unavailable because one participant has blocked the other.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chatly_reject_blocked_direct_message
ON public.direct_messages;
CREATE TRIGGER chatly_reject_blocked_direct_message
BEFORE INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.chatly_reject_blocked_direct_message();

-- Stop new one-to-one call signals after either person blocks the other.
-- Group calls use chat_group_call_signals and are intentionally unaffected.
CREATE OR REPLACE FUNCTION public.chatly_reject_blocked_direct_call_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_one uuid;
  v_user_two uuid;
BEGIN
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.user_one, c.user_two
    INTO v_user_one, v_user_two
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '23503';
  END IF;

  IF public.chatly_users_blocked(v_user_one, v_user_two) THEN
    RAISE EXCEPTION 'This private call is unavailable because one participant has blocked the other.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chatly_reject_blocked_direct_call_signal
ON public.call_signals;
CREATE TRIGGER chatly_reject_blocked_direct_call_signal
BEFORE INSERT ON public.call_signals
FOR EACH ROW EXECUTE FUNCTION public.chatly_reject_blocked_direct_call_signal();

-- Realtime lets the other device end an already-active private call
-- immediately after either participant blocks the other.
ALTER TABLE public.chat_user_blocks REPLICA IDENTITY FULL;
DO $block_publication$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_user_blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_user_blocks;
  END IF;
END;
$block_publication$;
