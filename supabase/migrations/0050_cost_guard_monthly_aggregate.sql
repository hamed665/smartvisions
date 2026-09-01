-- Keep Cost Guard aggregation in Postgres so provider/AI preflights do not
-- download growing history tables into a serverless runtime. Both functions are
-- SECURITY INVOKER and executable only by service_role.

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

create or replace function public.get_ai_run_quota_usage(
  p_organization_id uuid,
  p_lead_id uuid,
  p_day_start timestamptz
)
returns table(lead_run_count bigint, daily_deep_run_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    case
      when p_lead_id is null then 0::bigint
      else count(*) filter (
        where ar.lead_id = p_lead_id
          and ar.status in ('PROCESSING', 'COMPLETED')
      )
    end as lead_run_count,
    count(*) filter (
      where ar.started_at >= p_day_start
        and ar.status in ('PROCESSING', 'COMPLETED')
        and ar.trace ->> 'reasoningTier' = 'FULL'
    ) as daily_deep_run_count
  from public.agent_runs ar
  where ar.organization_id = p_organization_id;
$$;

revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from public;
revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from anon;
revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from authenticated;
grant execute on function public.get_cost_guard_monthly_usage(uuid, timestamptz) to service_role;

revoke all on function public.get_ai_run_quota_usage(uuid, uuid, timestamptz) from public;
revoke all on function public.get_ai_run_quota_usage(uuid, uuid, timestamptz) from anon;
revoke all on function public.get_ai_run_quota_usage(uuid, uuid, timestamptz) from authenticated;
grant execute on function public.get_ai_run_quota_usage(uuid, uuid, timestamptz) to service_role;
