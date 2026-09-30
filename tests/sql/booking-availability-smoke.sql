\set ON_ERROR_STOP on

-- BOOKING-CATALOG smoke runs immediately before this file and provides the
-- disposable Organization/Branch/Service/Resource authority used here.

set role service_role;

do $availability_catalog_extension$
declare
  v_windows jsonb:='[
    {"weekday":0,"start":"08:00","end":"18:00"},
    {"weekday":1,"start":"08:00","end":"18:00"},
    {"weekday":2,"start":"08:00","end":"18:00"},
    {"weekday":3,"start":"08:00","end":"18:00"},
    {"weekday":4,"start":"08:00","end":"18:00"},
    {"weekday":5,"start":"08:00","end":"18:00"},
    {"weekday":6,"start":"08:00","end":"18:00"}
  ]'::jsonb;
  v_result jsonb;
begin
  -- Two explicit staff let the smoke distinguish staff concurrency from
  -- service/resource capacity.
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
      "requiresConfirmation":false
    }'::jsonb,
    array['00000000-0000-0000-0000-00000000b703'::uuid],
    array[
      '00000000-0000-0000-0000-00000000c001'::uuid,
      '00000000-0000-0000-0000-00000000c003'::uuid
    ],
    '[{"resourceId":"00000000-0000-0000-0000-00000000b704","quantity":1}]'::jsonb,
    'booking-availability-ci-catalog-1'
  );

  v_result:=public.configure_booking_availability_calendar(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service','BUSINESS',
    '00000000-0000-0000-0000-00000000b703',
    null,null,'Asia/Muscat','ACTIVE',
    v_windows,'[]'::jsonb,
    'booking-availability-ci-business-1'
  );
  if coalesce((v_result->>'replayed')::boolean,true) then
    raise exception 'Initial business availability calendar was replayed';
  end if;

  perform public.configure_booking_availability_calendar(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service','STAFF',
    '00000000-0000-0000-0000-00000000b703',
    '00000000-0000-0000-0000-00000000c001',
    null,'Asia/Muscat','ACTIVE',
    v_windows,'[]'::jsonb,
    'booking-availability-ci-staff-owner-1'
  );

  perform public.configure_booking_availability_calendar(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service','STAFF',
    '00000000-0000-0000-0000-00000000b703',
    '00000000-0000-0000-0000-00000000c003',
    null,'Asia/Muscat','ACTIVE',
    v_windows,'[]'::jsonb,
    'booking-availability-ci-staff-agent-1'
  );

  perform public.configure_booking_availability_calendar(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service','RESOURCE',
    '00000000-0000-0000-0000-00000000b703',
    null,'00000000-0000-0000-0000-00000000b704',
    'Asia/Muscat','ACTIVE',
    v_windows,'[]'::jsonb,
    'booking-availability-ci-resource-1'
  );

  v_result:=public.configure_booking_availability_calendar(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service','BUSINESS',
    '00000000-0000-0000-0000-00000000b703',
    null,null,'Asia/Muscat','ACTIVE',
    v_windows,'[]'::jsonb,
    'booking-availability-ci-business-1'
  );
  if coalesce((v_result->>'replayed')::boolean,false) is distinct from true then
    raise exception 'Availability calendar replay was not detected';
  end if;

  begin
    perform public.configure_booking_availability_calendar(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'booking_ci_service','BUSINESS',
      '00000000-0000-0000-0000-00000000b703',
      null,null,'UTC','ACTIVE',
      v_windows,'[]'::jsonb,
      'booking-availability-ci-timezone-mismatch'
    );
    raise exception 'Branch calendar accepted non-canonical timezone';
  exception when others then
    if sqlerrm not like 'Booking availability branch calendar must use canonical branch timezone%' then raise; end if;
  end;
end;
$availability_catalog_extension$;

do $deterministic_slot_and_hold_conflicts$
declare
  v_day date:=(now() at time zone 'Asia/Muscat')::date+2;
  v_slot timestamptz;
  v_from timestamptz;
  v_to timestamptz;
  v_eval jsonb;
  v_hold1 jsonb;
  v_hold2 jsonb;
  v_replay jsonb;
