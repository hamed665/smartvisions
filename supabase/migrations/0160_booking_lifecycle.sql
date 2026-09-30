-- 0160: BOOKING-LIFECYCLE
-- Canonical Booking lifecycle authority layered over BOOKING-CATALOG and
-- BOOKING-AVAILABILITY. Holds remain temporary capacity claims. Confirmed and
-- rescheduled bookings become durable capacity claims. This migration does not
-- create a second service/staff/resource/customer/payment/workflow authority.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  booking_reference text not null default (
    'BK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))
  ),
  person_id uuid not null,
  lead_id uuid,
  service_id text not null,
  requested_branch_id uuid,
  requested_starts_at timestamptz,
  branch_id uuid,
  staff_user_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  occupied_starts_at timestamptz,
  occupied_ends_at timestamptz,
  status text not null default 'REQUESTED' check (
    status in ('REQUESTED','HELD','CONFIRMED','RESCHEDULED','CANCELED','COMPLETED','NO_SHOW')
  ),
  current_hold_id uuid,
  cancel_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384
  ),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  confirmed_at timestamptz,
  rescheduled_at timestamptz,
  canceled_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_person_fk
    foreign key (organization_id,person_id)
    references public.crm_people(organization_id,id)
    on delete restrict,
  constraint bookings_lead_fk
    foreign key (organization_id,lead_id)
    references public.leads(organization_id,id)
    on delete restrict,
  constraint bookings_service_fk
    foreign key (organization_id,service_id)
    references public.service_booking_profiles(organization_id,service_id)
    on delete restrict,
  constraint bookings_requested_branch_fk
    foreign key (organization_id,requested_branch_id)
    references public.branches(organization_id,id)
    on delete restrict,
  constraint bookings_branch_fk
    foreign key (organization_id,branch_id)
    references public.branches(organization_id,id)
    on delete restrict,
  constraint bookings_staff_fk
    foreign key (organization_id,staff_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint bookings_current_hold_fk
    foreign key (organization_id,current_hold_id)
    references public.booking_holds(organization_id,id)
    on delete restrict,
  constraint bookings_created_by_fk
    foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint bookings_updated_by_fk
    foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,

  constraint bookings_reference_check
    check (
      length(booking_reference) between 6 and 32
      and booking_reference ~ '^[A-Z0-9-]+$'
    ),
  constraint bookings_time_check
    check (
      (starts_at is null and ends_at is null and occupied_starts_at is null and occupied_ends_at is null)
      or
      (
        starts_at is not null and ends_at is not null
        and occupied_starts_at is not null and occupied_ends_at is not null
        and starts_at<ends_at
        and occupied_starts_at<=starts_at
        and occupied_ends_at>=ends_at
        and occupied_starts_at<occupied_ends_at
      )
    ),
  constraint bookings_state_shape_check
    check (
      (
        status='REQUESTED'
        and current_hold_id is null
        and starts_at is null
      )
      or
      (
        status='HELD'
        and current_hold_id is not null
        and starts_at is not null
        and staff_user_id is not null
      )
      or
      (
        status in ('CONFIRMED','RESCHEDULED','COMPLETED','NO_SHOW')
        and current_hold_id is null
        and starts_at is not null
        and staff_user_id is not null
      )
      or
      (
        status='CANCELED'
        and current_hold_id is null
      )
    ),
  constraint bookings_cancel_reason_check
    check (cancel_reason is null or length(btrim(cancel_reason)) between 1 and 500),
  constraint bookings_notes_check
    check (notes is null or length(notes)<=2000),
  unique (organization_id,id),
  unique (organization_id,booking_reference)
);

comment on table public.bookings is
  'Canonical Booking lifecycle truth. REQUESTED is non-capacity-bearing; HELD is backed by booking_holds; CONFIRMED/RESCHEDULED are durable capacity claims.';

create unique index bookings_current_hold_uidx
  on public.bookings(organization_id,current_hold_id)
  where current_hold_id is not null;
create index bookings_person_idx
  on public.bookings(organization_id,person_id,created_at desc,id);
create index bookings_lead_idx
  on public.bookings(organization_id,lead_id,created_at desc,id)
  where lead_id is not null;
create index bookings_service_slot_idx
  on public.bookings(organization_id,service_id,starts_at,status)
  where starts_at is not null;
