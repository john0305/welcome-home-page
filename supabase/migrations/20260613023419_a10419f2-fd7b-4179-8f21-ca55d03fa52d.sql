-- Replace the over-broad UPDATE policy on user_achievements with one that
-- only allows the user to toggle toast_delivered on their own rows. All
-- other columns (is_valid, hidden_from_user, invalidated_reason, awarded_at,
-- etc.) are no longer user-mutable; admin/service role access is unchanged.
DROP POLICY IF EXISTS "users update own toast_delivered" ON public.user_achievements;

REVOKE UPDATE ON public.user_achievements FROM authenticated;
GRANT UPDATE (toast_delivered) ON public.user_achievements TO authenticated;

CREATE POLICY "users update own toast_delivered"
ON public.user_achievements
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
