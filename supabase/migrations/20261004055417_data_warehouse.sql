-- DATA-WAREHOUSE
--
-- Logical analytics warehouse boundary for the current Production scale.
-- This is a rebuildable DERIVED projection over analytics_event_feed_v1.
-- It is never operational/business truth and never replaces canonical OLTP.
-- Cloudflare Cron remains the scheduler; no pg_cron, pgmq, CDC bus or second
-- event authority is introduced by this migration.

create table public.analytics_warehouse_facts (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  tenant_business_id uuid,
  branch_id uuid,
  source_table text not null
    check (length(btrim(source_table)) between 1 and 120),
  source_event_id text not null
    check (length(btrim(source_event_id)) between 1 and 240),
  event_name text not null
    check (length(btrim(event_name)) between 1 and 180),
  event_version integer not null
    check (event_version >= 1),
  source_event_type text not null
    check (length(btrim(source_event_type)) between 1 and 180),
  evidence_class text not null
    check (length(btrim(evidence_class)) between 1 and 80),
  entity_type text not null
    check (length(btrim(entity_type)) between 1 and 120),
  entity_id text,
  lead_id uuid,
  conversation_id uuid,
  occurred_at timestamptz not null,
  numeric_value numeric,
  numeric_unit text,
  dimensions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(dimensions) = 'object'),
  projected_at timestamptz not null default now(),
  source_feed_version integer not null default 1
    check (source_feed_version = 1),
  primary key (
    organization_id,
    source_table,
    source_event_id,
    event_name,
    event_version
  )
);

create index analytics_warehouse_facts_org_time_idx
  on public.analytics_warehouse_facts(organization_id, occurred_at desc);

create index analytics_warehouse_facts_org_event_time_idx
  on public.analytics_warehouse_facts(organization_id, event_name, occurred_at desc);

create index analytics_warehouse_facts_scope_time_idx
  on public.analytics_warehouse_facts(
    organization_id,
    tenant_business_id,
    branch_id,
    occurred_at desc
  );

comment on table public.analytics_warehouse_facts is
  'Rebuildable non-authoritative analytics projection of analytics_event_feed_v1. Canonical OLTP/event authorities remain the only business truth.';

create table public.analytics_warehouse_checkpoints (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  projection_version integer not null default 1
    check (projection_version = 1),
  last_complete_through timestamptz,
  last_source_event_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_inserted_count integer not null default 0
    check (last_inserted_count >= 0),
  lookback_seconds integer not null default 172800
    check (lookback_seconds between 0 and 604800),
  last_backfill_from timestamptz,
  last_backfill_to timestamptz,
  updated_at timestamptz not null default now(),
  check (
    last_backfill_from is null
    or last_backfill_to is null
    or last_backfill_to > last_backfill_from
  )
);

comment on table public.analytics_warehouse_checkpoints is
  'Projection freshness/backfill watermark only. It is not an event queue, scheduler, business fact or CDC truth.';

alter table public.analytics_warehouse_facts enable row level security;
alter table public.analytics_warehouse_checkpoints enable row level security;

create policy analytics_warehouse_facts_service
on public.analytics_warehouse_facts
for all
to service_role
using (true)
with check (true);

create policy analytics_warehouse_checkpoints_service
on public.analytics_warehouse_checkpoints
for all
to service_role
using (true)
with check (true);

revoke all on table public.analytics_warehouse_facts
  from public, anon, authenticated, service_role;
revoke all on table public.analytics_warehouse_checkpoints
  from public, anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.analytics_warehouse_facts to service_role;
grant select, insert, update
  on table public.analytics_warehouse_checkpoints to service_role;

