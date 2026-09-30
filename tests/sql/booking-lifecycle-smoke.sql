\set ON_ERROR_STOP on

-- BOOKING-CATALOG and BOOKING-AVAILABILITY smoke run immediately before this
-- file and leave the disposable Booking CI Organization, CRM Person, service,
-- calendars, staff and resource authorities in place.

set role service_role;

do $booking_lifecycle_request_hold_confirm_reschedule_cancel$
declare
  v_person uuid;
  v_day date:=(now() at time zone 'Asia/Muscat')::date+4;
  v_slot timestamptz;
  v_new_slot timestamptz;
  v_request jsonb;
  v_replay jsonb;
  v_hold jsonb;
  v_new_hold jsonb;
  v_result jsonb;
  v_booking_id uuid;
  v_eval jsonb;
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;

  if v_person is null then
    raise exception 'Booking lifecycle canonical CRM Person fixture is missing';
  end if;

  v_slot:=(v_day::timestamp+time '10:00') at time zone 'Asia/Muscat';
  v_new_slot:=((v_day+1)::timestamp+time '10:00') at time zone 'Asia/Muscat';

  v_request:=public.request_booking(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_person,null,'booking_ci_service',null,null,
    'Lifecycle CI request',
    '{"source":"CI"}'::jsonb,
    'booking-lifecycle-ci-request-1'
  );

  if v_request->>'status'<>'REQUESTED' then
    raise exception 'Booking request did not enter REQUESTED';
  end if;
  v_booking_id:=(v_request->>'bookingId')::uuid;

  v_replay:=public.request_booking(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_person,null,'booking_ci_service',null,null,
    'Lifecycle CI request',
    '{"source":"CI"}'::jsonb,
    'booking-lifecycle-ci-request-1'
  );
  if coalesce((v_replay->>'replayed')::boolean,false) is distinct from true
     or v_replay->>'bookingId'<>v_booking_id::text
  then
    raise exception 'Booking request replay failed';
  end if;

  v_hold:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,10,'booking-lifecycle-ci-hold-1',
    '{"source":"CI"}'::jsonb
  );

  v_result:=public.hold_booking_request(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_booking_id,(v_hold->>'holdId')::uuid,
    'booking-lifecycle-ci-held-1'
  );
  if v_result->>'status'<>'HELD' then
    raise exception 'Booking did not enter HELD';
  end if;

  begin
    perform public.release_booking_hold(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      (v_hold->>'holdId')::uuid,
      'CI_DIRECT_RELEASE_SHOULD_FAIL',
      'booking-lifecycle-ci-direct-release-1'
    );
    raise exception 'Linked Booking hold was directly released';
  exception when others then
    if sqlerrm not like 'Booking-linked hold must be released through Booking lifecycle%' then
      raise;
    end if;
  end;

  v_result:=public.confirm_booking(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_booking_id,
    'booking-lifecycle-ci-confirm-1'
  );
  if v_result->>'status'<>'CONFIRMED' then
    raise exception 'Booking did not enter CONFIRMED';
  end if;

  if not exists(
    select 1 from public.booking_holds
    where id=(v_hold->>'holdId')::uuid
      and status='RELEASED'
      and release_reason='BOOKING_CONFIRMED'
  ) then
    raise exception 'Booking confirmation did not consume temporary hold';
  end if;

  if not exists(
    select 1 from public.booking_resource_allocations
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and booking_id=v_booking_id
      and resource_id='00000000-0000-0000-0000-00000000b704'
      and quantity=1
  ) then
    raise exception 'Booking durable resource allocation is missing';
  end if;

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot
  );
  if coalesce((v_eval->>'available')::boolean,false) is distinct from true
     or (v_eval->>'remainingCapacity')::integer<>1
  then
    raise exception 'Confirmed Booking did not reduce canonical availability: %',v_eval;
  end if;

  v_new_hold:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_new_slot,10,'booking-lifecycle-ci-hold-reschedule-1',
    '{"source":"CI"}'::jsonb
  );

  v_result:=public.reschedule_booking(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_booking_id,(v_new_hold->>'holdId')::uuid,
    'CI_RESCHEDULE',
    'booking-lifecycle-ci-reschedule-1'
  );
  if v_result->>'status'<>'RESCHEDULED'
     or (v_result->>'startsAt')::timestamptz<>v_new_slot
  then
    raise exception 'Booking reschedule did not move durable capacity';
  end if;

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot
  );
  if coalesce((v_eval->>'available')::boolean,false) is distinct from true
     or (v_eval->>'remainingCapacity')::integer<>2
  then
    raise exception 'Old Booking slot was not released after reschedule: %',v_eval;
  end if;

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_new_slot
  );
  if coalesce((v_eval->>'available')::boolean,false) is distinct from true
     or (v_eval->>'remainingCapacity')::integer<>1
  then
    raise exception 'Rescheduled Booking did not reserve new slot: %',v_eval;
  end if;

  v_result:=public.cancel_booking(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_booking_id,'CI_CANCEL',
    'booking-lifecycle-ci-cancel-1'
  );
  if v_result->>'status'<>'CANCELED' then
    raise exception 'Booking did not enter CANCELED';
  end if;

  v_eval:=public.evaluate_booking_slot(
    '00000000-0000-0000-0000-000000000c01',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_new_slot
  );
  if coalesce((v_eval->>'available')::boolean,false) is distinct from true
     or (v_eval->>'remainingCapacity')::integer<>2
  then
    raise exception 'Canceled Booking did not release durable capacity: %',v_eval;
  end if;

  if not exists(
    select 1
    from public.booking_lifecycle_events
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and booking_id=v_booking_id
      and transition='RESCHEDULED'
      and from_status='CONFIRMED'
      and to_status='RESCHEDULED'
  ) then
    raise exception 'Audited reschedule transition evidence is missing';
  end if;
