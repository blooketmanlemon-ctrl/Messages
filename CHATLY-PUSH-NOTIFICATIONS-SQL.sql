-- CHATLY WEB PUSH NOTIFICATIONS
-- Run once in Supabase SQL Editor. Push subscriptions are managed only by
-- the authenticated chatly-push Edge Function using the service-role key.

CREATE TABLE IF NOT EXISTS public.chat_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_push_subscriptions_user_idx
ON public.chat_push_subscriptions(user_id);

ALTER TABLE public.chat_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- No direct table access is granted to browser users. The Edge Function uses
-- Supabase's service-role key only on the server to create/delete subscriptions
-- and deliver notification payloads.
REVOKE ALL ON TABLE public.chat_push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.chat_push_subscriptions TO service_role;
