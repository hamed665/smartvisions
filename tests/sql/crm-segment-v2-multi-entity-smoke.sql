\set ON_ERROR_STOP on

create temp table segment_v2_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as conversation_message_count;

do $segment_v2_structure$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid=con.conrelid
    join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname='public'
      and rel.relname='crm_segments'
      and con.conname='crm_segments_entity_type_check'
      and pg_get_constraintdef(con.oid) like '%LEAD%'
      and pg_get_constraintdef(con.oid) like '%PERSON%'
      and pg_get_constraintdef(con.oid) like '%DEAL%'
      and pg_get_constraintdef(con.oid) like '%ACCOUNT%'
  ) then
    raise exception 'SEGMENT-V2 entity-type constraint is incomplete';
  end if;

  if to_regclass('public.crm_segment_memberships') is not null
     or to_regclass('public.crm_segment_members') is not null
     or to_regclass('public.crm_segment_rules') is not null
     or to_regclass('public.segments_v2') is not null then
    raise exception 'SEGMENT-V2 introduced a parallel Segment/membership store';
  end if;

  if (
    select bool_or(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'create_crm_segment',
        'update_crm_segment_definition',
        'set_crm_segment_lifecycle',
        'evaluate_crm_segment',
        'crm_validate_segment_v2_predicate_node',
        'crm_segment_predicate_matches_v2'
      )
  ) then
    raise exception 'SEGMENT-V2 function unexpectedly uses SECURITY DEFINER';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.evaluate_crm_segment(uuid,uuid,integer,integer,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.evaluate_crm_segment(uuid,uuid,integer,integer,uuid)',
    'EXECUTE'
  ) then
    raise exception 'SEGMENT-V2 evaluator grants are incorrect';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.evaluate_crm_lead_segment(uuid,uuid,integer,integer,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Legacy Lead Segment evaluator compatibility was lost';
  end if;
end;
$segment_v2_structure$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $segment_v2_person$
declare
  v_person uuid;
  v_segment public.crm_segments%rowtype;
  v_eval jsonb;
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;

  if v_person is null then
    raise exception 'SEGMENT-V2 Person fixture is missing';
  end if;

  v_segment:=public.create_crm_segment(
    '00000000-0000-0000-0000-000000000c01',
    'PERSON',
    'Active People',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"status","operator":"EQ","value":"ACTIVE"}'::jsonb,
    'segment-v2-person-active'
  );

  if v_segment.entity_type<>'PERSON' then
    raise exception 'SEGMENT-V2 Person Segment was silently coerced to another entity';
  end if;

  v_eval:=public.evaluate_crm_segment(
    v_segment.organization_id,v_segment.id,1,100,null
  );

  if v_eval->>'entityType'<>'PERSON'
     or not exists (
       select 1
       from jsonb_array_elements_text(v_eval->'entityIds') id
       where id=v_person::text
     ) then
    raise exception 'SEGMENT-V2 Person evaluation missed canonical active Person: %',v_eval;
  end if;

  begin
    perform public.create_crm_segment(
      v_segment.organization_id,
      'PERSON',
      'Invalid Person Custom Field',
      '{"kind":"PREDICATE","source":"CUSTOM_FIELD","definitionId":"10000000-0000-4000-8000-000000000001","definitionVersion":1,"dataType":"TEXT","operator":"EQ","value":"private"}'::jsonb,
      'segment-v2-person-custom-field-denied'
    );
    raise exception 'SEGMENT-V2 accepted unsupported Person Custom Field predicate';
  exception when others then
    if sqlerrm not like 'CRM Segment Custom Fields are unavailable for this entity type%' then
      raise;
    end if;
  end;
end;
$segment_v2_person$;

do $segment_v2_deal$
declare
  v_contract uuid;
  v_contract_version integer;
  v_deal uuid;
  v_segment public.crm_segments%rowtype;
  v_eval jsonb;
begin
  select d.id into v_deal
  from public.crm_deals d
  where d.organization_id='00000000-0000-0000-0000-000000000c01'
    and d.request_key='fixture-agent-deal';

  select id,version into v_contract,v_contract_version
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and entity_type='DEAL'
    and field_key='contract_code';

  if v_deal is null or v_contract is null then
    raise exception 'SEGMENT-V2 Deal/custom-field fixture is missing';
  end if;

  v_segment:=public.create_crm_segment(
    '00000000-0000-0000-0000-000000000c01',
    'DEAL',
    'Agent contract Deal',
    jsonb_build_object(
      'kind','PREDICATE','source','CUSTOM_FIELD',
      'definitionId',v_contract::text,
      'definitionVersion',v_contract_version,
      'dataType','TEXT','operator','EQ','value','AGENT-C-1'
    ),
    'segment-v2-deal-contract'
  );

  v_eval:=public.evaluate_crm_segment(
    v_segment.organization_id,v_segment.id,1,100,null
  );

  if v_eval->>'entityType'<>'DEAL'
     or jsonb_array_length(v_eval->'entityIds')<>1
     or v_eval->'entityIds'->>0<>v_deal::text then
    raise exception 'SEGMENT-V2 Deal Custom Field evaluation is incorrect: %',v_eval;
  end if;