begin
  v_slot:=(v_day::timestamp+time '10:00') at time zone 'Asia/Muscat';
  v_from:=(v_day::timestamp+time '08:00') at time zone 'Asia/Muscat';
  v_to:=(v_day::timestamp+time '18:00') at time zone 'Asia/Muscat';

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot
  );
  if coalesce((v_eval->>'available')::boolean,false) is distinct from true
     or (v_eval->>'remainingCapacity')::integer<>2
  then
    raise exception 'Expected deterministic slot capacity 2, got %',v_eval;
  end if;

  if not exists(
    select 1 from public.get_booking_availability(
      '00000000-0000-0000-0000-000000000c01',
      'booking_ci_service',
      '00000000-0000-0000-0000-00000000b703',
      v_from,v_to,100
    ) a
    where a.slot_start_at=v_slot
      and a.remaining_capacity=2
  ) then
    raise exception 'Deterministic availability list did not contain expected slot';
  end if;

  -- Reduce resource capacity only in the disposable CI fixture so resource
  -- conflict can be distinguished from service/staff capacity.
  update public.booking_resources
  set capacity=1
  where id='00000000-0000-0000-0000-00000000b704';

  v_hold1:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,10,'booking-availability-ci-hold-1',
    '{"source":"CI"}'::jsonb
  );

  if v_hold1->>'status'<>'ACTIVE' then
    raise exception 'Booking hold was not created';
  end if;

  v_replay:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,10,'booking-availability-ci-hold-1',
    '{"source":"CI"}'::jsonb
  );
  if coalesce((v_replay->>'replayed')::boolean,false) is distinct from true
     or v_replay->>'holdId'<>v_hold1->>'holdId'
  then
    raise exception 'Booking hold replay failed';
  end if;

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot
  );
  if v_eval->>'reason'<>'RESOURCE_CAPACITY_FULL' then
    raise exception 'Resource conflict was not enforced: %',v_eval;
  end if;

  perform public.release_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    (v_hold1->>'holdId')::uuid,
    'CI_RELEASE',
    'booking-availability-ci-release-1'
  );

  update public.booking_resources
  set capacity=2
  where id='00000000-0000-0000-0000-00000000b704';

  v_hold1:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,10,'booking-availability-ci-hold-2',
    '{}'::jsonb
  );
  v_hold2:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,10,'booking-availability-ci-hold-3',
    '{}'::jsonb
  );

  if v_hold1->>'staffUserId'=v_hold2->>'staffUserId' then
    raise exception 'Concurrent holds reused the same staff member';
  end if;

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot
  );
  if v_eval->>'reason'<>'SERVICE_CAPACITY_FULL' then
    raise exception 'Service capacity was not enforced after two holds: %',v_eval;
  end if;

  perform public.release_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    (v_hold1->>'holdId')::uuid,'CI_RELEASE',
    'booking-availability-ci-release-2'
  );
  perform public.release_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    (v_hold2->>'holdId')::uuid,'CI_RELEASE',
    'booking-availability-ci-release-3'
  );

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot
  );
  if coalesce((v_eval->>'available')::boolean,false) is distinct from true then
    raise exception 'Release did not restore availability: %',v_eval;
  end if;
end;
$deterministic_slot_and_hold_conflicts$;

do $hold_expiry_and_holiday$
declare
  v_day date:=(now() at time zone 'Asia/Muscat')::date+3;
  v_slot timestamptz;
  v_hold jsonb;
  v_expired integer;
  v_windows jsonb:='[
    {"weekday":0,"start":"08:00","end":"18:00"},
    {"weekday":1,"start":"08:00","end":"18:00"},
    {"weekday":2,"start":"08:00","end":"18:00"},
    {"weekday":3,"start":"08:00","end":"18:00"},
    {"weekday":4,"start":"08:00","end":"18:00"},
    {"weekday":5,"start":"08:00","end":"18:00"},
    {"weekday":6,"start":"08:00","end":"18:00"}
  ]'::jsonb;
  v_eval jsonb;
