\set ON_ERROR_STOP on

do $dq_no_backfill$
begin
  if exists (select 1 from public.crm_data_import_batches) then
    raise exception 'CRM data-quality migration fabricated import receipts';
  end if;
end;
$dq_no_backfill$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c001', false);

do $dq_member_scan$
declare
  v_summary jsonb;
begin
  v_summary := public.get_crm_data_quality_summary(
    '00000000-0000-0000-0000-000000000c01',
    100
  );
  if v_summary is null
     or jsonb_typeof(v_summary -> 'summary') <> 'object'
     or jsonb_typeof(v_summary -> 'issues') <> 'array'
     or v_summary #>> '{retention,status}' <> 'DEFERRED_WITH_REASON' then
    raise exception 'CRM data-quality summary contract failed';
  end if;

  begin
    perform public.get_crm_data_quality_summary(
      '00000000-0000-0000-0000-000000000d01',
      100
    );
    raise exception 'CRM data-quality summary crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM data-quality read requires Organization membership%' then
        raise;
      end if;
  end;
end;
$dq_member_scan$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;

do $dq_apply$
declare
  v_batch uuid;
  v_rows integer;
  v_people integer;
  v_relationships integer;
  v_replayed boolean;
begin
  select batch_id, imported_rows, created_people, linked_relationships, replayed
    into v_batch, v_rows, v_people, v_relationships, v_replayed
  from public.apply_crm_verified_contact_import(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'dq-smoke-batch-1',
    jsonb_build_array(
      jsonb_build_object(
        'clientRowKey','dq-row-1',
        'businessId','10000000-0000-0000-0000-000000000c01',
        'identityType','EMAIL',
        'normalizedValue','dq-import@example.test',
        'displayValue','DQ Import <dq-import@example.test>',
        'displayName','DQ Imported Contact',
        'relationshipType','CONTACT',
        'jobTitle','Quality Fixture'
      )
    )
  );

  if v_batch is null
     or v_rows <> 1
     or v_people <> 1
     or v_relationships <> 1
     or v_replayed then
    raise exception 'CRM verified import did not apply expected canonical records';
  end if;

  if not exists (
    select 1
    from public.crm_identities i
    join public.crm_person_identity_links pil
      on pil.organization_id=i.organization_id
     and pil.identity_id=i.id
     and pil.status='ACTIVE'
    join public.crm_people p
      on p.organization_id=pil.organization_id
     and p.id=pil.person_id
     and p.status='ACTIVE'
    join public.crm_person_business_relationships r
      on r.organization_id=p.organization_id
     and r.person_id=p.id
     and r.business_id='10000000-0000-0000-0000-000000000c01'
     and r.status='ACTIVE'
    where i.organization_id='00000000-0000-0000-0000-000000000c01'
      and i.identity_type='EMAIL'
      and i.normalized_value='dq-import@example.test'
  ) then
    raise exception 'CRM verified import did not reuse canonical Identity/Person/relationship truth';
  end if;

  select replayed
    into v_replayed
  from public.apply_crm_verified_contact_import(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'dq-smoke-batch-1',
    jsonb_build_array(
      jsonb_build_object(
        'clientRowKey','dq-row-1',
        'businessId','10000000-0000-0000-0000-000000000c01',
        'identityType','EMAIL',
        'normalizedValue','dq-import@example.test',
        'displayValue','DQ Import <dq-import@example.test>',
        'displayName','DQ Imported Contact',
        'relationshipType','CONTACT',
        'jobTitle','Quality Fixture'
      )
    )
  );

  if not v_replayed then
    raise exception 'CRM verified import exact replay was not idempotent';
  end if;

  begin
    perform *
    from public.apply_crm_verified_contact_import(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'dq-smoke-batch-1',
      jsonb_build_array(
        jsonb_build_object(
          'clientRowKey','dq-row-other',
          'businessId','10000000-0000-0000-0000-000000000c01',
          'identityType','EMAIL',
          'normalizedValue','different@example.test'
        )
      )
    );
    raise exception 'CRM verified import accepted request-key reuse with different content';
  exception
    when others then
      if sqlerrm not like 'CRM verified import request key was reused with different content%' then
        raise;
      end if;
  end;

  begin
    perform *
    from public.apply_crm_verified_contact_import(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c003',
      'dq-viewer-should-fail',
      jsonb_build_array(
        jsonb_build_object(
          'clientRowKey','dq-viewer',
          'businessId','10000000-0000-0000-0000-000000000c01',
          'identityType','EMAIL',
          'normalizedValue','viewer-dq@example.test'
        )
      )
    );
    raise exception 'VIEWER unexpectedly applied CRM verified import';
  exception
    when others then
      if sqlerrm not like 'CRM verified import requires OWNER, ADMIN or SALES_MANAGER%' then
        raise;
      end if;
  end;
end;
$dq_apply$;

do $dq_duplicate_rows_blocked$
begin
  begin
    perform *
    from public.apply_crm_verified_contact_import(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'dq-duplicate-rows',
      jsonb_build_array(
        jsonb_build_object(
          'clientRowKey','dq-dup-a',
          'businessId','10000000-0000-0000-0000-000000000c01',
          'identityType','EMAIL',
          'normalizedValue','dup@example.test'
        ),
        jsonb_build_object(
          'clientRowKey','dq-dup-b',
          'businessId','10000000-0000-0000-0000-000000000c01',
          'identityType','EMAIL',
          'normalizedValue','dup@example.test'
        )
      )
    );
    raise exception 'CRM verified import accepted duplicate Business/identity rows';
  exception
    when others then
      if sqlerrm not like 'CRM verified import contains duplicate Business/identity rows%' then
        raise;
      end if;
  end;
end;
$dq_duplicate_rows_blocked$;

do $dq_security$
begin
  if has_function_privilege(
       'authenticated',
       'public.apply_crm_verified_contact_import(uuid,uuid,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Authenticated role can execute trusted CRM verified import directly';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.apply_crm_verified_contact_import(uuid,uuid,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'service_role cannot execute CRM verified import';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.get_crm_data_quality_summary(uuid,integer)',
       'EXECUTE'
     ) then
    raise exception 'Authenticated role cannot execute CRM data-quality read';
  end if;

  if exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('get_crm_data_quality_summary','apply_crm_verified_contact_import')
      and p.prosecdef
  ) then
    raise exception 'CRM data-quality function unexpectedly uses SECURITY DEFINER';
  end if;
end;
$dq_security$;

do $dq_privacy$
begin
  if not exists (
    select 1
    from public.crm_data_import_batches
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and request_key='dq-smoke-batch-1'
      and row_count=1
      and created_people_count=1
      and linked_relationship_count=1
      and summary ->> 'raw_pii_stored' = 'false'
  ) then
    raise exception 'CRM import receipt is missing bounded summary evidence';
  end if;

  if exists (
    select 1
    from public.crm_data_import_batches
    where coalesce(summary::text,'') ilike '%dq-import@example.test%'
       or coalesce(summary::text,'') ilike '%DQ Imported Contact%'
  ) then
    raise exception 'CRM import receipt copied raw PII';
  end if;

  if exists (
    select 1
    from public.audit_logs
    where action='CRM_DATA_VERIFIED_IMPORT_APPLIED'
      and (
        coalesce(before_data::text,'') ilike '%dq-import@example.test%'
        or coalesce(after_data::text,'') ilike '%dq-import@example.test%'
        or coalesce(after_data::text,'') ilike '%DQ Imported Contact%'
      )
  ) then
    raise exception 'CRM data-quality audit copied raw imported PII';
  end if;
end;
$dq_privacy$;

reset role;
