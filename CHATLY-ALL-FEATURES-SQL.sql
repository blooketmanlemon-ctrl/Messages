-- CHATLY ALL-FEATURES MIGRATION
-- Adds Notification Center, scheduled messages, Brain Lab leaderboards,
-- profile banners/status, shared calendar, private notes, and group roles.
-- Reactions/polls/pins already use the existing social-features migration.
-- Themes are stored locally. Shared media reuses chat-media storage.
-- Run once in Supabase SQL Editor. Safe to rerun.

-- 1) CUSTOM PROFILE BANNERS + STATUS
CREATE TABLE IF NOT EXISTS public.chat_profile_customizations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banner_url text,
  status_text text CHECK (status_text IS NULL OR char_length(status_text) <= 80),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_profile_banner_url_check CHECK (
    banner_url IS NULL OR (char_length(banner_url) <= 600 AND banner_url ~* '^https://')
  )
);
ALTER TABLE public.chat_profile_customizations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_profile_customizations TO authenticated;
DROP POLICY IF EXISTS "Authenticated users can view profile customizations" ON public.chat_profile_customizations;
CREATE POLICY "Authenticated users can view profile customizations"
ON public.chat_profile_customizations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users manage their own profile customizations" ON public.chat_profile_customizations;
CREATE POLICY "Users manage their own profile customizations"
ON public.chat_profile_customizations FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2) BRAIN LAB LEADERBOARD SCORES
CREATE TABLE IF NOT EXISTS public.chat_brainlab_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_key text NOT NULL CHECK (game_key IN ('reflex','sequence','number','verbal','visual','chimp','aim','typing')),
  score_value double precision NOT NULL CHECK (score_value >= 0),
  score_label text NOT NULL CHECK (char_length(score_label) <= 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_brainlab_scores_leaderboard_idx
ON public.chat_brainlab_scores(game_key, score_value, created_at DESC);
ALTER TABLE public.chat_brainlab_scores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.chat_brainlab_scores TO authenticated;
DROP POLICY IF EXISTS "Authenticated users can view Brain Lab scores" ON public.chat_brainlab_scores;
CREATE POLICY "Authenticated users can view Brain Lab scores"
ON public.chat_brainlab_scores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can save their own Brain Lab scores" ON public.chat_brainlab_scores;
CREATE POLICY "Users can save their own Brain Lab scores"
ON public.chat_brainlab_scores FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 3) SCHEDULED MESSAGES (sent by the sender's Chatly session when it is open)
CREATE TABLE IF NOT EXISTS public.chat_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 4000),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sending','sent','cancelled')),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_scheduled_messages_scope_check CHECK (
    (conversation_id IS NOT NULL AND group_id IS NULL)
    OR (conversation_id IS NULL AND group_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS chat_scheduled_messages_due_idx
ON public.chat_scheduled_messages(status, scheduled_for);
CREATE INDEX IF NOT EXISTS chat_scheduled_messages_sender_idx
ON public.chat_scheduled_messages(sender_id, created_at DESC);
ALTER TABLE public.chat_scheduled_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_scheduled_messages TO authenticated;
DROP POLICY IF EXISTS "Users manage their own scheduled messages" ON public.chat_scheduled_messages;
CREATE POLICY "Users manage their own scheduled messages"
ON public.chat_scheduled_messages FOR ALL TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (
  sender_id = auth.uid()
  AND (
    (conversation_id IS NOT NULL AND group_id IS NULL AND EXISTS (
      SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
      AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
    ))
    OR
    (group_id IS NOT NULL AND conversation_id IS NULL
      AND public.chatly_is_group_member(group_id))
  )
);

-- 4) SHARED CALENDAR
CREATE TABLE IF NOT EXISTS public.chat_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  starts_at timestamptz NOT NULL,
  reminder_minutes integer NOT NULL DEFAULT 15 CHECK (reminder_minutes IN (0,5,15,60,1440)),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  attendee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_calendar_events_scope_check CHECK (
    NOT (conversation_id IS NOT NULL AND group_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS chat_calendar_events_start_idx ON public.chat_calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS chat_calendar_events_owner_idx ON public.chat_calendar_events(owner_id, starts_at);
ALTER TABLE public.chat_calendar_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_calendar_events TO authenticated;
DROP POLICY IF EXISTS "Owners and attendees can view calendar events" ON public.chat_calendar_events;
CREATE POLICY "Owners and attendees can view calendar events"
ON public.chat_calendar_events FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR auth.uid() = ANY(attendee_ids));
DROP POLICY IF EXISTS "Users can create shared calendar events" ON public.chat_calendar_events;
CREATE POLICY "Users can create shared calendar events"
ON public.chat_calendar_events FOR INSERT TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND auth.uid() = ANY(attendee_ids)
  AND (
    (conversation_id IS NULL AND group_id IS NULL)
    OR (conversation_id IS NOT NULL AND group_id IS NULL AND EXISTS (
      SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
      AND (c.user_one = auth.uid() OR c.user_two = auth.uid())
    ))
    OR (group_id IS NOT NULL AND conversation_id IS NULL AND public.chatly_is_group_member(group_id))
  )
);
DROP POLICY IF EXISTS "Event owners can update calendar events" ON public.chat_calendar_events;
CREATE POLICY "Event owners can update calendar events"
ON public.chat_calendar_events FOR UPDATE TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Event owners can delete calendar events" ON public.chat_calendar_events;
CREATE POLICY "Event owners can delete calendar events"
ON public.chat_calendar_events FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 5) PRIVATE CHATTLY NOTES
CREATE TABLE IF NOT EXISTS public.chatly_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chatly_notes_user_updated_idx ON public.chatly_notes(user_id, updated_at DESC);
ALTER TABLE public.chatly_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatly_notes TO authenticated;
DROP POLICY IF EXISTS "Users manage their own private notes" ON public.chatly_notes;
CREATE POLICY "Users manage their own private notes"
ON public.chatly_notes FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6) IN-APP NOTIFICATION CENTER
CREATE TABLE IF NOT EXISTS public.chat_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('message','calendar_reminder','calendar_event','reaction','poll','call','system')),
  title text NOT NULL CHECK (char_length(title) <= 120),
  body text CHECK (body IS NULL OR char_length(body) <= 500),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  message_id uuid,
  event_id uuid REFERENCES public.chat_calendar_events(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, kind, event_id)
);
CREATE INDEX IF NOT EXISTS chat_notifications_inbox_idx ON public.chat_notifications(user_id, created_at DESC);
ALTER TABLE public.chat_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_notifications TO authenticated;
DROP POLICY IF EXISTS "Users view their own notifications" ON public.chat_notifications;
CREATE POLICY "Users view their own notifications"
ON public.chat_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users add notifications to their own center" ON public.chat_notifications;
CREATE POLICY "Users add notifications to their own center"
ON public.chat_notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update their own notifications" ON public.chat_notifications;
CREATE POLICY "Users update their own notifications"
ON public.chat_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete their own notifications" ON public.chat_notifications;
CREATE POLICY "Users delete their own notifications"
ON public.chat_notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 7) GROUP MEMBER ROLES
CREATE TABLE IF NOT EXISTS public.chat_group_roles (
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','moderator')),
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,user_id)
);
CREATE OR REPLACE FUNCTION public.chatly_can_manage_group_roles(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_groups g WHERE g.id=p_group_id AND g.created_by=p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.chat_group_roles r WHERE r.group_id=p_group_id AND r.user_id=p_user_id AND r.role='admin'
  );
