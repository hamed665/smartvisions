\set ON_ERROR_STOP on

set role service_role;

do $customer360_fixture$
declare
  v_person uuid;
  v_result uuid;
  v_replayed boolean;
begin
  select l.person_id
    into v_person
  from public.crm_person_identity_links l
  join public.crm_identities i
    on i.organization_id = l.organization_id
   and i.id = l.identity_id
  where l.organization_id = '00000000-0000-0000-0000-000000000c01'
    and i.normalized_value = 'sales@example.test'
    and l.status = 'ACTIVE'
  limit 1;

  if v_person is null then
    raise exception 'Customer 360 Person fixture is missing';
  end if;

  if exists (
    select 1 from public.leads
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and person_id is not null
  ) then
    raise exception 'Customer 360 migration fabricated Person links';
  end if;

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.link_crm_customer360_person_context(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'LEAD',
    '20000000-0000-0000-0000-000000000c01',
    v_person,
    'MANUAL_CONFIRMED',
    'customer360-smoke:lead',
    '{"reason":"controlled-test"}'::jsonb
  );

  if v_result is distinct from v_person or v_replayed then
    raise exception 'Customer 360 Lead link failed';
  end if;

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.link_crm_customer360_person_context(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'CONVERSATION',
    '30000000-0000-0000-0000-000000000c01',
    v_person,
    'MANUAL_CONFIRMED',
    'customer360-smoke:conversation',
    '{"reason":"controlled-test"}'::jsonb
  );

  if v_result is distinct from v_person or v_replayed then
    raise exception 'Customer 360 Conversation link failed';
  end if;

  begin
    perform *
    from public.link_crm_customer360_person_context(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'LEAD',
      '20000000-0000-0000-0000-000000000c02',
      v_person,
      'MANUAL_CONFIRMED',
      'customer360-smoke:wrong-company',
      '{"reason":"should-fail"}'::jsonb
    );
    raise exception 'Customer 360 linked Company-only context without a Person relationship';
  exception
    when others then
      if sqlerrm not like 'CRM Customer 360 Person link requires an active Person-Company relationship%' then
        raise;
      end if;
  end;

  begin
    perform *
    from public.link_crm_customer360_person_context(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'LEAD',
      '20000000-0000-0000-0000-000000000d01',
      v_person,
      'MANUAL_CONFIRMED',
      'customer360-smoke:cross-tenant',
      '{"reason":"should-fail"}'::jsonb
    );
    raise exception 'Customer 360 crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM Customer 360 entity was not found in the Organization%' then
        raise;
      end if;
  end;
end;
$customer360_fixture$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c001', false);

do $customer360_read$
declare
  v_person uuid;
  v_payload jsonb;
begin
  select l.person_id
    into v_person
  from public.crm_person_identity_links l
  join public.crm_identities i
    on i.organization_id = l.organization_id
   and i.id = l.identity_id
  where l.organization_id = '00000000-0000-0000-0000-000000000c01'
    and i.normalized_value = 'sales@example.test'
    and l.status = 'ACTIVE'
  limit 1;

  v_payload := public.get_crm_customer360_v2(
    '00000000-0000-0000-0000-000000000c01',
    v_person,
    50
  );

  if jsonb_array_length(v_payload -> 'leads') <> 1
     or jsonb_array_length(v_payload -> 'conversations') <> 1 then
    raise exception 'Customer 360 direct linked entity counts are incorrect';
  end if;

  if jsonb_array_length(v_payload -> 'activityTimeline') = 0 then
    raise exception 'Customer 360 direct Person timeline is empty';
  end if;

  if v_payload #>> '{moduleStatus,bookings}' <> 'MODULE_NOT_IMPLEMENTED'
     or v_payload #>> '{moduleStatus,payments}' <> 'MODULE_NOT_IMPLEMENTED' then
    raise exception 'Customer 360 fabricated unavailable module readiness';
  end if;

  begin
    perform public.get_crm_customer360_v2(
      '00000000-0000-0000-0000-000000000d01',
      '00000000-0000-0000-0000-000000000d44',
      50
    );
    raise exception 'Customer 360 read crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM Customer 360 read requires Organization membership%' then
        raise;
      end if;
  end;
end;
$customer360_read$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;

do $customer360_unlink_relink_merge$
declare
  v_sales_person uuid;
  v_other_identity uuid;
  v_other_person uuid;
  v_created boolean;
  v_relationship uuid;
  v_result uuid;
  v_replayed boolean;
