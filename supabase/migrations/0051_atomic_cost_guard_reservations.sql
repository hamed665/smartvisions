-- Serialize paid-provider budget claims inside the canonical usage_events ledger.
-- A reservation is a provisional usage row, not a parallel billing subsystem.
-- This closes the check-then-call race where concurrent provider requests could
-- all observe the same remaining budget before any of them recorded usage.

create unique index if not exists usage_events_org_reservation_key_uidx
  on public.usage_events (organization_id, ((metadata ->> 'reservation_key')))
  where metadata ? 'reservation_key';

-- Runtime settlement only needs to mutate accounting columns on rows it created.
grant update (cost_usd, input_tokens, output_tokens, units, metadata)
  on table public.usage_events to service_role;

create or replace function public.reserve_cost_guard_usage(
  p_organization_id uuid,
  p_provider text,
  p_operation text,
  p_reservation_key text,
  p_reserved_usd numeric,
  p_lead_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ttl_seconds integer default 900
)
returns table(event_id uuid, reserved_usd numeric, replayed boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_provider text := upper(trim(coalesce(p_provider, '')));
  v_key text := trim(coalesce(p_reservation_key, ''));
  v_reserved numeric := greatest(0, coalesce(p_reserved_usd, 0));
  v_month_spend numeric := 0;
  v_provider_spend numeric := 0;
  v_month_budget numeric := 0;
  v_provider_budget numeric := 0;
  v_event public.usage_events%rowtype;
  v_settings public.cost_guard_settings%rowtype;
  v_month_start timestamptz := date_trunc('month', now());
begin
  if p_organization_id is null then
    raise exception 'organizationId is required for a cost reservation';
  end if;
  if v_provider = '' or trim(coalesce(p_operation, '')) = '' then
    raise exception 'provider and operation are required for a cost reservation';
  end if;
  if v_key = '' or length(v_key) > 200 then
    raise exception 'reservation key must be 1..200 characters';
  end if;
  if v_reserved <= 0 then
    raise exception 'reserved cost must be greater than zero';
  end if;

  -- One organization-level transaction lock makes budget check + reservation
  -- insertion atomic across concurrent serverless invocations.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  -- An abandoned provider reservation is ambiguous: the request may have left
  -- the process and still incurred provider cost. Mark it STALE for operations,
  -- but deliberately keep the reserved amount counted until explicit settlement
  -- or release. Fail-closed accounting is safer than silently under-counting.
  update public.usage_events
     set metadata = (metadata - 'reservation_expires_at') || jsonb_build_object(
           'accounting_state', 'STALE',
           'stale_at', now(),
           'reconciliation_required', true
         )
   where organization_id = p_organization_id
     and metadata ->> 'accounting_state' = 'RESERVED'
     and (metadata ->> 'reservation_expires_at')::timestamptz <= now();

  select * into v_event
    from public.usage_events
   where organization_id = p_organization_id
     and metadata ->> 'reservation_key' = v_key
   limit 1;

  if found then
    return query select v_event.id, v_event.cost_usd, true;
    return;
  end if;

  select * into v_settings
    from public.cost_guard_settings
   where organization_id = p_organization_id;
  if not found then
    raise exception 'Cost Guard settings are missing; paid operation blocked';
  end if;

  v_month_budget := greatest(0, coalesce(v_settings.monthly_total_budget_usd, 0));
  v_provider_budget := case v_provider
    when 'OPENAI' then greatest(0, coalesce(v_settings.openai_budget_usd, 0))
    when 'GOOGLE_PLACES' then greatest(0, coalesce(v_settings.google_places_budget_usd, 0))
    when 'EMAIL' then greatest(0, coalesce(v_settings.email_budget_usd, 0))
    when 'WHATSAPP' then greatest(0, coalesce(v_settings.whatsapp_budget_usd, 0))
    else greatest(0, coalesce(v_settings.reserve_budget_usd, 0))
  end;

  select coalesce(sum(cost_usd), 0)
    into v_month_spend
    from public.usage_events
   where organization_id = p_organization_id
     and created_at >= v_month_start;

  select coalesce(sum(cost_usd), 0)
    into v_provider_spend
    from public.usage_events
   where organization_id = p_organization_id
     and upper(provider) = v_provider
     and created_at >= v_month_start;

  if v_month_budget <= 0 or v_month_spend + v_reserved > v_month_budget then
    raise exception 'Cost Guard monthly budget would be exceeded';
  end if;
  if v_provider_budget <= 0 or v_provider_spend + v_reserved > v_provider_budget then
    raise exception '% provider budget would be exceeded', v_provider;
  end if;

  insert into public.usage_events (
    organization_id,
    provider,
    operation,
    cost_usd,
    lead_id,
    metadata
  ) values (
    p_organization_id,
    v_provider,
    trim(p_operation),
    v_reserved,
    p_lead_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'accounting_state', 'RESERVED',
      'reservation_key', v_key,
      'reservation_expires_at', now() + make_interval(secs => greatest(60, least(coalesce(p_ttl_seconds, 900), 3600))),
      'pricing_status', 'CONSERVATIVE_PRECALL_RESERVATION'
    )
  ) returning * into v_event;

  return query select v_event.id, v_event.cost_usd, false;
