\set ON_ERROR_STOP on

-- DATA-ATTRIBUTION V2 controlled PostgreSQL 17 acceptance.
-- Reuses the canonical Marketing attribution fixtures plus Booking catalog
-- fixtures created earlier in the disposable CI chain. No Production fixture.

do $data_attribution_v2_structure$
declare
  fn_oid oid;
  result_contract text;
begin
  select p.oid into fn_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_observational_attribution_v2'
    and pg_get_function_identity_arguments(p.oid)=
      'p_organization_id uuid, p_outcome_type text, p_model text, p_lookback_days integer, p_limit integer';

  if fn_oid is null then
    raise exception 'DATA-ATTRIBUTION V2 function missing';
  end if;

  if (select prosecdef from pg_proc where oid=fn_oid) then
    raise exception 'DATA-ATTRIBUTION V2 must remain SECURITY INVOKER';
  end if;

  if has_function_privilege('anon',fn_oid,'EXECUTE') then
    raise exception 'anon must not execute DATA-ATTRIBUTION V2';
  end if;
  if not has_function_privilege('authenticated',fn_oid,'EXECUTE')
     or not has_function_privilege('service_role',fn_oid,'EXECUTE') then
    raise exception 'trusted attribution read grants missing';
  end if;

  select pg_get_function_result(fn_oid) into result_contract;
  if result_contract not ilike '%outcome_value_class%'
     or result_contract not ilike '%collected_money_evidence%'
     or result_contract not ilike '%causal_claim%'
  then
    raise exception 'DATA-ATTRIBUTION V2 evidence contract is incomplete';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p','m')
      and c.relname ~ '^data_attribution|^attribution_(facts|events|touchpoints|conversions)'
  ) then
    raise exception 'DATA-ATTRIBUTION V2 created a parallel persisted attribution truth';
  end if;

  if to_regclass('public.crm_deals_data_attribution_won_idx') is null
     or to_regclass('public.booking_events_data_attribution_completed_idx') is null
     or to_regclass('public.quote_events_data_attribution_accepted_idx') is null
     or to_regclass('public.order_events_data_attribution_fulfilled_idx') is null
     or to_regclass('public.payment_transactions_data_attribution_captured_idx') is null
  then
    raise exception 'DATA-ATTRIBUTION V2 bounded outcome indexes missing';
  end if;

  if to_regprocedure('public.get_marketing_attribution(uuid,text,integer,integer)') is null then
    raise exception 'DATA-ATTRIBUTION V2 removed the V1 compatibility function';
  end if;
end;
$data_attribution_v2_structure$;

do $data_attribution_v2_preconditions$
begin
  if not exists (
    select 1
    from public.crm_deals
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and id='60000000-0000-0000-0000-000000000c92'
      and state='WON'
      and won_at is not null
      and lead_id='20000000-0000-0000-0000-000000000c92'
  ) then
    raise exception 'DATA-ATTRIBUTION V2 expects canonical WON Deal fixture from V1 smoke';
  end if;

  if (
    select count(*)
    from public.outreach_messages
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and lead_id='20000000-0000-0000-0000-000000000c92'
      and direction='OUTBOUND'
      and sent_at is not null
      and campaign_id is not null
  )<2 then
    raise exception 'DATA-ATTRIBUTION V2 expects real sent Marketing touch fixtures';
  end if;
end;
$data_attribution_v2_preconditions$;

reset role;
set role service_role;

do $data_attribution_v2_booking_fixture$
declare
  v_person uuid;
  v_booking uuid:='74000000-0000-4000-8000-000000000c01';
