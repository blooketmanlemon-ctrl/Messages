-- CHATLY ARCADE: PRIVATE ROOMS, FRIEND INVITES, AND REALTIME GAME STATE
-- Run once in Supabase SQL Editor. No existing Chatly tables are modified.

CREATE TABLE IF NOT EXISTS public.chat_arcade_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key text NOT NULL CHECK (game_key IN ('ttt','connect4','reaction','tap','word','number')),
  title text NOT NULL DEFAULT 'Chatly game' CHECK (char_length(title) BETWEEN 1 AND 64),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','playing','finished','cancelled')),
  max_players smallint NOT NULL DEFAULT 6 CHECK (max_players BETWEEN 2 AND 6),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_arcade_players (
  room_id uuid NOT NULL REFERENCES public.chat_arcade_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_arcade_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_arcade_rooms(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (inviter_id <> invitee_id),
  UNIQUE (room_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS chat_arcade_invites_inbox_idx
ON public.chat_arcade_invites(invitee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_arcade_players_room_idx
ON public.chat_arcade_players(room_id, joined_at);

CREATE OR REPLACE FUNCTION public.chatly_arcade_is_player(p_room_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_arcade_players p WHERE p.room_id = p_room_id AND p.user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.chatly_arcade_is_invited(p_room_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_arcade_invites i WHERE i.room_id = p_room_id AND i.invitee_id = p_user_id AND i.status IN ('pending','accepted'));
$$;

REVOKE ALL ON FUNCTION public.chatly_arcade_is_player(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chatly_arcade_is_invited(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chatly_arcade_is_player(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chatly_arcade_is_invited(uuid,uuid) TO authenticated;

ALTER TABLE public.chat_arcade_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_arcade_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_arcade_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_arcade_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_arcade_players TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_arcade_invites TO authenticated;

DROP POLICY IF EXISTS "Arcade participants and invitees can view rooms" ON public.chat_arcade_rooms;
CREATE POLICY "Arcade participants and invitees can view rooms"
ON public.chat_arcade_rooms FOR SELECT TO authenticated
USING (host_id = auth.uid() OR public.chatly_arcade_is_player(id, auth.uid()) OR public.chatly_arcade_is_invited(id, auth.uid()));

DROP POLICY IF EXISTS "Users can create their own arcade rooms" ON public.chat_arcade_rooms;
CREATE POLICY "Users can create their own arcade rooms"
ON public.chat_arcade_rooms FOR INSERT TO authenticated
WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "Room participants can update arcade state" ON public.chat_arcade_rooms;
CREATE POLICY "Room participants can update arcade state"
ON public.chat_arcade_rooms FOR UPDATE TO authenticated
USING (host_id = auth.uid() OR public.chatly_arcade_is_player(id, auth.uid()))
WITH CHECK (host_id = auth.uid() OR public.chatly_arcade_is_player(id, auth.uid()));

DROP POLICY IF EXISTS "Room host can delete arcade room" ON public.chat_arcade_rooms;
CREATE POLICY "Room host can delete arcade room"
ON public.chat_arcade_rooms FOR DELETE TO authenticated
USING (host_id = auth.uid());

DROP POLICY IF EXISTS "Arcade players and invitees can view players" ON public.chat_arcade_players;
CREATE POLICY "Arcade players and invitees can view players"
ON public.chat_arcade_players FOR SELECT TO authenticated
USING (public.chatly_arcade_is_player(room_id, auth.uid()) OR public.chatly_arcade_is_invited(room_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.chat_arcade_rooms r WHERE r.id = room_id AND r.host_id = auth.uid()));

DROP POLICY IF EXISTS "Users can join rooms as themselves" ON public.chat_arcade_players;
CREATE POLICY "Users can join rooms as themselves"
ON public.chat_arcade_players FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND (EXISTS (SELECT 1 FROM public.chat_arcade_rooms r WHERE r.id = room_id AND r.host_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.chat_arcade_invites i WHERE i.room_id = room_id AND i.invitee_id = auth.uid() AND i.status = 'accepted')));

DROP POLICY IF EXISTS "Players can update their own arcade score" ON public.chat_arcade_players;
CREATE POLICY "Players can update their own arcade score"
ON public.chat_arcade_players FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Players can leave their room" ON public.chat_arcade_players;
CREATE POLICY "Players can leave their room"
ON public.chat_arcade_players FOR DELETE TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.chat_arcade_rooms r WHERE r.id = room_id AND r.host_id = auth.uid()));

DROP POLICY IF EXISTS "Inviters and invitees can view arcade invites" ON public.chat_arcade_invites;
CREATE POLICY "Inviters and invitees can view arcade invites"
ON public.chat_arcade_invites FOR SELECT TO authenticated
USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

DROP POLICY IF EXISTS "Room players can invite their direct contacts" ON public.chat_arcade_invites;
CREATE POLICY "Room players can invite their direct contacts"
ON public.chat_arcade_invites FOR INSERT TO authenticated
WITH CHECK (
  inviter_id = auth.uid()
  AND invitee_id <> auth.uid()
  AND public.chatly_arcade_is_player(room_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.user_one = auth.uid() AND c.user_two = invitee_id)
       OR (c.user_two = auth.uid() AND c.user_one = invitee_id)
  )
);

DROP POLICY IF EXISTS "Invitees can accept or decline arcade invites" ON public.chat_arcade_invites;
CREATE POLICY "Invitees can accept or decline arcade invites"
ON public.chat_arcade_invites FOR UPDATE TO authenticated
USING (invitee_id = auth.uid() AND status = 'pending')
WITH CHECK (invitee_id = auth.uid() AND status IN ('accepted','declined'));

-- Realtime: the home screen listens for invites; rooms listen for moves and player scores.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_arcade_rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_arcade_rooms;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_arcade_players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_arcade_players;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_arcade_invites') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_arcade_invites;
  END IF;
END;
$$;
