\set ON_ERROR_STOP on

do $segment_structure$
declare
  v_name text;
begin
  foreach v_name in array array['crm_segments','crm_segment_versions']
  loop
    if not (
      select relrowsecurity from pg_class
      where oid=('public.'||v_name)::regclass
    ) then
      raise exception '% RLS is not enabled',v_name;
    end if;

    if has_table_privilege('anon','public.'||v_name,'SELECT')
       or has_table_privilege('service_role','public.'||v_name,'SELECT')
    then
      raise exception '% exposed to anon/service_role',v_name;
    end if;

    if not has_table_privilege('authenticated','public.'||v_name,'SELECT')
       or not has_table_privilege('authenticated','public.'||v_name,'INSERT')
    then
      raise exception '% authenticated grants missing',v_name;
    end if;

    if has_table_privilege('authenticated','public.'||v_name,'DELETE') then
      raise exception '% unexpectedly allows DELETE',v_name;
    end if;
  end loop;

  if has_table_privilege('authenticated','public.crm_segment_versions','UPDATE') then
    raise exception 'CRM Segment versions unexpectedly allow UPDATE';
  end if;

  if (
    select p.prosecdef from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='evaluate_crm_lead_segment'
    limit 1
  ) then
    raise exception 'CRM Segment evaluator unexpectedly SECURITY DEFINER';
  end if;

  if (
    select p.prosecdef from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_crm_lead_segment'
    limit 1
  ) then
    raise exception 'CRM Segment create RPC unexpectedly SECURITY DEFINER';
  end if;

  if (select count(*) from public.crm_segments)<>0
     or (select count(*) from public.crm_segment_versions)<>0
  then
    raise exception 'CRM Segment migration fabricated tenant data';
  end if;
end;
$segment_structure$;

create temp table segment_smoke_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as conversation_message_count;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $owner_create_and_replay$
declare
  v_first public.crm_segments%rowtype;
  v_replay public.crm_segments%rowtype;
begin
  v_first := public.create_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    'All linked Leads',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"business_id","operator":"IS_SET"}'::jsonb,
    'segment-create-linked-leads'
  );

  v_replay := public.create_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    'All linked Leads',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"business_id","operator":"IS_SET"}'::jsonb,
    'segment-create-linked-leads'
  );

  if v_first.id is distinct from v_replay.id then
    raise exception 'CRM Segment create replay returned different identity';
  end if;

  if not exists (
    select 1 from public.crm_segments s
    where s.id=v_first.id
      and s.entity_type='LEAD'
      and s.status='ACTIVE'
      and s.current_definition_version=1
      and s.version=1
  ) then
    raise exception 'CRM Segment identity contract failed';
  end if;

  if (
    select count(*) from public.crm_segment_versions v
    where v.segment_id=v_first.id
  )<>1 then
    raise exception 'CRM Segment replay duplicated semantic version';
  end if;
end;
$owner_create_and_replay$;

do $bounded_dynamic_evaluation$
declare
  v_segment uuid;
  v_page jsonb;
  v_full jsonb;
begin
  select id into v_segment
  from public.crm_segments
  where last_request_key='segment-create-linked-leads';

  v_page := public.evaluate_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    v_segment,null,1,null
  );

  if (v_page->>'evaluationMode')<>'DYNAMIC'
     or (v_page->>'segmentVersion')::integer<>1
     or jsonb_array_length(v_page->'leadIds')<>1
     or (v_page->>'hasMore')::boolean<>true
     or nullif(v_page->>'nextCursor','') is null
  then
    raise exception 'CRM Segment bounded page evidence is invalid: %',v_page;
  end if;

  v_full := public.evaluate_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    v_segment,1,100,null
  );

  if jsonb_array_length(v_full->'leadIds')<>2
     or (v_full->>'hasMore')::boolean<>false
  then
    raise exception 'CRM Segment expected two linked Lead fixtures: %',v_full;
  end if;
end;
$bounded_dynamic_evaluation$;

do $invalid_ast_rejected$
begin
  begin
    perform public.create_crm_lead_segment(
      '00000000-0000-0000-0000-000000000c01',
      'Bad SQL Segment',
      '{"kind":"PREDICATE","source":"CANONICAL","field":"status","operator":"EQ","value":"ACTIVE","sql":"select * from leads"}'::jsonb,
      'segment-invalid-sql'
    );
    raise exception 'Arbitrary Segment AST key unexpectedly accepted';
  exception when others then
    if sqlerrm not like 'CRM Segment canonical predicate contains unsupported keys%' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.crm_segments
    where last_request_key='segment-invalid-sql'
  ) then
    raise exception 'Failed Segment creation left orphan identity';
  end if;
end;
$invalid_ast_rejected$;

insert into public.crm_custom_field_definitions(
  organization_id,entity_type,field_key,label,data_type,required,
  sensitivity_class,searchable,filterable,unique_value,
  last_request_key,created_by_user_id,updated_by_user_id
) values (
  '00000000-0000-0000-0000-000000000c01',
  'LEAD','segment_test_email','Segment Test Email','EMAIL',false,
  'PII',false,true,false,
  'segment-pii-definition',
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000c001'
);