end;
$segment_v2_deal$;

do $segment_v2_account$
declare
  v_segment public.crm_segments%rowtype;
  v_eval jsonb;
begin
  v_segment:=public.create_crm_segment(
    '00000000-0000-0000-0000-000000000c01',
    'ACCOUNT',
    'Unclassified Accounts',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"account_lifecycle","operator":"EQ","value":"UNCLASSIFIED"}'::jsonb,
    'segment-v2-account-unclassified'
  );

  v_eval:=public.evaluate_crm_segment(
    v_segment.organization_id,v_segment.id,1,100,null
  );

  if v_eval->>'entityType'<>'ACCOUNT'
     or not exists (
       select 1
       from jsonb_array_elements_text(v_eval->'entityIds') id
       where id='10000000-0000-0000-0000-000000000c01'
     ) then
    raise exception 'SEGMENT-V2 Account evaluation missed canonical unclassified Account: %',v_eval;
  end if;

  v_segment:=public.set_crm_segment_lifecycle(
    v_segment.organization_id,v_segment.id,v_segment.version,
    'ARCHIVED','segment-v2-account-archive'
  );

  begin
    perform public.evaluate_crm_segment(
      v_segment.organization_id,v_segment.id,null,100,null
    );
    raise exception 'Archived SEGMENT-V2 Segment unexpectedly evaluated';
  exception when others then
    if sqlerrm not like 'Archived CRM Segment cannot be evaluated%' then
      raise;
    end if;
  end;
end;
$segment_v2_account$;

do $segment_v2_request_replay$
declare
  v_first public.crm_segments%rowtype;
  v_replay public.crm_segments%rowtype;
begin
  v_first:=public.create_crm_segment(
    '00000000-0000-0000-0000-000000000c01',
    'DEAL',
    'Open Deals',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"state","operator":"EQ","value":"OPEN"}'::jsonb,
    'segment-v2-deal-open'
  );
  v_replay:=public.create_crm_segment(
    '00000000-0000-0000-0000-000000000c01',
    'DEAL',
    'Open Deals',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"state","operator":"EQ","value":"OPEN"}'::jsonb,
    'segment-v2-deal-open'
  );
  if v_first.id is distinct from v_replay.id then
    raise exception 'SEGMENT-V2 exact replay changed Segment identity';
  end if;

  begin
    perform public.create_crm_segment(
      '00000000-0000-0000-0000-000000000c01',
      'ACCOUNT',
      'Conflicting replay',
      '{"kind":"PREDICATE","source":"CANONICAL","field":"account_lifecycle","operator":"EQ","value":"UNCLASSIFIED"}'::jsonb,
      'segment-v2-deal-open'
    );
    raise exception 'SEGMENT-V2 accepted request-key reuse with different semantics';
  exception when others then
    if sqlerrm not like 'CRM Segment request key conflict%' then raise; end if;
  end;
end;
$segment_v2_request_replay$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $segment_v2_cross_tenant$
declare
  v_segment uuid;
begin
  select id into v_segment
  from public.crm_segments
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='segment-v2-person-active';

  if v_segment is not null then
    raise exception 'Cross-tenant RLS exposed SEGMENT-V2 identity';
  end if;
end;
$segment_v2_cross_tenant$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $segment_v2_audit_and_side_effects$
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
        coalesce(before_data::text,'') ilike '%AGENT-C-1%'
        or coalesce(after_data::text,'') ilike '%AGENT-C-1%'
        or coalesce(before_data::text,'') ilike '%Alice Person Fixture%'
        or coalesce(after_data::text,'') ilike '%Alice Person Fixture%'
      )
  ) then
    raise exception 'SEGMENT-V2 audit copied predicate value or Person PII';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where entity_type='crm_segment'
      and action='CRM_SEGMENT_EVALUATED'
      and after_data->>'segment_entity_type' in ('PERSON','DEAL','ACCOUNT')
  ) then
    raise exception 'SEGMENT-V2 bounded entity-type evaluation audit is missing';
  end if;

  select count(*) into v_outreach from public.outreach_messages;
  select count(*) into v_messages from public.conversation_messages;

  if v_outreach<>(select outreach_count from segment_v2_side_effect_baseline)
     or v_messages<>(select conversation_message_count from segment_v2_side_effect_baseline)
  then
    raise exception 'SEGMENT-V2 evaluation caused outbound/conversation side effects';
  end if;
end;
$segment_v2_audit_and_side_effects$;
