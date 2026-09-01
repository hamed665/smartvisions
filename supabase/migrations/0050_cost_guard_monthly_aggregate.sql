-- Keep Cost Guard spend calculation in Postgres so every provider preflight does
-- not download the entire month's usage_events history into a serverless runtime.
-- service_role already has SELECT on usage_events; this function is SECURITY
-- INVOKER and is executable only by service_role.

create or replace function public.get_cost_guard_monthly_usage(
  p_organization_id uuid,
  p_start timestamptz
)
returns table(provider text, cost_usd numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select upper(coalesce(u.provider, 'OTHER')) as provider,
         coalesce(sum(u.cost_usd), 0)::numeric as cost_usd
  from public.usage_events u
  where u.organization_id = p_organization_id
    and u.created_at >= p_start
  group by upper(coalesce(u.provider, 'OTHER'));
$$;

revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from public;
revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from anon;
revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from authenticated;
grant execute on function public.get_cost_guard_monthly_usage(uuid, timestamptz) to service_role;
