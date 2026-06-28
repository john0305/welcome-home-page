
-- Echo chat agent: sessions, messages, feedback, unanswered questions
-- and chat-message quota tracking + RPC.

CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  page_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sessions" ON public.chat_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_sessions_admin_all" ON public.chat_sessions
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_chat_sessions_user_updated ON public.chat_sessions(user_id, updated_at DESC);

-- Messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  page_label text,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  was_answered boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_messages_admin_all" ON public.chat_messages
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE INDEX idx_chat_messages_session_created ON public.chat_messages(session_id, created_at);
CREATE INDEX idx_chat_messages_user_created ON public.chat_messages(user_id, created_at DESC);

-- Feedback
CREATE TABLE public.chat_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('up','down')),
  reason text CHECK (reason IN ('off_topic','inaccurate','not_helpful')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_feedback TO authenticated;
GRANT ALL ON public.chat_feedback TO service_role;

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_feedback" ON public.chat_feedback
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_feedback_admin_all" ON public.chat_feedback
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Unanswered questions (admin queue, no user access)
CREATE TABLE public.unanswered_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text text NOT NULL,
  page_label text,
  listing_id uuid,
  reason text CHECK (reason IN ('out_of_scope','no_data','unknown_term','safety_block')),
  frequency integer NOT NULL DEFAULT 1,
  first_asked timestamptz NOT NULL DEFAULT now(),
  last_asked timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'unreviewed'
    CHECK (status IN ('unreviewed','in_progress','resolved','wont_fix'))
);

GRANT ALL ON public.unanswered_questions TO service_role;

ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unanswered_questions_admin_select" ON public.unanswered_questions
  FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY "unanswered_questions_admin_modify" ON public.unanswered_questions
  FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE INDEX idx_unanswered_questions_status ON public.unanswered_questions(status, last_asked DESC);

-- Monthly chat usage column
ALTER TABLE public.monthly_usage
  ADD COLUMN IF NOT EXISTS chat_messages_used integer NOT NULL DEFAULT 0;

-- Quota RPC
CREATE OR REPLACE FUNCTION public.consume_chat_message(
  _user_id uuid,
  _free_limit integer DEFAULT 15,
  _starter_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tier text;
  _month text := to_char(now(), 'YYYY-MM');
  _used int;
  _limit int;
BEGIN
  SELECT tier INTO _tier FROM public.user_profiles WHERE id = _user_id;
  _tier := COALESCE(_tier, 'free');

  _limit := CASE _tier
    WHEN 'free' THEN _free_limit
    WHEN 'starter' THEN _starter_limit
    ELSE -1
  END;

  INSERT INTO public.monthly_usage(user_id, month, optimizations_used, grades_used, chat_messages_used)
    VALUES (_user_id, _month, 0, 0, 0)
    ON CONFLICT (user_id, month) DO NOTHING;

  SELECT chat_messages_used INTO _used
    FROM public.monthly_usage
   WHERE user_id = _user_id AND month = _month
   FOR UPDATE;

  IF _limit <> -1 AND _used >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _limit, 'tier', _tier);
  END IF;

  UPDATE public.monthly_usage
     SET chat_messages_used = _used + 1,
         updated_at = now()
   WHERE user_id = _user_id AND month = _month;

  RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', _limit, 'tier', _tier);
END;
$$;
