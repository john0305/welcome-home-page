CREATE OR REPLACE FUNCTION public.get_waitlist_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.beta_signups WHERE archived_at IS NULL),
    'founding', (SELECT count(*) FROM public.beta_signups WHERE archived_at IS NULL AND plan_interest IN ('Pro','Agency'))
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_waitlist_stats() TO anon, authenticated;