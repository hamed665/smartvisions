\set ON_ERROR_STOP on

set role service_role;

do $crm_identity_graph_fixture$
declare
  v_sales_identity uuid;
  v_other_identity uuid;
  v_alice uuid;
  v_bob uuid;
  v_created boolean;
begin
  select id into v_sales_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'sales@example.test'
    and status = 'ACTIVE';

  select id into v_other_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'other@example.test'
    and status = 'ACTIVE';

  select person_id into v_alice
  from public.crm_person_identity_links
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_id = v_sales_identity
    and status = 'ACTIVE'
  order by created_at
  limit 1;

  if v_sales_identity is null or v_other_identity is null or v_alice is null then
    raise exception 'CRM identity graph fixture dependencies are missing';
  end if;

  select resolved_person_id, created
    into v_bob, v_created
  from public.create_or_resolve_crm_person_from_verified_identity(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_other_identity,
    'Bob Identity Fixture',
    'MANUAL_CONFIRMED',
    'crm-identity-graph-bob',
    '{"verification":"operator-confirmed"}'::jsonb,
    null, null, null, null, null, null
  );

  if v_bob is null or not v_created or v_bob = v_alice then
    raise exception 'CRM identity graph second Person fixture was not created';
  end if;

  insert into public.crm_person_identity_links(
    organization_id, person_id, identity_id, verification_method, source_ref,
    evidence, status, created_by_user_id, updated_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    v_bob,
    v_sales_identity,
    'MANUAL_CONFIRMED',
    'crm-identity-graph-conflict',
    '{"verification":"deliberate-conflict-fixture"}'::jsonb,
    'ACTIVE',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c001'
  );
end;
$crm_identity_graph_fixture$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c001', false);

do $crm_identity_graph_candidate$
declare
  v_sales_identity uuid;
  v_person_count integer;
  v_conflict text;
  v_person_ids uuid[];
begin
  select id into v_sales_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and normalized_value = 'sales@example.test';

  select person_count, conflict_state, person_ids
    into v_person_count, v_conflict, v_person_ids
  from public.list_crm_identity_resolution_candidates(
    '00000000-0000-0000-0000-000000000c01',
    50
  )
  where identity_id = v_sales_identity;

  if v_person_count <> 2
     or v_conflict <> 'PERSON_CONFLICT'
     or coalesce(cardinality(v_person_ids), 0) <> 2 then
    raise exception 'CRM identity conflict candidate did not expose deterministic Person evidence';
  end if;
end;
$crm_identity_graph_candidate$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;

do $crm_identity_graph_merge_split_unlink$
declare
  v_sales_identity uuid;
  v_other_identity uuid;
  v_alice uuid;
  v_bob uuid;
  v_split uuid := '00000000-0000-0000-0000-000000000c44';
  v_result uuid;
  v_replayed boolean;
begin
  select id into v_sales_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and normalized_value = 'sales@example.test';

  select id into v_other_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and normalized_value = 'other@example.test';

  select person_id into v_alice
  from public.crm_person_identity_links
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_id = v_sales_identity
    and source_ref = 'crm-person-fixture-1'
    and status = 'ACTIVE'
  limit 1;

  select person_id into v_bob
  from public.crm_person_identity_links
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_id = v_other_identity
    and source_ref = 'crm-identity-graph-bob'
    and status = 'ACTIVE'
  limit 1;

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.merge_crm_people_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_bob,
    v_alice,
    'Resolve deliberate exact-identity conflict',
    '{"ticket":"fixture-merge"}'::jsonb
  );

  if v_result is distinct from v_alice or v_replayed then
    raise exception 'CRM Person merge did not resolve to the target';
  end if;

  if (select status from public.crm_people
      where organization_id = '00000000-0000-0000-0000-000000000c01' and id = v_bob) <> 'MERGED' then
    raise exception 'CRM Person merge did not retain merged lineage';
  end if;

  if (select count(distinct identity_id)
      from public.crm_person_identity_links
      where organization_id = '00000000-0000-0000-0000-000000000c01'
        and person_id = v_alice
        and status = 'ACTIVE') < 2 then
    raise exception 'CRM Person merge did not preserve multiple canonical identities';
  end if;

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.merge_crm_people_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_bob,
    v_alice,
    'Resolve deliberate exact-identity conflict',
    '{"ticket":"fixture-merge"}'::jsonb
  );

  if v_result is distinct from v_alice or not v_replayed then
    raise exception 'CRM Person merge retry is not state-idempotent';
  end if;

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.split_crm_person_identity_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_alice,
    v_other_identity,
    v_split,
    'Split Identity Fixture',
    'Correct a deterministic identity association',
    '{"ticket":"fixture-split"}'::jsonb
  );

  if v_result is distinct from v_split or v_replayed then
    raise exception 'CRM Person split did not create the requested Person';
  end if;

  if exists (
    select 1 from public.crm_person_identity_links
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and person_id = v_alice
      and identity_id = v_other_identity
      and status = 'ACTIVE'
  ) then
    raise exception 'CRM Person split left the moved identity active on the source';
  end if;

  begin
    perform *
    from public.unlink_crm_person_identity_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_split,
      v_other_identity,
      'Should fail because this is the only identity',
      '{"ticket":"fixture-orphan-block"}'::jsonb
    );
    raise exception 'CRM Person unlink unexpectedly orphaned an active Person';
  exception
    when others then
      if sqlerrm not like 'CRM Person unlink would leave Person without an active identity%' then
        raise;
      end if;
  end;

  perform *
  from public.merge_crm_people_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_split,
    v_alice,
    'Rejoin before governed unlink test',
    '{"ticket":"fixture-rejoin"}'::jsonb
  );

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.unlink_crm_person_identity_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_alice,
    v_other_identity,
    'Retire the incorrect identity association',
    '{"ticket":"fixture-unlink"}'::jsonb
  );

  if v_result is distinct from v_alice or v_replayed then
    raise exception 'CRM Person unlink did not retire the association';
  end if;

  if exists (
    select 1 from public.crm_person_identity_links
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and person_id = v_alice
      and identity_id = v_other_identity
      and status = 'ACTIVE'
  ) then
    raise exception 'CRM Person unlink left the identity active';
  end if;

  select resolved_person_id, replayed
    into v_result, v_replayed
  from public.unlink_crm_person_identity_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_alice,
    v_other_identity,
    'Retire the incorrect identity association',
    '{"ticket":"fixture-unlink"}'::jsonb
  );

  if v_result is distinct from v_alice or not v_replayed then
    raise exception 'CRM Person unlink retry is not state-idempotent';
  end if;