$$;
REVOKE ALL ON FUNCTION public.chatly_can_manage_group_roles(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chatly_can_manage_group_roles(uuid,uuid) TO authenticated;
ALTER TABLE public.chat_group_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_roles TO authenticated;
DROP POLICY IF EXISTS "Group members can view group roles" ON public.chat_group_roles;
CREATE POLICY "Group members can view group roles"
ON public.chat_group_roles FOR SELECT TO authenticated USING (public.chatly_is_group_member(group_id));
DROP POLICY IF EXISTS "Group admins can assign roles" ON public.chat_group_roles;
CREATE POLICY "Group admins can assign roles"
ON public.chat_group_roles FOR INSERT TO authenticated
WITH CHECK (
  assigned_by=auth.uid()
  AND public.chatly_is_group_member(group_id)
  AND EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id=chat_group_roles.group_id AND m.user_id=chat_group_roles.user_id)
  AND public.chatly_can_manage_group_roles(group_id,auth.uid())
);
DROP POLICY IF EXISTS "Group admins can update roles" ON public.chat_group_roles;
CREATE POLICY "Group admins can update roles"
ON public.chat_group_roles FOR UPDATE TO authenticated
USING (public.chatly_can_manage_group_roles(group_id,auth.uid()))
WITH CHECK (
  assigned_by=auth.uid()
  AND public.chatly_can_manage_group_roles(group_id,auth.uid())
  AND EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id=chat_group_roles.group_id AND m.user_id=chat_group_roles.user_id)
);
DROP POLICY IF EXISTS "Group admins can remove roles" ON public.chat_group_roles;
CREATE POLICY "Group admins can remove roles"
ON public.chat_group_roles FOR DELETE TO authenticated USING (public.chatly_can_manage_group_roles(group_id,auth.uid()));

-- 8) REALTIME PUBLICATION
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_notifications','chat_calendar_events','chat_group_roles'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END;
$$;
