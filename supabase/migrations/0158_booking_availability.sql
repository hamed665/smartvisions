-- 0158: BOOKING-AVAILABILITY
-- Deterministic availability over canonical BOOKING-CATALOG authorities.
-- This adds calendars, availability exceptions and temporary holds only.
-- It does NOT create a Booking/Appointment lifecycle store, second service
-- catalog, second staff/branch/resource truth, or external calendar authority.

create table public.booking_availability_calendars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id text not null,
  calendar_kind text not null check (calendar_kind in ('BUSINESS','STAFF','RESOURCE')),
  branch_id uuid,
  staff_user_id uuid,
  resource_id uuid,
  timezone text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_availability_calendars_service_fk
    foreign key (organization_id,service_id)
    references public.service_booking_profiles(organization_id,service_id)
    on delete cascade,
  constraint booking_availability_calendars_branch_fk
    foreign key (organization_id,branch_id)
    references public.branches(organization_id,id)
    on delete restrict,
  constraint booking_availability_calendars_staff_fk
    foreign key (organization_id,staff_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint booking_availability_calendars_resource_fk
    foreign key (organization_id,resource_id)
    references public.booking_resources(organization_id,id)
    on delete restrict,
  constraint booking_availability_calendars_shape_check
    check (
      (calendar_kind='BUSINESS' and staff_user_id is null and resource_id is null)
      or
      (calendar_kind='STAFF' and staff_user_id is not null and resource_id is null)
      or
      (calendar_kind='RESOURCE' and staff_user_id is null and resource_id is not null)
    ),
  constraint booking_availability_calendars_timezone_check
    check (length(btrim(timezone)) between 1 and 100)
);

comment on table public.booking_availability_calendars is
  'Service-scoped deterministic availability calendars referencing canonical branch/staff/resource authorities. BUSINESS calendars define bookable hours; STAFF calendars are required for staff eligibility; RESOURCE calendars are optional availability restrictions.';

create unique index booking_availability_calendars_scope_uidx
  on public.booking_availability_calendars(
    organization_id,
    service_id,
    calendar_kind,
    coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(staff_user_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(resource_id,'00000000-0000-0000-0000-000000000000'::uuid)
  );

create index booking_availability_calendars_branch_idx
  on public.booking_availability_calendars(organization_id,branch_id,service_id)
  where branch_id is not null;
create index booking_availability_calendars_staff_idx
  on public.booking_availability_calendars(organization_id,staff_user_id,service_id)
  where staff_user_id is not null;
create index booking_availability_calendars_resource_idx
  on public.booking_availability_calendars(organization_id,resource_id,service_id)
  where resource_id is not null;

create unique index booking_availability_calendars_org_id_uidx
  on public.booking_availability_calendars(organization_id,id);

create table public.booking_availability_windows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_local time not null,
  end_local time not null,
  created_at timestamptz not null default now(),
  constraint booking_availability_windows_calendar_fk
    foreign key (organization_id,calendar_id)
    references public.booking_availability_calendars(organization_id,id)
    on delete cascade,
  constraint booking_availability_windows_order_check
    check (start_local < end_local),
  unique (calendar_id,weekday,start_local,end_local)
);

create index booking_availability_windows_calendar_idx
  on public.booking_availability_windows(organization_id,calendar_id,weekday,start_local);

create table public.booking_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_id uuid not null,
  exception_kind text not null check (
    exception_kind in ('HOLIDAY','TIME_OFF','BUSY','MAINTENANCE','SPECIAL_HOURS','MANUAL')
  ),
  availability text not null check (availability in ('CLOSED','OPEN_OVERRIDE')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384
  ),
  created_at timestamptz not null default now(),
  constraint booking_availability_exceptions_calendar_fk
    foreign key (organization_id,calendar_id)
    references public.booking_availability_calendars(organization_id,id)
    on delete cascade,
  constraint booking_availability_exceptions_range_check
    check (starts_at < ends_at),
  constraint booking_availability_exceptions_reason_check
    check (reason is null or length(btrim(reason)) between 1 and 500),
  constraint booking_availability_exceptions_open_kind_check
    check (availability<>'OPEN_OVERRIDE' or exception_kind='SPECIAL_HOURS')
);

create index booking_availability_exceptions_overlap_idx
  on public.booking_availability_exceptions(
    organization_id,calendar_id,starts_at,ends_at
  );

