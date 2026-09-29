-- 0157: BOOKING-CATALOG
-- Extends the canonical services authority with booking-specific child state.
-- No second service catalog, staff directory, branch model, availability engine,
-- booking lifecycle store or product catalog is introduced.

create table public.service_booking_profiles (
  organization_id uuid not null,
  service_id text not null,
  booking_enabled boolean not null default false,
  duration_minutes integer,
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 0,
  capacity_per_slot integer not null default 1,
  location_mode text not null default 'REMOTE' check (
    location_mode in ('REMOTE','ANY_ACTIVE_BRANCH','EXPLICIT_BRANCHES')
  ),
  staff_mode text not null default 'ANY_ELIGIBLE_ROLE' check (
    staff_mode in ('ANY_ELIGIBLE_ROLE','EXPLICIT_STAFF')
  ),
  eligible_staff_roles text[] not null default array['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']::text[],
  booking_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,service_id),
  constraint service_booking_profiles_service_fk
    foreign key (organization_id,service_id)
    references public.services(organization_id,id)
    on delete cascade,
  constraint service_booking_profiles_duration_check
    check (duration_minutes is null or duration_minutes between 5 and 1440),
  constraint service_booking_profiles_enabled_duration_check
    check (not booking_enabled or duration_minutes is not null),
  constraint service_booking_profiles_buffer_before_check
    check (buffer_before_minutes between 0 and 1440),
  constraint service_booking_profiles_buffer_after_check
    check (buffer_after_minutes between 0 and 1440),
  constraint service_booking_profiles_capacity_check
    check (capacity_per_slot between 1 and 1000),
  constraint service_booking_profiles_roles_check
    check (
      eligible_staff_roles <@ array['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER']::text[]
      and cardinality(eligible_staff_roles) <= 5
    ),
  constraint service_booking_profiles_rules_check
    check (
      jsonb_typeof(booking_rules)='object'
      and octet_length(booking_rules::text)<=16384
    )
);

comment on table public.service_booking_profiles is
  'Booking-specific child profile of canonical public.services. Absence of a row means the service is not configured for booking.';

create index service_booking_profiles_enabled_idx
  on public.service_booking_profiles(organization_id,booking_enabled,service_id);

create table public.service_booking_branches (
  organization_id uuid not null,
  service_id text not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,service_id,branch_id),
  constraint service_booking_branches_profile_fk
    foreign key (organization_id,service_id)
    references public.service_booking_profiles(organization_id,service_id)
    on delete cascade,
  constraint service_booking_branches_branch_fk
    foreign key (organization_id,branch_id)
    references public.branches(organization_id,id)
    on delete restrict
);

create index service_booking_branches_branch_idx
  on public.service_booking_branches(organization_id,branch_id,service_id);

create table public.service_booking_staff (
  organization_id uuid not null,
  service_id text not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,service_id,user_id),
  constraint service_booking_staff_profile_fk
    foreign key (organization_id,service_id)
    references public.service_booking_profiles(organization_id,service_id)
    on delete cascade,
  constraint service_booking_staff_member_fk
    foreign key (organization_id,user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict
);

create index service_booking_staff_user_idx
  on public.service_booking_staff(organization_id,user_id,service_id);

create table public.booking_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  code text not null,
  name text not null,
  resource_type text not null check (
    resource_type in ('ROOM','EQUIPMENT','VEHICLE','SPACE','CAPACITY_POOL','OTHER')
  ),
  capacity integer not null default 1 check (capacity between 1 and 1000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_resources_org_id_id_unique unique (organization_id,id),
  constraint booking_resources_org_code_unique unique (organization_id,code),
  constraint booking_resources_branch_fk
    foreign key (organization_id,branch_id)
    references public.branches(organization_id,id)
    on delete restrict,
  constraint booking_resources_code_check
    check (code ~ '^[A-Z][A-Z0-9_-]{1,79}$'),
  constraint booking_resources_name_check
    check (length(btrim(name)) between 1 and 200)
);

comment on table public.booking_resources is
  'Canonical reservable resource registry for Booking Operations. This is the first booking resource truth and is not a parallel service/staff/branch catalog.';

create index booking_resources_org_status_idx
  on public.booking_resources(organization_id,status,resource_type,code);
