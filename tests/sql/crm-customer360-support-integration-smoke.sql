\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $customer360_support_read$
declare
  v_person uuid;
  v_customer jsonb;
begin
  select person_id
    into v_person
  from public.crm_support_cases
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and id='50000000-0000-0000-0000-000000000c01';

  if v_person is null then
    raise exception 'Customer 360 Support smoke requires the canonical Support Person fixture';
  end if;

  v_customer := public.get_crm_customer360_v2(
    '00000000-0000-0000-0000-000000000c01',
    v_person,
    50
  );

  if v_customer #>> '{moduleStatus,supportCases}' <> 'IMPLEMENTED' then
    raise exception 'Customer 360 still reports Support Cases unavailable';
  end if;

  if v_customer #>> '{moduleStatus,notes}' <> 'CANONICAL_LINK_PENDING' then
    raise exception 'Customer 360 unexpectedly widened internal Notes coverage';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_customer -> 'supportCases') item
    where item ->> 'id' = '50000000-0000-0000-0000-000000000c01'
      and item ->> 'status' = 'CLOSED'
      and item ->> 'priority' = 'HIGH'
      and item ->> 'csatScore' = '5'
  ) then
    raise exception 'Customer 360 did not include the directly Person-linked Support Case';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_customer -> 'supportCases') item
    where item ? 'description' or item ? 'csatComment'
  ) then
    raise exception 'Customer 360 copied sensitive Support prose into the Support collection';
  end if;
end;
$customer360_support_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $customer360_support_cross_tenant$
declare
  v_person uuid;
begin
  select person_id
    into v_person
  from public.crm_support_cases
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and id='50000000-0000-0000-0000-000000000c01';

  begin
    perform public.get_crm_customer360_v2(
      '00000000-0000-0000-0000-000000000c01',
      v_person,
      50
    );
    raise exception 'Customer 360 Support read crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM Customer 360 read requires Organization membership%' then
        raise;
      end if;
  end;
end;
$customer360_support_cross_tenant$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $customer360_support_security$
begin
  if (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_crm_customer360_v2'
      and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_person_id uuid, p_limit integer'
  ) then
    raise exception 'Customer 360 Support read unexpectedly uses SECURITY DEFINER';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_customer360_v2(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role cannot execute Customer 360 Support read';
  end if;
end;
$customer360_support_security$;
