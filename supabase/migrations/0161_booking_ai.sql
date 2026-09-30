-- 0161: BOOKING-AI
-- AI tool orchestration over canonical Booking Catalog, Availability, Lifecycle,
-- Automation Runtime and Operator Brief authorities. No second booking engine,
-- scheduler, approval engine, payment truth or provider-send authority.

alter table public.bookings
  alter column created_by_user_id drop not null,
  alter column updated_by_user_id drop not null;

comment on column public.bookings.created_by_user_id is
  'Nullable only for governed SYSTEM mutations such as BOOKING-AI; human mutations retain canonical Organization member attribution.';
comment on column public.bookings.updated_by_user_id is
  'Nullable only for governed SYSTEM mutations such as BOOKING-AI; lifecycle audit remains authoritative for actor evidence.';

create or replace function public.booking_lifecycle_actor_allowed(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select
    (current_user='service_role' and p_actor_user_id is null)
    or exists(
      select 1
      from public.organization_members m
      where m.organization_id=p_organization_id
        and m.user_id=p_actor_user_id
        and m.role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')
    );
$$;

create or replace function public.request_booking(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_person_id uuid,
  p_lead_id uuid,
  p_service_id text,
  p_requested_branch_id uuid,
  p_requested_starts_at timestamptz,
  p_notes text,
  p_metadata jsonb,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');
  v_hash text;
  v_existing public.booking_lifecycle_events%rowtype;
  v_booking public.bookings%rowtype;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_actor_user_id is null
     or p_person_id is null
     or nullif(btrim(p_service_id),'') is null
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
     or p_metadata is null
     or jsonb_typeof(p_metadata)<>'object'
     or octet_length(p_metadata::text)>16384
     or (v_notes is not null and length(v_notes)>2000)
  then
    raise exception 'Booking request payload is invalid';
  end if;

  if not public.booking_lifecycle_actor_allowed(p_organization_id,p_actor_user_id) then
    raise exception 'Booking lifecycle actor is not permitted';
  end if;

  if not exists(
    select 1 from public.crm_people p
    where p.organization_id=p_organization_id
      and p.id=p_person_id
      and p.status='ACTIVE'
  ) then
    raise exception 'Booking requires an active canonical CRM Person';
  end if;

  if not exists(
    select 1 from public.service_booking_profiles p
    join public.services s
      on s.organization_id=p.organization_id and s.id=p.service_id
    where p.organization_id=p_organization_id
      and p.service_id=p_service_id
      and p.booking_enabled=true
      and s.enabled=true
  ) then
    raise exception 'Booking service is not bookable';
  end if;

  if p_requested_branch_id is not null
     and not exists(
       select 1 from public.branches b
       where b.organization_id=p_organization_id
         and b.id=p_requested_branch_id
         and b.status='ACTIVE'
     )
  then
    raise exception 'Requested Booking branch is missing or inactive';
  end if;

  if p_lead_id is not null
     and not exists(
       select 1 from public.leads l
       where l.organization_id=p_organization_id
         and l.id=p_lead_id
         and l.person_id=p_person_id
     )
  then
    raise exception 'Booking Lead must resolve to the same canonical CRM Person';
  end if;

  v_hash:=md5(jsonb_build_object(
    'personId',p_person_id,
    'leadId',p_lead_id,
    'serviceId',p_service_id,
    'requestedBranchId',p_requested_branch_id,
    'requestedStartsAt',p_requested_starts_at,
    'notes',v_notes,
    'metadata',p_metadata
  )::text);

  select * into v_existing
  from public.booking_lifecycle_events
  where organization_id=p_organization_id and request_key=v_request_key;

  if found then
    if v_existing.transition<>'REQUESTED' or v_existing.request_hash<>v_hash then
      raise exception 'Booking lifecycle request key conflict';
    end if;
    return v_existing.result_payload||jsonb_build_object('replayed',true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-lifecycle:'||p_organization_id::text,0)
  );

  select * into v_existing
  from public.booking_lifecycle_events
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    if v_existing.transition<>'REQUESTED' or v_existing.request_hash<>v_hash then
      raise exception 'Booking lifecycle request key conflict';
    end if;
    return v_existing.result_payload||jsonb_build_object('replayed',true);
  end if;

  perform set_config('app.booking_lifecycle_mutation','allowed',true);

  insert into public.bookings(
    organization_id,person_id,lead_id,service_id,
    requested_branch_id,requested_starts_at,status,
    notes,metadata,created_by_user_id,updated_by_user_id
  ) values (
    p_organization_id,p_person_id,p_lead_id,p_service_id,
    p_requested_branch_id,p_requested_starts_at,'REQUESTED',
    v_notes,p_metadata,p_actor_user_id,p_actor_user_id
  )
  returning * into v_booking;

  v_result:=jsonb_build_object(
    'bookingId',v_booking.id,
    'bookingReference',v_booking.booking_reference,
    'status',v_booking.status,
    'personId',v_booking.person_id,
    'serviceId',v_booking.service_id,
    'replayed',false
  );

  insert into public.booking_lifecycle_events(
    organization_id,booking_id,transition,from_status,to_status,
    actor_user_id,request_key,request_hash,evidence,result_payload
  ) values (
    p_organization_id,v_booking.id,'REQUESTED',null,'REQUESTED',
    p_actor_user_id,v_request_key,v_hash,
    jsonb_build_object(
      'requestedBranchId',p_requested_branch_id,
      'requestedStartsAt',p_requested_starts_at,
      'hasNotes',v_notes is not null
    ),
    v_result
  );

  perform set_config('app.booking_lifecycle_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'booking_ai'),
    'BOOKING_REQUESTED','booking',v_booking.id::text,
    jsonb_build_object(
      'bookingReference',v_booking.booking_reference,
      'personId',v_booking.person_id,
      'serviceId',v_booking.service_id,
      'status','REQUESTED',
      'hasNotes',v_notes is not null
    ),
    v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_lifecycle_mutation','0',true);
    raise;
end;
$$;

create or replace function public.hold_booking_request(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_hold_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_hash text;
  v_existing public.booking_lifecycle_events%rowtype;
  v_booking public.bookings%rowtype;
  v_hold public.booking_holds%rowtype;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_booking_id is null or p_hold_id is null
     or not public.booking_lifecycle_actor_allowed(p_organization_id,p_actor_user_id)
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
  then
    raise exception 'Booking hold transition payload is invalid';
  end if;

  v_hash:=md5(jsonb_build_object(
    'bookingId',p_booking_id,'holdId',p_hold_id
  )::text);

  select * into v_existing from public.booking_lifecycle_events
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    if v_existing.transition<>'HELD'
       or v_existing.booking_id<>p_booking_id
       or v_existing.request_hash<>v_hash
    then raise exception 'Booking lifecycle request key conflict'; end if;
    return v_existing.result_payload||jsonb_build_object('replayed',true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-lifecycle:'||p_organization_id::text,0)
  );

  select * into v_booking
  from public.bookings
  where organization_id=p_organization_id and id=p_booking_id
  for update;
  if not found then raise exception 'Booking was not found'; end if;
  if v_booking.status<>'REQUESTED' then
    raise exception 'Only REQUESTED Booking can enter HELD';
  end if;

  select * into v_hold
  from public.booking_holds
  where organization_id=p_organization_id and id=p_hold_id
  for update;
  if not found
     or v_hold.status<>'ACTIVE'
     or v_hold.expires_at<=now()
  then
    raise exception 'Booking requires an active unexpired hold';
  end if;

  if v_hold.service_id<>v_booking.service_id
     or (
       v_booking.requested_branch_id is not null
       and v_hold.branch_id is distinct from v_booking.requested_branch_id
     )
  then
    raise exception 'Booking hold does not match requested service/branch';
  end if;

  if exists(
    select 1 from public.bookings b
    where b.organization_id=p_organization_id
      and b.current_hold_id=p_hold_id
      and b.id<>p_booking_id
  ) then
    raise exception 'Booking hold is already linked to another Booking';
  end if;

  perform set_config('app.booking_lifecycle_mutation','allowed',true);

  update public.bookings
  set
    branch_id=v_hold.branch_id,
    staff_user_id=v_hold.staff_user_id,
    starts_at=v_hold.starts_at,
    ends_at=v_hold.ends_at,
    occupied_starts_at=v_hold.occupied_starts_at,
    occupied_ends_at=v_hold.occupied_ends_at,
    status='HELD',
    current_hold_id=v_hold.id,
    updated_by_user_id=p_actor_user_id,
    updated_at=now()
  where id=p_booking_id
  returning * into v_booking;

  delete from public.booking_resource_allocations
  where organization_id=p_organization_id and booking_id=p_booking_id;

  insert into public.booking_resource_allocations(
    organization_id,booking_id,resource_id,quantity
  )
  select organization_id,p_booking_id,resource_id,quantity
  from public.booking_hold_resources
  where organization_id=p_organization_id and hold_id=p_hold_id;

  v_result:=jsonb_build_object(
    'bookingId',v_booking.id,
    'bookingReference',v_booking.booking_reference,
    'status',v_booking.status,
    'holdId',v_hold.id,
    'startsAt',v_booking.starts_at,
    'endsAt',v_booking.ends_at,
    'staffUserId',v_booking.staff_user_id,
    'replayed',false
  );

  insert into public.booking_lifecycle_events(
    organization_id,booking_id,transition,from_status,to_status,
    actor_user_id,request_key,request_hash,evidence,result_payload
  ) values (
    p_organization_id,p_booking_id,'HELD','REQUESTED','HELD',
    p_actor_user_id,v_request_key,v_hash,
    jsonb_build_object('holdId',v_hold.id,'expiresAt',v_hold.expires_at),
    v_result
  );

  perform set_config('app.booking_lifecycle_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'booking_ai'),
    'BOOKING_HELD','booking',p_booking_id::text,
    jsonb_build_object('status','REQUESTED'),
    jsonb_build_object('status','HELD','holdId',v_hold.id,'startsAt',v_booking.starts_at),
    v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_lifecycle_mutation','0',true);
    raise;
end;
$$;

create or replace function public.confirm_booking(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_hash text;
  v_existing public.booking_lifecycle_events%rowtype;
  v_booking public.bookings%rowtype;
  v_hold public.booking_holds%rowtype;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_booking_id is null
     or not public.booking_lifecycle_actor_allowed(p_organization_id,p_actor_user_id)
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
  then raise exception 'Booking confirmation payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object('bookingId',p_booking_id)::text);

  select * into v_existing from public.booking_lifecycle_events
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    if v_existing.transition<>'CONFIRMED'
       or v_existing.booking_id<>p_booking_id
       or v_existing.request_hash<>v_hash
    then raise exception 'Booking lifecycle request key conflict'; end if;
    return v_existing.result_payload||jsonb_build_object('replayed',true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-lifecycle:'||p_organization_id::text,0)
  );

  select * into v_booking from public.bookings
  where organization_id=p_organization_id and id=p_booking_id
  for update;
  if not found then raise exception 'Booking was not found'; end if;
  if v_booking.status<>'HELD' or v_booking.current_hold_id is null then
    raise exception 'Only HELD Booking can be confirmed';
  end if;

  select * into v_hold from public.booking_holds
  where organization_id=p_organization_id and id=v_booking.current_hold_id
  for update;
  if not found or v_hold.status<>'ACTIVE' or v_hold.expires_at<=now() then
    raise exception 'Booking hold expired before confirmation';
  end if;

  perform set_config('app.booking_lifecycle_mutation','allowed',true);
  perform set_config('app.booking_availability_mutation','allowed',true);

  update public.booking_holds
  set status='RELEASED',release_reason='BOOKING_CONFIRMED',
      released_at=now(),updated_at=now()
  where id=v_hold.id;

  update public.bookings
  set status='CONFIRMED',current_hold_id=null,confirmed_at=now(),
      updated_by_user_id=p_actor_user_id,updated_at=now()
  where id=p_booking_id
  returning * into v_booking;

  v_result:=jsonb_build_object(
    'bookingId',v_booking.id,
    'bookingReference',v_booking.booking_reference,
    'status',v_booking.status,
    'startsAt',v_booking.starts_at,
    'endsAt',v_booking.ends_at,
    'staffUserId',v_booking.staff_user_id,
    'replayed',false
  );

  insert into public.booking_lifecycle_events(
    organization_id,booking_id,transition,from_status,to_status,
    actor_user_id,request_key,request_hash,evidence,result_payload
  ) values (
    p_organization_id,p_booking_id,'CONFIRMED','HELD','CONFIRMED',
    p_actor_user_id,v_request_key,v_hash,
    jsonb_build_object('consumedHoldId',v_hold.id),
    v_result
  );

  perform set_config('app.booking_availability_mutation','0',true);
  perform set_config('app.booking_lifecycle_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'booking_ai'),
    'BOOKING_CONFIRMED','booking',p_booking_id::text,
    jsonb_build_object('status','HELD','holdId',v_hold.id),
    jsonb_build_object('status','CONFIRMED','startsAt',v_booking.starts_at),
    v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    perform set_config('app.booking_lifecycle_mutation','0',true);
    raise;
end;
$$;

create or replace function public.reschedule_booking(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_new_hold_id uuid,
  p_reason text,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_hash text;
  v_existing public.booking_lifecycle_events%rowtype;
  v_booking public.bookings%rowtype;
  v_hold public.booking_holds%rowtype;
  v_old_start timestamptz;
  v_old_end timestamptz;
  v_from text;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_booking_id is null or p_new_hold_id is null
     or v_reason is null or length(v_reason)>500
     or not public.booking_lifecycle_actor_allowed(p_organization_id,p_actor_user_id)
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
  then raise exception 'Booking reschedule payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'bookingId',p_booking_id,'newHoldId',p_new_hold_id,'reason',v_reason
  )::text);

  select * into v_existing from public.booking_lifecycle_events
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    if v_existing.transition<>'RESCHEDULED'
       or v_existing.booking_id<>p_booking_id
       or v_existing.request_hash<>v_hash
    then raise exception 'Booking lifecycle request key conflict'; end if;
    return v_existing.result_payload||jsonb_build_object('replayed',true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-lifecycle:'||p_organization_id::text,0)
  );

  select * into v_booking from public.bookings
  where organization_id=p_organization_id and id=p_booking_id
  for update;
  if not found then raise exception 'Booking was not found'; end if;
  if v_booking.status not in ('CONFIRMED','RESCHEDULED') then
    raise exception 'Only confirmed Booking can be rescheduled';
  end if;

  select * into v_hold from public.booking_holds
  where organization_id=p_organization_id and id=p_new_hold_id
  for update;
  if not found or v_hold.status<>'ACTIVE' or v_hold.expires_at<=now() then
    raise exception 'Booking reschedule requires an active unexpired hold';
  end if;
  if v_hold.service_id<>v_booking.service_id then
    raise exception 'Booking reschedule hold must use the same service';
  end if;

  v_old_start:=v_booking.starts_at;
  v_old_end:=v_booking.ends_at;
  v_from:=v_booking.status;

  perform set_config('app.booking_lifecycle_mutation','allowed',true);
  perform set_config('app.booking_availability_mutation','allowed',true);

  update public.booking_holds
  set status='RELEASED',release_reason='BOOKING_RESCHEDULED',
      released_at=now(),updated_at=now()
  where id=v_hold.id;

  update public.bookings
  set
    branch_id=v_hold.branch_id,
    staff_user_id=v_hold.staff_user_id,
    starts_at=v_hold.starts_at,
    ends_at=v_hold.ends_at,
    occupied_starts_at=v_hold.occupied_starts_at,
    occupied_ends_at=v_hold.occupied_ends_at,
    status='RESCHEDULED',
    current_hold_id=null,
    rescheduled_at=now(),
    updated_by_user_id=p_actor_user_id,
    updated_at=now()
  where id=p_booking_id
  returning * into v_booking;

  delete from public.booking_resource_allocations
  where organization_id=p_organization_id and booking_id=p_booking_id;
  insert into public.booking_resource_allocations(
    organization_id,booking_id,resource_id,quantity
  )
  select organization_id,p_booking_id,resource_id,quantity
  from public.booking_hold_resources
  where organization_id=p_organization_id and hold_id=p_new_hold_id;

  v_result:=jsonb_build_object(
    'bookingId',v_booking.id,
    'bookingReference',v_booking.booking_reference,
    'status',v_booking.status,
    'startsAt',v_booking.starts_at,
    'endsAt',v_booking.ends_at,
    'staffUserId',v_booking.staff_user_id,
    'replayed',false
  );

  insert into public.booking_lifecycle_events(
    organization_id,booking_id,transition,from_status,to_status,reason,
    actor_user_id,request_key,request_hash,evidence,result_payload
  ) values (
    p_organization_id,p_booking_id,'RESCHEDULED',
    v_from,'RESCHEDULED',v_reason,
    p_actor_user_id,v_request_key,v_hash,
    jsonb_build_object(
      'oldStartsAt',v_old_start,'oldEndsAt',v_old_end,
      'newHoldId',v_hold.id,'newStartsAt',v_booking.starts_at
    ),
    v_result
  );

  perform set_config('app.booking_availability_mutation','0',true);
  perform set_config('app.booking_lifecycle_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'booking_ai'),
    'BOOKING_RESCHEDULED','booking',p_booking_id::text,
    jsonb_build_object('startsAt',v_old_start,'endsAt',v_old_end),
    jsonb_build_object('status','RESCHEDULED','startsAt',v_booking.starts_at,'reason',v_reason),
    v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    perform set_config('app.booking_lifecycle_mutation','0',true);
    raise;
end;
$$;

create or replace function public.cancel_booking(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_reason text,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_hash text;
  v_existing public.booking_lifecycle_events%rowtype;
  v_booking public.bookings%rowtype;
  v_from text;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_booking_id is null
     or v_reason is null or length(v_reason)>500
     or not public.booking_lifecycle_actor_allowed(p_organization_id,p_actor_user_id)
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
  then raise exception 'Booking cancellation payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'bookingId',p_booking_id,'reason',v_reason
  )::text);

  select * into v_existing from public.booking_lifecycle_events
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    if v_existing.transition<>'CANCELED'
       or v_existing.booking_id<>p_booking_id
       or v_existing.request_hash<>v_hash
    then raise exception 'Booking lifecycle request key conflict'; end if;
    return v_existing.result_payload||jsonb_build_object('replayed',true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-lifecycle:'||p_organization_id::text,0)
  );

  select * into v_booking from public.bookings
  where organization_id=p_organization_id and id=p_booking_id
  for update;
  if not found then raise exception 'Booking was not found'; end if;
  if v_booking.status not in ('REQUESTED','HELD','CONFIRMED','RESCHEDULED') then
    raise exception 'Booking is already terminal';
  end if;

  v_from:=v_booking.status;

  perform set_config('app.booking_lifecycle_mutation','allowed',true);
  perform set_config('app.booking_availability_mutation','allowed',true);

  if v_booking.status='HELD' and v_booking.current_hold_id is not null then
    update public.booking_holds
    set status='RELEASED',release_reason='BOOKING_CANCELED',
        released_at=now(),updated_at=now()
    where organization_id=p_organization_id
      and id=v_booking.current_hold_id
      and status='ACTIVE';
  end if;

  update public.bookings
  set status='CANCELED',current_hold_id=null,cancel_reason=v_reason,canceled_at=now(),
      updated_by_user_id=p_actor_user_id,updated_at=now()
  where id=p_booking_id
  returning * into v_booking;

  v_result:=jsonb_build_object(
    'bookingId',v_booking.id,
    'bookingReference',v_booking.booking_reference,
    'status',v_booking.status,
    'reason',v_reason,
    'replayed',false
  );

  insert into public.booking_lifecycle_events(
    organization_id,booking_id,transition,from_status,to_status,reason,
    actor_user_id,request_key,request_hash,evidence,result_payload
  ) values (
    p_organization_id,p_booking_id,'CANCELED',v_from,'CANCELED',v_reason,
    p_actor_user_id,v_request_key,v_hash,'{}'::jsonb,v_result
  );

  perform set_config('app.booking_availability_mutation','0',true);
  perform set_config('app.booking_lifecycle_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'booking_ai'),
    'BOOKING_CANCELED','booking',p_booking_id::text,
    jsonb_build_object('status',v_from),
    jsonb_build_object('status','CANCELED','reason',v_reason),
    v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    perform set_config('app.booking_lifecycle_mutation','0',true);
    raise;
end;
$$;

create or replace function public.validate_service_booking_rules(p_rules jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_key text;
begin
  if p_rules is null
     or jsonb_typeof(p_rules)<>'object'
     or octet_length(p_rules::text)>16384
  then
    raise exception 'Booking rules must be a bounded JSON object';
  end if;

  for v_key in select jsonb_object_keys(p_rules)
  loop
    if v_key not in (
      'minimumNoticeMinutes',
      'maximumAdvanceDays',
      'cancellationNoticeMinutes',
      'slotIncrementMinutes',
      'allowCustomerCancel',
      'allowCustomerReschedule',
      'requiresConfirmation',
      'reminderMinutesBefore',
      'depositRequired',
      'depositPercent',
      'depositAmount',
      'depositCurrency'
    ) then
      raise exception 'Unknown booking rule: %',v_key;
    end if;
  end loop;

  if p_rules ? 'minimumNoticeMinutes'
     and (
       jsonb_typeof(p_rules->'minimumNoticeMinutes')<>'number'
       or (p_rules->>'minimumNoticeMinutes')::integer not between 0 and 10080
     )
  then raise exception 'minimumNoticeMinutes is invalid'; end if;

  if p_rules ? 'maximumAdvanceDays'
     and (
       jsonb_typeof(p_rules->'maximumAdvanceDays')<>'number'
       or (p_rules->>'maximumAdvanceDays')::integer not between 1 and 730
     )
  then raise exception 'maximumAdvanceDays is invalid'; end if;

  if p_rules ? 'cancellationNoticeMinutes'
     and (
       jsonb_typeof(p_rules->'cancellationNoticeMinutes')<>'number'
       or (p_rules->>'cancellationNoticeMinutes')::integer not between 0 and 10080
     )
  then raise exception 'cancellationNoticeMinutes is invalid'; end if;

  if p_rules ? 'slotIncrementMinutes'
     and (
       jsonb_typeof(p_rules->'slotIncrementMinutes')<>'number'
       or (p_rules->>'slotIncrementMinutes')::integer not between 5 and 720
     )
  then raise exception 'slotIncrementMinutes is invalid'; end if;

  for v_key in
    select unnest(array[
      'allowCustomerCancel',
      'allowCustomerReschedule',
      'requiresConfirmation'
    ]::text[])
  loop
    if p_rules ? v_key and jsonb_typeof(p_rules->v_key)<>'boolean' then
      raise exception 'Booking rule % must be boolean',v_key;
    end if;
  end loop;

  if p_rules ? 'reminderMinutesBefore'
     and (
       jsonb_typeof(p_rules->'reminderMinutesBefore')<>'number'
       or (p_rules->>'reminderMinutesBefore')::numeric<>trunc((p_rules->>'reminderMinutesBefore')::numeric)
       or (p_rules->>'reminderMinutesBefore')::integer not between 0 and 10080
     )
  then raise exception 'reminderMinutesBefore is invalid'; end if;

  if p_rules ? 'depositRequired'
     and jsonb_typeof(p_rules->'depositRequired')<>'boolean'
  then raise exception 'depositRequired must be boolean'; end if;

  if p_rules ? 'depositPercent'
     and (
       jsonb_typeof(p_rules->'depositPercent')<>'number'
       or (p_rules->>'depositPercent')::numeric<>trunc((p_rules->>'depositPercent')::numeric)
       or (p_rules->>'depositPercent')::integer not between 1 and 100
     )
  then raise exception 'depositPercent is invalid'; end if;

  if p_rules ? 'depositAmount'
     and (
       jsonb_typeof(p_rules->'depositAmount')<>'number'
       or (p_rules->>'depositAmount')::numeric<=0
       or (p_rules->>'depositAmount')::numeric>1000000000
     )
  then raise exception 'depositAmount is invalid'; end if;

  if p_rules ? 'depositCurrency'
     and (
       jsonb_typeof(p_rules->'depositCurrency')<>'string'
       or (p_rules->>'depositCurrency') !~ '^[A-Z]{3}$'
     )
  then raise exception 'depositCurrency is invalid'; end if;

  if coalesce((p_rules->>'depositRequired')::boolean,false) then
    if (case when p_rules ? 'depositPercent' then 1 else 0 end)
       + (case when p_rules ? 'depositAmount' then 1 else 0 end) <> 1
    then
      raise exception 'Deposit policy requires exactly one of depositPercent or depositAmount';
    end if;
    if (p_rules ? 'depositAmount') and not (p_rules ? 'depositCurrency') then
      raise exception 'Fixed depositAmount requires depositCurrency';
    end if;
  elsif (p_rules ? 'depositPercent') or (p_rules ? 'depositAmount') or (p_rules ? 'depositCurrency') then
    raise exception 'Deposit value cannot be configured unless depositRequired is true';
  end if;

  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Booking rule numeric value is invalid';
end;
$$;

alter table public.tool_action_registry
  drop constraint tool_action_registry_scope_type_check,
  add constraint tool_action_registry_scope_type_check
    check (scope_type in ('LEAD','CONVERSATION','BOOKING','AUTOMATION_RULE'));

alter table public.tool_action_registry
  drop constraint tool_action_registry_side_effect_class_check,
  add constraint tool_action_registry_side_effect_class_check
    check (side_effect_class in ('READ_ONLY','INTERNAL_STATE','EXTERNAL_PROVIDER','CONTROL_PLANE'));

insert into public.tool_action_registry(
  action_key,tool_key,authority_key,contract_version,
  input_schema,output_schema,permission_key,scope_type,
  idempotency_required,idempotency_key_contract,cost_class,
  side_effect_class,approval_requirement,approval_policy_key,
  verifier_key,audit_contract,availability,required_work_packages,
  description,metadata
) values
(
  'BOOKING_CHECK_AVAILABILITY','BOOKING','BOOKING_AVAILABILITY',1,
  '{"type":"object","properties":{"organizationId":{"type":"string","format":"uuid"},"conversationId":{"type":"string","format":"uuid"},"serviceId":{"type":"string"},"branchId":{"type":"string","format":"uuid"},"from":{"type":"string","format":"date-time"},"to":{"type":"string","format":"date-time"}},"required":["organizationId","conversationId","serviceId","from","to"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"slots":{"type":"array"},"count":{"type":"integer"}},"required":["slots","count"],"additionalProperties":false}'::jsonb,
  'BOOKING_READ','CONVERSATION',true,'AGENT_RUN_REQUEST_KEY_PLUS_BOOKING_TOOL','NONE',
  'READ_ONLY','NONE',null,'BOOKING_AVAILABILITY_RELOAD',
  '{"event":"BOOKING_AI_AVAILABILITY_READ","entityType":"conversation","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Read deterministic canonical Booking availability for an explicitly scoped conversation.',
  '{"executionSurfaces":["AI"],"providerSend":false,"paymentExecution":false}'::jsonb
),
(
  'BOOKING_CREATE','BOOKING','BOOKING_LIFECYCLE',1,
  '{"type":"object","properties":{"organizationId":{"type":"string","format":"uuid"},"conversationId":{"type":"string","format":"uuid"},"personId":{"type":"string","format":"uuid"},"leadId":{"type":"string","format":"uuid"},"serviceId":{"type":"string"},"branchId":{"type":"string","format":"uuid"},"startsAt":{"type":"string","format":"date-time"},"explicitCustomerRequest":{"type":"boolean"}},"required":["organizationId","conversationId","personId","serviceId","startsAt","explicitCustomerRequest"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"bookingId":{"type":"string","format":"uuid"},"status":{"type":"string"},"bookingReference":{"type":"string"}},"required":["bookingId","status"],"additionalProperties":true}'::jsonb,
  'BOOKING_MUTATE','CONVERSATION',true,'AGENT_RUN_REQUEST_KEY_PLUS_BOOKING_CREATE','NONE',
  'INTERNAL_STATE','NONE',null,'BOOKING_LIFECYCLE_EVENT_RELOAD',
  '{"event":"BOOKING_AI_CREATED","entityType":"booking","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Create a Booking only through canonical request/hold/confirm lifecycle commands after explicit customer intent is verified.',
  '{"executionSurfaces":["AI"],"providerSend":false,"paymentExecution":false,"shadowMutationBlocked":true}'::jsonb
),
(
  'BOOKING_RESCHEDULE','BOOKING','BOOKING_LIFECYCLE',1,
  '{"type":"object","properties":{"organizationId":{"type":"string","format":"uuid"},"bookingId":{"type":"string","format":"uuid"},"branchId":{"type":"string","format":"uuid"},"startsAt":{"type":"string","format":"date-time"},"reason":{"type":"string"},"explicitCustomerRequest":{"type":"boolean"}},"required":["organizationId","bookingId","startsAt","explicitCustomerRequest"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"bookingId":{"type":"string","format":"uuid"},"status":{"type":"string"},"startsAt":{"type":"string","format":"date-time"}},"required":["bookingId","status"],"additionalProperties":true}'::jsonb,
  'BOOKING_MUTATE','BOOKING',true,'AGENT_RUN_REQUEST_KEY_PLUS_BOOKING_RESCHEDULE','NONE',
  'INTERNAL_STATE','NONE',null,'BOOKING_LIFECYCLE_EVENT_RELOAD',
  '{"event":"BOOKING_AI_RESCHEDULED","entityType":"booking","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Reschedule through canonical availability hold plus lifecycle transition, subject to customer-reschedule policy.',
  '{"executionSurfaces":["AI"],"providerSend":false,"paymentExecution":false,"shadowMutationBlocked":true}'::jsonb
),
(
  'BOOKING_CANCEL','BOOKING','BOOKING_LIFECYCLE',1,
  '{"type":"object","properties":{"organizationId":{"type":"string","format":"uuid"},"bookingId":{"type":"string","format":"uuid"},"reason":{"type":"string"},"explicitCustomerRequest":{"type":"boolean"}},"required":["organizationId","bookingId","reason","explicitCustomerRequest"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"bookingId":{"type":"string","format":"uuid"},"status":{"type":"string"},"reason":{"type":"string"}},"required":["bookingId","status"],"additionalProperties":true}'::jsonb,
  'BOOKING_MUTATE','BOOKING',true,'AGENT_RUN_REQUEST_KEY_PLUS_BOOKING_CANCEL','NONE',
  'INTERNAL_STATE','NONE',null,'BOOKING_LIFECYCLE_EVENT_RELOAD',
  '{"event":"BOOKING_AI_CANCELED","entityType":"booking","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Cancel through canonical lifecycle only when service policy and cancellation notice permit customer cancellation.',
  '{"executionSurfaces":["AI"],"providerSend":false,"paymentExecution":false,"shadowMutationBlocked":true}'::jsonb
),
(
  'BOOKING_SCHEDULE_REMINDER','BOOKING','AUTOMATION_RUNTIME',1,
  '{"type":"object","properties":{"organizationId":{"type":"string","format":"uuid"},"bookingId":{"type":"string","format":"uuid"},"conversationId":{"type":"string","format":"uuid"},"reminderAt":{"type":"string","format":"date-time"}},"required":["organizationId","bookingId","conversationId","reminderAt"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"scheduled":{"type":"boolean"},"matched":{"type":"integer"},"enqueued":{"type":"integer"}},"required":["scheduled"],"additionalProperties":true}'::jsonb,
  'BOOKING_REMINDER_SCHEDULE','BOOKING',true,'AUTOMATION_RUNTIME_SOURCE_EVENT_KEY','NONE',
  'INTERNAL_STATE','NONE',null,'AUTOMATION_RUNTIME_ENQUEUE_RELOAD',
  '{"event":"BOOKING_AI_REMINDER_SCHEDULED","entityType":"booking","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Schedule a governed SCHEDULE_DUE runtime event; any customer reminder send still crosses existing SEND_FOLLOWUP approval/provider authority.',
  '{"executionSurfaces":["AI"],"providerSend":false,"downstreamProviderSendAuthority":"SEND_FOLLOWUP"}'::jsonb
),
(
  'BOOKING_ESCALATE','BOOKING','OPERATOR_BRIEFS',1,
  '{"type":"object","properties":{"organizationId":{"type":"string","format":"uuid"},"bookingId":{"type":"string","format":"uuid"},"conversationId":{"type":"string","format":"uuid"},"reason":{"type":"string"}},"required":["organizationId","bookingId","conversationId","reason"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"briefId":{"type":"string","format":"uuid"},"verified":{"type":"boolean"}},"required":["briefId"],"additionalProperties":true}'::jsonb,
  'OPERATOR_BRIEF_CREATE','BOOKING',true,'OPERATOR_BRIEF_REQUEST_KEY','NONE',
  'INTERNAL_STATE','NONE',null,'OPERATOR_BRIEF_PERSISTENCE',
  '{"event":"BOOKING_AI_ESCALATED","entityType":"booking","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Escalate Booking attention through the existing idempotent operator-brief authority.',
  '{"executionSurfaces":["AI"],"providerSend":false}'::jsonb
),
(
  'BOOKING_DEPOSIT_REQUIREMENT','BOOKING','BOOKING_CATALOG',1,
  '{"type":"object","properties":{"organizationId":{"type":"string","format":"uuid"},"conversationId":{"type":"string","format":"uuid"},"serviceId":{"type":"string"}},"required":["organizationId","conversationId","serviceId"],"additionalProperties":false}'::jsonb,
  '{"type":"object","properties":{"required":{"type":"boolean"},"percent":{"type":"integer"},"amount":{"type":"number"},"currency":{"type":"string"},"paymentExecutionAvailable":{"type":"boolean"}},"required":["required","paymentExecutionAvailable"],"additionalProperties":true}'::jsonb,
  'BOOKING_READ','CONVERSATION',true,'AGENT_RUN_REQUEST_KEY_PLUS_DEPOSIT_POLICY','NONE',
  'READ_ONLY','NONE',null,'BOOKING_DEPOSIT_POLICY_RELOAD',
  '{"event":"BOOKING_AI_DEPOSIT_POLICY_READ","entityType":"conversation","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Read canonical deposit requirement. It never creates payment intent, payment link or paid state before PAYMENT-CORE.',
  '{"executionSurfaces":["AI"],"providerSend":false,"paymentExecution":false,"paymentExecutionDependency":"PAYMENT-CORE"}'::jsonb
);

create or replace function public.validate_automation_actions(
  p_organization_id uuid,
  p_actions jsonb,
  p_for_publish boolean default false
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_key text;
  v_contract public.tool_action_registry%rowtype;
  v_count integer := 0;
begin
  if p_organization_id is null then
    raise exception 'Automation action validation requires Organization';
  end if;

  if p_actions is null
     or jsonb_typeof(p_actions)<>'array'
     or jsonb_array_length(p_actions) not between 1 and 20
  then
    raise exception 'Automation actions must contain 1..20 action objects';
  end if;

  for v_item in select value from jsonb_array_elements(p_actions) x(value)
  loop
    if jsonb_typeof(v_item)<>'object'
       or (v_item - array['key','config']::text[])<>'{}'::jsonb
       or nullif(btrim(v_item->>'key'),'') is null
       or not (v_item ? 'config')
       or jsonb_typeof(v_item->'config')<>'object'
       or pg_column_size(v_item->'config')>8192
    then
      raise exception 'Automation action shape is invalid';
    end if;

    v_key := upper(btrim(v_item->>'key'));
    if v_key is distinct from v_item->>'key'
       or v_key !~ '^[A-Z][A-Z0-9_.:-]{0,127}$'
    then
      raise exception 'Automation action key is invalid';
    end if;

    select * into v_contract
    from public.tool_action_registry
    where action_key=v_key;

    if not found then
      raise exception 'Automation action is not cataloged: %',v_key;
    end if;

    if p_for_publish then
      if jsonb_typeof(v_contract.metadata->'executionSurfaces')='array'
         and not (v_contract.metadata->'executionSurfaces' @> '["AUTOMATION"]'::jsonb)
      then
        raise exception 'Automation action is not available on AUTOMATION execution surface: %',v_key;
      end if;
      if v_contract.availability<>'AVAILABLE' then
        raise exception 'Automation action is not publishable: % (%)',
          v_key,v_contract.availability;
      end if;

      if v_contract.approval_requirement='REQUIRED'
         and not exists(
           select 1
           from public.approval_rules a
           where a.organization_id=p_organization_id
             and a.action_key=v_contract.approval_policy_key
             and a.requires_approval=true
         )
      then
        raise exception 'Required approval policy is not configured: %',
          v_contract.approval_policy_key;
      end if;

      if v_contract.approval_requirement='CONDITIONAL'
         and not exists(
           select 1
           from public.approval_rules a
           where a.organization_id=p_organization_id
             and a.action_key=v_contract.approval_policy_key
         )
      then
        raise exception 'Conditional approval policy is not configured: %',
          v_contract.approval_policy_key;
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

insert into public.automation_condition_fact_catalog
  (fact_key,subject_type,data_type,operators,nullable,description)
values
  ('BOOKING.STATUS','BOOKING','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Booking lifecycle status.'),
  ('BOOKING.SERVICE_ID','BOOKING','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical service identifier on Booking.'),
  ('BOOKING.PERSON_ID','BOOKING','UUID',array['EQ','IN','NOT_IN'],false,'Canonical CRM Person linked to Booking.'),
  ('BOOKING.LEAD_ID','BOOKING','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Optional canonical Lead linked to Booking.'),
  ('BOOKING.BRANCH_ID','BOOKING','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Resolved canonical Branch on Booking.'),
  ('BOOKING.STAFF_USER_ID','BOOKING','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Resolved Organization staff member on Booking.'),
  ('BOOKING.STARTS_AT','BOOKING','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Resolved Booking start.'),
  ('BOOKING.ENDS_AT','BOOKING','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Resolved Booking end.'),
  ('BOOKING.REQUESTED_STARTS_AT','BOOKING','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Requested start before a hold is attached.'),
  ('BOOKING.CREATED_AT','BOOKING','TIMESTAMP',array['BEFORE','AFTER','BETWEEN'],false,'Booking creation timestamp.'),
  ('BOOKING.UPDATED_AT','BOOKING','TIMESTAMP',array['BEFORE','AFTER','BETWEEN'],false,'Booking update timestamp.');

create or replace function public.automation_trigger_expected_condition_subject(p_trigger_key text)
returns text
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select case family
    when 'MESSAGE' then 'CONVERSATION'
    when 'CUSTOMER' then 'ACCOUNT'
    when 'LEAD' then 'LEAD'
    when 'DEAL' then 'DEAL'
    when 'TASK' then 'TASK'
    when 'SEGMENT' then 'SEGMENT_SNAPSHOT'
    when 'CASE' then 'CASE'
    when 'BOOKING' then 'BOOKING'
    else null
  end
  from public.automation_trigger_catalog
  where trigger_key=upper(trim(p_trigger_key));
$$;

create or replace function public.automation_condition_subject_facts(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_subject text := upper(trim(coalesce(p_subject_type,'')));
  v_facts jsonb;
begin
  if v_subject='LEAD' then
    select jsonb_build_object(
      'LEAD.STATUS',l.status::text,
      'LEAD.OPPORTUNITY_SCORE',l.opportunity_score,
      'LEAD.INTENT_SCORE',l.intent_score,
      'LEAD.FIT_SCORE',l.fit_score,
      'LEAD.ENGAGEMENT_SCORE',l.engagement_score,
      'LEAD.BUSINESS_ID',l.business_id,
      'LEAD.PERSON_ID',l.person_id,
      'LEAD.AGENT_MODE',l.agent_mode::text,
      'LEAD.RECOMMENDED_OFFER',l.recommended_offer,
      'LEAD.CREATED_AT',l.created_at,
      'LEAD.UPDATED_AT',l.updated_at
    ) into v_facts
    from public.leads l
    where l.organization_id=p_organization_id and l.id=p_subject_id;

  elsif v_subject='DEAL' then
    select jsonb_build_object(
      'DEAL.STATE',d.state,
      'DEAL.AMOUNT',d.amount,
      'DEAL.CURRENCY',d.currency,
      'DEAL.BUSINESS_ID',d.business_id,
      'DEAL.OWNER_USER_ID',d.owner_user_id,
      'DEAL.TEAM_ID',d.team_id,
      'DEAL.PERSON_ID',d.person_id,
      'DEAL.EXPECTED_CLOSE_AT',d.expected_close_at
    ) into v_facts
    from public.crm_deals d
    where d.organization_id=p_organization_id and d.id=p_subject_id;

  elsif v_subject='TASK' then
    select jsonb_build_object(
      'TASK.STATUS',t.status,
      'TASK.ASSIGNEE_USER_ID',t.assignee_user_id,
      'TASK.DUE_AT',t.due_at,
      'TASK.DEAL_ID',t.deal_id,
      'TASK.LEAD_ID',t.lead_id,
      'TASK.PERSON_ID',t.person_id
    ) into v_facts
    from public.crm_tasks t
    where t.organization_id=p_organization_id and t.id=p_subject_id;

  elsif v_subject='ACCOUNT' then
    select jsonb_build_object(
      'ACCOUNT.ACCOUNT_LIFECYCLE',b.account_lifecycle,
      'ACCOUNT.COUNTRY_CODE',b.country_code,
      'ACCOUNT.CITY',b.city,
      'ACCOUNT.CATEGORY',b.category,
      'ACCOUNT.OWNER_USER_ID',b.account_owner_user_id,
      'ACCOUNT.PARENT_BUSINESS_ID',b.parent_business_id,
      'ACCOUNT.CREATED_AT',b.created_at,
      'ACCOUNT.UPDATED_AT',b.updated_at
    ) into v_facts
    from public.businesses b
    where b.organization_id=p_organization_id and b.id=p_subject_id;

  elsif v_subject='CONVERSATION' then
    select jsonb_build_object(
      'CONVERSATION.CHANNEL',c.channel,
      'CONVERSATION.STAGE',c.stage,
      'CONVERSATION.PRIORITY',c.priority,
      'CONVERSATION.UNREAD_COUNT',c.unread_count,
      'CONVERSATION.AWAITING_PARTY',c.awaiting_party,
      'CONVERSATION.REQUIRES_HUMAN',c.requires_human,
      'CONVERSATION.LAST_INBOUND_AT',c.last_inbound_at,
      'CONVERSATION.LAST_OUTBOUND_AT',c.last_outbound_at,
      'CONVERSATION.INTENT_LABEL',c.intent_label,
      'CONVERSATION.SENTIMENT_LABEL',c.sentiment_label,
      'CONVERSATION.LEAD_ID',c.lead_id,
      'CONVERSATION.PERSON_ID',c.person_id
    ) into v_facts
    from public.sales_conversations c
    where c.organization_id=p_organization_id and c.id=p_subject_id;

  elsif v_subject='SEGMENT_SNAPSHOT' then
    select jsonb_build_object(
      'SEGMENT_SNAPSHOT.SEGMENT_ID',s.segment_id,
      'SEGMENT_SNAPSHOT.SEGMENT_VERSION',s.segment_version,
      'SEGMENT_SNAPSHOT.ENTITY_TYPE',s.entity_type,
      'SEGMENT_SNAPSHOT.MEMBER_COUNT',s.member_count,
      'SEGMENT_SNAPSHOT.PURPOSE',s.purpose,
      'SEGMENT_SNAPSHOT.CREATED_AT',s.created_at
    ) into v_facts
    from public.crm_segment_snapshots s
    where s.organization_id=p_organization_id and s.id=p_subject_id;

  elsif v_subject='BOOKING' then
    select jsonb_build_object(
      'BOOKING.STATUS',b.status,
      'BOOKING.SERVICE_ID',b.service_id,
      'BOOKING.PERSON_ID',b.person_id,
      'BOOKING.LEAD_ID',b.lead_id,
      'BOOKING.BRANCH_ID',b.branch_id,
      'BOOKING.STAFF_USER_ID',b.staff_user_id,
      'BOOKING.STARTS_AT',b.starts_at,
      'BOOKING.ENDS_AT',b.ends_at,
      'BOOKING.REQUESTED_STARTS_AT',b.requested_starts_at,
      'BOOKING.CREATED_AT',b.created_at,
      'BOOKING.UPDATED_AT',b.updated_at
    ) into v_facts
    from public.bookings b
    where b.organization_id=p_organization_id and b.id=p_subject_id;

  elsif v_subject='CASE' then
    select jsonb_build_object(
      'CASE.STATUS',s.status,
      'CASE.PRIORITY',s.priority,
      'CASE.ASSIGNEE_USER_ID',s.assignee_user_id,
      'CASE.ESCALATION_LEVEL',s.escalation_level,
      'CASE.CSAT_SCORE',s.csat_score,
      'CASE.BUSINESS_ID',s.business_id,
      'CASE.PERSON_ID',s.person_id,
      'CASE.CONVERSATION_ID',s.conversation_id,
      'CASE.FIRST_RESPONSE_DUE_AT',s.first_response_due_at,
      'CASE.RESOLUTION_DUE_AT',s.resolution_due_at
    ) into v_facts
    from public.crm_support_cases s
    where s.organization_id=p_organization_id and s.id=p_subject_id;

  else
    raise exception 'Automation condition subject type is unsupported: %',v_subject;
  end if;

  if v_facts is null then
    raise exception 'Automation condition subject was not found in Organization';
  end if;

  return v_facts;
end;
$$;

update public.automation_trigger_catalog
set availability='AVAILABLE',
    required_work_package=null,
    description=case trigger_key
      when 'BOOKING_CREATED' then 'Canonical Booking request was created with immutable lifecycle evidence.'
      when 'BOOKING_CONFIRMED' then 'Canonical Booking reached CONFIRMED with immutable lifecycle evidence.'
      when 'BOOKING_CANCELLED' then 'Canonical Booking reached CANCELED with immutable lifecycle evidence.'
      else description
    end
where trigger_key in ('BOOKING_CREATED','BOOKING_CONFIRMED','BOOKING_CANCELLED');

create unique index audit_logs_booking_automation_projection_uidx
  on public.audit_logs(organization_id,correlation_id)
  where action='BOOKING_AUTOMATION_EVENT_PROJECTED'
    and correlation_id is not null;

create or replace function public.reconcile_booking_automation_events(
  p_limit integer default 100
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_event record;
  v_trigger text;
  v_source_key text;
  v_result jsonb;
  v_processed integer:=0;
  v_enqueued integer:=0;
  v_replayed integer:=0;
begin
  if current_user<>'service_role' or p_limit not between 1 and 1000 then
    raise exception 'Booking automation reconciliation is not permitted';
  end if;

  for v_event in
    select e.id,e.organization_id,e.booking_id,e.transition,e.from_status,e.to_status,
           e.reason,e.result_payload,e.occurred_at
    from public.booking_lifecycle_events e
    where e.transition in ('REQUESTED','CONFIRMED','CANCELED')
      and not exists(
        select 1 from public.audit_logs a
        where a.organization_id=e.organization_id
          and a.action='BOOKING_AUTOMATION_EVENT_PROJECTED'
          and a.correlation_id='booking-lifecycle:'||e.id::text
      )
    order by e.occurred_at,e.id
    for update skip locked
    limit p_limit
  loop
    v_trigger:=case v_event.transition
      when 'REQUESTED' then 'BOOKING_CREATED'
      when 'CONFIRMED' then 'BOOKING_CONFIRMED'
      when 'CANCELED' then 'BOOKING_CANCELLED'
    end;
    v_source_key:='booking-lifecycle:'||v_event.id::text;

    v_result:=public.enqueue_automation_runtime_event(
      v_event.organization_id,
      v_trigger,
      v_source_key,
      'BOOKING',
      v_event.booking_id,
      jsonb_build_object(
        'bookingId',v_event.booking_id,
        'transition',v_event.transition,
        'fromStatus',v_event.from_status,
        'toStatus',v_event.to_status,
        'reason',v_event.reason,
        'lifecycleEventId',v_event.id,
        'result',v_event.result_payload
      ),
      v_event.occurred_at
    );

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,
      after_data,correlation_id
    ) values (
      v_event.organization_id,'SYSTEM','booking_ai',
      'BOOKING_AUTOMATION_EVENT_PROJECTED','booking',v_event.booking_id::text,
      jsonb_build_object(
        'triggerKey',v_trigger,
        'lifecycleEventId',v_event.id,
        'runtime',v_result
      ),
      v_source_key
    )
    on conflict do nothing;

    v_processed:=v_processed+1;
    v_enqueued:=v_enqueued+coalesce((v_result->>'enqueued')::integer,0);
    v_replayed:=v_replayed+coalesce((v_result->>'replayed')::integer,0);
  end loop;

  return jsonb_build_object(
    'processed',v_processed,
    'enqueued',v_enqueued,
    'replayed',v_replayed
  );
end;
$$;

create or replace function public.get_booking_deposit_requirement(
  p_organization_id uuid,
  p_service_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_rules jsonb;
  v_required boolean;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or nullif(btrim(p_service_id),'') is null
  then raise exception 'Booking deposit policy lookup is not permitted'; end if;

  select p.booking_rules into v_rules
  from public.service_booking_profiles p
  join public.services s
    on s.organization_id=p.organization_id and s.id=p.service_id
  where p.organization_id=p_organization_id
    and p.service_id=p_service_id
    and p.booking_enabled=true
    and s.enabled=true;

  if v_rules is null then
    raise exception 'Bookable service was not found';
  end if;

  v_required:=coalesce((v_rules->>'depositRequired')::boolean,false);
  return jsonb_strip_nulls(jsonb_build_object(
    'serviceId',p_service_id,
    'required',v_required,
    'percent',case when v_required and v_rules ? 'depositPercent' then (v_rules->>'depositPercent')::integer end,
    'amount',case when v_required and v_rules ? 'depositAmount' then (v_rules->>'depositAmount')::numeric end,
    'currency',case when v_required then v_rules->>'depositCurrency' end,
    'paymentExecutionAvailable',false,
    'paymentExecutionDependency','PAYMENT-CORE'
  ));
end;
$$;

create or replace function public.execute_booking_ai_create(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_person_id uuid,
  p_lead_id uuid,
  p_service_id text,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_request_key text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_request jsonb;
  v_hold jsonb;
  v_held jsonb;
  v_final jsonb;
  v_rules jsonb;
begin
  if current_user<>'service_role'
     or p_conversation_id is null or p_person_id is null
     or nullif(btrim(p_service_id),'') is null or p_starts_at is null
     or length(v_request_key) not between 8 and 150
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object'
     or coalesce((p_evidence->>'explicitCustomerRequest')::boolean,false) is distinct from true
     or octet_length(p_evidence::text)>16384
  then raise exception 'Booking AI create payload is invalid'; end if;

  if not exists(
    select 1
    from public.sales_conversations c
    left join public.leads l
      on l.organization_id=c.organization_id and l.id=c.lead_id
    where c.organization_id=p_organization_id
      and c.id=p_conversation_id
      and (c.person_id=p_person_id or l.person_id=p_person_id)
      and (p_lead_id is null or c.lead_id=p_lead_id)
  ) then raise exception 'Booking AI conversation/customer linkage is invalid'; end if;

  select p.booking_rules into v_rules
  from public.service_booking_profiles p
  join public.services s
    on s.organization_id=p.organization_id and s.id=p.service_id
  where p.organization_id=p_organization_id and p.service_id=p_service_id
    and p.booking_enabled=true and s.enabled=true;
  if v_rules is null then raise exception 'Booking AI service is not bookable'; end if;

  v_request:=public.request_booking(
    p_organization_id,null,p_person_id,p_lead_id,p_service_id,
    p_branch_id,p_starts_at,null,
    p_evidence||jsonb_build_object('source','BOOKING_AI','conversationId',p_conversation_id),
    v_request_key||':request'
  );

  v_hold:=public.create_booking_hold(
    p_organization_id,null,p_service_id,p_branch_id,p_starts_at,15,
    v_request_key||':hold',
    p_evidence||jsonb_build_object('source','BOOKING_AI','conversationId',p_conversation_id)
  );

  v_held:=public.hold_booking_request(
    p_organization_id,null,(v_request->>'bookingId')::uuid,(v_hold->>'holdId')::uuid,
    v_request_key||':held'
  );

  if coalesce((v_rules->>'requiresConfirmation')::boolean,false) then
    v_final:=v_held;
  else
    v_final:=public.confirm_booking(
      p_organization_id,null,(v_request->>'bookingId')::uuid,
      v_request_key||':confirm'
    );
  end if;

  return v_final||jsonb_build_object(
    'action','BOOKING_CREATE',
    'holdId',v_hold->>'holdId',
    'requiresConfirmation',coalesce((v_rules->>'requiresConfirmation')::boolean,false)
  );
end;
$$;

create or replace function public.execute_booking_ai_reschedule(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_booking_id uuid,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_reason text,
  p_request_key text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_booking public.bookings%rowtype;
  v_rules jsonb;
  v_hold jsonb;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_conversation_id is null or p_booking_id is null or p_starts_at is null
     or v_reason is null or length(v_reason)>500
     or length(v_request_key) not between 8 and 150
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object'
     or coalesce((p_evidence->>'explicitCustomerRequest')::boolean,false) is distinct from true
     or octet_length(p_evidence::text)>16384
  then raise exception 'Booking AI reschedule payload is invalid'; end if;

  select b.* into v_booking
  from public.bookings b
  where b.organization_id=p_organization_id and b.id=p_booking_id;
  if not found then raise exception 'Booking AI target Booking was not found'; end if;

  if not exists(
    select 1
    from public.sales_conversations c
    left join public.leads l
      on l.organization_id=c.organization_id and l.id=c.lead_id
    where c.organization_id=p_organization_id
      and c.id=p_conversation_id
      and (c.person_id=v_booking.person_id or l.person_id=v_booking.person_id)
  ) then raise exception 'Booking AI conversation/customer linkage is invalid'; end if;

  select booking_rules into v_rules
  from public.service_booking_profiles
  where organization_id=p_organization_id and service_id=v_booking.service_id;
  if coalesce((v_rules->>'allowCustomerReschedule')::boolean,false) is distinct from true then
    raise exception 'Customer reschedule is disabled by canonical Booking policy';
  end if;

  v_hold:=public.create_booking_hold(
    p_organization_id,null,v_booking.service_id,p_branch_id,p_starts_at,15,
    v_request_key||':hold',
    p_evidence||jsonb_build_object('source','BOOKING_AI','conversationId',p_conversation_id)
  );
  v_result:=public.reschedule_booking(
    p_organization_id,null,p_booking_id,(v_hold->>'holdId')::uuid,
    v_reason,v_request_key||':reschedule'
  );
  return v_result||jsonb_build_object('action','BOOKING_RESCHEDULE','holdId',v_hold->>'holdId');
end;
$$;

create or replace function public.execute_booking_ai_cancel(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_booking_id uuid,
  p_reason text,
  p_request_key text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_booking public.bookings%rowtype;
  v_rules jsonb;
  v_notice integer;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_conversation_id is null or p_booking_id is null
     or v_reason is null or length(v_reason)>500
     or length(v_request_key) not between 8 and 150
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object'
     or coalesce((p_evidence->>'explicitCustomerRequest')::boolean,false) is distinct from true
     or octet_length(p_evidence::text)>16384
  then raise exception 'Booking AI cancel payload is invalid'; end if;

  select b.* into v_booking
  from public.bookings b
  where b.organization_id=p_organization_id and b.id=p_booking_id;
  if not found then raise exception 'Booking AI target Booking was not found'; end if;

  if not exists(
    select 1
    from public.sales_conversations c
    left join public.leads l
      on l.organization_id=c.organization_id and l.id=c.lead_id
    where c.organization_id=p_organization_id
      and c.id=p_conversation_id
      and (c.person_id=v_booking.person_id or l.person_id=v_booking.person_id)
  ) then raise exception 'Booking AI conversation/customer linkage is invalid'; end if;

  select booking_rules into v_rules
  from public.service_booking_profiles
  where organization_id=p_organization_id and service_id=v_booking.service_id;
  if coalesce((v_rules->>'allowCustomerCancel')::boolean,false) is distinct from true then
    raise exception 'Customer cancellation is disabled by canonical Booking policy';
  end if;

  v_notice:=coalesce((v_rules->>'cancellationNoticeMinutes')::integer,0);
  if v_booking.starts_at is not null
     and now()>v_booking.starts_at-make_interval(mins=>v_notice)
  then raise exception 'Customer cancellation notice window has closed'; end if;

  v_result:=public.cancel_booking(
    p_organization_id,null,p_booking_id,v_reason,v_request_key||':cancel'
  );
  return v_result||jsonb_build_object('action','BOOKING_CANCEL');
end;
$$;

create or replace function public.record_booking_ai_tool_audit(
  p_organization_id uuid,
  p_action_key text,
  p_conversation_id uuid,
  p_entity_id text,
  p_request_key text,
  p_evidence jsonb,
  p_result jsonb
)
returns boolean
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or upper(btrim(coalesce(p_action_key,''))) not like 'BOOKING_%'
     or p_conversation_id is null
     or length(btrim(coalesce(p_request_key,''))) not between 8 and 200
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object'
     or p_result is null or jsonb_typeof(p_result)<>'object'
     or octet_length(p_evidence::text)>16384
     or octet_length(p_result::text)>32768
  then raise exception 'Booking AI tool audit payload is invalid'; end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'SYSTEM','booking_ai','BOOKING_AI_TOOL_EXECUTED',
    'booking_ai_action',coalesce(p_entity_id,p_conversation_id::text),
    jsonb_build_object(
      'actionKey',upper(btrim(p_action_key)),
      'conversationId',p_conversation_id,
      'evidence',p_evidence,
      'result',p_result
    ),
    p_request_key
  );
  return true;
end;
$$;

create unique index audit_logs_booking_ai_tool_request_uidx
  on public.audit_logs(organization_id,correlation_id)
  where action='BOOKING_AI_TOOL_EXECUTED'
    and correlation_id is not null;

revoke all on function public.reconcile_booking_automation_events(integer)
  from public,anon,authenticated;
grant execute on function public.reconcile_booking_automation_events(integer)
  to service_role;

revoke all on function public.get_booking_deposit_requirement(uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_booking_deposit_requirement(uuid,text)
  to service_role;

revoke all on function public.execute_booking_ai_create(uuid,uuid,uuid,uuid,text,uuid,timestamptz,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.execute_booking_ai_create(uuid,uuid,uuid,uuid,text,uuid,timestamptz,text,jsonb)
  to service_role;

revoke all on function public.execute_booking_ai_reschedule(uuid,uuid,uuid,uuid,timestamptz,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.execute_booking_ai_reschedule(uuid,uuid,uuid,uuid,timestamptz,text,text,jsonb)
  to service_role;

revoke all on function public.execute_booking_ai_cancel(uuid,uuid,uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.execute_booking_ai_cancel(uuid,uuid,uuid,text,text,jsonb)
  to service_role;

revoke all on function public.record_booking_ai_tool_audit(uuid,text,uuid,text,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.record_booking_ai_tool_audit(uuid,text,uuid,text,text,jsonb,jsonb)
  to service_role;
