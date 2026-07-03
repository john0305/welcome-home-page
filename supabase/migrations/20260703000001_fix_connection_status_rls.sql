-- Fix: connected stores showing as "not connected" for regular users.
--
-- Root cause: etsy_connection_status is a security_invoker view over
-- etsy_tokens, and migration 20260615125840 dropped etsy_tokens_owner_select.
-- With no owner SELECT policy, the view returns zero rows for non-admin users,
-- so the app's loadConnectedStore() marked every real user as not_connected
-- and showed the "Connect your store" button — despite valid tokens (backend
-- syncs, which use the service role, were unaffected).
--
-- The June 15 intent (never expose access_token/refresh_token to the client)
-- is preserved with COLUMN-level grants: the owner may SELECT only the safe
-- status columns; token columns stay service-role-only. No re-auth is needed —
-- existing tokens become visible to their owners again immediately.

CREATE POLICY "etsy_tokens_owner_select" ON public.etsy_tokens
  FOR SELECT USING (auth.uid() = user_id);

REVOKE SELECT ON public.etsy_tokens FROM authenticated;
GRANT SELECT (user_id, shop_id, shop_name, expires_at, created_at, status)
  ON public.etsy_tokens TO authenticated;
