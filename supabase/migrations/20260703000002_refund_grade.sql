-- Refund a grade credit (Section 12a): failed AI generations must not
-- charge tier quota. Called by edge functions (service role) after an AI
-- gateway failure when the credit was already reserved via consume_grade.
CREATE OR REPLACE FUNCTION public.refund_grade(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _month text := to_char(now(), 'YYYY-MM');
begin
  update public.monthly_usage
     set grades_used = greatest(0, grades_used - 1)
   where user_id = _user_id and month = _month;
end;
$function$;

REVOKE ALL ON FUNCTION public.refund_grade(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_grade(uuid) TO service_role;
