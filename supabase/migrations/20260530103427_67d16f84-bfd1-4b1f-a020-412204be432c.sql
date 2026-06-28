-- 1. store_personalization table
CREATE TABLE public.store_personalization (
  user_id uuid PRIMARY KEY,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_prompt_override text,
  category text,
  ai_followups jsonb NOT NULL DEFAULT '[]'::jsonb,
  completion_percentage integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_personalization TO authenticated;
GRANT ALL ON public.store_personalization TO service_role;

ALTER TABLE public.store_personalization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personalization_owner_select" ON public.store_personalization
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "personalization_owner_insert" ON public.store_personalization
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personalization_owner_update" ON public.store_personalization
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personalization_owner_delete" ON public.store_personalization
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "personalization_admin_all" ON public.store_personalization
  FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Prevent users from setting their own custom_prompt_override (admin/service only)
CREATE OR REPLACE FUNCTION public.protect_personalization_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.custom_prompt_override IS NOT NULL THEN
    NEW.custom_prompt_override := NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.custom_prompt_override IS DISTINCT FROM OLD.custom_prompt_override THEN
    NEW.custom_prompt_override := OLD.custom_prompt_override;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_personalization_override_trg
  BEFORE INSERT OR UPDATE ON public.store_personalization
  FOR EACH ROW EXECUTE FUNCTION public.protect_personalization_override();

-- 2. extend monthly_usage
ALTER TABLE public.monthly_usage
  ADD COLUMN IF NOT EXISTS grades_used integer NOT NULL DEFAULT 0;

-- 3. consume_grade function
CREATE OR REPLACE FUNCTION public.consume_grade(_user_id uuid, _free_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier text;
  _month text := to_char(now(), 'YYYY-MM');
  _used int;
  _is_paid boolean;
BEGIN
  SELECT tier INTO _tier FROM public.user_profiles WHERE id = _user_id;
  _is_paid := COALESCE(_tier, 'free') <> 'free';

  INSERT INTO public.monthly_usage(user_id, month, optimizations_used, grades_used)
    VALUES (_user_id, _month, 0, 0)
    ON CONFLICT (user_id, month) DO NOTHING;

  SELECT grades_used INTO _used
    FROM public.monthly_usage
   WHERE user_id = _user_id AND month = _month
   FOR UPDATE;

  IF NOT _is_paid AND _used >= _free_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _free_limit, 'tier', _tier);
  END IF;

  UPDATE public.monthly_usage
     SET grades_used = _used + 1,
         updated_at = now()
   WHERE user_id = _user_id AND month = _month;

  RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', CASE WHEN _is_paid THEN -1 ELSE _free_limit END, 'tier', _tier);
END;
$$;