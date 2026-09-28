\set ON_ERROR_STOP on

create temp table sales_scoring_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count;

insert into public.leads(
  id,organization_id,business_id,status,agent_mode
) values (
  '60000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '10000000-0000-0000-0000-000000000c01',
  'NEW',
  'AUTO'
)
on conflict (id) do nothing;

do $scoring_no_backfill$
begin
  if not exists (
    select 1 from public.leads
    where id='60000000-0000-0000-0000-000000000c01'
      and opportunity_score=0
      and intent_score=0
      and fit_score is null
      and engagement_score is null
      and scoring_source is null
      and scoring_revision=0
      and manual_score_override is null
      and model_score_suggestion is null
  ) then
    raise exception 'SALES-SCORING fixture was silently backfilled';
  end if;
end;
$scoring_no_backfill$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $scoring_direct_mutation_guard$
begin
  begin
    update public.leads
    set opportunity_score=99
    where id='60000000-0000-0000-0000-000000000c01';
    raise exception 'Direct authenticated score UPDATE bypassed governance';
  exception when others then
    if sqlstate<>'42501'
       and sqlerrm not like 'CRM Lead scoring fields require the governed scoring mutation boundary%'
    then raise; end if;
  end;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);
  begin
    update public.leads
    set opportunity_score=98
    where id='60000000-0000-0000-0000-000000000c01';
    raise exception 'Authenticated browser spoofed scoring mutation marker';
  exception when others then
    if sqlstate<>'42501'
       and sqlerrm not like 'CRM Lead scoring fields require the governed scoring mutation boundary%'
    then raise; end if;
  end;

  begin
    insert into public.leads(
      id,organization_id,business_id,status,agent_mode,
      opportunity_score,score_reasons,scoring_source,
      scoring_policy_version,scoring_evidence,scoring_revision,scoring_updated_at
    ) values (
      '60000000-0000-0000-0000-000000000c02',
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      'NEW','AUTO',88,'["browser fabricated"]'::jsonb,
      'CRM_DETERMINISTIC_V1','sales-scoring-v1','{"fixture":true}'::jsonb,1,now()
    );
    raise exception 'Authenticated browser created a scored Lead directly';
  exception when others then
    if sqlstate<>'42501'
       and sqlerrm not like 'Scored CRM Lead creation requires the trusted server boundary%'
    then raise; end if;
  end;
end;
$scoring_direct_mutation_guard$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $scoring_deterministic_and_replay$
declare
  v_result jsonb;
begin
  v_result:=public.record_crm_lead_deterministic_score(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '60000000-0000-0000-0000-000000000c01',
    80,70,20,null,
    '["Verified deterministic fixture","Bounded evidence only"]'::jsonb,
    'CRM_DETERMINISTIC_V1',
    'sales-scoring-v1',
    '{"source":"controlled-test","fitEvidence":true}'::jsonb,
    0,
    'sales-scoring-deterministic-1'
  );

  if (v_result->>'opportunityScore')::integer<>80
     or (v_result->>'fitScore')::integer<>70
     or (v_result->>'intentScore')::integer<>20
     or (v_result->>'revision')::integer<>1
     or (v_result->>'replayed')::boolean
  then
    raise exception 'Deterministic CRM Lead score write failed: %',v_result;
  end if;

  v_result:=public.record_crm_lead_deterministic_score(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '60000000-0000-0000-0000-000000000c01',
    80,70,20,null,
    '["Verified deterministic fixture","Bounded evidence only"]'::jsonb,
    'CRM_DETERMINISTIC_V1',
    'sales-scoring-v1',
    '{"source":"controlled-test","fitEvidence":true}'::jsonb,
    0,
    'sales-scoring-deterministic-1'
  );

  if not (v_result->>'replayed')::boolean
     or (v_result->>'revision')::integer<>1
  then
    raise exception 'Deterministic CRM Lead score replay was not idempotent: %',v_result;
  end if;

  begin
    perform public.record_crm_lead_deterministic_score(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      '60000000-0000-0000-0000-000000000c01',
      81,70,20,null,
      '["Different semantic request"]'::jsonb,
      'CRM_DETERMINISTIC_V1',
      'sales-scoring-v1',
      '{"source":"controlled-test"}'::jsonb,
      0,
      'sales-scoring-deterministic-1'
    );
    raise exception 'Scoring request key accepted semantic conflict';
  exception when others then
    if sqlerrm not like 'CRM Lead scoring request key conflict%' then raise; end if;
  end;
end;
$scoring_deterministic_and_replay$;

do $scoring_model_suggestion$
declare
  v_result jsonb;
begin
  v_result:=public.record_crm_lead_model_score_suggestion(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '60000000-0000-0000-0000-000000000c01',
    '{
      "opportunityScore":95,
      "fitScore":90,
      "intentScore":35,
      "reasons":["controlled advisory fixture"],
      "provider":"fixture-provider",
      "model":"fixture-model",
      "modelVersion":"v1",
      "sourceRunId":"controlled-run-1"
    }'::jsonb,
    1,
    'sales-scoring-model-1'
  );

  if (v_result->>'opportunityScore')::integer<>80
     or (v_result->>'effectiveScore')::integer<>80
     or (v_result->>'revision')::integer<>2
     or coalesce((v_result->>'suggestionAdvisoryOnly')::boolean,false) is not true
  then
    raise exception 'Model suggestion altered canonical score truth: %',v_result;
  end if;

  if not exists (
    select 1 from public.leads
    where id='60000000-0000-0000-0000-000000000c01'
      and opportunity_score=80
      and model_score_suggestion->>'opportunityScore'='95'
  ) then
    raise exception 'Model suggestion was not stored separately from canonical score';
  end if;
