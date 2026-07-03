CREATE POLICY "etsy_tokens_owner_select" ON public.etsy_tokens
  FOR SELECT USING (auth.uid() = user_id);

REVOKE SELECT ON public.etsy_tokens FROM authenticated;
GRANT SELECT (user_id, shop_id, shop_name, expires_at, created_at, status)
  ON public.etsy_tokens TO authenticated;