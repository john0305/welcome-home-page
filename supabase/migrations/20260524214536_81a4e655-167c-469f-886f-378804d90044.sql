CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role (webhooks, edge functions with service key) bypasses
  IF auth.uid() IS NULL OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Platform admins may change anything
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.is_affiliate IS DISTINCT FROM OLD.is_affiliate
     OR NEW.invite_code IS DISTINCT FROM OLD.invite_code
     OR NEW.invite_code_redeemed_at IS DISTINCT FROM OLD.invite_code_redeemed_at THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.user_profiles p
SET tier = CASE 
  WHEN s.price_id IN ('starter_monthly','starter_yearly') THEN 'starter'
  WHEN s.price_id IN ('pro_monthly','pro_yearly') THEN 'pro'
  WHEN s.price_id IN ('agency_monthly','agency_yearly') THEN 'agency'
  ELSE p.tier
END
FROM public.subscriptions s
WHERE s.user_id = p.id
  AND s.status IN ('active','trialing','past_due')
  AND p.tier = 'free';