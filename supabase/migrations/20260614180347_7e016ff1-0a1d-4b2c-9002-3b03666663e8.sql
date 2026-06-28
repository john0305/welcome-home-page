CREATE POLICY "Users can insert their own score history"
  ON public.store_health_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT INSERT ON public.store_health_history TO authenticated;