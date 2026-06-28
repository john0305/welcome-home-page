REVOKE EXECUTE ON FUNCTION public.consume_personal_quota(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_personal_quota(uuid, text) TO authenticated, service_role;