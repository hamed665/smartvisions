\set ON_ERROR_STOP on

-- BOOKING-CATALOG, BOOKING-AVAILABILITY and BOOKING-LIFECYCLE smoke run first.
-- This file uses only disposable CI authorities and never calls a provider.

reset role;

-- Seed only the disposable CI conversation as the database owner. This is test
-- fixture setup, not BOOKING-AI runtime authority. The runtime itself remains
-- exercised as service_role and no broader sales_conversations grant is needed
-- merely to make this smoke pass.
do $booking_ai_conversation_fixture$
declare
  v_person uuid;
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;
  if v_person is null then raise exception 'BOOKING-AI Person fixture missing'; end if;

  insert into public.sales_conversations(
    id,organization_id,lead_id,channel,person_id,last_message_at
  ) values (
    '00000000-0000-0000-0000-00000000ba01',
    '00000000-0000-0000-0000-000000000c01',
    null,'EMAIL',v_person,now()
  )
  on conflict (id) do update set person_id=excluded.person_id,last_message_at=excluded.last_message_at;
end;
$booking_ai_conversation_fixture$;

set role service_role;

do $booking_ai_fixture_and_governed_lifecycle$
declare
  v_person uuid;
  v_day date:=(now() at time zone 'Asia/Muscat')::date+12;
  v_slot timestamptz;
  v_new_slot timestamptz;
  v_result jsonb;
  v_booking_id uuid;
  v_deposit jsonb;
  v_reconcile jsonb;
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;
  if v_person is null then raise exception 'BOOKING-AI Person fixture missing'; end if;

  -- Extend only the disposable service policy. Deposit requirement is policy
  -- truth; no payment intent/link/ledger is created here.
  perform public.configure_service_booking_catalog(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    true,60,15,10,2,
    'EXPLICIT_BRANCHES','EXPLICIT_STAFF',
    '{}'::text[],
    '{
      "minimumNoticeMinutes":120,
      "maximumAdvanceDays":90,
      "cancellationNoticeMinutes":240,
      "slotIncrementMinutes":30,
      "allowCustomerCancel":true,
      "allowCustomerReschedule":true,
      "requiresConfirmation":false,
      "reminderMinutesBefore":120,
      "depositRequired":true,
      "depositPercent":25
    }'::jsonb,
    array['00000000-0000-0000-0000-00000000b703'::uuid],
    array[
      '00000000-0000-0000-0000-00000000c001'::uuid,
      '00000000-0000-0000-0000-00000000c003'::uuid
    ],
    '[{"resourceId":"00000000-0000-0000-0000-00000000b704","quantity":1}]'::jsonb,
    'booking-ai-ci-catalog-policy-1'
  );

  v_deposit:=public.get_booking_deposit_requirement(
    '00000000-0000-0000-0000-000000000c01','booking_ci_service'
  );
  if coalesce((v_deposit->>'required')::boolean,false) is distinct from true
     or (v_deposit->>'percent')::integer<>25
     or coalesce((v_deposit->>'paymentExecutionAvailable')::boolean,true) is distinct from false
     or v_deposit->>'paymentExecutionDependency'<>'PAYMENT-CORE'
  then
    raise exception 'BOOKING-AI deposit policy contract failed: %',v_deposit;
  end if;

  v_slot:=(v_day::timestamp+time '14:00') at time zone 'Asia/Muscat';
  v_new_slot:=((v_day+1)::timestamp+time '14:00') at time zone 'Asia/Muscat';

  v_result:=public.execute_booking_ai_create(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000ba01',
    v_person,null,'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,'booking-ai-ci-create-1',
    '{"explicitCustomerRequest":true,"sourceMessageId":"ci-inbound-1","source":"CI"}'::jsonb
  );
  if v_result->>'status'<>'CONFIRMED' then
    raise exception 'BOOKING-AI create did not pass canonical lifecycle: %',v_result;
  end if;
  v_booking_id:=(v_result->>'bookingId')::uuid;

  if not exists(
    select 1 from public.bookings
    where id=v_booking_id
      and organization_id='00000000-0000-0000-0000-000000000c01'
      and created_by_user_id is null
      and updated_by_user_id is null
      and status='CONFIRMED'
  ) then
    raise exception 'BOOKING-AI system actor was fabricated as a human member';
  end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and entity_type='booking'
      and entity_id=v_booking_id::text
      and action='BOOKING_CONFIRMED'
      and actor_type='SYSTEM'
      and actor_id='booking_ai'
  ) then
    raise exception 'BOOKING-AI canonical SYSTEM lifecycle audit is missing';
  end if;

  v_result:=public.execute_booking_ai_reschedule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000ba01',
    v_booking_id,
    '00000000-0000-0000-0000-00000000b703',
    v_new_slot,'CUSTOMER_REQUEST_VIA_AI',
    'booking-ai-ci-reschedule-1',
    '{"explicitCustomerRequest":true,"sourceMessageId":"ci-inbound-2","source":"CI"}'::jsonb
  );
  if v_result->>'status'<>'RESCHEDULED'
     or (v_result->>'startsAt')::timestamptz<>v_new_slot
  then raise exception 'BOOKING-AI reschedule failed canonical lifecycle: %',v_result; end if;

  v_result:=public.execute_booking_ai_cancel(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000ba01',
    v_booking_id,'CUSTOMER_REQUEST_VIA_AI',
    'booking-ai-ci-cancel-1',
    '{"explicitCustomerRequest":true,"sourceMessageId":"ci-inbound-3","source":"CI"}'::jsonb
  );
  if v_result->>'status'<>'CANCELED' then
    raise exception 'BOOKING-AI cancel failed canonical lifecycle: %',v_result;
  end if;

  -- Lifecycle events are the durable producer evidence. Reconciliation uses
  -- the existing Automation Runtime; no Booking queue/outbox is created.
  v_reconcile:=public.reconcile_booking_automation_events(100);
  if coalesce((v_reconcile->>'processed')::integer,0)<1 then
    raise exception 'BOOKING-AI automation lifecycle reconciler processed nothing';
  end if;
  v_reconcile:=public.reconcile_booking_automation_events(100);
  if coalesce((v_reconcile->>'processed')::integer,-1)<>0 then
    raise exception 'BOOKING-AI lifecycle event reconciliation is not idempotent: %',v_reconcile;
  end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='BOOKING_AUTOMATION_EVENT_PROJECTED'
      and entity_id=v_booking_id::text
  ) then
    raise exception 'BOOKING-AI automation projection receipt missing';
  end if;
