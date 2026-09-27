\set ON_ERROR_STOP on

do $crm_person_no_backfill$
begin
  if exists (select 1 from public.crm_people)
     or exists (select 1 from public.crm_person_identity_links)
     or exists (select 1 from public.crm_person_business_relationships) then
    raise exception 'CRM Person migration fabricated Person/relationship rows';
  end if;
end;
$crm_person_no_backfill$;

insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000c003')
on conflict (id) do nothing;

insert into public.organization_members(organization_id, user_id, role)
values (
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c003',
  'VIEWER'
)
on conflict (organization_id, user_id) do update set role = excluded.role;

set role service_role;

do $crm_person_create$
declare
  v_identity uuid;
  v_person uuid;
  v_created boolean;
  v_relationship uuid;
begin
  select id into v_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'sales@example.test'
    and status = 'ACTIVE';

  if v_identity is null then
    raise exception 'CRM Person fixture identity missing';
  end if;

  select resolved_person_id, created, resolved_relationship_id
    into v_person, v_created, v_relationship
  from public.create_or_resolve_crm_person_from_verified_identity(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_identity,
    'Alice Person Fixture',
    'MANUAL_CONFIRMED',
    'crm-person-fixture-1',
    '{"verification":"operator-confirmed","secret_note":"never-audit-this-value"}'::jsonb,
    '10000000-0000-0000-0000-000000000c01',
    'DECISION_MAKER',
    'Operations Lead',
    'MANUAL_CONFIRMED',
    'crm-person-business-fixture-1',
    '{"relationship":"operator-confirmed","private_note":"never-audit-relationship-value"}'::jsonb
  );

  if v_person is null or not v_created or v_relationship is null then
    raise exception 'CRM Person verified creation did not return expected evidence';
  end if;

  if not exists (
    select 1
    from public.crm_people
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and id = v_person
      and created_from_identity_id = v_identity
      and display_name = 'Alice Person Fixture'
      and status = 'ACTIVE'
  ) then
    raise exception 'CRM Person row was not created from canonical identity';
  end if;
end;
$crm_person_create$;

do $crm_person_idempotent$
declare
  v_identity uuid;
  v_first_person uuid;
  v_second_person uuid;
  v_created boolean;
begin
  select id into v_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'sales@example.test';

  select person_id into v_first_person
  from public.crm_person_identity_links
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_id = v_identity
    and status = 'ACTIVE'
  order by created_at
  limit 1;

  select resolved_person_id, created
    into v_second_person, v_created
  from public.create_or_resolve_crm_person_from_verified_identity(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_identity,
    'Ignored Replacement Name',
    'MANUAL_CONFIRMED',
    'crm-person-fixture-1',
    '{"verification":"operator-confirmed","refresh":true}'::jsonb,
    '10000000-0000-0000-0000-000000000c01',
    'DECISION_MAKER',
    'Operations Lead',
    'MANUAL_CONFIRMED',
    'crm-person-business-fixture-1',
    '{"relationship":"operator-confirmed","refresh":true}'::jsonb
  );

  if v_second_person is distinct from v_first_person or v_created then
    raise exception 'CRM Person identity command is not idempotent';
  end if;

  if (select count(*) from public.crm_people
      where organization_id = '00000000-0000-0000-0000-000000000c01') <> 1 then
    raise exception 'CRM Person command duplicated a Person';
  end if;

  if (select display_name from public.crm_people
      where organization_id = '00000000-0000-0000-0000-000000000c01'
        and id = v_first_person) <> 'Alice Person Fixture' then
    raise exception 'CRM Person idempotent refresh overwrote an established display name';
  end if;

  if (select count(*) from public.crm_person_business_relationships
      where organization_id = '00000000-0000-0000-0000-000000000c01'
        and person_id = v_first_person
        and business_id = '10000000-0000-0000-0000-000000000c01'
        and status = 'ACTIVE') <> 1 then
    raise exception 'CRM Person Business relationship is not idempotent';
  end if;
end;
$crm_person_idempotent$;

do $crm_person_viewer_blocked$
declare
  v_identity uuid;