create or replace function public.sync_analytics_warehouse_v1(
  p_organization_id uuid,
  p_end_at timestamptz default now(),
  p_backfill_from timestamptz default null,
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_checkpoint public.analytics_warehouse_checkpoints%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit,5000),1),5000);
  v_end timestamptz := least(coalesce(p_end_at,now()),now());
  v_earliest timestamptz;
  v_base_start timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_new_complete timestamptz;
  v_max_inserted timestamptz;
  v_last_source_event_at timestamptz;
  v_inserted integer := 0;
  v_remaining boolean := false;
  v_is_backfill boolean := p_backfill_from is not null;
  v_lookback_seconds integer := 172800;
  v_locked boolean;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'trusted analytics warehouse sync required';
  end if;
  if p_organization_id is null then
    raise exception 'organization is required';
  end if;
  if not exists (
    select 1 from public.organizations o where o.id=p_organization_id
  ) then
    raise exception 'organization not found';
  end if;
  if p_end_at is null then
    raise exception 'endAt is required';
  end if;

  select pg_try_advisory_xact_lock(
    hashtextextended('analytics_warehouse_v1:'||p_organization_id::text,0)
  ) into v_locked;
  if not v_locked then
    return jsonb_build_object(
      'organizationId',p_organization_id,
      'locked',true,
      'inserted',0,
      'caughtUp',false
    );
  end if;

  select *
  into v_checkpoint
  from public.analytics_warehouse_checkpoints c
  where c.organization_id=p_organization_id
  for update;

  if found then
    v_lookback_seconds:=v_checkpoint.lookback_seconds;
  end if;

  if v_is_backfill then
    if p_backfill_from>=v_end then
      raise exception 'backfill window is invalid';
    end if;
    if v_end-p_backfill_from>interval '31 days' then
      raise exception 'backfill window exceeds 31 days';
    end if;
    v_base_start:=p_backfill_from;
    v_window_start:=p_backfill_from;
    v_window_end:=v_end;
  else
    select min(f.occurred_at)
    into v_earliest
    from public.analytics_event_feed_v1 f
    where f.organization_id=p_organization_id;

    if v_checkpoint.organization_id is not null
       and v_checkpoint.last_complete_through is not null then
      v_base_start:=least(v_checkpoint.last_complete_through,v_end);
    else
      v_base_start:=coalesce(v_earliest,v_end);
    end if;

    v_window_start:=v_base_start-make_interval(secs=>v_lookback_seconds);
    v_window_end:=least(v_base_start+interval '7 days',v_end);
  end if;

  with candidates as (
    select
      f.organization_id,
      f.tenant_business_id,
      f.branch_id,
      f.source_table,
      f.event_id as source_event_id,
      f.event_name,
      f.event_version,
      f.source_event_type,
      f.evidence_class,
      f.entity_type,
      f.entity_id,
      f.lead_id,
      f.conversation_id,
      f.occurred_at,
      f.numeric_value,
      f.numeric_unit,
      f.dimensions
    from public.analytics_event_feed_v1 f
    where f.organization_id=p_organization_id
      and f.occurred_at>=v_window_start
      and f.occurred_at<v_window_end
      and not exists (
        select 1
        from public.analytics_warehouse_facts w
        where w.organization_id=f.organization_id
          and w.source_table=f.source_table
          and w.source_event_id=f.event_id
          and w.event_name=f.event_name
          and w.event_version=f.event_version
      )
    order by f.occurred_at,f.source_table,f.event_id,f.event_name,f.event_version
    limit v_limit
  ),
  inserted as (
    insert into public.analytics_warehouse_facts(
      organization_id,
      tenant_business_id,
      branch_id,
      source_table,
      source_event_id,
      event_name,
      event_version,
      source_event_type,
      evidence_class,
      entity_type,
      entity_id,
      lead_id,
      conversation_id,
      occurred_at,
      numeric_value,
      numeric_unit,
      dimensions,
      source_feed_version
    )
    select
      organization_id,
      tenant_business_id,
      branch_id,
      source_table,
      source_event_id,
      event_name,
      event_version,
      source_event_type,
      evidence_class,
      entity_type,
      entity_id,
      lead_id,
      conversation_id,
      occurred_at,
      numeric_value,
      numeric_unit,
      dimensions,
      1
    from candidates
    on conflict do nothing
    returning occurred_at
  )
  select count(*),max(occurred_at)
  into v_inserted,v_max_inserted
  from inserted;

  if not v_is_backfill then
    select exists(
      select 1
      from public.analytics_event_feed_v1 f
      where f.organization_id=p_organization_id
        and f.occurred_at>=v_base_start
        and f.occurred_at<v_window_end
        and not exists (
          select 1
          from public.analytics_warehouse_facts w
          where w.organization_id=f.organization_id
            and w.source_table=f.source_table
            and w.source_event_id=f.event_id
            and w.event_name=f.event_name
            and w.event_version=f.event_version
        )
    ) into v_remaining;

    if v_remaining then
      v_new_complete:=coalesce(
        v_checkpoint.last_complete_through,
        v_base_start
      );
    else
      v_new_complete:=v_window_end;
    end if;
  else
    v_new_complete:=v_checkpoint.last_complete_through;
  end if;

  select max(w.occurred_at)
  into v_last_source_event_at
  from public.analytics_warehouse_facts w
  where w.organization_id=p_organization_id;

  insert into public.analytics_warehouse_checkpoints(
    organization_id,
    projection_version,
    last_complete_through,
    last_source_event_at,
    last_attempt_at,
    last_success_at,
    last_inserted_count,
    lookback_seconds,
    last_backfill_from,
    last_backfill_to,
    updated_at
  )
  values(
    p_organization_id,
    1,
    v_new_complete,
    v_last_source_event_at,
    now(),
    now(),
    v_inserted,
    v_lookback_seconds,
    case when v_is_backfill then p_backfill_from else null end,
    case when v_is_backfill then v_end else null end,
    now()
  )
  on conflict(organization_id) do update
  set
    projection_version=1,
    last_complete_through=case
      when v_is_backfill
        then analytics_warehouse_checkpoints.last_complete_through
      else excluded.last_complete_through
    end,
    last_source_event_at=excluded.last_source_event_at,
    last_attempt_at=excluded.last_attempt_at,
    last_success_at=excluded.last_success_at,
    last_inserted_count=excluded.last_inserted_count,
    lookback_seconds=excluded.lookback_seconds,
    last_backfill_from=case
      when v_is_backfill then excluded.last_backfill_from
      else analytics_warehouse_checkpoints.last_backfill_from
    end,
    last_backfill_to=case
      when v_is_backfill then excluded.last_backfill_to
      else analytics_warehouse_checkpoints.last_backfill_to
    end,
    updated_at=excluded.updated_at;

  return jsonb_build_object(
    'organizationId',p_organization_id,
    'mode',case when v_is_backfill then 'BACKFILL' else 'INCREMENTAL' end,
    'windowStart',v_window_start,
    'windowEnd',v_window_end,
    'inserted',v_inserted,
    'remainingInWindow',v_remaining,
    'lastInsertedOccurredAt',v_max_inserted,
    'lastCompleteThrough',v_new_complete,
    'lastSourceEventAt',v_last_source_event_at,
    'caughtUp',(
      not v_is_backfill
      and not v_remaining
      and v_new_complete>=v_end
    ),
    'lagSeconds',case
      when v_is_backfill or v_new_complete is null then null
      else greatest(0,extract(epoch from (v_end-v_new_complete)))::bigint
    end
  );
