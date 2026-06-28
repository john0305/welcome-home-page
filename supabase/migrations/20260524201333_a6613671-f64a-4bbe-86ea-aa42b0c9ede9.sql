-- Atomic optimization usage counter (server-enforced, free-tier limit)
create or replace function public.consume_optimization(_user_id uuid, _free_limit int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _tier text;
  _month text := to_char(now(), 'YYYY-MM');
  _used int;
  _is_paid boolean;
begin
  select tier into _tier from public.user_profiles where id = _user_id;
  _is_paid := coalesce(_tier, 'free') <> 'free';

  insert into public.monthly_usage(user_id, month, optimizations_used)
    values (_user_id, _month, 0)
    on conflict (user_id, month) do nothing;

  -- Lock + read current count
  select optimizations_used into _used
    from public.monthly_usage
   where user_id = _user_id and month = _month
   for update;

  if not _is_paid and _used >= _free_limit then
    return jsonb_build_object('allowed', false, 'used', _used, 'limit', _free_limit, 'tier', _tier);
  end if;

  update public.monthly_usage
     set optimizations_used = _used + 1,
         updated_at = now()
   where user_id = _user_id and month = _month;

  return jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', case when _is_paid then -1 else _free_limit end, 'tier', _tier);
end;
$$;

-- Ensure (user_id, month) uniqueness for the upsert above
do $$ begin
  if not exists (
    select 1 from pg_indexes
     where schemaname='public' and indexname='monthly_usage_user_month_key'
  ) then
    alter table public.monthly_usage
      add constraint monthly_usage_user_month_key unique (user_id, month);
  end if;
end $$;

revoke all on function public.consume_optimization(uuid, int) from public;
grant execute on function public.consume_optimization(uuid, int) to authenticated, service_role;