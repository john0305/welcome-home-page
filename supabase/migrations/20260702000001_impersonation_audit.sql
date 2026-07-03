-- Impersonation audit log: one row per admin "sign in as user" session.
-- Written exclusively by the admin-impersonate edge function (service role).
-- Admins can read it; nobody can modify or delete rows from the client.
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Client enforces sign-out at this time; kept in the row so the audit
  -- trail shows the intended window even if the client is closed early.
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_admin
  ON public.impersonation_sessions (admin_user_id, created_at DESC);

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Read-only for admins; all writes go through the service role.
CREATE POLICY "Admins can read impersonation audit"
  ON public.impersonation_sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