create index bookings_branch_slot_idx
  on public.bookings(organization_id,branch_id,starts_at,status)
  where branch_id is not null and starts_at is not null;
create index bookings_requested_branch_idx
  on public.bookings(organization_id,requested_branch_id)
  where requested_branch_id is not null;
create index bookings_staff_slot_idx
  on public.bookings(organization_id,staff_user_id,occupied_starts_at,occupied_ends_at)
  where staff_user_id is not null and occupied_starts_at is not null;
create index bookings_created_by_idx
  on public.bookings(organization_id,created_by_user_id);
create index bookings_updated_by_idx
  on public.bookings(organization_id,updated_by_user_id);
create index bookings_upcoming_idx
  on public.bookings(organization_id,starts_at,id)
  where status in ('HELD','CONFIRMED','RESCHEDULED');

create table public.booking_resource_allocations (
  organization_id uuid not null,
  booking_id uuid not null,
  resource_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (booking_id,resource_id),
  constraint booking_resource_allocations_booking_fk
    foreign key (organization_id,booking_id)
    references public.bookings(organization_id,id)
    on delete cascade,
  constraint booking_resource_allocations_resource_fk
    foreign key (organization_id,resource_id)
    references public.booking_resources(organization_id,id)
    on delete restrict
);

create index booking_resource_allocations_booking_idx
  on public.booking_resource_allocations(organization_id,booking_id);
create index booking_resource_allocations_resource_idx
  on public.booking_resource_allocations(organization_id,resource_id,booking_id);