create table public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id text not null,
  branch_id uuid,
  staff_user_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupied_starts_at timestamptz not null,
  occupied_ends_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED','EXPIRED')),
  request_key text not null,
  created_by_user_id uuid,
  release_reason text,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384
  ),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint booking_holds_service_fk
    foreign key (organization_id,service_id)
    references public.service_booking_profiles(organization_id,service_id)
    on delete restrict,
  constraint booking_holds_branch_fk
    foreign key (organization_id,branch_id)
    references public.branches(organization_id,id)
    on delete restrict,
  constraint booking_holds_staff_fk
    foreign key (organization_id,staff_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint booking_holds_created_by_fk
    foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint booking_holds_time_check
    check (
      starts_at < ends_at
      and occupied_starts_at <= starts_at
      and occupied_ends_at >= ends_at
      and occupied_starts_at < occupied_ends_at
    ),
  constraint booking_holds_request_key_check
    check (
      length(request_key) between 8 and 200
      and request_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint booking_holds_release_reason_check
    check (release_reason is null or length(btrim(release_reason)) between 1 and 500)
);

create unique index booking_holds_request_uidx
  on public.booking_holds(organization_id,request_key);
create index booking_holds_service_overlap_idx
  on public.booking_holds(
    organization_id,service_id,branch_id,occupied_starts_at,occupied_ends_at
  ) where status='ACTIVE';
create index booking_holds_staff_overlap_idx
  on public.booking_holds(
    organization_id,staff_user_id,occupied_starts_at,occupied_ends_at
  ) where status='ACTIVE';
create index booking_holds_expiry_idx
  on public.booking_holds(expires_at,id)
  where status='ACTIVE';

create unique index booking_holds_org_id_uidx
  on public.booking_holds(organization_id,id);

create table public.booking_hold_resources (
  organization_id uuid not null,
  hold_id uuid not null,
  resource_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (hold_id,resource_id),
  constraint booking_hold_resources_hold_fk
    foreign key (organization_id,hold_id)
    references public.booking_holds(organization_id,id)
    on delete cascade,
  constraint booking_hold_resources_resource_fk
    foreign key (organization_id,resource_id)
    references public.booking_resources(organization_id,id)
    on delete restrict
);

create index booking_hold_resources_resource_idx
  on public.booking_hold_resources(organization_id,resource_id,hold_id);

alter table public.booking_availability_calendars enable row level security;
alter table public.booking_availability_windows enable row level security;
alter table public.booking_availability_exceptions enable row level security;
alter table public.booking_holds enable row level security;
alter table public.booking_hold_resources enable row level security;

create policy booking_availability_calendars_member_read
on public.booking_availability_calendars for select to authenticated
using (public.is_org_member(organization_id));
create policy booking_availability_windows_member_read
on public.booking_availability_windows for select to authenticated
using (public.is_org_member(organization_id));
create policy booking_availability_exceptions_member_read
on public.booking_availability_exceptions for select to authenticated
using (public.is_org_member(organization_id));
create policy booking_holds_member_read
on public.booking_holds for select to authenticated
using (public.is_org_member(organization_id));
create policy booking_hold_resources_member_read
on public.booking_hold_resources for select to authenticated
using (public.is_org_member(organization_id));

revoke all on table
  public.booking_availability_calendars,
  public.booking_availability_windows,
  public.booking_availability_exceptions,
  public.booking_holds,
  public.booking_hold_resources
from public,anon,authenticated,service_role;

grant select on table
  public.booking_availability_calendars,
  public.booking_availability_windows,
  public.booking_availability_exceptions,
  public.booking_holds,
  public.booking_hold_resources
to authenticated,service_role;

grant insert,update,delete on table
  public.booking_availability_calendars,
  public.booking_availability_windows,
  public.booking_availability_exceptions,
  public.booking_holds,
  public.booking_hold_resources
to service_role;

create or replace function public.guard_booking_availability_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.booking_availability_mutation',true),'')<>'allowed' then
    raise exception 'Booking availability state requires governed command';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger booking_availability_calendars_mutation_guard
before insert or update or delete on public.booking_availability_calendars
for each row execute function public.guard_booking_availability_mutation();
create trigger booking_availability_windows_mutation_guard
before insert or update or delete on public.booking_availability_windows
for each row execute function public.guard_booking_availability_mutation();
create trigger booking_availability_exceptions_mutation_guard
before insert or update or delete on public.booking_availability_exceptions
for each row execute function public.guard_booking_availability_mutation();
create trigger booking_holds_mutation_guard
before insert or update or delete on public.booking_holds
for each row execute function public.guard_booking_availability_mutation();
create trigger booking_hold_resources_mutation_guard
before insert or update or delete on public.booking_hold_resources
for each row execute function public.guard_booking_availability_mutation();

create unique index audit_logs_booking_availability_calendar_request_uidx
  on public.audit_logs(organization_id,correlation_id)
  where entity_type='booking_availability_calendar'
    and action='BOOKING_AVAILABILITY_CALENDAR_CONFIGURED'
    and correlation_id is not null;

create unique index audit_logs_booking_hold_release_request_uidx
  on public.audit_logs(organization_id,correlation_id)
  where entity_type='booking_hold'
    and action='BOOKING_HOLD_RELEASED'
    and correlation_id is not null;

create or replace function public.booking_assert_timezone(p_timezone text)
returns boolean
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
begin
  if nullif(btrim(p_timezone),'') is null
     or not exists(select 1 from pg_timezone_names where name=btrim(p_timezone))
  then
    raise exception 'Booking availability timezone is invalid: %',coalesce(p_timezone,'NULL');
  end if;
  return true;
end;
$$;

create or replace function public.configure_booking_availability_calendar(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_service_id text,
  p_calendar_kind text,
  p_branch_id uuid,
  p_staff_user_id uuid,
  p_resource_id uuid,
  p_timezone text,
  p_status text,
  p_windows jsonb,
  p_exceptions jsonb,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_kind text:=upper(btrim(coalesce(p_calendar_kind,'')));
  v_status text:=upper(btrim(coalesce(p_status,'ACTIVE')));
  v_timezone text:=btrim(coalesce(p_timezone,''));
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_role text;
  v_profile public.service_booking_profiles%rowtype;
  v_member_role text;
  v_resource public.booking_resources%rowtype;
  v_branch public.branches%rowtype;
  v_calendar public.booking_availability_calendars%rowtype;
  v_item jsonb;
  v_weekday integer;
  v_start time;
  v_end time;
  v_exception_kind text;
  v_availability text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_date date;
  v_request_hash text;
  v_existing jsonb;
  v_after jsonb;
begin
  if current_user<>'service_role' then
    raise exception 'Booking availability configuration requires trusted server boundary';
  end if;

  select role into v_role
  from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_role is distinct from 'OWNER' then
    raise exception 'Booking availability configuration requires Organization OWNER';
  end if;

  select * into v_profile
  from public.service_booking_profiles
  where organization_id=p_organization_id and service_id=p_service_id;
  if not found then raise exception 'Booking availability service profile was not found'; end if;

  if v_kind not in ('BUSINESS','STAFF','RESOURCE')
     or v_status not in ('ACTIVE','INACTIVE')
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
  then
    raise exception 'Booking availability calendar payload is invalid';
  end if;

  perform public.booking_assert_timezone(v_timezone);

  if p_branch_id is not null then
    select * into v_branch
    from public.branches
    where organization_id=p_organization_id and id=p_branch_id and status='ACTIVE';
    if not found then raise exception 'Booking availability branch is missing or inactive'; end if;

    if v_profile.location_mode='REMOTE' then
      raise exception 'Remote Booking service cannot use a branch availability calendar';
    end if;
    if v_profile.location_mode='EXPLICIT_BRANCHES'
       and not exists(
         select 1 from public.service_booking_branches b
         where b.organization_id=p_organization_id
           and b.service_id=p_service_id
           and b.branch_id=p_branch_id
       )
    then
      raise exception 'Booking availability branch is not eligible for this service';
    end if;
    if v_branch.timezone is not null and btrim(v_branch.timezone)<>v_timezone then
      raise exception 'Booking availability branch calendar must use canonical branch timezone';
    end if;
  end if;

  if v_kind='BUSINESS' then
    if p_staff_user_id is not null or p_resource_id is not null then
      raise exception 'BUSINESS availability calendar cannot target staff/resource';
    end if;
  elsif v_kind='STAFF' then
    if p_staff_user_id is null or p_resource_id is not null then
      raise exception 'STAFF availability calendar requires exactly one staff member';
    end if;
    select role into v_member_role
    from public.organization_members
    where organization_id=p_organization_id and user_id=p_staff_user_id;
    if v_member_role is null then
      raise exception 'Booking availability staff member is not in the Organization';
    end if;
    if v_profile.staff_mode='EXPLICIT_STAFF' then
      if not exists(
        select 1 from public.service_booking_staff s
        where s.organization_id=p_organization_id
          and s.service_id=p_service_id
          and s.user_id=p_staff_user_id
      ) then
        raise exception 'Booking availability staff member is not eligible for this service';
      end if;
    elsif not (v_member_role=any(v_profile.eligible_staff_roles)) then
      raise exception 'Booking availability staff role is not eligible for this service';
    end if;
  else
    if p_resource_id is null or p_staff_user_id is not null then
      raise exception 'RESOURCE availability calendar requires exactly one resource';
    end if;
    select * into v_resource
    from public.booking_resources
    where organization_id=p_organization_id and id=p_resource_id and status='ACTIVE';
    if not found then raise exception 'Booking availability resource is missing or inactive'; end if;
    if not exists(
      select 1 from public.service_booking_resource_requirements r
      where r.organization_id=p_organization_id
        and r.service_id=p_service_id
        and r.resource_id=p_resource_id
    ) then
      raise exception 'Booking availability resource is not required by this service';
    end if;
    if v_resource.branch_id is distinct from p_branch_id then
      raise exception 'Booking availability resource calendar must match canonical resource branch';
    end if;
  end if;

  if p_windows is null
     or jsonb_typeof(p_windows)<>'array'
     or jsonb_array_length(p_windows)>50
     or p_exceptions is null
     or jsonb_typeof(p_exceptions)<>'array'
     or jsonb_array_length(p_exceptions)>200
  then
    raise exception 'Booking availability windows/exceptions must be bounded arrays';
  end if;

  v_request_hash:=md5(jsonb_build_object(
    'organizationId',p_organization_id,
    'actorUserId',p_actor_user_id,
    'serviceId',p_service_id,
    'calendarKind',v_kind,
    'branchId',p_branch_id,
    'staffUserId',p_staff_user_id,
    'resourceId',p_resource_id,
    'timezone',v_timezone,
    'status',v_status,
    'windows',p_windows,
    'exceptions',p_exceptions
  )::text);

  select after_data into v_existing
  from public.audit_logs
  where organization_id=p_organization_id
    and entity_type='booking_availability_calendar'
    and action='BOOKING_AVAILABILITY_CALENDAR_CONFIGURED'
    and correlation_id=v_request_key
  order by created_at desc,id desc
  limit 1;

  if v_existing is not null then
    if coalesce(v_existing->>'requestHash','')<>v_request_hash then
      raise exception 'Booking availability calendar request key conflict';
    end if;
    return (v_existing-'requestHash')||jsonb_build_object('replayed',true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('booking-availability:'||p_organization_id::text,0)
  );
  perform set_config('app.booking_availability_mutation','allowed',true);

  select * into v_calendar
  from public.booking_availability_calendars c
  where c.organization_id=p_organization_id
    and c.service_id=p_service_id
    and c.calendar_kind=v_kind
    and c.branch_id is not distinct from p_branch_id
    and c.staff_user_id is not distinct from p_staff_user_id
    and c.resource_id is not distinct from p_resource_id
  for update;

  if not found then
    insert into public.booking_availability_calendars(
      organization_id,service_id,calendar_kind,branch_id,staff_user_id,
      resource_id,timezone,status,metadata
    ) values (
      p_organization_id,p_service_id,v_kind,p_branch_id,p_staff_user_id,
      p_resource_id,v_timezone,v_status,'{}'::jsonb
    )
    returning * into v_calendar;
  else
    update public.booking_availability_calendars
    set timezone=v_timezone,status=v_status,updated_at=now()
    where id=v_calendar.id
    returning * into v_calendar;
  end if;

  delete from public.booking_availability_windows
  where organization_id=p_organization_id and calendar_id=v_calendar.id;

  for v_item in select value from jsonb_array_elements(p_windows) x(value)
  loop
    if jsonb_typeof(v_item)<>'object'
       or (v_item-array['weekday','start','end']::text[])<>'{}'::jsonb
       or jsonb_typeof(v_item->'weekday')<>'number'
       or nullif(v_item->>'start','') is null
       or nullif(v_item->>'end','') is null
    then raise exception 'Booking availability weekly window shape is invalid'; end if;
    begin
      v_weekday:=(v_item->>'weekday')::integer;
      v_start:=(v_item->>'start')::time;
      v_end:=(v_item->>'end')::time;
    exception when others then
      raise exception 'Booking availability weekly window value is invalid';
    end;
    if v_weekday not between 0 and 6 or v_start>=v_end then
      raise exception 'Booking availability weekly window is invalid';
    end if;
    insert into public.booking_availability_windows(
      organization_id,calendar_id,weekday,start_local,end_local
    ) values (p_organization_id,v_calendar.id,v_weekday,v_start,v_end);
  end loop;

  if exists(
    select 1
    from public.booking_availability_windows a
    join public.booking_availability_windows b
      on b.calendar_id=a.calendar_id
     and b.weekday=a.weekday
     and b.id>a.id
     and a.start_local<b.end_local
     and b.start_local<a.end_local
    where a.calendar_id=v_calendar.id
  ) then
    raise exception 'Booking availability weekly windows overlap';
  end if;

  delete from public.booking_availability_exceptions
  where organization_id=p_organization_id and calendar_id=v_calendar.id;

  for v_item in select value from jsonb_array_elements(p_exceptions) x(value)
  loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'Booking availability exception must be an object';
    end if;
    v_exception_kind:=upper(btrim(coalesce(v_item->>'kind','')));
    v_availability:=upper(btrim(coalesce(v_item->>'availability','CLOSED')));
    if v_exception_kind not in ('HOLIDAY','TIME_OFF','BUSY','MAINTENANCE','SPECIAL_HOURS','MANUAL')
       or v_availability not in ('CLOSED','OPEN_OVERRIDE')
       or (v_availability='OPEN_OVERRIDE' and v_exception_kind<>'SPECIAL_HOURS')
    then
      raise exception 'Booking availability exception type is invalid';
    end if;

    begin
      if v_item ? 'date' then
        v_date:=(v_item->>'date')::date;
        v_starts_at:=(v_date::timestamp at time zone v_timezone);
        v_ends_at:=((v_date+1)::timestamp at time zone v_timezone);
      else
        v_starts_at:=(v_item->>'startsAt')::timestamptz;
        v_ends_at:=(v_item->>'endsAt')::timestamptz;
      end if;
    exception when others then
      raise exception 'Booking availability exception time is invalid';
    end;
    if v_starts_at is null or v_ends_at is null or v_starts_at>=v_ends_at then
      raise exception 'Booking availability exception range is invalid';
    end if;

    insert into public.booking_availability_exceptions(
      organization_id,calendar_id,exception_kind,availability,
      starts_at,ends_at,reason,metadata
    ) values (
      p_organization_id,v_calendar.id,v_exception_kind,v_availability,
      v_starts_at,v_ends_at,nullif(btrim(v_item->>'reason'),''),
      '{}'::jsonb
    );
  end loop;

  perform set_config('app.booking_availability_mutation','0',true);

  v_after:=jsonb_build_object(
    'calendarId',v_calendar.id,
    'serviceId',p_service_id,
    'calendarKind',v_kind,
    'branchId',p_branch_id,
    'staffUserId',p_staff_user_id,
    'resourceId',p_resource_id,
    'timezone',v_timezone,
    'status',v_status,
    'windowCount',jsonb_array_length(p_windows),
    'exceptionCount',jsonb_array_length(p_exceptions),
    'requestHash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'BOOKING_AVAILABILITY_CALENDAR_CONFIGURED',
    'booking_availability_calendar',v_calendar.id::text,
    v_after,v_request_key
  );

  return v_after-'requestHash';
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    raise;
end;
$$;

create or replace function public.booking_calendar_is_open(
  p_calendar_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_calendar public.booking_availability_calendars%rowtype;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if p_calendar_id is null or p_starts_at is null or p_ends_at is null or p_starts_at>=p_ends_at then
    return false;
  end if;

  select * into v_calendar
  from public.booking_availability_calendars
  where id=p_calendar_id and status='ACTIVE';
  if not found then return false; end if;

  if exists(
    select 1 from public.booking_availability_exceptions e
    where e.calendar_id=p_calendar_id
      and e.availability='CLOSED'
      and e.starts_at<p_ends_at
      and e.ends_at>p_starts_at
  ) then
    return false;
  end if;

  if exists(
    select 1 from public.booking_availability_exceptions e
    where e.calendar_id=p_calendar_id
      and e.availability='OPEN_OVERRIDE'
      and e.starts_at<=p_starts_at
      and e.ends_at>=p_ends_at
  ) then
    return true;
  end if;

  v_local_start:=p_starts_at at time zone v_calendar.timezone;
  v_local_end:=p_ends_at at time zone v_calendar.timezone;

  if v_local_start::date<>v_local_end::date then return false; end if;

  return exists(
    select 1 from public.booking_availability_windows w
    where w.calendar_id=p_calendar_id
      and w.weekday=extract(dow from v_local_start)::integer
      and w.start_local<=v_local_start::time
      and w.end_local>=v_local_end::time
  );
end;
$$;

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
  v_reason text;
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

  if coalesce(v_service_enabled,false)=false or not v_profile.booking_enabled or not v_profile.booking_enabled or v_profile.duration_minutes is null then
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

  select greatest(0,v_profile.capacity_per_slot-count(*))::integer
  into v_service_remaining
  from public.booking_holds h
  where h.organization_id=p_organization_id
    and h.service_id=p_service_id
    and h.branch_id is not distinct from p_branch_id
    and h.status='ACTIVE'
    and h.expires_at>now()
    and h.occupied_starts_at<v_occupied_end
    and h.occupied_ends_at>v_occupied_start;

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
        v_req.capacity-coalesce(sum(hr.quantity),0)
      )/v_req.quantity_required
    )::integer
    into v_resource_remaining
    from public.booking_hold_resources hr
    join public.booking_holds h
      on h.organization_id=hr.organization_id and h.id=hr.hold_id
    where hr.organization_id=p_organization_id
      and hr.resource_id=v_req.resource_id
      and h.status='ACTIVE'
      and h.expires_at>now()
      and h.occupied_starts_at<v_occupied_end
      and h.occupied_ends_at>v_occupied_start;

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

create or replace function public.get_booking_availability(
  p_organization_id uuid,
  p_service_id text,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 200
)
returns table(
  slot_start_at timestamptz,
  slot_end_at timestamptz,
  resolved_branch_id uuid,
  resolved_staff_user_id uuid,
  resolved_timezone text,
  remaining_capacity integer,
  evidence jsonb
)
language plpgsql
stable
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_profile public.service_booking_profiles%rowtype;
  v_branch_id uuid;
  v_calendar public.booking_availability_calendars%rowtype;
  v_day date;
  v_window record;
  v_open timestamptz;
  v_close timestamptz;
  v_candidate timestamptz;
  v_increment integer;
  v_eval jsonb;
  v_count integer:=0;
  v_seen text[]:='{}'::text[];
  v_key text;
  v_exception record;
begin
  if current_user<>'service_role'
     and not public.is_org_member(p_organization_id)
  then
    raise exception 'Booking availability read requires Organization membership';
  end if;
  if p_organization_id is null
     or nullif(btrim(p_service_id),'') is null
     or p_from is null or p_to is null or p_from>=p_to
     or p_to-p_from>interval '31 days'
     or p_limit not between 1 and 500
  then
    raise exception 'Booking availability query is invalid';
  end if;

  select * into v_profile
  from public.service_booking_profiles
  where organization_id=p_organization_id and service_id=p_service_id;
  if not found or not v_profile.booking_enabled then return; end if;

  v_increment:=coalesce((v_profile.booking_rules->>'slotIncrementMinutes')::integer,30);
  if v_increment not between 5 and 720 then
    raise exception 'Booking slot increment is invalid';
  end if;

  for v_branch_id in
    select branch_id
    from (
      select null::uuid as branch_id
      where v_profile.location_mode='REMOTE' and p_branch_id is null
      union all
      select b.id
      from public.branches b
      where v_profile.location_mode='ANY_ACTIVE_BRANCH'
        and b.organization_id=p_organization_id
        and b.status='ACTIVE'
        and (p_branch_id is null or b.id=p_branch_id)
      union all
      select sb.branch_id
      from public.service_booking_branches sb
      join public.branches b
        on b.organization_id=sb.organization_id and b.id=sb.branch_id
      where v_profile.location_mode='EXPLICIT_BRANCHES'
        and sb.organization_id=p_organization_id
        and sb.service_id=p_service_id
        and b.status='ACTIVE'
        and (p_branch_id is null or sb.branch_id=p_branch_id)
    ) q
    order by branch_id nulls first
  loop
    select * into v_calendar
    from public.booking_availability_calendars c
    where c.organization_id=p_organization_id
      and c.service_id=p_service_id
      and c.calendar_kind='BUSINESS'
      and c.status='ACTIVE'
      and (
        c.branch_id is not distinct from v_branch_id
        or (v_branch_id is not null and c.branch_id is null)
      )
    order by case when c.branch_id is not distinct from v_branch_id then 0 else 1 end,c.id
    limit 1;
    if not found then continue; end if;

    for v_day in
      select gs::date
      from generate_series(
        (p_from at time zone v_calendar.timezone)::date::timestamp,
        (p_to at time zone v_calendar.timezone)::date::timestamp,
        interval '1 day'
      ) gs
    loop
      for v_window in
        select start_local,end_local
        from public.booking_availability_windows
        where calendar_id=v_calendar.id
          and weekday=extract(dow from v_day)::integer
        order by start_local,end_local
      loop
        v_open:=(v_day::timestamp+v_window.start_local) at time zone v_calendar.timezone;
        v_close:=(v_day::timestamp+v_window.end_local) at time zone v_calendar.timezone;
        for v_candidate in
          select gs
          from generate_series(
            v_open,
            v_close-make_interval(mins=>coalesce(v_profile.duration_minutes,0)),
            make_interval(mins=>v_increment)
          ) gs
        loop
          if v_candidate<p_from or v_candidate>=p_to then continue; end if;
          v_key:=coalesce(v_branch_id::text,'REMOTE')||'|'||v_candidate::text;
          if v_key=any(v_seen) then continue; end if;
          v_seen:=array_append(v_seen,v_key);
          v_eval:=public.evaluate_booking_slot(
            p_organization_id,p_service_id,v_branch_id,v_candidate
          );
          if coalesce((v_eval->>'available')::boolean,false) then
            slot_start_at:=v_candidate;
            slot_end_at:=(v_eval->>'slotEnd')::timestamptz;
            resolved_branch_id:=v_branch_id;
            resolved_staff_user_id:=(v_eval->>'staffUserId')::uuid;
            resolved_timezone:=v_eval->>'timezone';
            remaining_capacity:=(v_eval->>'remainingCapacity')::integer;
            evidence:=v_eval;
            return next;
            v_count:=v_count+1;
            if v_count>=p_limit then return; end if;
          end if;
        end loop;
      end loop;
    end loop;

    for v_exception in
      select starts_at,ends_at
      from public.booking_availability_exceptions
      where calendar_id=v_calendar.id
        and availability='OPEN_OVERRIDE'
        and starts_at<p_to and ends_at>p_from
      order by starts_at
    loop
      for v_candidate in
        select gs
        from generate_series(
          greatest(v_exception.starts_at,p_from),
          least(v_exception.ends_at,p_to)-make_interval(mins=>coalesce(v_profile.duration_minutes,0)),
          make_interval(mins=>v_increment)
        ) gs
      loop
        if v_candidate<p_from or v_candidate>=p_to then continue; end if;
        v_key:=coalesce(v_branch_id::text,'REMOTE')||'|'||v_candidate::text;
        if v_key=any(v_seen) then continue; end if;
        v_seen:=array_append(v_seen,v_key);
        v_eval:=public.evaluate_booking_slot(
          p_organization_id,p_service_id,v_branch_id,v_candidate
        );
        if coalesce((v_eval->>'available')::boolean,false) then
          slot_start_at:=v_candidate;
          slot_end_at:=(v_eval->>'slotEnd')::timestamptz;
          resolved_branch_id:=v_branch_id;
          resolved_staff_user_id:=(v_eval->>'staffUserId')::uuid;
          resolved_timezone:=v_eval->>'timezone';
          remaining_capacity:=(v_eval->>'remainingCapacity')::integer;
          evidence:=v_eval;
          return next;
          v_count:=v_count+1;
          if v_count>=p_limit then return; end if;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

create or replace function public.create_booking_hold(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_service_id text,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_ttl_minutes integer,
  p_request_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_hold public.booking_holds%rowtype;
  v_eval jsonb;
  v_staff uuid;
  v_slot_end timestamptz;
  v_occupied_start timestamptz;
  v_occupied_end timestamptz;
  v_result jsonb;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or nullif(btrim(p_service_id),'') is null
     or p_starts_at is null
     or p_ttl_minutes not between 1 and 120
     or length(v_request_key) not between 8 and 200
     or v_request_key !~ '^[A-Za-z0-9._:-]+$'
     or p_metadata is null
     or jsonb_typeof(p_metadata)<>'object'
     or octet_length(p_metadata::text)>16384
  then
    raise exception 'Booking hold payload is invalid';
  end if;

  if p_actor_user_id is not null
     and not exists(
       select 1 from public.organization_members
       where organization_id=p_organization_id and user_id=p_actor_user_id
     )
  then
    raise exception 'Booking hold actor is not in the Organization';
  end if;

  select * into v_hold
  from public.booking_holds
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    if v_hold.service_id<>p_service_id
       or v_hold.branch_id is distinct from p_branch_id
       or v_hold.starts_at<>p_starts_at
    then
      raise exception 'Booking hold request key conflict';
    end if;
    return jsonb_build_object(
      'holdId',v_hold.id,
      'status',v_hold.status,
      'serviceId',v_hold.service_id,
      'branchId',v_hold.branch_id,
      'staffUserId',v_hold.staff_user_id,
      'startsAt',v_hold.starts_at,
      'endsAt',v_hold.ends_at,
      'expiresAt',v_hold.expires_at,
      'replayed',true
    );
  end if;

  -- Organization-wide availability lock deliberately serializes hold creation
  -- across services so shared staff/resources cannot be overbooked by races.
  perform pg_advisory_xact_lock(
    hashtextextended('booking-hold:'||p_organization_id::text,0)
  );

  select * into v_hold
  from public.booking_holds
  where organization_id=p_organization_id and request_key=v_request_key;
  if found then
    return jsonb_build_object(
      'holdId',v_hold.id,'status',v_hold.status,'replayed',true
    );
  end if;

  v_eval:=public.evaluate_booking_slot(
    p_organization_id,p_service_id,p_branch_id,p_starts_at
  );
  if coalesce((v_eval->>'available')::boolean,false) is distinct from true then
    raise exception 'Booking slot is unavailable: %',coalesce(v_eval->>'reason','UNKNOWN');
  end if;

  v_staff:=(v_eval->>'staffUserId')::uuid;
  v_slot_end:=(v_eval->>'slotEnd')::timestamptz;
  v_occupied_start:=(v_eval->>'occupiedStart')::timestamptz;
  v_occupied_end:=(v_eval->>'occupiedEnd')::timestamptz;

  perform set_config('app.booking_availability_mutation','allowed',true);

  insert into public.booking_holds(
    organization_id,service_id,branch_id,staff_user_id,
    starts_at,ends_at,occupied_starts_at,occupied_ends_at,
    expires_at,status,request_key,created_by_user_id,metadata
  ) values (
    p_organization_id,p_service_id,p_branch_id,v_staff,
    p_starts_at,v_slot_end,v_occupied_start,v_occupied_end,
    now()+make_interval(mins=>p_ttl_minutes),'ACTIVE',v_request_key,
    p_actor_user_id,p_metadata
  )
  returning * into v_hold;

  insert into public.booking_hold_resources(
    organization_id,hold_id,resource_id,quantity
  )
  select
    p_organization_id,v_hold.id,r.resource_id,r.quantity_required
  from public.service_booking_resource_requirements r
  where r.organization_id=p_organization_id
    and r.service_id=p_service_id;

  perform set_config('app.booking_availability_mutation','0',true);

  v_result:=jsonb_build_object(
    'holdId',v_hold.id,
    'status',v_hold.status,
    'serviceId',v_hold.service_id,
    'branchId',v_hold.branch_id,
    'staffUserId',v_hold.staff_user_id,
    'startsAt',v_hold.starts_at,
    'endsAt',v_hold.ends_at,
    'expiresAt',v_hold.expires_at,
    'remainingCapacityBeforeHold',(v_eval->>'remainingCapacity')::integer,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'booking_availability'),
    'BOOKING_HOLD_CREATED','booking_hold',v_hold.id::text,
    v_result,v_request_key
  );

  return v_result;
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    raise;
end;
$$;

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
  v_count integer;
begin
  if current_user<>'service_role' or p_limit not between 1 and 1000 then
    raise exception 'Booking hold expiry is not permitted';
  end if;

  perform set_config('app.booking_availability_mutation','allowed',true);
  with due as (
    select id
    from public.booking_holds
    where status='ACTIVE' and expires_at<=now()
    order by expires_at,id
    for update skip locked
    limit p_limit
  )
  update public.booking_holds h
  set status='EXPIRED',release_reason='HOLD_TTL_EXPIRED',released_at=now(),updated_at=now()
  from due
  where h.id=due.id;
  get diagnostics v_count=row_count;
  perform set_config('app.booking_availability_mutation','0',true);
  return v_count;
exception
  when others then
    perform set_config('app.booking_availability_mutation','0',true);
    raise;
end;
$$;

revoke all on function public.guard_booking_availability_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.booking_assert_timezone(text)
  from public,anon;
revoke all on function public.configure_booking_availability_calendar(
  uuid,uuid,text,text,uuid,uuid,uuid,text,text,jsonb,jsonb,text
) from public,anon,authenticated;
revoke all on function public.booking_calendar_is_open(uuid,timestamptz,timestamptz)
  from public,anon;
revoke all on function public.evaluate_booking_slot(uuid,text,uuid,timestamptz)
  from public,anon;
revoke all on function public.get_booking_availability(
  uuid,text,uuid,timestamptz,timestamptz,integer
) from public,anon;
revoke all on function public.create_booking_hold(
  uuid,uuid,text,uuid,timestamptz,integer,text,jsonb
) from public,anon,authenticated;
revoke all on function public.release_booking_hold(
  uuid,uuid,uuid,text,text
) from public,anon,authenticated;
revoke all on function public.expire_booking_holds(integer)
  from public,anon,authenticated;

grant execute on function public.booking_assert_timezone(text)
  to authenticated,service_role;
grant execute on function public.booking_calendar_is_open(uuid,timestamptz,timestamptz)
  to authenticated,service_role;
grant execute on function public.evaluate_booking_slot(uuid,text,uuid,timestamptz)
  to authenticated,service_role;
grant execute on function public.get_booking_availability(
  uuid,text,uuid,timestamptz,timestamptz,integer
) to authenticated,service_role;
grant execute on function public.configure_booking_availability_calendar(
  uuid,uuid,text,text,uuid,uuid,uuid,text,text,jsonb,jsonb,text
) to service_role;
grant execute on function public.create_booking_hold(
  uuid,uuid,text,uuid,timestamptz,integer,text,jsonb
) to service_role;
grant execute on function public.release_booking_hold(
  uuid,uuid,uuid,text,text
) to service_role;
grant execute on function public.expire_booking_holds(integer)
  to service_role;
