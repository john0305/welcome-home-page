GRANT SELECT ON public.achievements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievements TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_achievements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_achievements TO service_role;

GRANT SELECT, INSERT ON public.achievement_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievement_audit_log TO service_role;

GRANT SELECT, INSERT ON public.user_activity_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_activity_days TO service_role;

GRANT SELECT, INSERT ON public.user_event_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_event_counters TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'award_welcome_aboard_on_profile_created'
  ) THEN
    CREATE TRIGGER award_welcome_aboard_on_profile_created
    AFTER INSERT ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.award_welcome_aboard();
  END IF;
END $$;