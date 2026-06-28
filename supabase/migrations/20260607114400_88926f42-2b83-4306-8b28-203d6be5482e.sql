-- Auto-award "Welcome Aboard" on profile creation so every new signup
-- gets it immediately, without waiting for the next achievement evaluation.
CREATE OR REPLACE FUNCTION public.award_welcome_aboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ach_id uuid;
BEGIN
  SELECT id INTO _ach_id
    FROM public.achievements
   WHERE name = 'Welcome Aboard' AND is_active = true
   LIMIT 1;

  IF _ach_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_achievements
    (user_id, achievement_id, award_method, toast_delivered, trigger_snapshot)
  VALUES
    (NEW.id, _ach_id, 'organic', false,
     jsonb_build_object('metric','account_created','value_at_trigger',1,'awarded_by_trigger',true))
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  INSERT INTO public.achievement_audit_log
    (event_type, achievement_id, user_id, performed_by, metadata)
  VALUES
    ('earned', _ach_id, NEW.id, NEW.id,
     jsonb_build_object('metric','account_created','source','signup_trigger'));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_welcome_aboard ON public.user_profiles;
CREATE TRIGGER trg_award_welcome_aboard
AFTER INSERT ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.award_welcome_aboard();