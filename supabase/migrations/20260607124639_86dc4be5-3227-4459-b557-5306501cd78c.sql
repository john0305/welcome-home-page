
-- Replace the permissive update policy with a column-restricted trigger guard.
DROP POLICY IF EXISTS "users update own toast_delivered" ON public.user_achievements;

CREATE POLICY "users update own toast_delivered"
ON public.user_achievements
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.user_achievements_restrict_user_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role / postgres / definer contexts to bypass.
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For end-user updates, only toast_delivered may change.
  IF NEW.user_id        IS DISTINCT FROM OLD.user_id
  OR NEW.achievement_id IS DISTINCT FROM OLD.achievement_id
  OR NEW.awarded_at     IS DISTINCT FROM OLD.awarded_at
  OR NEW.is_valid       IS DISTINCT FROM OLD.is_valid
  OR NEW.hidden_from_user IS DISTINCT FROM OLD.hidden_from_user
  OR NEW.invalidated_reason IS DISTINCT FROM OLD.invalidated_reason
  OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at
  OR NEW.award_method   IS DISTINCT FROM OLD.award_method
  OR NEW.awarded_by     IS DISTINCT FROM OLD.awarded_by
  OR NEW.metadata       IS DISTINCT FROM OLD.metadata
  THEN
    RAISE EXCEPTION 'Only toast_delivered may be modified by the achievement owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_achievements_restrict_user_updates ON public.user_achievements;
CREATE TRIGGER trg_user_achievements_restrict_user_updates
BEFORE UPDATE ON public.user_achievements
FOR EACH ROW
EXECUTE FUNCTION public.user_achievements_restrict_user_updates();