do $pii_predicate_rejected$
declare
  v_definition uuid;
begin
  select id into v_definition
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='segment_test_email';

  begin
    perform public.create_crm_lead_segment(
      '00000000-0000-0000-0000-000000000c01',
      'PII Segment',
      jsonb_build_object(
        'kind','PREDICATE','source','CUSTOM_FIELD',
        'definitionId',v_definition::text,'definitionVersion',1,
        'dataType','EMAIL','operator','EQ','value','person@example.test'
      ),
      'segment-pii-rejected'
    );
    raise exception 'PII Custom Field Segment unexpectedly accepted';
  exception when others then
    if sqlerrm not like 'CRM Segment Custom Field contract is unavailable or incompatible%' then
      raise;
    end if;
  end;
end;
$pii_predicate_rejected$;

do $custom_field_segment$
declare
  v_region uuid;
  v_region_version integer;
  v_segment public.crm_segments%rowtype;
  v_eval jsonb;
begin
  select id,version into v_region,v_region_version
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='region';

  v_segment := public.create_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    'Muscat Leads',
    jsonb_build_object(
      'kind','GROUP','op','AND','children',jsonb_build_array(
        jsonb_build_object(
          'kind','PREDICATE','source','CANONICAL',
          'field','status','operator','EQ','value','ACTIVE'
        ),
        jsonb_build_object(
          'kind','PREDICATE','source','CUSTOM_FIELD',
          'definitionId',v_region::text,'definitionVersion',v_region_version,
          'dataType','SINGLE_SELECT','operator','EQ','value','muscat'
        )
      )
    ),
    'segment-create-muscat'
  );

  v_eval := public.evaluate_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    v_segment.id,1,100,null
  );

  if jsonb_array_length(v_eval->'leadIds')<>1
     or v_eval->'leadIds'->>0<>'20000000-0000-0000-0000-000000000c01'
  then
    raise exception 'Custom Field Segment returned wrong Lead: %',v_eval;
  end if;
end;
$custom_field_segment$;

do $lifecycle_and_definition_versioning$
declare
  v_segment public.crm_segments%rowtype;
  v_updated public.crm_segments%rowtype;
  v_eval jsonb;
begin
  select * into v_segment
  from public.crm_segments
  where last_request_key='segment-create-linked-leads';

  v_updated := public.set_crm_lead_segment_lifecycle(
    v_segment.organization_id,v_segment.id,v_segment.version,
    'ARCHIVED','segment-archive-linked'
  );

  if v_updated.status<>'ARCHIVED' or v_updated.current_definition_version<>1 then
    raise exception 'CRM Segment archive changed semantic version';
  end if;

  begin
    perform public.evaluate_crm_lead_segment(
      v_updated.organization_id,v_updated.id,null,10,null
    );
    raise exception 'Archived CRM Segment unexpectedly evaluated';
  exception when others then
    if sqlerrm not like 'Archived CRM Segment cannot be evaluated%' then
      raise;
    end if;
  end;

  v_updated := public.set_crm_lead_segment_lifecycle(
    v_updated.organization_id,v_updated.id,v_updated.version,
    'ACTIVE','segment-reactivate-linked'
  );

  v_updated := public.update_crm_lead_segment_definition(
    v_updated.organization_id,v_updated.id,v_updated.version,
    'High score Leads',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"opportunity_score","operator":"GTE","value":0}'::jsonb,
    'segment-update-linked-v2'
  );

  if v_updated.current_definition_version<>2 then
    raise exception 'CRM Segment semantic version did not advance';
  end if;

  v_eval := public.evaluate_crm_lead_segment(
    v_updated.organization_id,v_updated.id,1,100,null
  );
  if (v_eval->>'segmentVersion')::integer<>1 then
    raise exception 'Historical canonical Segment version evidence changed';
  end if;
end;
$lifecycle_and_definition_versioning$;

do $custom_field_version_fail_closed$
declare
  v_region uuid;
  v_segment public.crm_segments%rowtype;
  v_current_definition_version integer;
  v_eval jsonb;
begin
  select id into v_region
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='region';

  update public.crm_custom_field_definitions
  set label='Region v3',
      updated_by_user_id='00000000-0000-0000-0000-00000000c001',
      last_request_key='segment-region-v3'
  where id=v_region;

  select * into v_segment
  from public.crm_segments
  where last_request_key='segment-create-muscat';

  begin
    perform public.evaluate_crm_lead_segment(
      v_segment.organization_id,v_segment.id,1,100,null
    );
    raise exception 'Stale Custom Field Segment unexpectedly evaluated';
  exception when others then
    if sqlerrm not like 'CRM Segment Custom Field contract is unavailable or incompatible%' then
      raise;
    end if;
  end;

  select version into v_current_definition_version
  from public.crm_custom_field_definitions
  where id=v_region;

  v_segment := public.update_crm_lead_segment_definition(
    v_segment.organization_id,v_segment.id,v_segment.version,
    'Muscat Leads v2',
    jsonb_build_object(
      'kind','PREDICATE','source','CUSTOM_FIELD',
      'definitionId',v_region::text,
      'definitionVersion',v_current_definition_version,
      'dataType','SINGLE_SELECT','operator','EQ','value','muscat'
    ),
    'segment-muscat-v2'
  );

  v_eval := public.evaluate_crm_lead_segment(
    v_segment.organization_id,v_segment.id,
    v_segment.current_definition_version,100,null
  );

  if jsonb_array_length(v_eval->'leadIds')<>1 then
    raise exception 'Updated Custom Field Segment failed: %',v_eval;
  end if;