end;
$booking_lifecycle_request_hold_confirm_reschedule_cancel$;

do $booking_lifecycle_complete_and_no_show$
declare
  v_person uuid;
  v_day date:=(now() at time zone 'Asia/Muscat')::date+6;
  v_slot timestamptz;
  v_request jsonb;
  v_hold jsonb;
  v_booking_id uuid;
  v_result jsonb;
  v_target text;
  v_i integer;
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;

  for v_i in 1..2 loop
    v_slot:=(v_day::timestamp+(case when v_i=1 then time '10:00' else time '13:00' end))
      at time zone 'Asia/Muscat';

    v_request:=public.request_booking(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_person,null,'booking_ci_service',null,null,null,
      jsonb_build_object('source','CI','terminalCase',v_i),
      'booking-lifecycle-ci-terminal-request-'||v_i
    );
    v_booking_id:=(v_request->>'bookingId')::uuid;

    v_hold:=public.create_booking_hold(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'booking_ci_service',
      '00000000-0000-0000-0000-00000000b703',
      v_slot,10,
      'booking-lifecycle-ci-terminal-hold-'||v_i,
      '{"source":"CI"}'::jsonb
    );

    perform public.hold_booking_request(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_booking_id,(v_hold->>'holdId')::uuid,
      'booking-lifecycle-ci-terminal-held-'||v_i
    );
    perform public.confirm_booking(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_booking_id,
      'booking-lifecycle-ci-terminal-confirm-'||v_i
    );

    -- Disposable CI fixture simulates passage of time without weakening the
    -- Production command contract.
    perform set_config('app.booking_lifecycle_mutation','allowed',true);
    update public.bookings
    set starts_at=now()-interval '2 hours',
        ends_at=now()-interval '1 hour',
        occupied_starts_at=now()-interval '2 hours 15 minutes',
        occupied_ends_at=now()-interval '50 minutes',
        updated_at=now()
    where id=v_booking_id;
    perform set_config('app.booking_lifecycle_mutation','0',true);

    v_target:=case when v_i=1 then 'COMPLETED' else 'NO_SHOW' end;
    v_result:=public.finalize_booking(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_booking_id,v_target,
      case when v_i=1 then 'CI_COMPLETE' else 'CI_NO_SHOW' end,
      'booking-lifecycle-ci-terminal-finalize-'||v_i
    );

    if v_result->>'status'<>v_target then
      raise exception 'Booking terminal transition % failed',v_target;
    end if;
  end loop;
end;
$booking_lifecycle_complete_and_no_show$;

