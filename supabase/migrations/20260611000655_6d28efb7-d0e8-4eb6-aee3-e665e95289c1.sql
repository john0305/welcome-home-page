
-- 1. Add column
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS unlimited_quota boolean NOT NULL DEFAULT false;

-- 2. Update privilege escalation guard to include the new field
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.is_affiliate IS DISTINCT FROM OLD.is_affiliate
     OR NEW.invite_code IS DISTINCT FROM OLD.invite_code
     OR NEW.invite_code_redeemed_at IS DISTINCT FROM OLD.invite_code_redeemed_at
     OR NEW.unlimited_quota IS DISTINCT FROM OLD.unlimited_quota THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Bypass limits when unlimited_quota = true
CREATE OR REPLACE FUNCTION public.consume_optimization(_user_id uuid, _free_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _tier text;
  _unlimited boolean;
  _month text := to_char(now(), 'YYYY-MM');
  _used int;
  _is_paid boolean;
begin
  select tier, coalesce(unlimited_quota, false)
    into _tier, _unlimited
    from public.user_profiles where id = _user_id;
  _is_paid := coalesce(_tier, 'free') <> 'free';

  insert into public.monthly_usage(user_id, month, optimizations_used)
    values (_user_id, _month, 0)
    on conflict (user_id, month) do nothing;

  select optimizations_used into _used
    from public.monthly_usage
   where user_id = _user_id and month = _month
   for update;

  if not _unlimited and not _is_paid and _used >= _free_limit then
    return jsonb_build_object('allowed', false, 'used', _used, 'limit', _free_limit, 'tier', _tier);
  end if;

  update public.monthly_usage
     set optimizations_used = _used + 1,
         updated_at = now()
   where user_id = _user_id and month = _month;

  return jsonb_build_object(
    'allowed', true,
    'used', _used + 1,
    'limit', case when _unlimited or _is_paid then -1 else _free_limit end,
    'tier', _tier,
    'unlimited', _unlimited
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_grade(_user_id uuid, _free_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tier text;
  _unlimited boolean;
  _month text := to_char(now(), 'YYYY-MM');
  _used int;
  _is_paid boolean;
BEGIN
  SELECT tier, COALESCE(unlimited_quota, false)
    INTO _tier, _unlimited
    FROM public.user_profiles WHERE id = _user_id;
  _is_paid := COALESCE(_tier, 'free') <> 'free';

  INSERT INTO public.monthly_usage(user_id, month, optimizations_used, grades_used)
    VALUES (_user_id, _month, 0, 0)
    ON CONFLICT (user_id, month) DO NOTHING;

  SELECT grades_used INTO _used
    FROM public.monthly_usage
   WHERE user_id = _user_id AND month = _month
   FOR UPDATE;

  IF NOT _unlimited AND NOT _is_paid AND _used >= _free_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _free_limit, 'tier', _tier);
  END IF;

  UPDATE public.monthly_usage
     SET grades_used = _used + 1,
         updated_at = now()
   WHERE user_id = _user_id AND month = _month;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', _used + 1,
    'limit', CASE WHEN _unlimited OR _is_paid THEN -1 ELSE _free_limit END,
    'tier', _tier,
    'unlimited', _unlimited
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_chat_message(_user_id uuid, _free_limit integer DEFAULT 15, _starter_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tier text;
  _unlimited boolean;
  _month text := to_char(now(), 'YYYY-MM');
  _used int;
  _limit int;
BEGIN
  SELECT tier, COALESCE(unlimited_quota, false)
    INTO _tier, _unlimited
    FROM public.user_profiles WHERE id = _user_id;
  _tier := COALESCE(_tier, 'free');

  _limit := CASE _tier
    WHEN 'free' THEN _free_limit
    WHEN 'starter' THEN _starter_limit
    ELSE -1
  END;

  IF _unlimited THEN
    _limit := -1;
  END IF;

  INSERT INTO public.monthly_usage(user_id, month, optimizations_used, grades_used, chat_messages_used)
    VALUES (_user_id, _month, 0, 0, 0)
    ON CONFLICT (user_id, month) DO NOTHING;

  SELECT chat_messages_used INTO _used
    FROM public.monthly_usage
   WHERE user_id = _user_id AND month = _month
   FOR UPDATE;

  IF _limit <> -1 AND _used >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _limit, 'tier', _tier);
  END IF;

  UPDATE public.monthly_usage
     SET chat_messages_used = _used + 1,
         updated_at = now()
   WHERE user_id = _user_id AND month = _month;

  RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', _limit, 'tier', _tier, 'unlimited', _unlimited);
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_personal_quota(_user_id uuid, _kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tier text;
  _unlimited boolean;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used int;
  _limit int;
  _col text;
BEGIN
  IF _kind NOT IN ('grade','optimization','tryon') THEN
    RAISE EXCEPTION 'invalid kind: %', _kind;
  END IF;

  SELECT tier, COALESCE(unlimited_quota, false)
    INTO _tier, _unlimited
    FROM public.user_profiles WHERE id = _user_id;
  _tier := COALESCE(_tier, 'free');

  IF _kind = 'grade' THEN
    _limit := CASE _tier
      WHEN 'starter' THEN 5
      WHEN 'pro' THEN 15
      WHEN 'agency' THEN 40
      WHEN 'admin' THEN 9999
      ELSE 0
    END;
    _col := 'personal_grades_used';
  ELSIF _kind = 'optimization' THEN
    _limit := CASE _tier
      WHEN 'starter' THEN 5
      WHEN 'pro' THEN 15
      WHEN 'agency' THEN 40
      WHEN 'admin' THEN 9999
      ELSE 0
    END;
    _col := 'personal_optimizations_used';
  ELSE
    _limit := 0;
    _col := 'personal_tryons_used';
  END IF;

  IF _unlimited THEN
    _limit := 9999;
  END IF;

  INSERT INTO public.personal_daily_quotas(user_id, date)
    VALUES (_user_id, _today)
    ON CONFLICT (user_id, date) DO NOTHING;

  EXECUTE format(
    'SELECT %I FROM public.personal_daily_quotas WHERE user_id = $1 AND date = $2 FOR UPDATE',
    _col
  ) INTO _used USING _user_id, _today;

  IF _used >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _limit, 'tier', _tier, 'kind', _kind);
  END IF;

  EXECUTE format(
    'UPDATE public.personal_daily_quotas SET %I = %I + 1, updated_at = now() WHERE user_id = $1 AND date = $2',
    _col, _col
  ) USING _user_id, _today;

  RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', _limit, 'tier', _tier, 'kind', _kind, 'unlimited', _unlimited);
END;
$function$;
