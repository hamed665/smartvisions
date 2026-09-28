\set ON_ERROR_STOP on

set role service_role;

do $account_no_backfill$
begin
  if exists (
    select 1
    from public.businesses
    where account_lifecycle <> 'UNCLASSIFIED'
       or account_owner_user_id is not null
       or parent_business_id is not null
       or hierarchy_relation is not null
  ) then
    raise exception 'CRM Account migration inferred lifecycle/owner/hierarchy for existing Businesses';
  end if;
end;
$account_no_backfill$;

do $account_governance$
declare
  v_business uuid;
  v_owner uuid;
  v_lifecycle text;
  v_parent uuid;
  v_relation text;
  v_replayed boolean;
begin
  select resolved_business_id, resolved_owner_user_id, replayed
    into v_business, v_owner, v_replayed
  from public.set_crm_account_owner_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Account smoke owner assignment',
    '{"marker":"account-smoke-private"}'::jsonb
  );

  if v_business <> '10000000-0000-0000-0000-000000000c01'
     or v_owner <> '00000000-0000-0000-0000-00000000c001'
     or v_replayed then
    raise exception 'CRM Account owner assignment failed';
  end if;

  select replayed into v_replayed
  from public.set_crm_account_owner_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Account smoke owner replay',
    '{"marker":"account-smoke-private"}'::jsonb
  );
  if not v_replayed then
    raise exception 'CRM Account owner replay was not idempotent';
  end if;

  select resolved_lifecycle, replayed
    into v_lifecycle, v_replayed
  from public.set_crm_account_lifecycle_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c01',
    'QUALIFIED',
    'Account smoke lifecycle',
    '{"marker":"account-smoke-private"}'::jsonb
  );
  if v_lifecycle <> 'QUALIFIED' or v_replayed then
    raise exception 'CRM Account lifecycle mutation failed';
  end if;

  select resolved_parent_business_id, resolved_relation, replayed
    into v_parent, v_relation, v_replayed
  from public.set_crm_account_parent_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    '10000000-0000-0000-0000-000000000c01',
    'BRANCH_OF',
    'Account smoke hierarchy',
    '{"marker":"account-smoke-private"}'::jsonb
  );
  if v_parent <> '10000000-0000-0000-0000-000000000c01'
     or v_relation <> 'BRANCH_OF'
     or v_replayed then
    raise exception 'CRM Account hierarchy mutation failed';
  end if;

  begin
    perform *
    from public.set_crm_account_parent_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      '10000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c02',
      'SUBSIDIARY_OF',
      'Account smoke cycle should fail',
      '{"marker":"account-smoke-private"}'::jsonb
    );
    raise exception 'CRM Account hierarchy accepted a cycle';
  exception
    when others then
      if sqlerrm not like 'CRM Account hierarchy would create a cycle%' then
        raise;
      end if;
  end;

  begin
    perform *
    from public.set_crm_account_parent_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      '10000000-0000-0000-0000-000000000c02',
      '10000000-0000-0000-0000-000000000d01',
      'BRANCH_OF',
      'Account smoke cross tenant should fail',
      '{"marker":"account-smoke-private"}'::jsonb
    );
    raise exception 'CRM Account hierarchy crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM Account parent was not found in the Organization%' then
        raise;
      end if;
  end;

  begin
    perform *
    from public.set_crm_account_lifecycle_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c003',
      '10000000-0000-0000-0000-000000000c01',
      'CUSTOMER',
      'Viewer should fail',
      '{"marker":"account-smoke-private"}'::jsonb
    );
    raise exception 'VIEWER changed CRM Account lifecycle';
  exception
    when others then
      if sqlerrm not like 'CRM Account lifecycle mutation requires an authorized CRM role%' then
        raise;
      end if;
  end;
end;
$account_governance$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c001', false);

do $account_read_and_direct_guard$
declare
  v_payload jsonb;
