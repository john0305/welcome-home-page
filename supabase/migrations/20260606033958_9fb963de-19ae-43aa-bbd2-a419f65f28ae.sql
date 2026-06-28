ALTER TABLE public.feature_waitlist ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.feature_waitlist ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS feature_waitlist_email_feature_key ON public.feature_waitlist(email, feature_key) WHERE email IS NOT NULL;
-- Ensure at least one identifier present
ALTER TABLE public.feature_waitlist DROP CONSTRAINT IF EXISTS feature_waitlist_identifier_chk;
ALTER TABLE public.feature_waitlist ADD CONSTRAINT feature_waitlist_identifier_chk CHECK (user_id IS NOT NULL OR email IS NOT NULL);