begin
  select id into v_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'other@example.test';

  begin
    perform *
    from public.create_or_resolve_crm_person_from_verified_identity(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c003',
      v_identity,
      null,
      'MANUAL_CONFIRMED',
      'crm-person-viewer-fixture',
      '{"verification":"viewer-should-fail"}'::jsonb,
      null, null, null, null, null, null
    );
    raise exception 'VIEWER unexpectedly created a CRM Person';
  exception
    when others then
      if sqlerrm not like 'CRM Person mutation requires an authorized Organization member%' then
        raise;
      end if;
  end;
end;
$crm_person_viewer_blocked$;

do $crm_person_cross_tenant_blocked$
declare
  v_other_identity uuid;
begin
  select id into v_other_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000d01'
    and identity_type = 'EMAIL'
    and normalized_value = 'sales@example.test';

  begin
    perform *
    from public.create_or_resolve_crm_person_from_verified_identity(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_other_identity,
      null,
      'MANUAL_CONFIRMED',
      'crm-person-cross-tenant-fixture',
      '{"verification":"cross-tenant-should-fail"}'::jsonb,
      null, null, null, null, null, null
    );
    raise exception 'Cross-tenant identity unexpectedly created a CRM Person';
  exception
    when others then
      if sqlerrm not like 'CRM Person requires an active canonical identity in the same Organization%' then
        raise;
      end if;
  end;
end;
$crm_person_cross_tenant_blocked$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c001', false);

do $crm_person_rls_owner$
begin
  if (select count(*) from public.crm_people
      where organization_id = '00000000-0000-0000-0000-000000000c01') <> 1 then
    raise exception 'Organization member cannot read CRM Person';
  end if;

  if exists (
    select 1 from public.crm_people
    where organization_id = '00000000-0000-0000-0000-000000000d01'
  ) then
    raise exception 'CRM Person RLS leaked another Organization';
  end if;

  begin
    insert into public.crm_people(
      organization_id,
      created_from_identity_id,
      created_by_user_id,
      updated_by_user_id
    )
    select
      '00000000-0000-0000-0000-000000000c01',
      i.id,
      '00000000-0000-0000-0000-00000000c001',
      '00000000-0000-0000-0000-00000000c001'
    from public.crm_identities i
    where i.organization_id = '00000000-0000-0000-0000-000000000c01'
    limit 1;

    raise exception 'Authenticated role unexpectedly inserted CRM Person directly';
  exception
    when insufficient_privilege then null;
  end;
end;
$crm_person_rls_owner$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

do $crm_person_audit_privacy$
begin
  if exists (
    select 1
    from public.audit_logs
    where entity_type in (
      'crm_people',
      'crm_person_identity_links',
      'crm_person_business_relationships'
    )
    and (
      coalesce(before_data::text, '') ilike '%Alice Person Fixture%'
      or coalesce(after_data::text, '') ilike '%Alice Person Fixture%'
      or coalesce(before_data::text, '') ilike '%never-audit%'
      or coalesce(after_data::text, '') ilike '%never-audit%'
    )
  ) then
    raise exception 'CRM Person audit copied raw profile/evidence PII';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where entity_type = 'crm_people'
      and action = 'CRM_PERSON_INSERT'
      and after_data ? 'created_from_identity_id'
      and after_data ? 'has_display_name'
      and correlation_id like 'dbtx:%'
  ) then
    raise exception 'CRM Person bounded audit evidence is missing';
  end if;
end;
$crm_person_audit_privacy$;

do $crm_person_security_contract$
begin
  if (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_or_resolve_crm_person_from_verified_identity'
  ) then
    raise exception 'CRM Person command unexpectedly uses SECURITY DEFINER';
  end if;

  if has_table_privilege('authenticated', 'public.crm_people', 'INSERT')
     or has_table_privilege('authenticated', 'public.crm_person_identity_links', 'UPDATE')
     or has_table_privilege('authenticated', 'public.crm_person_business_relationships', 'INSERT') then
    raise exception 'Authenticated CRM Person mutation grants are too broad';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.create_or_resolve_crm_person_from_verified_identity(uuid,uuid,uuid,text,text,text,jsonb,uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute CRM Person command';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.create_or_resolve_crm_person_from_verified_identity(uuid,uuid,uuid,text,text,text,jsonb,uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute trusted CRM Person command directly';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.crm_people'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.crm_person_identity_links'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.crm_person_business_relationships'::regclass) then
    raise exception 'CRM Person RLS is not enabled on all public tables';
  end if;
end;
$crm_person_security_contract$;
