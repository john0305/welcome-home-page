
-- Achievement system: tables, RLS, helpers, seed data

-- 1. achievements
CREATE TABLE IF NOT EXISTS public.achievements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  flavor_text       TEXT,
  icon              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN (
                      'getting_started','sales','listings','optimization',
                      'echo','renewal_health','pinterest','shop_health','loyalty'
                    )),
  points            INT NOT NULL DEFAULT 0,
  trigger_type      TEXT NOT NULL CHECK (trigger_type IN ('organic','admin')),
  trigger_condition JSONB NOT NULL,
  is_active         BOOLEAN DEFAULT TRUE,
  is_retroactive    BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id)
);
GRANT SELECT ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read active achievements" ON public.achievements;
CREATE POLICY "read active achievements" ON public.achievements
  FOR SELECT TO authenticated USING (is_active = TRUE);
DROP POLICY IF EXISTS "admin full access achievements" ON public.achievements;
CREATE POLICY "admin full access achievements" ON public.achievements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. user_achievements
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id      UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  awarded_at          TIMESTAMPTZ DEFAULT NOW(),
  award_method        TEXT NOT NULL CHECK (award_method IN ('organic','admin_single','admin_bulk')),
  awarded_by_admin    UUID REFERENCES auth.users(id),
  admin_reason        TEXT,
  trigger_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  toast_delivered     BOOLEAN DEFAULT FALSE,
  is_valid            BOOLEAN DEFAULT TRUE,
  invalidated_at      TIMESTAMPTZ,
  invalidated_reason  TEXT,
  UNIQUE(user_id, achievement_id)
);
GRANT SELECT, UPDATE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own achievements" ON public.user_achievements;
CREATE POLICY "users read own achievements" ON public.user_achievements
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "users update own toast_delivered" ON public.user_achievements;
CREATE POLICY "users update own toast_delivered" ON public.user_achievements
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "admin full access user_achievements" ON public.user_achievements;
CREATE POLICY "admin full access user_achievements" ON public.user_achievements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. achievement_audit_log
CREATE TABLE IF NOT EXISTS public.achievement_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL CHECK (event_type IN (
                    'earned','invalidated','admin_awarded','toggled_active','created','edited'
                  )),
  achievement_id  UUID REFERENCES public.achievements(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT ON public.achievement_audit_log TO authenticated;
GRANT ALL ON public.achievement_audit_log TO service_role;
ALTER TABLE public.achievement_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read audit log" ON public.achievement_audit_log;
CREATE POLICY "admin read audit log" ON public.achievement_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. user_event_counters
CREATE TABLE IF NOT EXISTS public.user_event_counters (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric      TEXT NOT NULL,
  value       INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, metric)
);
GRANT SELECT ON public.user_event_counters TO authenticated;
GRANT ALL ON public.user_event_counters TO service_role;
ALTER TABLE public.user_event_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own counters" ON public.user_event_counters;
CREATE POLICY "users read own counters" ON public.user_event_counters
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 5. user_activity_days
CREATE TABLE IF NOT EXISTS public.user_activity_days (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day       DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);
GRANT SELECT ON public.user_activity_days TO authenticated;
GRANT ALL ON public.user_activity_days TO service_role;
ALTER TABLE public.user_activity_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own activity" ON public.user_activity_days;
CREATE POLICY "users read own activity" ON public.user_activity_days
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 6. pinterest_posts stub
CREATE TABLE IF NOT EXISTS public.pinterest_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id     BIGINT,
  listing_id  BIGINT,
  pin_id      TEXT,
  board_id    TEXT,
  posted_at   TIMESTAMPTZ DEFAULT NOW(),
  removed_at  TIMESTAMPTZ
);
GRANT SELECT ON public.pinterest_posts TO authenticated;
GRANT ALL ON public.pinterest_posts TO service_role;
ALTER TABLE public.pinterest_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own pins" ON public.pinterest_posts;
CREATE POLICY "users read own pins" ON public.pinterest_posts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 7. user_profiles additions
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS achievement_sounds BOOLEAN DEFAULT TRUE;
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS achievement_emails BOOLEAN DEFAULT TRUE;

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user 
  ON public.user_achievements(user_id, awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_undelivered 
  ON public.user_achievements(user_id, toast_delivered) 
  WHERE toast_delivered = FALSE;
CREATE INDEX IF NOT EXISTS idx_audit_log_achievement 
  ON public.achievement_audit_log(achievement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_counters_user 
  ON public.user_event_counters(user_id, metric);
CREATE INDEX IF NOT EXISTS idx_activity_days_user 
  ON public.user_activity_days(user_id, day DESC);

-- 9. system_settings: achievements_enabled is stored as a key/value row
-- (system_settings in this project is a key/value table, not a flat table)
INSERT INTO public.system_settings(key, value)
  VALUES ('achievements_enabled', 'true'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Allow authenticated users to read the achievements_enabled flag
DROP POLICY IF EXISTS "system_settings_read_achievements_flag" ON public.system_settings;
CREATE POLICY "system_settings_read_achievements_flag" ON public.system_settings
  FOR SELECT TO authenticated USING (key = 'achievements_enabled');

-- 10. Helper functions
CREATE OR REPLACE FUNCTION public.is_achievements_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((value)::text::boolean, TRUE)
  FROM public.system_settings WHERE key = 'achievements_enabled' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.increment_event_counter(
  p_user_id UUID,
  p_metric TEXT,
  p_by INT DEFAULT 1
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_event_counters (user_id, metric, value, updated_at)
  VALUES (p_user_id, p_metric, p_by, NOW())
  ON CONFLICT (user_id, metric)
  DO UPDATE SET value = public.user_event_counters.value + p_by, updated_at = NOW();
$$;

CREATE OR REPLACE FUNCTION public.set_event_counter_max(
  p_user_id UUID,
  p_metric TEXT,
  p_value INT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.user_event_counters (user_id, metric, value, updated_at)
  VALUES (p_user_id, p_metric, p_value, NOW())
  ON CONFLICT (user_id, metric)
  DO UPDATE SET value = GREATEST(public.user_event_counters.value, p_value), updated_at = NOW();
$$;

GRANT EXECUTE ON FUNCTION public.is_achievements_enabled() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_event_counter(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_counter_max(UUID, TEXT, INT) TO authenticated;

-- 11. updated_at trigger on achievements
DROP TRIGGER IF EXISTS update_achievements_updated_at ON public.achievements;
CREATE TRIGGER update_achievements_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Seed all 30 achievements (idempotent by name)
INSERT INTO public.achievements
  (name, description, flavor_text, icon, category, points, trigger_type, trigger_condition, is_retroactive)
VALUES
('Radar Online','Connect your first Etsy store to RadarIQ','The signal is live. Let''s see what''s out there.','📡','getting_started',50,'organic','{"metric":"connected_stores","threshold":1}'::jsonb,TRUE),
('First Scan','Complete your first full store sync','RadarIQ sees your store. All of it.','🔄','getting_started',50,'organic','{"metric":"syncs_completed","threshold":1}'::jsonb,TRUE),
('Echo Awakens','Send your first message to Echo','The bat stirs. Ask it anything.','🦇','getting_started',75,'organic','{"metric":"echo_messages_sent","threshold":1}'::jsonb,TRUE),
('Profile Complete','Fill out all recommended store fields — bio, banner, and policies','First impressions are everything.','✅','getting_started',50,'organic','{"metric":"profile_complete","threshold":1}'::jsonb,TRUE),
('Founding Member','Joined RadarIQ as a founding member','You were here before the world knew about us.','🏅','getting_started',200,'admin','{"metric":"is_founding_member","threshold":1}'::jsonb,FALSE),
('First Sale','Record your first Etsy sale tracked by RadarIQ','It begins.','🎉','sales',100,'organic','{"metric":"total_sales","threshold":1}'::jsonb,TRUE),
('Ten Strong','Reach 10 total sales','Double digits. You''re just getting started.','🔟','sales',150,'organic','{"metric":"total_sales","threshold":10}'::jsonb,TRUE),
('Century Mark','Reach 100 total sales','One hundred. Let that sink in.','💯','sales',300,'organic','{"metric":"total_sales","threshold":100}'::jsonb,TRUE),
('Momentum','Make 3 sales in a single day','Three in a day. Whatever you''re doing — keep doing it.','⚡','sales',150,'organic','{"metric":"single_day_sales","threshold":3}'::jsonb,TRUE),
('Repeat Customer','Receive a second order from the same buyer','They came back. That means something.','🤝','sales',125,'organic','{"metric":"repeat_buyers","threshold":1}'::jsonb,TRUE),
('First Hundred','Cross $100 in total revenue tracked by RadarIQ','Your first hundred dollars. Not your last.','💵','sales',100,'organic','{"metric":"total_revenue_usd","threshold":100}'::jsonb,TRUE),
('Four Figures','Cross $1,000 in total revenue','Four figures. You built that.','💰','sales',250,'organic','{"metric":"total_revenue_usd","threshold":1000}'::jsonb,TRUE),
('Open for Business','Have 10 active listings in your store','Ten listings in the window. The store is alive.','🏪','listings',75,'organic','{"metric":"active_listings","threshold":10}'::jsonb,TRUE),
('Listing Library','Have 50 active listings in your store','Fifty strong. Buyers have options. That''s a good thing.','📚','listings',150,'organic','{"metric":"active_listings","threshold":50}'::jsonb,TRUE),
('Stale Slayer','Retire or refresh a listing with a stale score of 80 or higher','Out with the old. In with the sold.','🧹','listings',100,'organic','{"metric":"stale_listings_resolved","threshold":1}'::jsonb,TRUE),
('Renewal Watcher','RadarIQ detects your first real observed renewal event','RadarIQ caught it in real time. No more guessing.','👁️','listings',75,'organic','{"metric":"observed_renewal_events","threshold":1}'::jsonb,TRUE),
('First Tune-Up','Run your first listing optimization through RadarIQ','Every great store started with one good edit.','🔧','optimization',75,'organic','{"metric":"optimizations_run","threshold":1}'::jsonb,TRUE),
('Tune-Up Pro','Run 10 listing optimizations','Ten optimizations in. Your listings are working harder than ever.','🛠️','optimization',150,'organic','{"metric":"optimizations_run","threshold":10}'::jsonb,TRUE),
('Tag Gap Closed','Apply a competitor tag gap recommendation to a listing','You found what was missing. Now buyers can find you.','🏷️','optimization',100,'organic','{"metric":"tag_gaps_applied","threshold":1}'::jsonb,TRUE),
('Photo Finish','Act on a photo analysis recommendation for a listing','A great photo is worth a thousand search results.','📸','optimization',100,'organic','{"metric":"photo_recommendations_applied","threshold":1}'::jsonb,TRUE),
('Grade A','Bring a listing to a grade of A or higher after optimization','A-grade listing. Echo would be proud.','🅰️','optimization',150,'organic','{"metric":"listings_graded_a_or_above","threshold":1}'::jsonb,TRUE),
('Full Sweep','Optimize every listing in your store at least once','Every listing, touched. That''s a whole store transformed.','🌊','optimization',300,'organic','{"metric":"pct_listings_optimized","threshold":100}'::jsonb,TRUE),
('Deep Dive','Have a 10-message conversation with Echo in a single session','You really talked to the bat.','🌊','echo',75,'organic','{"metric":"echo_session_depth","threshold":10}'::jsonb,TRUE),
('Echo Applied','Apply an Echo recommendation directly to a listing','Echo said it. You did it. That''s the loop.','🦇','echo',100,'organic','{"metric":"echo_recommendations_applied","threshold":1}'::jsonb,TRUE),
('Echo Believer','Apply 25 Echo recommendations across your store','Twenty-five recommendations acted on. Echo doesn''t forget.','💡','echo',250,'organic','{"metric":"echo_recommendations_applied","threshold":25}'::jsonb,TRUE),
('Cost Aware','View your shop renewal cost summary for the first time','Now you know what it costs to stand still.','💸','renewal_health',50,'organic','{"metric":"renewal_cost_card_viewed","threshold":1}'::jsonb,TRUE),
('Cleanup Crew','Resolve 5 stale unique listings flagged by the renewal system','Five stale listings retired. Your store thanks you.','🗑️','renewal_health',200,'organic','{"metric":"stale_unique_listings_resolved","threshold":5}'::jsonb,TRUE),
('Spotlight Ready','Have your first listing promoted via Pinterest Spotlight','Your listing is out in the world. Pinterest noticed.','📌','pinterest',100,'organic','{"metric":"pinterest_spotlights_posted","threshold":1}'::jsonb,TRUE),
('Pinterest Pro','Accumulate 10 Pinterest Spotlight posts','Ten spotlights. Your reach is growing.','🎯','pinterest',200,'organic','{"metric":"pinterest_spotlights_posted","threshold":10}'::jsonb,TRUE),
('Still Here','Active RadarIQ user for 90 of the last 120 days','Ninety days. You''re not dabbling — you''re building.','🏆','loyalty',300,'organic','{"metric":"rolling_active_days","threshold":90}'::jsonb,TRUE)
ON CONFLICT DO NOTHING;
