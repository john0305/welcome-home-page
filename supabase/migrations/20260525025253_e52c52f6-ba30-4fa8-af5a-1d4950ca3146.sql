grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_platform_admin() to anon;

grant execute on function public.has_active_subscription(uuid, text) to authenticated;
grant execute on function public.has_active_subscription(uuid, text) to anon;