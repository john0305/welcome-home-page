ALTER PUBLICATION supabase_realtime ADD TABLE public.fix_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_action_summaries;
ALTER TABLE public.fix_actions ADD COLUMN IF NOT EXISTS dismissal_reason text;
ALTER TABLE public.fix_actions REPLICA IDENTITY FULL;
ALTER TABLE public.daily_action_summaries REPLICA IDENTITY FULL;