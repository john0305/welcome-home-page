revoke execute on function public.consume_optimization(uuid, int) from authenticated, anon, public;
grant execute on function public.consume_optimization(uuid, int) to service_role;