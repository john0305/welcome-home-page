GRANT SELECT ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;

GRANT SELECT, INSERT ON public.achievement_audit_log TO authenticated;
GRANT ALL ON public.achievement_audit_log TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.user_activity_days TO authenticated;
GRANT ALL ON public.user_activity_days TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.user_event_counters TO authenticated;
GRANT ALL ON public.user_event_counters TO service_role;