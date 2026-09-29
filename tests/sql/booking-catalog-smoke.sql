\set ON_ERROR_STOP on

-- Self-contained disposable Booking catalog authority fixture.
insert into public.organizations(id,name)
values ('00000000-0000-0000-0000-000000000c01','Booking Catalog CI')
on conflict (id) do nothing;

insert into auth.users(id)
values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c003')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c001','OWNER'),
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c003','SALES_AGENT')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.brands(id,organization_id,name,slug,status,metadata)
values (
  '00000000-0000-0000-0000-00000000b701',
  '00000000-0000-0000-0000-000000000c01',
  'Booking CI Brand','booking-ci-brand','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,country_code,timezone,status,metadata
) values (
  '00000000-0000-0000-0000-00000000b702',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000b701',
  'Booking CI Business','booking-ci-business','OM','Asia/Muscat','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.branches(
  id,organization_id,tenant_business_id,name,code,country_code,timezone,status,metadata
) values (
  '00000000-0000-0000-0000-00000000b703',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000b702',
  'Booking CI Muscat','BOOKING_CI_MUSCAT','OM','Asia/Muscat','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.services(id,organization_id,name,enabled,config,updated_at)
values (
  'booking_ci_service',
  '00000000-0000-0000-0000-000000000c01',
  'Booking CI Service',true,'{}'::jsonb,now()
)
on conflict (organization_id,id) do update set name=excluded.name,enabled=true;

insert into public.booking_resources(
  id,organization_id,branch_id,code,name,resource_type,capacity,status,metadata
) values (
  '00000000-0000-0000-0000-00000000b704',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000b703',
  'ROOM_A','Room A','ROOM',2,'ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $direct_partial_booking_profile_mutation_is_blocked$
begin
  begin
    insert into public.service_booking_profiles(
      organization_id,service_id,booking_enabled,duration_minutes
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'booking_ci_service',true,60
    );
    raise exception 'Direct partial booking catalog mutation was accepted';
  exception when others then
    if sqlerrm not like 'Booking catalog child state requires governed configuration command%' then
      raise;
    end if;
  end;
end;
$direct_partial_booking_profile_mutation_is_blocked$;

do $configure_full_booking_catalog_and_replay$
declare
  v_result jsonb;
begin
  v_result:=public.configure_service_booking_catalog(
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
    array['00000000-0000-0000-0000-00000000c003'::uuid],
    '[{"resourceId":"00000000-0000-0000-0000-00000000b704","quantity":1}]'::jsonb,
    'booking-catalog-ci-config-1'
  );

  if coalesce((v_result->>'replayed')::boolean,true) then
    raise exception 'Initial Booking catalog command was incorrectly replayed';
  end if;

  if not exists(
    select 1 from public.service_booking_profiles
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and service_id='booking_ci_service'
      and booking_enabled=true
      and duration_minutes=60
      and buffer_before_minutes=15
      and buffer_after_minutes=10
      and capacity_per_slot=2
      and location_mode='EXPLICIT_BRANCHES'
      and staff_mode='EXPLICIT_STAFF'
  ) then
    raise exception 'Booking profile was not persisted';
  end if;

  if not exists(
    select 1 from public.service_booking_branches
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and service_id='booking_ci_service'
      and branch_id='00000000-0000-0000-0000-00000000b703'
  ) then
    raise exception 'Booking branch eligibility was not persisted';
  end if;

  if not exists(
    select 1 from public.service_booking_staff
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and service_id='booking_ci_service'
      and user_id='00000000-0000-0000-0000-00000000c003'
  ) then
    raise exception 'Booking staff eligibility was not persisted';
  end if;

  if not exists(
    select 1 from public.service_booking_resource_requirements
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and service_id='booking_ci_service'
      and resource_id='00000000-0000-0000-0000-00000000b704'
      and quantity_required=1
  ) then
    raise exception 'Booking resource requirement was not persisted';
  end if;

  v_result:=public.configure_service_booking_catalog(
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
    array['00000000-0000-0000-0000-00000000c003'::uuid],
    '[{"resourceId":"00000000-0000-0000-0000-00000000b704","quantity":1}]'::jsonb,
    'booking-catalog-ci-config-1'
  );
  if coalesce((v_result->>'replayed')::boolean,false) is distinct from true then
    raise exception 'Booking catalog replay was not detected';
  end if;

  begin
    perform public.configure_service_booking_catalog(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'booking_ci_service',
      true,90,15,10,2,
      'EXPLICIT_BRANCHES','EXPLICIT_STAFF',
      '{}'::text[],
      '{}'::jsonb,
      array['00000000-0000-0000-0000-00000000b703'::uuid],
      array['00000000-0000-0000-0000-00000000c003'::uuid],
      '[{"resourceId":"00000000-0000-0000-0000-00000000b704","quantity":1}]'::jsonb,
      'booking-catalog-ci-config-1'
    );
    raise exception 'Booking catalog request-key conflict was accepted';
  exception when others then
    if sqlerrm not like 'Booking catalog request key conflict%' then raise; end if;
  end;
end;
$configure_full_booking_catalog_and_replay$;

do $invalid_resource_and_rules_fail_closed$
begin
  begin
    perform public.configure_service_booking_catalog(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'booking_ci_service',
      true,60,0,0,2,
      'EXPLICIT_BRANCHES','EXPLICIT_STAFF',
      '{}'::text[],'{}'::jsonb,
      array['00000000-0000-0000-0000-00000000b703'::uuid],
      array['00000000-0000-0000-0000-00000000c003'::uuid],
      '[{"resourceId":"00000000-0000-0000-0000-00000000b704","quantity":3}]'::jsonb,
      'booking-catalog-ci-over-capacity'
    );
    raise exception 'Over-capacity resource requirement was accepted';
  exception when others then
    if sqlerrm not like 'Booking resource is missing, inactive, over capacity, or incompatible with location scope%' then raise; end if;
  end;

  begin
    perform public.configure_service_booking_catalog(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'booking_ci_service',
      true,60,0,0,1,
      'REMOTE','ANY_ELIGIBLE_ROLE',
      array['OWNER']::text[],
      '{"unknownRule":true}'::jsonb,
      '{}'::uuid[],'{}'::uuid[],'[]'::jsonb,
      'booking-catalog-ci-unknown-rule'
    );
    raise exception 'Unknown booking rule was accepted';
  exception when others then
    if sqlerrm not like 'Unknown booking rule:%' then raise; end if;
  end;

  begin
    perform public.configure_service_booking_catalog(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'booking_ci_service',
      true,60,0,0,1,
      'REMOTE','ANY_ELIGIBLE_ROLE',
      array['OWNER']::text[],'{}'::jsonb,
      '{}'::uuid[],'{}'::uuid[],
      '[{"resourceId":"00000000-0000-0000-0000-00000000b704","quantity":1}]'::jsonb,
      'booking-catalog-ci-remote-branch-resource'
    );
    raise exception 'Remote service accepted branch-scoped resource';
  exception when others then
    if sqlerrm not like 'Booking resource is missing, inactive, over capacity, or incompatible with location scope%' then raise; end if;
  end;
end;
$invalid_resource_and_rules_fail_closed$;

do $booking_catalog_security_and_indexes$
declare
  v_missing text;
begin
  if not (
    select relrowsecurity from pg_class where oid='public.service_booking_profiles'::regclass
  ) or not (
    select relrowsecurity from pg_class where oid='public.booking_resources'::regclass
  ) then
    raise exception 'Booking catalog RLS is not enabled';
  end if;

  if exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('configure_service_booking_catalog','validate_service_booking_rules')
      and p.prosecdef
  ) then
    raise exception 'Booking catalog unexpectedly uses SECURITY DEFINER';
  end if;

  select string_agg(expected,', ' order by expected)
  into v_missing
  from unnest(array[
    'service_booking_branches_branch_idx',
    'service_booking_staff_user_idx',
    'booking_resources_branch_fk_idx',
    'service_booking_resource_requirements_resource_idx'
  ]::text[]) expected
  where not exists(
    select 1 from pg_indexes
    where schemaname='public' and indexname=expected
  );

  if v_missing is not null then
    raise exception 'Booking catalog FK covering indexes missing: %',v_missing;
  end if;
end;
$booking_catalog_security_and_indexes$;

-- Non-owner members may read governed booking catalog state but cannot configure it.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);
do $non_owner_cannot_configure$
begin
  if not exists(
    select 1 from public.service_booking_profiles
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and service_id='booking_ci_service'
  ) then
    raise exception 'Organization member cannot read Booking catalog profile';
  end if;

  begin
    perform public.configure_service_booking_catalog(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c003',
      'booking_ci_service',
      false,null,0,0,1,
      'REMOTE','ANY_ELIGIBLE_ROLE',array['SALES_AGENT']::text[],
      '{}'::jsonb,'{}'::uuid[],'{}'::uuid[],'[]'::jsonb,
      'booking-catalog-ci-non-owner'
    );
    raise exception 'Non-owner configured Booking catalog';
  exception when others then
    if sqlerrm not like 'Booking catalog configuration requires Organization OWNER%' then raise; end if;
  end;
end;
$non_owner_cannot_configure$;

reset role;
select set_config('request.jwt.claim.sub','',false);