begin
  select person_id into v_person
  from public.leads
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and id='20000000-0000-0000-0000-000000000c92';

  if v_person is null or not exists (
    select 1 from public.crm_people
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and id=v_person
      and status='ACTIVE'
  ) then
    raise exception 'Marketing Lead must resolve to an active CRM Person for Booking attribution smoke';
  end if;

  perform set_config('app.booking_lifecycle_mutation','allowed',true);

  insert into public.bookings(
    id,organization_id,booking_reference,person_id,lead_id,service_id,
    branch_id,staff_user_id,starts_at,ends_at,occupied_starts_at,occupied_ends_at,
    status,metadata,created_by_user_id,updated_by_user_id,
    confirmed_at,completed_at,created_at,updated_at
  ) values (
    v_booking,
    '00000000-0000-0000-0000-000000000c01',
    'BK-ATTRIBUTION01',
    v_person,
    '20000000-0000-0000-0000-000000000c92',
    'booking_ci_service',
    null,
    '00000000-0000-0000-0000-00000000c001',
    now()-interval '2 hours',
    now()-interval '1 hour',
    now()-interval '2 hours 10 minutes',
    now()-interval '50 minutes',
    'COMPLETED',
    '{"source":"DATA_ATTRIBUTION_V2_CI"}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c001',
    now()-interval '90 minutes',
    now()-interval '5 minutes',
    now()-interval '3 hours',
    now()-interval '5 minutes'
  );

  insert into public.booking_lifecycle_events(
    id,organization_id,booking_id,transition,from_status,to_status,
    reason,actor_user_id,request_key,request_hash,evidence,result_payload,occurred_at
  ) values (
    '74000000-0000-4000-8000-000000000c02',
    '00000000-0000-0000-0000-000000000c01',
    v_booking,
    'COMPLETED','CONFIRMED','COMPLETED',
    'DATA attribution controlled outcome',
    '00000000-0000-0000-0000-00000000c001',
    'data-attribution-v2-booking-completed',
    md5('data-attribution-v2-booking-completed'),
    '{"source":"CONTROLLED_CI"}'::jsonb,
    jsonb_build_object('bookingId',v_booking,'status','COMPLETED'),
    now()-interval '5 minutes'
  );

  perform set_config('app.booking_lifecycle_mutation','0',true);
end;
$data_attribution_v2_booking_fixture$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $data_attribution_v2_models$
declare
  v_first uuid;
  v_last uuid;
  v_second uuid;
  v_linear_count integer;
  v_linear_credit integer;
begin
  select id into v_second
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-attribution-second-campaign';

  select campaign_id into v_first
  from public.get_observational_attribution_v2(
    '00000000-0000-0000-0000-000000000c01',
    'DEAL_WON','FIRST_TOUCH',30,200
  )
  where outcome_id='60000000-0000-0000-0000-000000000c92';

  if v_first is distinct from (
    select id from public.campaigns
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and last_request_key='marketing-campaign-create'
  ) then
    raise exception 'DATA-ATTRIBUTION V2 FIRST_TOUCH did not select earliest eligible campaign';
  end if;

  select campaign_id into v_last
  from public.get_observational_attribution_v2(
    '00000000-0000-0000-0000-000000000c01',
    'DEAL_WON','LAST_TOUCH',30,200
  )
  where outcome_id='60000000-0000-0000-0000-000000000c92';

  if v_last is distinct from v_second then
    raise exception 'DATA-ATTRIBUTION V2 LAST_TOUCH did not select latest eligible campaign';
  end if;

  select count(*),sum(credit_bps)
  into v_linear_count,v_linear_credit
  from public.get_observational_attribution_v2(
    '00000000-0000-0000-0000-000000000c01',
    'DEAL_WON','LINEAR',30,200
  )
  where outcome_id='60000000-0000-0000-0000-000000000c92';

  if v_linear_count<>2 or v_linear_credit<>10000 then
    raise exception 'DATA-ATTRIBUTION V2 LINEAR credit is not exactly 10000 bps';
  end if;

  if not exists (
    select 1
    from public.get_observational_attribution_v2(
      '00000000-0000-0000-0000-000000000c01',
      'DEAL_WON','LAST_TOUCH',30,200
    )
    where outcome_id='60000000-0000-0000-0000-000000000c92'
      and outcome_value_class='SALES_VALUE'
      and causal_claim=false
      and collected_money_evidence=false
      and evidence_basis @> array['CANONICAL_WON_DEAL','SENT_MARKETING_TOUCHPOINT']::text[]
  ) then
    raise exception 'DATA-ATTRIBUTION V2 Deal evidence semantics failed';
  end if;