end;
$booking_ai_fixture_and_governed_lifecycle$;

do $booking_ai_catalog_and_condition_contracts$
declare
  v_facts jsonb;
  v_booking_id uuid;
begin
  if exists(
    select 1 from public.automation_trigger_catalog
    where trigger_key in ('BOOKING_CREATED','BOOKING_CONFIRMED','BOOKING_CANCELLED')
      and (availability<>'AVAILABLE' or required_work_package is not null)
  ) then raise exception 'Canonical Booking triggers were not promoted'; end if;

  if (
    select count(*) from public.tool_action_registry
    where action_key in (
      'BOOKING_CHECK_AVAILABILITY','BOOKING_CREATE','BOOKING_RESCHEDULE',
      'BOOKING_CANCEL','BOOKING_SCHEDULE_REMINDER','BOOKING_ESCALATE',
      'BOOKING_DEPOSIT_REQUIREMENT'
    )
      and availability='AVAILABLE'
      and metadata->'executionSurfaces' @> '["AI"]'::jsonb
  )<>7 then
    raise exception 'BOOKING-AI Tool Registry contracts incomplete';
  end if;

  begin
    perform public.validate_automation_actions(
      '[{"key":"BOOKING_CREATE","config":{"serviceId":"booking_ci_service"}}]'::jsonb,
      true
    );
    raise exception 'AI-only Booking action was publishable by Automation Builder';
  exception when others then
    if sqlerrm not like 'Automation action is not available on AUTOMATION execution surface:%' then raise; end if;
  end;

  select id into v_booking_id
  from public.bookings
  where organization_id='00000000-0000-0000-0000-000000000c01'
  order by updated_at desc
  limit 1;
  v_facts:=public.automation_condition_subject_facts(
    '00000000-0000-0000-0000-000000000c01','BOOKING',v_booking_id
  );
  if v_facts is null
     or v_facts->>'BOOKING.STATUS' is null
     or v_facts->>'BOOKING.SERVICE_ID'<>'booking_ci_service'
  then raise exception 'BOOKING-AI condition facts are unavailable: %',v_facts; end if;

  if public.automation_trigger_expected_condition_subject('BOOKING_CONFIRMED')<>'BOOKING' then
    raise exception 'BOOKING trigger condition subject contract is not canonical';
  end if;

  begin
    perform public.validate_service_booking_rules(
      '{"depositRequired":true,"depositPercent":25,"depositAmount":10}'::jsonb
    );
    raise exception 'Ambiguous deposit policy was accepted';
  exception when others then
    if sqlerrm not like 'Deposit policy requires exactly one%' then raise; end if;
  end;
end;
$booking_ai_catalog_and_condition_contracts$;

do $booking_ai_security_contract$
begin
  if exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'reconcile_booking_automation_events','get_booking_deposit_requirement',
        'execute_booking_ai_create','execute_booking_ai_reschedule',
        'execute_booking_ai_cancel','record_booking_ai_tool_audit'
      )
      and p.prosecdef
  ) then raise exception 'BOOKING-AI unexpectedly uses SECURITY DEFINER'; end if;

  if (select is_nullable from information_schema.columns
      where table_schema='public' and table_name='bookings' and column_name='created_by_user_id')<>'YES'
     or (select is_nullable from information_schema.columns
      where table_schema='public' and table_name='bookings' and column_name='updated_by_user_id')<>'YES'
  then raise exception 'BOOKING-AI SYSTEM actor columns remain falsely human-required'; end if;
end;
$booking_ai_security_contract$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

do $booking_ai_browser_denial$
begin
  if has_function_privilege(
    'authenticated',
    'public.execute_booking_ai_create(uuid,uuid,uuid,uuid,text,uuid,timestamptz,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.execute_booking_ai_cancel(uuid,uuid,uuid,text,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.reconcile_booking_automation_events(integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.get_booking_deposit_requirement(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Browser can execute trusted BOOKING-AI server authority';
  end if;
end;
$booking_ai_browser_denial$;

reset role;
select set_config('request.jwt.claim.sub','',false);
