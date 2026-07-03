-- Refund an optimization credit (Section 12a): failed AI generations must not
-- charge tier quota. Called by edge functions (service role) after an AI
-- gateway failure when the credit was already reserved via consume_optimization.
CREATE OR REPLACE FUNCTION public.refund_optimization(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _month text := to_char(now(), 'YYYY-MM');
begin
  update public.monthly_usage
     set optimizations_used = greatest(0, optimizations_used - 1)
   where user_id = _user_id and month = _month;
end;
$function$;

REVOKE ALL ON FUNCTION public.refund_optimization(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_optimization(uuid) TO service_role;