begin
  v_payload := public.get_crm_account_v2(
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    50
  );

  if v_payload #>> '{account,lifecycle}' <> 'QUALIFIED'
     or v_payload #>> '{account,ownerUserId}' <> '00000000-0000-0000-0000-00000000c001'
     or jsonb_array_length(v_payload -> 'children') <> 1
     or v_payload #>> '{children,0,id}' <> '10000000-0000-0000-0000-000000000c02' then
    raise exception 'CRM Account v2 read model returned incorrect governance state';
  end if;

  begin
    update public.businesses
       set account_lifecycle = 'CUSTOMER',
           updated_at = now()
     where organization_id = '00000000-0000-0000-0000-000000000c01'
       and id = '10000000-0000-0000-0000-000000000c01';
    raise exception 'Authenticated user directly changed governed Account fields';
  exception
    when others then
      if sqlerrm not like 'CRM Account governance requires the trusted server boundary%'
         and sqlerrm not like 'permission denied for table businesses%' then
        raise;
      end if;
  end;

  begin
    perform public.get_crm_account_v2(
      '00000000-0000-0000-0000-000000000d01',
      '10000000-0000-0000-0000-000000000d01',
      50
    );
    raise exception 'CRM Account read crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM Account read requires Organization membership%' then
        raise;
      end if;
  end;
end;
$account_read_and_direct_guard$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;

do $account_security$
begin
  if (
    select bool_or(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'guard_crm_account_governance',
        'set_crm_account_owner_manual',
        'set_crm_account_lifecycle_manual',
        'set_crm_account_parent_manual',
        'get_crm_account_v2'
      )
  ) then
    raise exception 'CRM Account function unexpectedly uses SECURITY DEFINER';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.set_crm_account_owner_manual(uuid,uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.set_crm_account_lifecycle_manual(uuid,uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.set_crm_account_parent_manual(uuid,uuid,uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Authenticated role can execute trusted CRM Account mutation directly';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_account_v2(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role cannot execute CRM Account read';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.set_crm_account_owner_manual(uuid,uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute CRM Account owner mutation';
  end if;
end;
$account_security$;

do $account_audit_privacy$
begin
  if not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_ACCOUNT_OWNER_CHANGED'
  ) or not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_ACCOUNT_LIFECYCLE_CHANGED'
  ) or not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_ACCOUNT_HIERARCHY_CHANGED'
  ) then
    raise exception 'CRM Account audit evidence is incomplete';
  end if;

  if exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action in (
        'CRM_ACCOUNT_OWNER_CHANGED',
        'CRM_ACCOUNT_LIFECYCLE_CHANGED',
        'CRM_ACCOUNT_HIERARCHY_CHANGED'
      )
      and (
        coalesce(before_data::text, '') ilike '%account-smoke-private%'
        or coalesce(after_data::text, '') ilike '%account-smoke-private%'
      )
  ) then
    raise exception 'CRM Account audit copied raw operator reason/evidence';
  end if;
end;
$account_audit_privacy$;

-- Restore fixtures to their pre-0130 governance state through the governed commands.
do $account_restore$
begin
  perform *
  from public.set_crm_account_parent_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    null,
    null,
    'Restore Account smoke hierarchy',
    '{"restore":true}'::jsonb
  );

  perform *
  from public.set_crm_account_lifecycle_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c01',
    'UNCLASSIFIED',
    'Restore Account smoke lifecycle',
    '{"restore":true}'::jsonb
  );

  perform *
  from public.set_crm_account_owner_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c01',
    null,
    'Restore Account smoke owner',
    '{"restore":true}'::jsonb
  );
end;
$account_restore$;

do $account_fixture_restored$
begin
  if exists (
    select 1
    from public.businesses
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and id in (
        '10000000-0000-0000-0000-000000000c01',
        '10000000-0000-0000-0000-000000000c02'
      )
      and (
        account_lifecycle <> 'UNCLASSIFIED'
        or account_owner_user_id is not null
        or parent_business_id is not null
      )
  ) then
    raise exception 'CRM Account smoke did not restore fixtures';
  end if;
end;
$account_fixture_restored$;

reset role;