end;
$data_attribution_v2_models$;

do $data_attribution_v2_booking$
declare
  v_second uuid;
begin
  select id into v_second
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-attribution-second-campaign';

  if not exists (
    select 1
    from public.get_observational_attribution_v2(
      '00000000-0000-0000-0000-000000000c01',
      'BOOKING_COMPLETED','LAST_TOUCH',30,200
    )
    where outcome_id='74000000-0000-4000-8000-000000000c01'
      and campaign_id=v_second
      and lead_id='20000000-0000-0000-0000-000000000c92'
      and lead_link_basis='DIRECT_BOOKING_LEAD'
      and outcome_value is null
      and outcome_currency is null
      and outcome_value_class='NON_MONETARY'
      and causal_claim=false
      and collected_money_evidence=false
      and evidence_basis @> array['BOOKING_COMPLETED_LIFECYCLE_EVENT','DIRECT_BOOKING_LEAD']::text[]
  ) then
    raise exception 'DATA-ATTRIBUTION V2 Booking outcome attribution failed';
  end if;
end;
$data_attribution_v2_booking$;

do $data_attribution_v2_strict_payment_linkage$
begin
  -- PAYMENT-CORE controlled fixtures live in a separate Organization and have no
  -- Deal/Booking-to-Lead marketing linkage. The attribution reader must return
  -- zero instead of inferring from person, invoice or payment status.
  if exists (
    select 1
    from public.get_observational_attribution_v2(
      '00000000-0000-0000-0000-00000000c701',
      'PAYMENT_CAPTURED','LAST_TOUCH',180,500
    )
  ) then
    raise exception 'DATA-ATTRIBUTION V2 fabricated Payment attribution without exact Lead linkage';
  end if;
end;
$data_attribution_v2_strict_payment_linkage$;

do $data_attribution_v2_bounds$
begin
  begin
    perform * from public.get_observational_attribution_v2(
      '00000000-0000-0000-0000-000000000c01','MAGIC','LAST_TOUCH',30,10
    );
    raise exception 'Unsupported outcome type was accepted';
  exception when others then
    if sqlerrm not like 'unsupported attribution outcome type%' then raise; end if;
  end;

  begin
    perform * from public.get_observational_attribution_v2(
      '00000000-0000-0000-0000-000000000c01','DEAL_WON','MAGIC',30,10
    );
    raise exception 'Unsupported model was accepted';
  exception when others then
    if sqlerrm not like 'unsupported attribution model%' then raise; end if;
  end;

  begin
    perform * from public.get_observational_attribution_v2(
      '00000000-0000-0000-0000-000000000c01','ALL','LAST_TOUCH',365,10
    );
    raise exception 'Unbounded lookback was accepted';
  exception when others then
    if sqlerrm not like 'attribution lookback must be between 1 and 180 days%' then raise; end if;
  end;
end;
$data_attribution_v2_bounds$;

do $data_attribution_v2_compatibility$
begin
  if not exists (
    select 1
    from public.get_marketing_attribution(
      '00000000-0000-0000-0000-000000000c01','LAST_TOUCH',30,200
    )
    where deal_id='60000000-0000-0000-0000-000000000c92'
  ) then
    raise exception 'DATA-ATTRIBUTION V2 broke V1 Marketing Attribution compatibility';
  end if;
end;
$data_attribution_v2_compatibility$;

reset role;
select set_config('request.jwt.claim.sub','',false);