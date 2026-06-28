
-- Drop owner write policies — token rows are created/refreshed/deleted only by edge functions (service role).
DROP POLICY IF EXISTS etsy_tokens_owner_insert ON public.etsy_tokens;
DROP POLICY IF EXISTS etsy_tokens_owner_update ON public.etsy_tokens;
DROP POLICY IF EXISTS etsy_tokens_owner_delete ON public.etsy_tokens;

-- Replace owner SELECT with a column-restricted grant: owners can see metadata,
-- never the access_token / refresh_token columns.
REVOKE ALL ON public.etsy_tokens FROM authenticated;
GRANT SELECT (user_id, shop_id, shop_name, expires_at, created_at, updated_at)
  ON public.etsy_tokens TO authenticated;
GRANT ALL ON public.etsy_tokens TO service_role;

-- The owner SELECT RLS policy still applies row-wise (auth.uid() = user_id);
-- column grants enforce that the token columns are never returned.