begin
  select l.person_id
    into v_sales_person
  from public.crm_person_identity_links l
  join public.crm_identities i
    on i.organization_id = l.organization_id
   and i.id = l.identity_id
  where l.organization_id = '00000000-0000-0000-0000-000000000c01'
    and i.normalized_value = 'sales@example.test'
    and l.status = 'ACTIVE'
  limit 1;

  select id into v_other_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and normalized_value = 'other@example.test'
    and status = 'ACTIVE';

  select resolved_person_id, created, resolved_relationship_id
    into v_other_person, v_created, v_relationship
  from public.create_or_resolve_crm_person_from_verified_identity(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_other_identity,
    'Customer 360 Merge Fixture',
    'MANUAL_CONFIRMED',
    'customer360-merge-person',
    '{"verification":"controlled-test"}'::jsonb,
    '10000000-0000-0000-0000-000000000c01',
    'CONTACT',
    null,
    'MANUAL_CONFIRMED',
    'customer360-merge-relationship',
    '{"relationship":"controlled-test"}'::jsonb
  );

  if v_other_person is null or not v_created or v_relationship is null then
    raise exception 'Customer 360 merge fixture Person was not created';
  end if;

  perform *
  from public.unlink_crm_customer360_person_context(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'LEAD',
    '20000000-0000-0000-0000-000000000c01',
    v_sales_person,
    'Prepare controlled merge preservation test',
    '{"reason":"controlled-test"}'::jsonb
  );

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.link_crm_customer360_person_context(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'LEAD',
    '20000000-0000-0000-0000-000000000c01',
    v_other_person,
    'MANUAL_CONFIRMED',
    'customer360-smoke:merge-source',
    '{"reason":"controlled-test"}'::jsonb
  );

  if v_result is distinct from v_other_person or v_replayed then
    raise exception 'Customer 360 merge-source link failed';
  end if;

  perform *
  from public.merge_crm_people_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_other_person,
    v_sales_person,
    'Verify Customer 360 merge preservation',
    '{"ticket":"customer360-controlled-test"}'::jsonb
  );

  if (select person_id from public.leads
      where organization_id = '00000000-0000-0000-0000-000000000c01'
        and id = '20000000-0000-0000-0000-000000000c01') is distinct from v_sales_person then
    raise exception 'Customer 360 Person merge did not preserve Lead attribution';
  end if;

  if (
    select person_link_evidence ->> 'reason'
    from public.leads
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and id = '20000000-0000-0000-0000-000000000c01'
  ) <> 'controlled-test' then
    raise exception 'Customer 360 Person merge rewrote original link evidence';
  end if;
end;
$customer360_unlink_relink_merge$;

do $customer360_security$
begin
  if (
    select bool_or(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'link_crm_customer360_person_context',
        'unlink_crm_customer360_person_context',
        'get_crm_customer360_v2',
        'guard_crm_customer360_person_context',
        'reconcile_crm_customer360_person_merge'
      )
  ) then
    raise exception 'Customer 360 function unexpectedly uses SECURITY DEFINER';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.link_crm_customer360_person_context(uuid,uuid,text,uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.unlink_crm_customer360_person_context(uuid,uuid,text,uuid,uuid,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Authenticated role can execute trusted Customer 360 mutation directly';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_customer360_v2(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role cannot execute Customer 360 read';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.link_crm_customer360_person_context(uuid,uuid,text,uuid,uuid,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute Customer 360 Person link';
  end if;

  if not has_column_privilege('service_role', 'public.crm_tasks', 'person_id', 'UPDATE')
     or not has_column_privilege('service_role', 'public.crm_deals', 'person_id', 'UPDATE')
     or not has_column_privilege('service_role', 'public.crm_tasks', 'business_id', 'SELECT')
     or not has_column_privilege('service_role', 'public.crm_deals', 'business_id', 'SELECT') then
    raise exception 'Customer 360 narrow Task/Deal service grants are incomplete';
  end if;

  if has_table_privilege('service_role', 'public.crm_tasks', 'UPDATE')
     or has_table_privilege('service_role', 'public.crm_deals', 'UPDATE') then
    raise exception 'Customer 360 widened Task/Deal service_role to table-level UPDATE';
  end if;
end;
$customer360_security$;

do $customer360_audit_privacy$
begin
  if not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_CUSTOMER360_PERSON_LINKED'
  ) or not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_CUSTOMER360_PERSON_UNLINKED'
  ) then
    raise exception 'Customer 360 audit evidence is incomplete';
  end if;

  if exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action in ('CRM_CUSTOMER360_PERSON_LINKED','CRM_CUSTOMER360_PERSON_UNLINKED')
      and (
        coalesce(before_data::text, '') ilike '%controlled-test%'
        or coalesce(after_data::text, '') ilike '%controlled-test%'
      )
  ) then
    raise exception 'Customer 360 audit copied raw reason/evidence';
  end if;
end;
$customer360_audit_privacy$;

reset role;
