
CREATE OR REPLACE VIEW public.etsy_connection_status
WITH (security_invoker = on) AS
SELECT user_id, shop_id, shop_name, expires_at, created_at, status
FROM public.etsy_tokens;

GRANT SELECT ON public.etsy_connection_status TO authenticated;
GRANT SELECT ON public.etsy_connection_status TO service_role;

DROP POLICY IF EXISTS "etsy_tokens_owner_select" ON public.etsy_tokens;