end;
$scoring_model_suggestion$;

do $scoring_override$
declare
  v_result jsonb;
begin
  v_result:=public.set_crm_lead_score_override(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '60000000-0000-0000-0000-000000000c01',
    90,
    'Private operator override fixture reason',
    null,
    2,
    'sales-scoring-override-set-1'
  );

  if (v_result->>'opportunityScore')::integer<>80
     or (v_result->>'effectiveScore')::integer<>90
     or (v_result->>'revision')::integer<>3
  then
    raise exception 'Manual override did not preserve deterministic base score: %',v_result;
  end if;
end;
$scoring_override$;

reset role;

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,stage,last_inbound_at
) values (
  '70000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '60000000-0000-0000-0000-000000000c01',
  'EMAIL','ACTIVE',now()
)
on conflict (id) do update
set lead_id=excluded.lead_id,stage='ACTIVE',last_inbound_at=excluded.last_inbound_at;

set role service_role;

do $scoring_engagement$
declare
  v_result jsonb;
begin
  v_result:=public.recompute_crm_lead_engagement(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '60000000-0000-0000-0000-000000000c01',
    3,
    'sales-scoring-engagement-1'
  );

  if (v_result->>'engagementScore')::integer<>50
     or (v_result->>'effectiveScore')::integer<>90
     or (v_result->>'revision')::integer<>4
  then
    raise exception 'Deterministic engagement recompute failed: %',v_result;
  end if;

  if not exists (
    select 1 from public.leads
    where id='60000000-0000-0000-0000-000000000c01'
      and engagement_score=50
      and scoring_evidence->'engagement'->>'policyVersion'='crm-engagement-v1'
  ) then
    raise exception 'Engagement provenance is missing';
  end if;
end;
$scoring_engagement$;

do $scoring_clear_override$
declare
  v_result jsonb;
begin
  v_result:=public.clear_crm_lead_score_override(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '60000000-0000-0000-0000-000000000c01',
    'Correction completed fixture',
    4,
    'sales-scoring-override-clear-1'
  );

  if (v_result->>'effectiveScore')::integer<>80
     or (v_result->>'revision')::integer<>5
  then
    raise exception 'Clearing override did not restore deterministic effective score: %',v_result;
  end if;
end;
$scoring_clear_override$;

do $scoring_service_direct_update_guard$
begin
  begin
    update public.leads
    set intent_score=99
    where id='60000000-0000-0000-0000-000000000c01';
    raise exception 'service_role directly mutated governed Lead scoring';
  exception when others then
    if sqlerrm not like 'CRM Lead scoring fields require the governed scoring mutation boundary%' then raise; end if;
  end;
end;
$scoring_service_direct_update_guard$;

do $scoring_actor_boundary$
begin
  begin
    perform public.recompute_crm_lead_engagement(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c002',
      '60000000-0000-0000-0000-000000000c01',
      5,
      'sales-scoring-cross-tenant'
    );
    raise exception 'Cross-tenant actor mutated Lead scoring';
  exception when others then
    if sqlerrm not like 'CRM Lead scoring mutation requires OWNER, ADMIN or SALES_MANAGER%' then raise; end if;
  end;
end;
$scoring_actor_boundary$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c004',false);

do $scoring_viewer_read$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.get_crm_lead_scoring(
    '00000000-0000-0000-0000-000000000c01',
    '60000000-0000-0000-0000-000000000c01'
  );
  if v_count<>1 then raise exception 'Organization VIEWER could not read Lead scoring'; end if;

  if has_function_privilege(
    'authenticated',
    'public.set_crm_lead_score_override(uuid,uuid,uuid,integer,text,timestamptz,integer,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated browser can execute trusted score override RPC';
  end if;
end;
$scoring_viewer_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $scoring_security_and_audit$
begin
  if not has_function_privilege(
       'service_role',
       'public.record_crm_lead_deterministic_score(uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.recompute_crm_lead_engagement(uuid,uuid,uuid,integer,text)',
       'EXECUTE'
     )
  then
    raise exception 'Trusted SALES-SCORING mutation grants are incomplete';
  end if;

  if exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'record_crm_lead_deterministic_score',
        'recompute_crm_lead_engagement',
        'set_crm_lead_score_override',
        'clear_crm_lead_score_override',
        'record_crm_lead_model_score_suggestion'
      )
      and p.prosecdef
  ) then
    raise exception 'SALES-SCORING mutation unexpectedly uses SECURITY DEFINER';
  end if;

  if exists (
    select 1 from public.audit_logs
    where entity_type='lead'
      and entity_id='60000000-0000-0000-0000-000000000c01'
      and (
        coalesce(before_data::text,'') ilike '%Private operator override fixture reason%'
        or coalesce(after_data::text,'') ilike '%Private operator override fixture reason%'
        or coalesce(before_data::text,'') ilike '%controlled advisory fixture%'
        or coalesce(after_data::text,'') ilike '%controlled advisory fixture%'
      )
  ) then
    raise exception 'SALES-SCORING audit leaked private/free-form reasons';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where entity_type='lead'
      and entity_id='60000000-0000-0000-0000-000000000c01'
      and action='CRM_LEAD_SCORE_OVERRIDE_SET'
      and after_data->>'reason_present'='true'
  ) then
    raise exception 'SALES-SCORING bounded override audit evidence is missing';
  end if;

  if (select count(*) from public.outreach_messages)
       <>(select outreach_count from sales_scoring_side_effect_baseline)
     or (select count(*) from public.conversation_messages)
       <>(select message_count from sales_scoring_side_effect_baseline)
  then
    raise exception 'SALES-SCORING caused outbound message side effects';
  end if;
end;
$scoring_security_and_audit$;