do $booking_lifecycle_expired_hold_cancels_held_booking$
declare
  v_person uuid;
  v_day date:=(now() at time zone 'Asia/Muscat')::date+8;
  v_slot timestamptz;
  v_request jsonb;
  v_hold jsonb;
  v_booking_id uuid;
  v_expired integer;
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;

  v_slot:=(v_day::timestamp+time '11:00') at time zone 'Asia/Muscat';
  v_request:=public.request_booking(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_person,null,'booking_ci_service',null,null,null,
    '{"source":"CI"}'::jsonb,
    'booking-lifecycle-ci-expire-request-1'
  );
  v_booking_id:=(v_request->>'bookingId')::uuid;

  v_hold:=public.create_booking_hold(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'booking_ci_service',
    '00000000-0000-0000-0000-00000000b703',
    v_slot,10,'booking-lifecycle-ci-expire-hold-1',
    '{"source":"CI"}'::jsonb
  );
  perform public.hold_booking_request(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_booking_id,(v_hold->>'holdId')::uuid,
    'booking-lifecycle-ci-expire-held-1'
  );

  perform set_config('app.booking_availability_mutation','allowed',true);
  update public.booking_holds
  set expires_at=now()-interval '1 minute'
  where id=(v_hold->>'holdId')::uuid;
  perform set_config('app.booking_availability_mutation','0',true);

  v_expired:=public.expire_booking_holds(100);
  if v_expired<1 then raise exception 'Booking hold expiry did not process due hold'; end if;

  if not exists(
    select 1 from public.bookings
    where id=v_booking_id
      and status='CANCELED'
      and current_hold_id is null
      and cancel_reason='HOLD_TTL_EXPIRED'
  ) then
    raise exception 'Expired hold left Booking in HELD state';
  end if;

  if not exists(
    select 1 from public.booking_lifecycle_events
    where booking_id=v_booking_id
      and transition='CANCELED'
      and from_status='HELD'
      and reason='HOLD_TTL_EXPIRED'
  ) then
    raise exception 'Expired hold cancellation evidence is missing';
  end if;
end;
$booking_lifecycle_expired_hold_cancels_held_booking$;

do $booking_lifecycle_security_and_indexes$
declare
  v_missing text;
begin
  if exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'request_booking','hold_booking_request','confirm_booking',
        'reschedule_booking','cancel_booking','finalize_booking',
        'booking_lifecycle_actor_allowed','guard_booking_lifecycle_mutation',
        'guard_linked_booking_hold_release'
      )
      and p.prosecdef
  ) then
    raise exception 'Booking lifecycle unexpectedly uses SECURITY DEFINER';
  end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.bookings'::regclass,
      'public.booking_resource_allocations'::regclass,
      'public.booking_lifecycle_events'::regclass
    )
  ) then
    raise exception 'Booking lifecycle RLS is not enabled';
  end if;

  select string_agg(expected,', ' order by expected)
  into v_missing
  from unnest(array[
    'bookings_person_idx',
    'bookings_lead_idx',
    'bookings_service_slot_idx',
    'bookings_branch_slot_idx',
    'bookings_requested_branch_idx',
    'bookings_staff_slot_idx',
    'bookings_current_hold_uidx',
    'bookings_created_by_idx',
    'bookings_updated_by_idx',
    'booking_resource_allocations_booking_idx',
    'booking_resource_allocations_resource_idx',
    'booking_lifecycle_events_booking_idx',
    'booking_lifecycle_events_actor_idx'
  ]::text[]) expected
  where not exists(
    select 1 from pg_indexes where schemaname='public' and indexname=expected
  );

  if v_missing is not null then
    raise exception 'Booking lifecycle covering indexes missing: %',v_missing;
  end if;
end;
$booking_lifecycle_security_and_indexes$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

do $booking_lifecycle_browser_boundary$
begin
  if not exists(
    select 1 from public.bookings
    where organization_id='00000000-0000-0000-0000-000000000c01'
  ) then
    raise exception 'Organization member cannot read Booking lifecycle';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.request_booking(uuid,uuid,uuid,uuid,text,uuid,timestamptz,text,jsonb,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.confirm_booking(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.cancel_booking(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Browser can execute trusted Booking lifecycle mutation';
  end if;

  begin
    update public.bookings
    set status='CANCELED'
    where organization_id='00000000-0000-0000-0000-000000000c01';
    raise exception 'Direct Booking lifecycle mutation was accepted';
  exception when others then
    if sqlerrm not like 'permission denied for table bookings%'
       and sqlerrm not like 'Booking lifecycle state requires governed command%'
    then raise; end if;
  end;
end;
$booking_lifecycle_browser_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);
