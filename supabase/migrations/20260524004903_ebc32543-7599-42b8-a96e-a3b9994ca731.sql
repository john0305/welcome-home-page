-- Add invite code columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS invite_code_redeemed_at timestamptz;

-- Enforce: one invite code per account, cannot change once set, must redeem within 30 days of signup
CREATE OR REPLACE FUNCTION public.enforce_invite_code_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block changing or clearing an already-set code
  IF OLD.invite_code IS NOT NULL
     AND NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN
    RAISE EXCEPTION 'Invite code is already set and cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Setting a code for the first time
  IF OLD.invite_code IS NULL AND NEW.invite_code IS NOT NULL THEN
    IF NEW.created_at < now() - interval '30 days' THEN
      RAISE EXCEPTION 'Invite codes must be redeemed within 30 days of account creation'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.invite_code_redeemed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_invite_code_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_invite_code_rules ON public.user_profiles;
CREATE TRIGGER user_profiles_invite_code_rules
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invite_code_rules();