create table public.booking_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid not null,
  transition text not null check (
    transition in (
      'REQUESTED','HELD','CONFIRMED','RESCHEDULED',
      'CANCELED','COMPLETED','NO_SHOW'
    )
  ),
  from_status text,
  to_status text not null check (
    to_status in (
      'REQUESTED','HELD','CONFIRMED','RESCHEDULED',
      'CANCELED','COMPLETED','NO_SHOW'
    )
  ),
  reason text,
  actor_user_id uuid,
  request_key text not null,
  request_hash text not null,
  evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16384
  ),
  result_payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(result_payload)='object' and octet_length(result_payload::text)<=16384
  ),
  occurred_at timestamptz not null default now(),

  constraint booking_lifecycle_events_booking_fk
    foreign key (organization_id,booking_id)
    references public.bookings(organization_id,id)
    on delete cascade,
  constraint booking_lifecycle_events_actor_fk
    foreign key (organization_id,actor_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint booking_lifecycle_events_from_status_check
    check (
      from_status is null
      or from_status in (
        'REQUESTED','HELD','CONFIRMED','RESCHEDULED',
        'CANCELED','COMPLETED','NO_SHOW'
      )
    ),
  constraint booking_lifecycle_events_reason_check
    check (reason is null or length(btrim(reason)) between 1 and 500),
  constraint booking_lifecycle_events_request_key_check
    check (
      length(request_key) between 8 and 200
      and request_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  unique (organization_id,request_key)
);

create index booking_lifecycle_events_booking_idx
  on public.booking_lifecycle_events(organization_id,booking_id,occurred_at desc,id);
create index booking_lifecycle_events_actor_idx
  on public.booking_lifecycle_events(organization_id,actor_user_id,occurred_at desc)
  where actor_user_id is not null;

alter table public.bookings enable row level security;
alter table public.booking_resource_allocations enable row level security;
alter table public.booking_lifecycle_events enable row level security;

create policy bookings_member_read
on public.bookings for select to authenticated
using (public.is_org_member(organization_id));

create policy booking_resource_allocations_member_read
on public.booking_resource_allocations for select to authenticated
using (public.is_org_member(organization_id));

create policy booking_lifecycle_events_member_read
on public.booking_lifecycle_events for select to authenticated
using (public.is_org_member(organization_id));

revoke all on table
  public.bookings,
  public.booking_resource_allocations,
  public.booking_lifecycle_events
from public,anon,authenticated,service_role;

grant select on table
  public.bookings,
  public.booking_resource_allocations,
  public.booking_lifecycle_events
to authenticated,service_role;

grant insert,update,delete on table
  public.bookings,
  public.booking_resource_allocations,
  public.booking_lifecycle_events
to service_role;

create or replace function public.guard_booking_lifecycle_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.booking_lifecycle_mutation',true),'')<>'allowed' then
    raise exception 'Booking lifecycle state requires governed command';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger bookings_mutation_guard
before insert or update or delete on public.bookings
for each row execute function public.guard_booking_lifecycle_mutation();

create trigger booking_resource_allocations_mutation_guard
before insert or update or delete on public.booking_resource_allocations
for each row execute function public.guard_booking_lifecycle_mutation();

create trigger booking_lifecycle_events_mutation_guard
before insert or update or delete on public.booking_lifecycle_events
for each row execute function public.guard_booking_lifecycle_mutation();

create or replace function public.guard_linked_booking_hold_release()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if old.status='ACTIVE'
     and new.status in ('RELEASED','EXPIRED')
     and coalesce(current_setting('app.booking_lifecycle_mutation',true),'')<>'allowed'
     and exists(
       select 1
       from public.bookings b
       where b.organization_id=old.organization_id
         and b.current_hold_id=old.id
         and b.status='HELD'
     )
  then
    raise exception 'Booking-linked hold must be released through Booking lifecycle';
  end if;
  return new;
end;
$$;

create trigger booking_holds_linked_lifecycle_guard
before update of status on public.booking_holds
for each row execute function public.guard_linked_booking_hold_release();

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
  select exists(
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
    p_organization_id,'USER',p_actor_user_id::text,
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
    p_organization_id,'USER',p_actor_user_id::text,
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
    p_organization_id,'USER',p_actor_user_id::text,
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
    case when v_booking.rescheduled_at is null then 'CONFIRMED' else 'CONFIRMED' end,
    'RESCHEDULED',v_reason,
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
    p_organization_id,'USER',p_actor_user_id::text,
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
    p_organization_id,'USER',p_actor_user_id::text,
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

create or replace function public.finalize_booking(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_booking_id uuid,
  p_target_status text,
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
  v_target text:=upper(btrim(coalesce(p_target_status,'')));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_hash text;
  v_existing public.booking_lifecycle_events%rowtype;
  v_booking public.bookings%rowtype;
  v_from text;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_booking_id is null
     or v_target not in ('COMPLETED','NO_SHOW')
     or (v_reason is not null and length(v_reason)>500)
     or not public.booking_lifecycle_actor_allowed(p_organization_id,p_actor_user_id)
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
  then raise exception 'Booking finalization payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'bookingId',p_booking_id,'targetStatus',v_target,'reason',v_reason
  )::text);

  select * into v_existing from public.booking_lifecycle_events
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    if v_existing.transition<>v_target
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
    raise exception 'Only confirmed Booking can be completed or marked no-show';
  end if;
  if v_booking.starts_at>now() then
    raise exception 'Future Booking cannot be completed or marked no-show';
  end if;

  v_from:=v_booking.status;
  perform set_config('app.booking_lifecycle_mutation','allowed',true);

  update public.bookings
  set status=v_target,
      completed_at=case when v_target='COMPLETED' then now() else completed_at end,
      no_show_at=case when v_target='NO_SHOW' then now() else no_show_at end,
      updated_by_user_id=p_actor_user_id,
      updated_at=now()
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
    p_organization_id,p_booking_id,v_target,v_from,v_target,v_reason,
    p_actor_user_id,v_request_key,v_hash,'{}'::jsonb,v_result
  );

  perform set_config('app.booking_lifecycle_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    case when v_target='COMPLETED' then 'BOOKING_COMPLETED' else 'BOOKING_NO_SHOW' end,
    'booking',p_booking_id::text,
    jsonb_build_object('status',v_from),
    jsonb_build_object('status',v_target,'reason',v_reason),
    v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_lifecycle_mutation','0',true);
    raise;
end;
$$;

-- Availability must count durable confirmed/rescheduled bookings in addition to
-- temporary active holds. This preserves one canonical availability engine.
create or replace function public.evaluate_booking_slot(
  p_organization_id uuid,
  p_service_id text,
  p_branch_id uuid,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_profile public.service_booking_profiles%rowtype;
  v_service_enabled boolean;
  v_calendar public.booking_availability_calendars%rowtype;
  v_ends_at timestamptz;
  v_occupied_start timestamptz;
  v_occupied_end timestamptz;
  v_min_notice integer;
  v_max_advance integer;
  v_service_remaining integer;
  v_staff_count integer;
  v_staff_user_id uuid;
  v_resource_limit integer:=1000000;
  v_resource_remaining integer;
  v_req record;
  v_resource_calendar uuid;
  v_hold_count integer;
  v_booking_count integer;
begin
  select * into v_profile
  from public.service_booking_profiles p
  where p.organization_id=p_organization_id and p.service_id=p_service_id;

  if not found then
    return jsonb_build_object('available',false,'reason','SERVICE_NOT_BOOKABLE');
  end if;

  select s.enabled into v_service_enabled
  from public.services s
  where s.organization_id=p_organization_id and s.id=p_service_id;

  if coalesce(v_service_enabled,false)=false
     or not v_profile.booking_enabled
     or v_profile.duration_minutes is null
  then
    return jsonb_build_object('available',false,'reason','SERVICE_NOT_BOOKABLE');
  end if;

  if p_starts_at is null then
    return jsonb_build_object('available',false,'reason','START_REQUIRED');
  end if;

  v_min_notice:=coalesce((v_profile.booking_rules->>'minimumNoticeMinutes')::integer,0);
  v_max_advance:=coalesce((v_profile.booking_rules->>'maximumAdvanceDays')::integer,365);
  if p_starts_at<now()+make_interval(mins=>v_min_notice) then
    return jsonb_build_object('available',false,'reason','MINIMUM_NOTICE');
  end if;
  if p_starts_at>now()+make_interval(days=>v_max_advance) then
    return jsonb_build_object('available',false,'reason','MAXIMUM_ADVANCE');
  end if;

  if v_profile.location_mode='REMOTE' and p_branch_id is not null then
    return jsonb_build_object('available',false,'reason','REMOTE_BRANCH_MISMATCH');
  elsif v_profile.location_mode='ANY_ACTIVE_BRANCH' then
    if p_branch_id is null or not exists(
      select 1 from public.branches b
      where b.organization_id=p_organization_id and b.id=p_branch_id and b.status='ACTIVE'
    ) then
      return jsonb_build_object('available',false,'reason','BRANCH_REQUIRED_OR_INACTIVE');
    end if;
  elsif v_profile.location_mode='EXPLICIT_BRANCHES' then
    if p_branch_id is null or not exists(
      select 1 from public.service_booking_branches b
      join public.branches br
        on br.organization_id=b.organization_id and br.id=b.branch_id
      where b.organization_id=p_organization_id
        and b.service_id=p_service_id
        and b.branch_id=p_branch_id
        and br.status='ACTIVE'
    ) then
      return jsonb_build_object('available',false,'reason','BRANCH_NOT_ELIGIBLE');
    end if;
  end if;

  select * into v_calendar
  from public.booking_availability_calendars c
  where c.organization_id=p_organization_id
    and c.service_id=p_service_id
    and c.calendar_kind='BUSINESS'
    and c.status='ACTIVE'
    and (
      c.branch_id is not distinct from p_branch_id
      or (p_branch_id is not null and c.branch_id is null)
    )
  order by case when c.branch_id is not distinct from p_branch_id then 0 else 1 end,c.id
  limit 1;

  if not found then
    return jsonb_build_object('available',false,'reason','BUSINESS_CALENDAR_MISSING');
  end if;

  v_ends_at:=p_starts_at+make_interval(mins=>v_profile.duration_minutes);
  v_occupied_start:=p_starts_at-make_interval(mins=>v_profile.buffer_before_minutes);
  v_occupied_end:=v_ends_at+make_interval(mins=>v_profile.buffer_after_minutes);

  if not public.booking_calendar_is_open(v_calendar.id,v_occupied_start,v_occupied_end) then
    return jsonb_build_object('available',false,'reason','OUTSIDE_BUSINESS_HOURS','timezone',v_calendar.timezone);
  end if;

  select count(*)::integer into v_hold_count
  from public.booking_holds h
  where h.organization_id=p_organization_id
    and h.service_id=p_service_id
    and h.branch_id is not distinct from p_branch_id
    and h.status='ACTIVE'
    and h.expires_at>now()
    and h.occupied_starts_at<v_occupied_end
    and h.occupied_ends_at>v_occupied_start;

  select count(*)::integer into v_booking_count
  from public.bookings b
  where b.organization_id=p_organization_id
    and b.service_id=p_service_id
    and b.branch_id is not distinct from p_branch_id
    and b.status in ('CONFIRMED','RESCHEDULED')
    and b.occupied_starts_at<v_occupied_end
    and b.occupied_ends_at>v_occupied_start;

  v_service_remaining:=greatest(
    0,v_profile.capacity_per_slot-coalesce(v_hold_count,0)-coalesce(v_booking_count,0)
  );

  if v_service_remaining<=0 then
    return jsonb_build_object('available',false,'reason','SERVICE_CAPACITY_FULL','timezone',v_calendar.timezone);
  end if;

  with eligible as (
    select m.user_id
    from public.organization_members m
    where m.organization_id=p_organization_id
      and (
        (
          v_profile.staff_mode='ANY_ELIGIBLE_ROLE'
          and m.role=any(v_profile.eligible_staff_roles)
        )
        or (
          v_profile.staff_mode='EXPLICIT_STAFF'
          and exists(
            select 1 from public.service_booking_staff ss
            where ss.organization_id=p_organization_id
              and ss.service_id=p_service_id
              and ss.user_id=m.user_id
          )
        )
      )
  ),
  available_staff as (
    select e.user_id
    from eligible e
    join lateral (
      select c.id
      from public.booking_availability_calendars c
      where c.organization_id=p_organization_id
        and c.service_id=p_service_id
        and c.calendar_kind='STAFF'
        and c.staff_user_id=e.user_id
        and c.status='ACTIVE'
        and (
          c.branch_id is not distinct from p_branch_id
          or (p_branch_id is not null and c.branch_id is null)
        )
      order by case when c.branch_id is not distinct from p_branch_id then 0 else 1 end,c.id
      limit 1
    ) sc on true
    where public.booking_calendar_is_open(sc.id,v_occupied_start,v_occupied_end)
      and not exists(
        select 1 from public.booking_holds h
        where h.organization_id=p_organization_id
          and h.staff_user_id=e.user_id
          and h.status='ACTIVE'
          and h.expires_at>now()
          and h.occupied_starts_at<v_occupied_end
          and h.occupied_ends_at>v_occupied_start
      )
      and not exists(
        select 1 from public.bookings b
        where b.organization_id=p_organization_id
          and b.staff_user_id=e.user_id
          and b.status in ('CONFIRMED','RESCHEDULED')
          and b.occupied_starts_at<v_occupied_end
          and b.occupied_ends_at>v_occupied_start
      )
  )
  select count(*)::integer,(array_agg(user_id order by user_id))[1]
  into v_staff_count,v_staff_user_id
  from available_staff;

  if coalesce(v_staff_count,0)=0 or v_staff_user_id is null then
    return jsonb_build_object('available',false,'reason','STAFF_UNAVAILABLE','timezone',v_calendar.timezone);
  end if;

  for v_req in
    select rr.resource_id,rr.quantity_required,r.capacity,r.branch_id
    from public.service_booking_resource_requirements rr
    join public.booking_resources r
      on r.organization_id=rr.organization_id and r.id=rr.resource_id
    where rr.organization_id=p_organization_id
      and rr.service_id=p_service_id
      and r.status='ACTIVE'
  loop
    if v_req.branch_id is not null and v_req.branch_id is distinct from p_branch_id then
      return jsonb_build_object('available',false,'reason','RESOURCE_BRANCH_MISMATCH','resourceId',v_req.resource_id);
    end if;

    select c.id into v_resource_calendar
    from public.booking_availability_calendars c
    where c.organization_id=p_organization_id
      and c.service_id=p_service_id
      and c.calendar_kind='RESOURCE'
      and c.resource_id=v_req.resource_id
      and c.status='ACTIVE'
      and (
        c.branch_id is not distinct from p_branch_id
        or (p_branch_id is not null and c.branch_id is null)
      )
    order by case when c.branch_id is not distinct from p_branch_id then 0 else 1 end,c.id
    limit 1;

    if v_resource_calendar is not null
       and not public.booking_calendar_is_open(v_resource_calendar,v_occupied_start,v_occupied_end)
    then
      return jsonb_build_object('available',false,'reason','RESOURCE_CALENDAR_CLOSED','resourceId',v_req.resource_id);
    end if;

    select greatest(
      0,
      (
        v_req.capacity
        - coalesce((
            select sum(hr.quantity)
            from public.booking_hold_resources hr
            join public.booking_holds h
              on h.organization_id=hr.organization_id and h.id=hr.hold_id
            where hr.organization_id=p_organization_id
              and hr.resource_id=v_req.resource_id
              and h.status='ACTIVE'
              and h.expires_at>now()
              and h.occupied_starts_at<v_occupied_end
              and h.occupied_ends_at>v_occupied_start
          ),0)
        - coalesce((
            select sum(ra.quantity)
            from public.booking_resource_allocations ra
            join public.bookings b
              on b.organization_id=ra.organization_id and b.id=ra.booking_id
            where ra.organization_id=p_organization_id
              and ra.resource_id=v_req.resource_id
              and b.status in ('CONFIRMED','RESCHEDULED')
              and b.occupied_starts_at<v_occupied_end
              and b.occupied_ends_at>v_occupied_start
          ),0)
      )/v_req.quantity_required
    )::integer
    into v_resource_remaining;

    v_resource_remaining:=coalesce(v_resource_remaining,v_req.capacity/v_req.quantity_required);
    if v_resource_remaining<=0 then
      return jsonb_build_object('available',false,'reason','RESOURCE_CAPACITY_FULL','resourceId',v_req.resource_id);
    end if;
    v_resource_limit:=least(v_resource_limit,v_resource_remaining);
  end loop;

  return jsonb_build_object(
    'available',true,
    'slotStart',p_starts_at,
    'slotEnd',v_ends_at,
    'occupiedStart',v_occupied_start,
    'occupiedEnd',v_occupied_end,
    'branchId',p_branch_id,
    'staffUserId',v_staff_user_id,
    'timezone',v_calendar.timezone,
    'remainingCapacity',least(v_service_remaining,v_staff_count,v_resource_limit),
    'reason','AVAILABLE'
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('available',false,'reason','BOOKING_RULE_VALUE_INVALID');
end;
$$;

-- Direct hold release remains available for unlinked temporary holds only.
create or replace function public.release_booking_hold(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_hold_id uuid,
  p_reason text,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_hold public.booking_holds%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_hold_id is null
     or v_reason is null or length(v_reason)>500
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
  then
    raise exception 'Booking hold release payload is invalid';
  end if;

  if p_actor_user_id is not null then
    if not exists(
      select 1 from public.organization_members
      where organization_id=p_organization_id
        and user_id=p_actor_user_id
        and role in ('OWNER','ADMIN','SALES_MANAGER')
    ) then
      raise exception 'Booking hold release actor is not permitted';
    end if;
  end if;

  select after_data into v_existing
  from public.audit_logs
  where organization_id=p_organization_id
    and entity_type='booking_hold'
    and action='BOOKING_HOLD_RELEASED'
    and correlation_id=v_request_key
  order by created_at desc,id desc
  limit 1;
  if v_existing is not null then
    if v_existing->>'holdId'<>p_hold_id::text then
      raise exception 'Booking hold release request key conflict';
    end if;
    return v_existing||jsonb_build_object('replayed',true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-hold:'||p_organization_id::text,0)
  );

  select * into v_hold
  from public.booking_holds
  where organization_id=p_organization_id and id=p_hold_id
  for update;
  if not found then raise exception 'Booking hold was not found'; end if;

  if exists(
    select 1 from public.bookings b
    where b.organization_id=p_organization_id
      and b.current_hold_id=p_hold_id
      and b.status='HELD'
  ) then
    raise exception 'Booking-linked hold must be released through Booking lifecycle';
  end if;

  if v_hold.status='ACTIVE' then
    perform set_config('app.booking_availability_mutation','allowed',true);
    update public.booking_holds
    set status='RELEASED',release_reason=v_reason,released_at=now(),updated_at=now()
    where id=p_hold_id
    returning * into v_hold;
    perform set_config('app.booking_availability_mutation','0',true);
  end if;

  v_result:=jsonb_build_object(
    'holdId',v_hold.id,'status',v_hold.status,'reason',v_reason,'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'booking_availability'),
    'BOOKING_HOLD_RELEASED','booking_hold',v_hold.id::text,
    v_result,v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    raise;
end;
$$;

-- Expiry also closes a HELD Booking, so durable lifecycle state can never point
-- at an expired temporary capacity claim.
create or replace function public.expire_booking_holds(
  p_limit integer default 200
)
returns integer
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_count integer:=0;
  v_due record;
  v_booking public.bookings%rowtype;
  v_request_key text;
  v_result jsonb;
begin
  if current_user<>'service_role' or p_limit not between 1 and 1000 then
    raise exception 'Booking hold expiry is not permitted';
  end if;

  for v_due in
    select id,organization_id
    from public.booking_holds
    where status='ACTIVE' and expires_at<=now()
    order by expires_at,id
    for update skip locked
    limit p_limit
  loop
    perform set_config('app.booking_lifecycle_mutation','allowed',true);
    perform set_config('app.booking_availability_mutation','allowed',true);

    update public.booking_holds
    set status='EXPIRED',release_reason='HOLD_TTL_EXPIRED',
        released_at=now(),updated_at=now()
    where id=v_due.id;

    select * into v_booking
    from public.bookings b
    where b.organization_id=v_due.organization_id
      and b.current_hold_id=v_due.id
      and b.status='HELD'
    for update;

    if found then
      update public.bookings
      set status='CANCELED',current_hold_id=null,
          cancel_reason='HOLD_TTL_EXPIRED',canceled_at=now(),updated_at=now()
      where id=v_booking.id
      returning * into v_booking;

      v_request_key:='booking-hold-expiry:'||v_due.id::text;
      v_result:=jsonb_build_object(
        'bookingId',v_booking.id,
        'bookingReference',v_booking.booking_reference,
        'status','CANCELED',
        'reason','HOLD_TTL_EXPIRED',
        'replayed',false
      );

      insert into public.booking_lifecycle_events(
        organization_id,booking_id,transition,from_status,to_status,reason,
        actor_user_id,request_key,request_hash,evidence,result_payload
      ) values (
        v_due.organization_id,v_booking.id,'CANCELED','HELD','CANCELED',
        'HOLD_TTL_EXPIRED',null,v_request_key,
        md5(jsonb_build_object('bookingId',v_booking.id,'holdId',v_due.id)::text),
        jsonb_build_object('expiredHoldId',v_due.id),
        v_result
      )
      on conflict (organization_id,request_key) do nothing;

      insert into public.audit_logs(
        organization_id,actor_type,actor_id,action,entity_type,entity_id,
        before_data,after_data,correlation_id
      ) values (
        v_due.organization_id,'SYSTEM','booking_lifecycle',
        'BOOKING_CANCELED','booking',v_booking.id::text,
        jsonb_build_object('status','HELD','holdId',v_due.id),
        jsonb_build_object('status','CANCELED','reason','HOLD_TTL_EXPIRED'),
        v_request_key
      );
    end if;

    perform set_config('app.booking_availability_mutation','0',true);
    perform set_config('app.booking_lifecycle_mutation','0',true);
    v_count:=v_count+1;
  end loop;

  return v_count;
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    perform set_config('app.booking_lifecycle_mutation','0',true);
    raise;
end;
$$;

revoke all on function public.guard_booking_lifecycle_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_linked_booking_hold_release()
  from public,anon,authenticated,service_role;
revoke all on function public.booking_lifecycle_actor_allowed(uuid,uuid)
  from public,anon;
revoke all on function public.request_booking(
  uuid,uuid,uuid,uuid,text,uuid,timestamptz,text,jsonb,text
) from public,anon,authenticated;
revoke all on function public.hold_booking_request(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.confirm_booking(uuid,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.reschedule_booking(uuid,uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.cancel_booking(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.finalize_booking(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;

grant execute on function public.booking_lifecycle_actor_allowed(uuid,uuid)
  to authenticated,service_role;
grant execute on function public.request_booking(
  uuid,uuid,uuid,uuid,text,uuid,timestamptz,text,jsonb,text
) to service_role;
grant execute on function public.hold_booking_request(uuid,uuid,uuid,uuid,text)
  to service_role;
grant execute on function public.confirm_booking(uuid,uuid,uuid,text)
  to service_role;
grant execute on function public.reschedule_booking(uuid,uuid,uuid,uuid,text,text)
  to service_role;
grant execute on function public.cancel_booking(uuid,uuid,uuid,text,text)
  to service_role;
grant execute on function public.finalize_booking(uuid,uuid,uuid,text,text,text)
  to service_role;
