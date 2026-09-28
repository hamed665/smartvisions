\set ON_ERROR_STOP on

do $support_no_backfill$
begin
  if exists (select 1 from public.crm_support_cases)
     or exists (select 1 from public.crm_support_sla_policies) then
    raise exception 'CRM Support Case migration fabricated rows';
  end if;
end;
$support_no_backfill$;

insert into public.sales_conversations(
  id,organization_id,lead_id,channel
) values (
  '30000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c01',
  'EMAIL'
)
on conflict (id) do nothing;

set role service_role;

do $support_sla_and_case$
declare
  v_policy uuid:='40000000-0000-0000-0000-000000000c01';
  v_person uuid;
  v_case uuid:='50000000-0000-0000-0000-000000000c01';
  v_version integer;
  v_replayed boolean;
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;

  if v_person is null then
    raise exception 'Support Case Person fixture is missing';
  end if;

  select resolved_version,replayed into v_version,v_replayed
  from public.upsert_crm_support_sla_policy_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_policy,
    'High Support Fixture',
    'HIGH',
    30,
    240,
    120,
    'ACTIVE',
    0,
    'support-sla-fixture-create'
  );
  if v_version<>1 or v_replayed then
    raise exception 'Support SLA create failed';
  end if;

  select resolved_version,replayed into v_version,v_replayed
  from public.create_crm_support_case_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_case,
    '10000000-0000-0000-0000-000000000c01',
    v_person,
    '30000000-0000-0000-0000-000000000c01',
    'Support private fixture subject',
    'Support private fixture description',
    'HIGH',
    '00000000-0000-0000-0000-00000000c001',
    null,
    'CONVERSATION',
    'fixture-conversation-source',
    'support-case-fixture-create',
    '{"fixture":true}'::jsonb
  );
  if v_version<>1 or v_replayed then
    raise exception 'Support Case create failed';
  end if;

  if not exists (
    select 1 from public.crm_support_cases
    where id=v_case
      and sla_policy_id=v_policy
      and first_response_due_at is not null
      and resolution_due_at>first_response_due_at
      and status='OPEN'
  ) then
    raise exception 'Support Case did not apply active SLA';
  end if;

  select replayed into v_replayed
  from public.create_crm_support_case_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_case,
    '10000000-0000-0000-0000-000000000c01',
    v_person,
    '30000000-0000-0000-0000-000000000c01',
    'Support private fixture subject',
    'Support private fixture description',
    'HIGH',
    '00000000-0000-0000-0000-00000000c001',
    null,
    'CONVERSATION',
    'fixture-conversation-source',
    'support-case-fixture-create',
    '{"fixture":true}'::jsonb
  );
  if not v_replayed then
    raise exception 'Support Case create replay is not idempotent';
  end if;
end;
$support_sla_and_case$;

do $support_cross_tenant$
declare v_person uuid;
begin
  select id into v_person from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01' limit 1;

  begin
    perform *
    from public.create_crm_support_case_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      '50000000-0000-0000-0000-000000000c02',
      '10000000-0000-0000-0000-000000000d01',
      v_person,
      null,
      'Cross tenant should fail',
      null,
      'NORMAL',
      null,
      null,
      'MANUAL',
      null,
      'support-case-cross-tenant',
      '{}'::jsonb
    );
    raise exception 'Support Case crossed Organization boundary';
  exception
    when others then
      if sqlerrm not like 'CRM Support Case Business was not found in the Organization%' then
        raise;
      end if;
  end;
end;
$support_cross_tenant$;

do $support_viewer_blocked$
begin
  begin
    perform *
    from public.create_crm_support_case_manual(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c003',
      '50000000-0000-0000-0000-000000000c03',
      null,null,null,
      'Viewer should fail',
      null,
      'NORMAL',
      null,null,
      'MANUAL',
      null,
      'support-case-viewer',
      '{}'::jsonb
    );
    raise exception 'VIEWER created a Support Case';
  exception
    when others then
      if sqlerrm not like 'CRM Support Case creation requires an authorized Organization member%' then
        raise;
      end if;
  end;
end;
$support_viewer_blocked$;

do $support_lifecycle$
declare
  v_case uuid:='50000000-0000-0000-0000-000000000c01';
  v_version integer;
  v_level smallint;