end;
$$;

revoke all on function public.sync_analytics_warehouse_v1(uuid,timestamptz,timestamptz,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.sync_analytics_warehouse_v1(uuid,timestamptz,timestamptz,integer)
  to service_role;

comment on function public.sync_analytics_warehouse_v1(uuid,timestamptz,timestamptz,integer) is
  'Idempotently projects bounded canonical analytics_event_feed_v1 evidence into the rebuildable analytics warehouse. Automatic windows advance at most 7 days; explicit backfills are capped at 31 days.';

create or replace function public.read_analytics_warehouse_v1(
  p_organization_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_event_names text[] default null,
  p_tenant_business_id uuid default null,
  p_branch_id uuid default null,
  p_limit integer default 5000
)
returns table (
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  event_id text,
  event_name text,
  event_version integer,
  source_table text,
  source_event_type text,
  evidence_class text,
  entity_type text,
  entity_id text,
  lead_id uuid,
  conversation_id uuid,
  occurred_at timestamptz,
  numeric_value numeric,
  numeric_unit text,
  dimensions jsonb,
  projected_at timestamptz
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,5000),1),10000);
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'trusted analytics warehouse reader required';
  end if;
  if p_organization_id is null or p_start_at is null or p_end_at is null then
    raise exception 'organization and bounded time window are required';
  end if;
  if p_end_at<=p_start_at then
    raise exception 'analytics warehouse window is invalid';
  end if;
  if p_end_at-p_start_at>interval '366 days' then
    raise exception 'analytics warehouse window exceeds 366 days';
  end if;
  if p_event_names is not null and cardinality(p_event_names)>64 then
    raise exception 'too many event filters';
  end if;

  return query
  select
    w.organization_id,
    w.tenant_business_id,
    w.branch_id,
    w.source_event_id,
    w.event_name,
    w.event_version,
    w.source_table,
    w.source_event_type,
    w.evidence_class,
    w.entity_type,
    w.entity_id,
    w.lead_id,
    w.conversation_id,
    w.occurred_at,
    w.numeric_value,
    w.numeric_unit,
    w.dimensions,
    w.projected_at
  from public.analytics_warehouse_facts w
  where w.organization_id=p_organization_id
    and w.occurred_at>=p_start_at
    and w.occurred_at<p_end_at
    and (p_event_names is null or w.event_name=any(p_event_names))
    and (p_tenant_business_id is null or w.tenant_business_id=p_tenant_business_id)
    and (p_branch_id is null or w.branch_id=p_branch_id)
  order by w.occurred_at,w.source_table,w.source_event_id,w.event_name
  limit v_limit;