end;
$$;

create or replace function public.finalize_cost_guard_usage(
  p_organization_id uuid,
  p_reservation_key text,
  p_state text,
  p_actual_cost_usd numeric default 0,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_units numeric default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(event_id uuid, final_cost_usd numeric, replayed boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_key text := trim(coalesce(p_reservation_key, ''));
  v_state text := upper(trim(coalesce(p_state, '')));
  v_event public.usage_events%rowtype;
  v_cost numeric;
begin
  if p_organization_id is null or v_key = '' then
    raise exception 'organizationId and reservation key are required';
  end if;
  if v_state not in ('SETTLED', 'RELEASED') then
    raise exception 'final reservation state must be SETTLED or RELEASED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select * into v_event
    from public.usage_events
   where organization_id = p_organization_id
     and metadata ->> 'reservation_key' = v_key
   for update;
  if not found then
    raise exception 'Cost reservation not found';
  end if;

  if v_event.metadata ->> 'accounting_state' = 'SETTLED' then
    return query select v_event.id, v_event.cost_usd, true;
    return;
  end if;
  if v_event.metadata ->> 'accounting_state' = 'RELEASED' and v_state = 'RELEASED' then
    return query select v_event.id, v_event.cost_usd, true;
    return;
  end if;

  v_cost := case when v_state = 'SETTLED' then greatest(0, coalesce(p_actual_cost_usd, 0)) else 0 end;

  update public.usage_events
     set cost_usd = v_cost,
         input_tokens = case when v_state = 'SETTLED' then p_input_tokens else input_tokens end,
         output_tokens = case when v_state = 'SETTLED' then p_output_tokens else output_tokens end,
         units = case when v_state = 'SETTLED' then p_units else units end,
         metadata = (metadata - 'reservation_expires_at' - 'stale_at' - 'reconciliation_required')
           || coalesce(p_metadata, '{}'::jsonb)
           || jsonb_build_object(
             'accounting_state', v_state,
             case when v_state = 'SETTLED' then 'settled_at' else 'released_at' end,
             now()
           )
   where id = v_event.id
   returning * into v_event;

  return query select v_event.id, v_event.cost_usd, false;
end;
$$;

-- The canonical monthly aggregate includes RESERVED and STALE conservative cost.
-- Ambiguous provider calls therefore remain budgeted until explicit reconciliation.
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

revoke all on function public.reserve_cost_guard_usage(uuid, text, text, text, numeric, uuid, jsonb, integer) from public;
revoke all on function public.reserve_cost_guard_usage(uuid, text, text, text, numeric, uuid, jsonb, integer) from anon;
revoke all on function public.reserve_cost_guard_usage(uuid, text, text, text, numeric, uuid, jsonb, integer) from authenticated;
grant execute on function public.reserve_cost_guard_usage(uuid, text, text, text, numeric, uuid, jsonb, integer) to service_role;

revoke all on function public.finalize_cost_guard_usage(uuid, text, text, numeric, integer, integer, numeric, jsonb) from public;
revoke all on function public.finalize_cost_guard_usage(uuid, text, text, numeric, integer, integer, numeric, jsonb) from anon;
revoke all on function public.finalize_cost_guard_usage(uuid, text, text, numeric, integer, integer, numeric, jsonb) from authenticated;
grant execute on function public.finalize_cost_guard_usage(uuid, text, text, numeric, integer, integer, numeric, jsonb) to service_role;

revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from public;
revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from anon;
revoke all on function public.get_cost_guard_monthly_usage(uuid, timestamptz) from authenticated;
grant execute on function public.get_cost_guard_monthly_usage(uuid, timestamptz) to service_role;