begin
  select version into v_version from public.crm_support_cases where id=v_case;

  select resolved_version into v_version
  from public.mark_crm_support_first_response_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_case,v_version,'First response fixture reason'
  );

  if not exists (
    select 1 from public.crm_support_cases
    where id=v_case and first_responded_at is not null
  ) then raise exception 'Support first response was not recorded'; end if;

  select resolved_version,escalation_level into v_version,v_level
  from public.escalate_crm_support_case_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_case,v_version,'Escalation fixture reason'
  );
  if v_level<>1 then raise exception 'Support escalation failed'; end if;

  select resolved_version into v_version
  from public.transition_crm_support_case_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_case,'RESOLVED',v_version,'Resolved fixture reason','Support private resolution summary'
  );

  select resolved_version into v_version
  from public.record_crm_support_csat_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_case,5::smallint,'Support private CSAT comment','verified-fixture-csat',v_version
  );

  select resolved_version into v_version
  from public.transition_crm_support_case_manual(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_case,'CLOSED',v_version,'Close fixture reason',null
  );

  if not exists (
    select 1 from public.crm_support_cases
    where id=v_case and status='CLOSED' and csat_score=5
      and resolved_at is not null and closed_at is not null
  ) then raise exception 'Support resolution/CSAT/close lifecycle failed'; end if;
end;
$support_lifecycle$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $support_member_read$
begin
  if not exists (
    select 1 from public.get_crm_support_cases(
      '00000000-0000-0000-0000-000000000c01',
      null,null,null,true,50,null,null
    ) where id='50000000-0000-0000-0000-000000000c01' and status='CLOSED'
  ) then raise exception 'Support Case member read failed'; end if;

  if not exists (
    select 1 from public.get_crm_support_sla_policies(
      '00000000-0000-0000-0000-000000000c01',false
    ) where id='40000000-0000-0000-0000-000000000c01'
  ) then raise exception 'Support SLA member read failed'; end if;

  begin
    insert into public.crm_support_cases(
      id,organization_id,subject,request_key,created_by_user_id,updated_by_user_id
    ) values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000c01',
      'Direct browser insert should fail',
      'support-direct-auth-insert',
      '00000000-0000-0000-0000-00000000c001',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Authenticated role inserted Support Case directly';
  exception when insufficient_privilege then null;
  end;
end;
$support_member_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $support_cross_tenant_read$
begin
  if exists (
    select 1 from public.get_crm_support_cases(
      '00000000-0000-0000-0000-000000000c01',
      null,null,null,true,50,null,null
    )
  ) then raise exception 'Support Case read leaked another Organization'; end if;
end;
$support_cross_tenant_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $support_security$
begin
  if (
    select bool_or(p.prosecdef)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%crm_support%'
  ) then raise exception 'Support function unexpectedly uses SECURITY DEFINER'; end if;

  if has_table_privilege('authenticated','public.crm_support_cases','INSERT')
     or has_table_privilege('authenticated','public.crm_support_cases','UPDATE')
     or has_table_privilege('authenticated','public.crm_support_sla_policies','INSERT') then
    raise exception 'Support authenticated table grants are too broad';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.create_crm_support_case_manual(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then raise exception 'Authenticated role can call trusted Support mutation'; end if;

  if not has_function_privilege(
    'service_role',
    'public.create_crm_support_case_manual(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then raise exception 'service_role cannot call Support mutation'; end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_support_cases(uuid,text,text,uuid,boolean,integer,timestamptz,uuid)',
    'EXECUTE'
  ) then raise exception 'Authenticated role cannot read Support Cases'; end if;

  if not (select relrowsecurity from pg_class where oid='public.crm_support_cases'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.crm_support_sla_policies'::regclass) then
    raise exception 'Support Case RLS is incomplete';
  end if;
end;
$support_security$;

do $support_audit_privacy$
begin
  if exists (
    select 1 from public.audit_logs
    where entity_type in ('crm_support_cases','crm_support_sla_policies')
      and (
        coalesce(before_data::text,'') ilike '%Support private%'
        or coalesce(after_data::text,'') ilike '%Support private%'
        or coalesce(before_data::text,'') ilike '%fixture reason%'
        or coalesce(after_data::text,'') ilike '%fixture reason%'
      )
  ) then raise exception 'Support audit copied private prose'; end if;

  if not exists (
    select 1 from public.audit_logs
    where entity_type='crm_support_cases'
      and action='CRM_SUPPORT_CASE_CREATED'
      and after_data ? 'has_description'
  ) then raise exception 'Support bounded creation audit missing'; end if;
end;
$support_audit_privacy$;

reset role;
