drop policy if exists "etsy_tokens_admin_all" on public.etsy_tokens;
create policy "etsy_tokens_admin_all" on public.etsy_tokens
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "stores_admin_all" on public.stores;
create policy "stores_admin_all" on public.stores
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "listings_admin_all" on public.listings;
create policy "listings_admin_all" on public.listings
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "optimizations_admin_all" on public.optimizations;
create policy "optimizations_admin_all" on public.optimizations
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "monthly_usage_admin_all" on public.monthly_usage;
create policy "monthly_usage_admin_all" on public.monthly_usage
  for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());