create index booking_resources_branch_fk_idx
  on public.booking_resources(organization_id,branch_id)
  where branch_id is not null;

create table public.service_booking_resource_requirements (
  organization_id uuid not null,
  service_id text not null,
  resource_id uuid not null,
  quantity_required integer not null default 1 check (quantity_required between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (organization_id,service_id,resource_id),
  constraint service_booking_resource_requirements_profile_fk
    foreign key (organization_id,service_id)
    references public.service_booking_profiles(organization_id,service_id)
    on delete cascade,
  constraint service_booking_resource_requirements_resource_fk
    foreign key (organization_id,resource_id)
    references public.booking_resources(organization_id,id)
    on delete restrict
);

create index service_booking_resource_requirements_resource_idx
  on public.service_booking_resource_requirements(organization_id,resource_id,service_id);

alter table public.service_booking_profiles enable row level security;
alter table public.service_booking_branches enable row level security;
alter table public.service_booking_staff enable row level security;
alter table public.booking_resources enable row level security;
alter table public.service_booking_resource_requirements enable row level security;

create policy service_booking_profiles_member_read
on public.service_booking_profiles for select to authenticated
using (public.is_org_member(organization_id));

create policy service_booking_profiles_owner_insert
on public.service_booking_profiles for insert to authenticated
with check (public.is_org_owner(organization_id));
create policy service_booking_profiles_owner_update
on public.service_booking_profiles for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));
create policy service_booking_profiles_owner_delete
on public.service_booking_profiles for delete to authenticated
using (public.is_org_owner(organization_id));

create policy service_booking_branches_member_read
on public.service_booking_branches for select to authenticated
using (public.is_org_member(organization_id));

create policy service_booking_branches_owner_insert
on public.service_booking_branches for insert to authenticated
with check (public.is_org_owner(organization_id));
create policy service_booking_branches_owner_update
on public.service_booking_branches for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));
create policy service_booking_branches_owner_delete
on public.service_booking_branches for delete to authenticated
using (public.is_org_owner(organization_id));

create policy service_booking_staff_member_read
on public.service_booking_staff for select to authenticated
using (public.is_org_member(organization_id));

create policy service_booking_staff_owner_insert
on public.service_booking_staff for insert to authenticated
with check (public.is_org_owner(organization_id));
create policy service_booking_staff_owner_update
on public.service_booking_staff for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));
create policy service_booking_staff_owner_delete
on public.service_booking_staff for delete to authenticated
using (public.is_org_owner(organization_id));

create policy booking_resources_member_read
on public.booking_resources for select to authenticated
using (public.is_org_member(organization_id));

create policy booking_resources_owner_insert
on public.booking_resources for insert to authenticated
with check (public.is_org_owner(organization_id));
create policy booking_resources_owner_update
on public.booking_resources for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));
create policy booking_resources_owner_delete
on public.booking_resources for delete to authenticated
using (public.is_org_owner(organization_id));

create policy service_booking_resource_requirements_member_read
on public.service_booking_resource_requirements for select to authenticated
using (public.is_org_member(organization_id));

create policy service_booking_resource_requirements_owner_insert
on public.service_booking_resource_requirements for insert to authenticated
with check (public.is_org_owner(organization_id));
create policy service_booking_resource_requirements_owner_update
on public.service_booking_resource_requirements for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));
create policy service_booking_resource_requirements_owner_delete
on public.service_booking_resource_requirements for delete to authenticated
using (public.is_org_owner(organization_id));

revoke all on table
  public.service_booking_profiles,
  public.service_booking_branches,
  public.service_booking_staff,
  public.booking_resources,
  public.service_booking_resource_requirements
from public,anon,authenticated,service_role;

grant select,insert,update,delete on table
  public.service_booking_profiles,
  public.service_booking_branches,
  public.service_booking_staff,
  public.booking_resources,
  public.service_booking_resource_requirements
to authenticated,service_role;

create or replace function public.guard_service_booking_catalog_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.booking_catalog_mutation',true),'')<>'allowed' then
    raise exception 'Booking catalog child state requires governed configuration command';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger service_booking_profiles_mutation_guard
before insert or update or delete on public.service_booking_profiles
for each row execute function public.guard_service_booking_catalog_mutation();