begin
  v_slot:=(v_day::timestamp+time '11:00') at time zone 'Asia/Muscat';
  v_hold:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,10,'booking-availability-ci-expire-1','{}'::jsonb
  );

  perform set_config('app.booking_availability_mutation','allowed',true);
  update public.booking_holds
  set expires_at=now()-interval '1 minute'
  where id=(v_hold->>'holdId')::uuid;
  perform set_config('app.booking_availability_mutation','0',true);

  v_expired:=public.expire_booking_holds(100);
  if v_expired<1 or not exists(
    select 1 from public.booking_holds
    where id=(v_hold->>'holdId')::uuid and status='EXPIRED'
  ) then
    raise exception 'Expired Booking hold was not reaped';
  end if;

  perform public.configure_booking_availability_calendar(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service','BUSINESS',
    '00000000-0000-0000-0000-00000000b703',
    null,null,'Asia/Muscat','ACTIVE',
    v_windows,
    jsonb_build_array(jsonb_build_object(
      'kind','HOLIDAY','availability','CLOSED','date',v_day::text,'reason','CI holiday'
    )),
    'booking-availability-ci-holiday-1'
  );

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot
  );
  if v_eval->>'reason'<>'OUTSIDE_BUSINESS_HOURS' then
    raise exception 'Holiday closure did not remove availability: %',v_eval;
  end if;
end;
$hold_expiry_and_holiday$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

do $availability_browser_boundary$
begin
  if not exists(
    select 1 from public.booking_availability_calendars
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and service_id='booking_ci_service'
  ) then
    raise exception 'Organization member cannot read availability calendars';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_booking_availability(uuid,text,uuid,timestamptz,timestamptz,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated Organization member cannot call availability read';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.configure_booking_availability_calendar(uuid,uuid,text,text,uuid,uuid,uuid,text,text,jsonb,jsonb,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.create_booking_hold(uuid,uuid,text,uuid,timestamptz,integer,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Browser can execute trusted Booking availability mutation';
  end if;

  begin
    update public.booking_availability_calendars
    set status='INACTIVE'
    where organization_id='00000000-0000-0000-0000-000000000c01';
    raise exception 'Direct availability mutation was accepted';
  exception when others then
    if sqlerrm not like 'permission denied for table booking_availability_calendars%'
       and sqlerrm not like 'Booking availability state requires governed command%'
    then raise; end if;
  end;
end;
$availability_browser_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $availability_security_and_indexes$
declare
  v_missing text;
begin
  if exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'configure_booking_availability_calendar',
        'booking_calendar_is_open',
        'evaluate_booking_slot',
        'get_booking_availability',
        'create_booking_hold',
        'release_booking_hold',
        'expire_booking_holds'
      )
      and p.prosecdef
  ) then
    raise exception 'Booking availability unexpectedly uses SECURITY DEFINER';
  end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.booking_availability_calendars'::regclass,
      'public.booking_availability_windows'::regclass,
      'public.booking_availability_exceptions'::regclass,
      'public.booking_holds'::regclass,
      'public.booking_hold_resources'::regclass
    )
  ) then
    raise exception 'Booking availability RLS is not enabled';
  end if;

  select string_agg(expected,', ' order by expected)
  into v_missing
  from unnest(array[
    'booking_availability_calendars_branch_idx',
    'booking_availability_calendars_staff_idx',
    'booking_availability_calendars_resource_idx',
    'booking_availability_windows_calendar_idx',
    'booking_availability_exceptions_overlap_idx',
    'booking_holds_service_overlap_idx',
    'booking_holds_staff_overlap_idx',
    'booking_hold_resources_resource_idx',
    'booking_hold_resources_org_hold_fk_idx',
    'booking_holds_org_branch_fk_idx',
    'booking_holds_org_created_by_fk_idx'
  ]::text[]) expected
  where not exists(
    select 1 from pg_indexes where schemaname='public' and indexname=expected
  );
  if v_missing is not null then
    raise exception 'Booking availability covering indexes missing: %',v_missing;
  end if;
end;
$availability_security_and_indexes$;