end;
$$;

revoke all on function public.read_analytics_warehouse_v1(uuid,timestamptz,timestamptz,text[],uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.read_analytics_warehouse_v1(uuid,timestamptz,timestamptz,text[],uuid,uuid,integer)
  to service_role;

comment on function public.read_analytics_warehouse_v1(uuid,timestamptz,timestamptz,text[],uuid,uuid,integer) is
  'Bounded service-only warehouse reader. Reads derived analytics facts and never executes arbitrary OLTP SQL.';

create or replace view public.analytics_warehouse_health_v1
with (security_invoker=true)
as
select
  o.id as organization_id,
  count(w.organization_id)::bigint as fact_count,
  min(w.occurred_at) as first_fact_at,
  max(w.occurred_at) as last_fact_at,
  c.last_complete_through,
  c.last_source_event_at,
  c.last_attempt_at,
  c.last_success_at,
  c.last_inserted_count,
  c.lookback_seconds,
  c.last_backfill_from,
  c.last_backfill_to,
  case
    when c.last_complete_through is null then null
    else greatest(0,extract(epoch from (now()-c.last_complete_through)))::bigint
  end as freshness_lag_seconds
from public.organizations o
left join public.analytics_warehouse_checkpoints c
  on c.organization_id=o.id
left join public.analytics_warehouse_facts w
  on w.organization_id=o.id
group by
  o.id,
  c.last_complete_through,
  c.last_source_event_at,
  c.last_attempt_at,
  c.last_success_at,
  c.last_inserted_count,
  c.lookback_seconds,
  c.last_backfill_from,
  c.last_backfill_to;

revoke all on table public.analytics_warehouse_health_v1
  from public,anon,authenticated,service_role;
grant select on table public.analytics_warehouse_health_v1
  to service_role;

comment on view public.analytics_warehouse_health_v1 is
  'Service-only warehouse freshness/volume projection. Health metadata is derived operational evidence, not business truth.';