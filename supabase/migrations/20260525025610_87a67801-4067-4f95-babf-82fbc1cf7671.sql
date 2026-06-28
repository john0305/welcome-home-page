drop policy if exists "Anyone can signup for beta" on public.beta_signups;
create policy "Anyone can signup for beta" on public.beta_signups
  for insert
  to public
  with check (
    email is not null
    and length(trim(email)) between 3 and 320
    and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );

drop policy if exists "Only admins can view beta signups" on public.beta_signups;
create policy "Only admins can view beta signups" on public.beta_signups
  for select
  to authenticated
  using (public.is_platform_admin());