end;
$crm_identity_graph_merge_split_unlink$;

do $crm_identity_graph_split_orphan_block$
declare
  v_sales_identity uuid;
  v_alice uuid;
begin
  select id into v_sales_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and normalized_value = 'sales@example.test';

  select person_id into v_alice
  from public.crm_person_identity_links
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_id = v_sales_identity
    and status = 'ACTIVE'
  limit 1;

  begin
    perform *
    from public.split_crm_person_identity_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_alice,
      v_sales_identity,
      '00000000-0000-0000-0000-000000000c45',
      null,
      'Should fail because source would have no active identity',
      '{"ticket":"fixture-split-orphan-block"}'::jsonb
    );
    raise exception 'CRM Person split unexpectedly orphaned the source';
  exception
    when others then
      if sqlerrm not like 'CRM Person split would leave source Person without an active identity%' then
        raise;
      end if;
  end;
end;
$crm_identity_graph_split_orphan_block$;

do $crm_identity_graph_cross_tenant$
declare
  v_other_org_identity uuid;
begin
  select id into v_other_org_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000d01'
    and normalized_value = 'sales@example.test'
    and status = 'ACTIVE'
  limit 1;

  if v_other_org_identity is null then
    raise exception 'CRM identity graph cross-tenant fixture identity missing';
  end if;

  insert into public.crm_people(
    id, organization_id, created_from_identity_id, display_name, status
  ) values (
    '00000000-0000-0000-0000-000000000d44',
    '00000000-0000-0000-0000-000000000d01',
    v_other_org_identity,
    'Cross Tenant Fixture',
    'ACTIVE'
  )
  on conflict (organization_id, id) do nothing;

  begin
    perform *
    from public.merge_crm_people_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      (select id from public.crm_people
       where organization_id = '00000000-0000-0000-0000-000000000c01'
         and status = 'ACTIVE'
       order by created_at
       limit 1),
      '00000000-0000-0000-0000-000000000d44',
      'Cross tenant should fail',
      '{"ticket":"fixture-cross-tenant"}'::jsonb
    );
    raise exception 'CRM Person merge crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM Person merge requires People in the same Organization%' then
        raise;
      end if;
  end;
end;
$crm_identity_graph_cross_tenant$;

do $crm_identity_graph_security_contract$
begin
  if (
    select bool_or(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'list_crm_identity_resolution_candidates',
        'merge_crm_people_manual',
        'split_crm_person_identity_manual',
        'unlink_crm_person_identity_manual'
      )
  ) then
    raise exception 'CRM identity graph function unexpectedly uses SECURITY DEFINER';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.merge_crm_people_manual(uuid,uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.split_crm_person_identity_manual(uuid,uuid,uuid,uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.unlink_crm_person_identity_manual(uuid,uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Authenticated role can execute trusted CRM identity resolution mutation directly';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.list_crm_identity_resolution_candidates(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated role cannot read governed CRM identity candidates';
  end if;
end;
$crm_identity_graph_security_contract$;

do $crm_identity_graph_audit$
begin
  if not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_PERSON_MANUAL_MERGE'
  ) or not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_PERSON_MANUAL_SPLIT'
  ) or not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action = 'CRM_PERSON_IDENTITY_MANUAL_UNLINK'
  ) then
    raise exception 'CRM identity resolution bounded audit evidence is incomplete';
  end if;

  if exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and action in (
        'CRM_PERSON_MANUAL_MERGE',
        'CRM_PERSON_MANUAL_SPLIT',
        'CRM_PERSON_IDENTITY_MANUAL_UNLINK'
      )
      and (
        coalesce(before_data::text, '') ilike '%fixture-%'
        or coalesce(after_data::text, '') ilike '%fixture-%'
      )
  ) then
    raise exception 'CRM identity resolution audit copied raw reason/evidence content';
  end if;
end;
$crm_identity_graph_audit$;

reset role;