end;
$custom_field_version_fail_closed$;

do $immutable_version_write_guard$
declare
  v_version_id uuid;
begin
  select id into v_version_id
  from public.crm_segment_versions
  order by created_at asc limit 1;

  begin
    update public.crm_segment_versions
    set name='Mutated historical definition'
    where id=v_version_id;
    raise exception 'CRM Segment version unexpectedly allowed UPDATE';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.crm_segment_versions where id=v_version_id;
    raise exception 'CRM Segment version unexpectedly allowed DELETE';
  exception when insufficient_privilege then null;
  end;
end;
$immutable_version_write_guard$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

do $sales_agent_cannot_manage$
begin
  begin
    perform public.create_crm_lead_segment(
      '00000000-0000-0000-0000-000000000c01',
      'Agent Segment',
      '{"kind":"PREDICATE","source":"CANONICAL","field":"business_id","operator":"IS_SET"}'::jsonb,
      'segment-sales-agent-denied'
    );
    raise exception 'Sales Agent unexpectedly created organization Segment';
  exception when others then
    if sqlerrm not like 'CRM Segment management is not permitted%' then
      raise;
    end if;
  end;
end;
$sales_agent_cannot_manage$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c005',false);

do $sales_manager_can_manage$
declare
  v_segment public.crm_segments%rowtype;
begin
  v_segment := public.create_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    'Manager Segment',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"business_id","operator":"IS_SET"}'::jsonb,
    'segment-manager-create'
  );
  if v_segment.id is null then
    raise exception 'Sales Manager could not create organization Segment';
  end if;
end;
$sales_manager_can_manage$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c004',false);

do $viewer_read_evaluate_only$
declare
  v_segment uuid;
  v_eval jsonb;
begin
  select id into v_segment
  from public.crm_segments
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='segment-update-linked-v2';

  v_eval := public.evaluate_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    v_segment,null,10,null
  );

  if jsonb_array_length(v_eval->'leadIds')<>2 then
    raise exception 'Viewer could not evaluate readable Segment';
  end if;

  begin
    perform public.create_crm_lead_segment(
      '00000000-0000-0000-0000-000000000c01',
      'Viewer Segment',
      '{"kind":"PREDICATE","source":"CANONICAL","field":"business_id","operator":"IS_SET"}'::jsonb,
      'segment-viewer-denied'
    );
    raise exception 'Viewer unexpectedly created organization Segment';
  exception when others then
    if sqlerrm not like 'CRM Segment management is not permitted%' then
      raise;
    end if;
  end;
end;
$viewer_read_evaluate_only$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $cross_tenant_isolation$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.get_crm_segments(
    '00000000-0000-0000-0000-000000000c01',
    true,100,null,null
  );
  if v_count<>0 then
    raise exception 'Cross-tenant Segment read leaked rows';
  end if;
end;
$cross_tenant_isolation$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $audit_and_side_effect_minimization$
declare
  v_outreach bigint;
  v_messages bigint;
begin
  if exists (
    select 1
    from public.audit_logs
    where entity_type='crm_segment'
      and action like 'CRM_SEGMENT_%'
      and (
        coalesce(before_data::text,'') ilike '%muscat%'
        or coalesce(after_data::text,'') ilike '%muscat%'
        or coalesce(before_data::text,'') ilike '%person@example.test%'
        or coalesce(after_data::text,'') ilike '%person@example.test%'
      )
  ) then
    raise exception 'CRM Segment audit leaked predicate/raw PII value';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where entity_type='crm_segment'
      and action='CRM_SEGMENT_CREATED'
  ) or not exists (
    select 1 from public.audit_logs
    where entity_type='crm_segment'
      and action='CRM_SEGMENT_EVALUATED'
  ) or not exists (
    select 1 from public.audit_logs
    where entity_type='crm_segment'
      and action='CRM_SEGMENT_DEFINITION_UPDATED'
  ) then
    raise exception 'CRM Segment material audit evidence is incomplete';
  end if;

  select count(*) into v_outreach from public.outreach_messages;
  select count(*) into v_messages from public.conversation_messages;

  if v_outreach<>(select outreach_count from segment_smoke_baseline)
     or v_messages<>(select conversation_message_count from segment_smoke_baseline)
  then
    raise exception 'CRM Segment smoke created outbound/conversation messages';
  end if;
end;
$audit_and_side_effect_minimization$;
