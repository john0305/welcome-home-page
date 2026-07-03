CREATE OR REPLACE FUNCTION public.refund_grade(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month text := to_char(now(), 'YYYY-MM');
BEGIN
  UPDATE public.monthly_usage
     SET grades_used = GREATEST(COALESCE(grades_used, 0) - 1, 0),
         updated_at = now()
   WHERE user_id = _user_id AND month = _month;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_grade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_grade(uuid) TO service_role;