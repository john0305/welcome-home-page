DROP POLICY IF EXISTS "users update own toast_delivered" ON public.user_achievements;

CREATE OR REPLACE FUNCTION public.user_achievements_lock_non_toast_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins / service_role to update anything
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Regular users may only flip toast_delivered; lock all other columns.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.achievement_id IS DISTINCT FROM OLD.achievement_id
     OR NEW.awarded_at IS DISTINCT FROM OLD.awarded_at
     OR NEW.award_method IS DISTINCT FROM OLD.award_method
     OR NEW.is_valid IS DISTINCT FROM OLD.is_valid
     OR NEW.hidden_from_user IS DISTINCT FROM OLD.hidden_from_user
     OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at
     OR NEW.trigger_snapshot IS DISTINCT FROM OLD.trigger_snapshot
  THEN
    RAISE EXCEPTION 'Only toast_delivered may be updated by the owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_achievements_lock_non_toast_columns ON public.user_achievements;
CREATE TRIGGER user_achievements_lock_non_toast_columns
  BEFORE UPDATE ON public.user_achievements
  FOR EACH ROW EXECUTE FUNCTION public.user_achievements_lock_non_toast_columns();

CREATE POLICY "users update own toast_delivered"
  ON public.user_achievements
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());