create trigger service_booking_branches_mutation_guard
before insert or update or delete on public.service_booking_branches
for each row execute function public.guard_service_booking_catalog_mutation();

create trigger service_booking_staff_mutation_guard
before insert or update or delete on public.service_booking_staff
for each row execute function public.guard_service_booking_catalog_mutation();

create trigger service_booking_resource_requirements_mutation_guard
before insert or update or delete on public.service_booking_resource_requirements
for each row execute function public.guard_service_booking_catalog_mutation();

create unique index audit_logs_booking_catalog_request_uidx
  on public.audit_logs(organization_id,entity_id,correlation_id)
  where entity_type='service'
    and action='BOOKING_CATALOG_CONFIGURED'
    and correlation_id is not null;

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
      'requiresConfirmation'
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

  return true;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Booking rule numeric value is invalid';
end;
$$;

create or replace function public.configure_service_booking_catalog(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_service_id text,
  p_booking_enabled boolean,
  p_duration_minutes integer,
  p_buffer_before_minutes integer,
  p_buffer_after_minutes integer,
  p_capacity_per_slot integer,
  p_location_mode text,
  p_staff_mode text,
  p_eligible_staff_roles text[],
  p_booking_rules jsonb,
  p_branch_ids uuid[],
  p_staff_user_ids uuid[],
  p_resource_requirements jsonb,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_actor_role text;
  v_location_mode text:=upper(btrim(coalesce(p_location_mode,'')));
  v_staff_mode text:=upper(btrim(coalesce(p_staff_mode,'')));
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_branch_ids uuid[];
  v_staff_ids uuid[];
  v_roles text[];
  v_resources jsonb;
  v_item jsonb;
  v_resource_id uuid;
  v_quantity integer;
  v_request_hash text;
  v_existing jsonb;
  v_after jsonb;
begin
  if current_user<>'service_role' then
    raise exception 'Booking catalog configuration requires trusted server boundary';
  end if;

  select role into v_actor_role
  from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id;

  if v_actor_role is distinct from 'OWNER' then
    raise exception 'Booking catalog configuration requires Organization OWNER';
  end if;


  if not exists(
    select 1 from public.services
    where organization_id=p_organization_id and id=p_service_id
  ) then
    raise exception 'Booking catalog service was not found';
  end if;

  if p_booking_enabled is null
     or (p_duration_minutes is not null and p_duration_minutes not between 5 and 1440)
     or (p_booking_enabled and p_duration_minutes is null)
     or p_buffer_before_minutes not between 0 and 1440
     or p_buffer_after_minutes not between 0 and 1440
     or p_capacity_per_slot not between 1 and 1000
     or v_location_mode not in ('REMOTE','ANY_ACTIVE_BRANCH','EXPLICIT_BRANCHES')
     or v_staff_mode not in ('ANY_ELIGIBLE_ROLE','EXPLICIT_STAFF')
     or length(v_request_key) not between 8 and 200
  then
    raise exception 'Booking catalog profile payload is invalid';
  end if;

  perform public.validate_service_booking_rules(p_booking_rules);

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[])
  into v_branch_ids
  from unnest(coalesce(p_branch_ids,'{}'::uuid[])) x;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[])
  into v_staff_ids
  from unnest(coalesce(p_staff_user_ids,'{}'::uuid[])) x;

  select coalesce(array_agg(distinct upper(btrim(x)) order by upper(btrim(x))),'{}'::text[])
  into v_roles
  from unnest(coalesce(p_eligible_staff_roles,'{}'::text[])) x
  where nullif(btrim(x),'') is not null;

  if not (v_roles <@ array['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER']::text[]) then
    raise exception 'Booking catalog staff role is invalid';
  end if;

  if v_location_mode='EXPLICIT_BRANCHES' and cardinality(v_branch_ids)=0 then
    raise exception 'Explicit branch mode requires at least one branch';
  end if;
  if v_location_mode<>'EXPLICIT_BRANCHES' and cardinality(v_branch_ids)>0 then
    raise exception 'Branch IDs are valid only in EXPLICIT_BRANCHES mode';
  end if;

  if exists(
    select 1 from unnest(v_branch_ids) b
    where not exists(
      select 1 from public.branches br
      where br.organization_id=p_organization_id
        and br.id=b
        and br.status='ACTIVE'
    )
  ) then
    raise exception 'Booking catalog references missing or inactive branch';
  end if;

  if v_staff_mode='EXPLICIT_STAFF' and cardinality(v_staff_ids)=0 then
    raise exception 'Explicit staff mode requires at least one staff member';
  end if;
  if v_staff_mode='ANY_ELIGIBLE_ROLE' and cardinality(v_staff_ids)>0 then
    raise exception 'Explicit staff IDs are valid only in EXPLICIT_STAFF mode';
  end if;
  if v_staff_mode='ANY_ELIGIBLE_ROLE' and cardinality(v_roles)=0 then
    raise exception 'Any-role staff mode requires at least one eligible role';
  end if;

  if exists(
    select 1 from unnest(v_staff_ids) u
    where not exists(
      select 1 from public.organization_members m
      where m.organization_id=p_organization_id and m.user_id=u
    )
  ) then
    raise exception 'Booking catalog references non-member staff';
  end if;

  if p_resource_requirements is null
     or jsonb_typeof(p_resource_requirements)<>'array'
     or jsonb_array_length(p_resource_requirements)>50
  then
    raise exception 'Booking resource requirements must be a bounded array';
  end if;

  v_resources:='[]'::jsonb;
  for v_item in select value from jsonb_array_elements(p_resource_requirements) x(value)
  loop
    if jsonb_typeof(v_item)<>'object'
       or (v_item-array['resourceId','quantity']::text[])<>'{}'::jsonb
       or nullif(v_item->>'resourceId','') is null
       or jsonb_typeof(v_item->'quantity')<>'number'
    then
      raise exception 'Booking resource requirement shape is invalid';
    end if;

    begin
      v_resource_id:=(v_item->>'resourceId')::uuid;
      v_quantity:=(v_item->>'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Booking resource requirement value is invalid';
    end;

    if v_quantity not between 1 and 100 then
      raise exception 'Booking resource quantity is invalid';
    end if;

    if not exists(
      select 1 from public.booking_resources r
      where r.organization_id=p_organization_id
        and r.id=v_resource_id
        and r.status='ACTIVE'
        and r.capacity>=v_quantity
        and (
          r.branch_id is null
          or (
            v_location_mode='ANY_ACTIVE_BRANCH'
            and exists(
              select 1 from public.branches rb
              where rb.organization_id=p_organization_id
                and rb.id=r.branch_id
                and rb.status='ACTIVE'
            )
          )
          or (
            v_location_mode='EXPLICIT_BRANCHES'
            and r.branch_id=any(v_branch_ids)
          )
        )
    ) then
      raise exception 'Booking resource is missing, inactive, over capacity, or incompatible with location scope';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(v_resources) r(value)
      where r.value->>'resourceId'=v_resource_id::text
    ) then
      raise exception 'Booking resource requirement is duplicated';
    end if;

    v_resources:=v_resources||jsonb_build_array(
      jsonb_build_object('resourceId',v_resource_id,'quantity',v_quantity)
    );
  end loop;

  select coalesce(jsonb_agg(value order by value->>'resourceId'),'[]'::jsonb)
  into v_resources
  from jsonb_array_elements(v_resources) x(value);

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text||':'||p_service_id||':'||v_request_key,
      0
    )
  );

  v_request_hash:=md5(jsonb_build_object(
    'organizationId',p_organization_id,
    'actorUserId',p_actor_user_id,
    'serviceId',p_service_id,
    'bookingEnabled',p_booking_enabled,
    'durationMinutes',p_duration_minutes,
    'bufferBeforeMinutes',p_buffer_before_minutes,
    'bufferAfterMinutes',p_buffer_after_minutes,
    'capacityPerSlot',p_capacity_per_slot,
    'locationMode',v_location_mode,
    'staffMode',v_staff_mode,
    'eligibleStaffRoles',to_jsonb(v_roles),
    'bookingRules',p_booking_rules,
    'branchIds',to_jsonb(v_branch_ids),
    'staffUserIds',to_jsonb(v_staff_ids),
    'resourceRequirements',v_resources
  )::text);

  select a.after_data into v_existing
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.entity_type='service'
    and a.entity_id=p_service_id
    and a.action='BOOKING_CATALOG_CONFIGURED'
    and a.correlation_id=v_request_key
  order by a.created_at desc,a.id desc
  limit 1;

  if v_existing is not null then
    if coalesce(v_existing->>'requestHash','')<>v_request_hash then
      raise exception 'Booking catalog request key conflict';
    end if;
    return (v_existing-'requestHash')||jsonb_build_object('replayed',true);
  end if;

  perform set_config('app.booking_catalog_mutation','allowed',true);

  insert into public.service_booking_profiles(
    organization_id,service_id,booking_enabled,duration_minutes,
    buffer_before_minutes,buffer_after_minutes,capacity_per_slot,
    location_mode,staff_mode,eligible_staff_roles,booking_rules,updated_at
  ) values (
    p_organization_id,p_service_id,p_booking_enabled,p_duration_minutes,
    p_buffer_before_minutes,p_buffer_after_minutes,p_capacity_per_slot,
    v_location_mode,v_staff_mode,v_roles,p_booking_rules,now()
  )
  on conflict (organization_id,service_id) do update set
    booking_enabled=excluded.booking_enabled,
    duration_minutes=excluded.duration_minutes,
    buffer_before_minutes=excluded.buffer_before_minutes,
    buffer_after_minutes=excluded.buffer_after_minutes,
    capacity_per_slot=excluded.capacity_per_slot,
    location_mode=excluded.location_mode,
    staff_mode=excluded.staff_mode,
    eligible_staff_roles=excluded.eligible_staff_roles,
    booking_rules=excluded.booking_rules,
    updated_at=now();

  delete from public.service_booking_branches
  where organization_id=p_organization_id and service_id=p_service_id;
  insert into public.service_booking_branches(organization_id,service_id,branch_id)
  select p_organization_id,p_service_id,x from unnest(v_branch_ids) x;

  delete from public.service_booking_staff
  where organization_id=p_organization_id and service_id=p_service_id;
  insert into public.service_booking_staff(organization_id,service_id,user_id)
  select p_organization_id,p_service_id,x from unnest(v_staff_ids) x;

  delete from public.service_booking_resource_requirements
  where organization_id=p_organization_id and service_id=p_service_id;
  insert into public.service_booking_resource_requirements(
    organization_id,service_id,resource_id,quantity_required
  )
  select
    p_organization_id,p_service_id,
    (x.value->>'resourceId')::uuid,
    (x.value->>'quantity')::integer
  from jsonb_array_elements(v_resources) x(value);

  perform set_config('app.booking_catalog_mutation','0',true);

  v_after:=jsonb_build_object(
    'serviceId',p_service_id,
    'bookingEnabled',p_booking_enabled,
    'durationMinutes',p_duration_minutes,
    'bufferBeforeMinutes',p_buffer_before_minutes,
    'bufferAfterMinutes',p_buffer_after_minutes,
    'capacityPerSlot',p_capacity_per_slot,
    'locationMode',v_location_mode,
    'staffMode',v_staff_mode,
    'eligibleStaffRoles',to_jsonb(v_roles),
    'bookingRules',p_booking_rules,
    'branchIds',to_jsonb(v_branch_ids),
    'staffUserIds',to_jsonb(v_staff_ids),
    'resourceRequirements',v_resources,
    'requestHash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'BOOKING_CATALOG_CONFIGURED','service',p_service_id,
    v_after,v_request_key
  );

  return v_after-'requestHash';
exception
  when others then
    perform set_config('app.booking_catalog_mutation','0',true);
    raise;
end;
$$;

revoke all on function public.guard_service_booking_catalog_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.validate_service_booking_rules(jsonb)
  from public,anon;
revoke all on function public.configure_service_booking_catalog(
  uuid,uuid,text,boolean,integer,integer,integer,integer,
  text,text,text[],jsonb,uuid[],uuid[],jsonb,text
) from public,anon,authenticated;

grant execute on function public.validate_service_booking_rules(jsonb)
  to authenticated,service_role;
grant execute on function public.configure_service_booking_catalog(
  uuid,uuid,text,boolean,integer,integer,integer,integer,
  text,text,text[],jsonb,uuid[],uuid[],jsonb,text
) to service_role;
