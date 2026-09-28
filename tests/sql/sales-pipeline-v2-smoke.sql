\set ON_ERROR_STOP on

create temp table sales_pipeline_v2_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count;

do $pipeline_v2_structure$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='crm_deals'
      and column_name='weighted_amount' and is_generated='ALWAYS'
  ) then
    raise exception 'SALES-PIPELINE-V2 generated weighted amount is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='crm_pipeline_stages'
      and column_name='default_probability_percent'
  ) then
    raise exception 'SALES-PIPELINE-V2 stage probability policy is missing';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.get_crm_pipeline_forecast(uuid,uuid,uuid,uuid,timestamptz,timestamptz)',
      'EXECUTE'
    )
  then
    raise exception 'Authenticated role cannot execute Pipeline forecast read model';
  end if;

  if (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_crm_pipeline_forecast'
    limit 1
  ) then
    raise exception 'Pipeline forecast unexpectedly uses SECURITY DEFINER';
  end if;
end;
$pipeline_v2_structure$;

-- Foundation smoke has already created Sales + OPEN/WON/LOST evidence.
-- The old API shape must still resolve into deterministic V2 stage defaults.
do $pipeline_v2_backward_compat$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Sales';

  if v_pipeline is null then raise exception 'CRM Deal foundation fixture is missing'; end if;

  if not exists (
    select 1 from public.crm_pipeline_stages
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and pipeline_id=v_pipeline
      and category='WON'
      and default_probability_percent=100
      and forecast_category='CLOSED'
  ) or not exists (
    select 1 from public.crm_pipeline_stages
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and pipeline_id=v_pipeline
      and category='LOST'
      and default_probability_percent=0
      and forecast_category='OMITTED'
  ) then
    raise exception 'Existing Pipeline create contract did not receive deterministic V2 terminal defaults';
  end if;

  if not exists (
    select 1 from public.crm_deals
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and state='WON'
      and probability_percent=100
      and forecast_category='CLOSED'
      and forecast_source='STAGE_DEFAULT'
  ) then
    raise exception 'Existing Deal lifecycle did not receive V2 terminal forecast semantics';
  end if;
end;
$pipeline_v2_backward_compat$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

-- Create a controlled Team hierarchy only in CI/test. No Production fixtures are created.
insert into public.brands(id,organization_id,name,slug) values (
  '81000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Test Brand','pipeline-v2-test-brand'
);
insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values (
  '82000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '81000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Test Business','pipeline-v2-test-business'
);
insert into public.branches(id,organization_id,tenant_business_id,name,code) values (
  '83000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '82000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Branch','PIPEV2'
);
insert into public.departments(id,organization_id,branch_id,name,code) values (
  '84000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '83000000-0000-0000-0000-000000000c01',
  'Sales Forecast','FORECAST'
);
insert into public.teams(id,organization_id,department_id,name,code) values (
  '85000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '84000000-0000-0000-0000-000000000c01',
  'Forecast Team','FORECAST'
);

select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c003',
  'TEAM',
  'SALES_AGENT',
  null,null,null,null,
  '85000000-0000-0000-0000-000000000c01',
  '{}'::jsonb,
  'sales-pipeline-v2-team-assignment'
)).id;

select public.create_crm_pipeline_with_stages(
  '00000000-0000-0000-0000-000000000c01',
  'Forecast Policy',
  false,
  '[
    {"name":"Discovery","position":1,"category":"OPEN","defaultProbabilityPercent":20,"forecastCategory":"PIPELINE"},
    {"name":"Proposal","position":2,"category":"OPEN","defaultProbabilityPercent":60,"forecastCategory":"BEST_CASE","requiresAmount":true,"requiresExpectedClose":true},
    {"name":"Commit","position":3,"category":"OPEN","defaultProbabilityPercent":85,"forecastCategory":"COMMIT","requiresAmount":true,"requiresExpectedClose":true},
    {"name":"Won","position":4,"category":"WON","defaultProbabilityPercent":100,"forecastCategory":"CLOSED"},
    {"name":"Lost","position":5,"category":"LOST","defaultProbabilityPercent":0,"forecastCategory":"OMITTED"}
  ]'::jsonb
);

do $pipeline_v2_policy_creation$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Policy';

  if v_pipeline is null then raise exception 'V2 Pipeline was not created'; end if;

  if not exists (
    select 1 from public.crm_pipeline_stages
    where pipeline_id=v_pipeline and name='Proposal'
      and default_probability_percent=60
      and forecast_category='BEST_CASE'
      and requires_amount
      and requires_expected_close
  ) then
    raise exception 'Typed Pipeline stage policy was not persisted';
  end if;
end;
$pipeline_v2_policy_creation$;

do $pipeline_v2_required_policy$
declare
  v_pipeline uuid;
  v_proposal uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Forecast Policy';
  select id into v_proposal from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and name='Proposal';

  begin
    insert into public.crm_deals(
      organization_id,business_id,pipeline_id,stage_id,title,
      owner_user_id,source_type,request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      v_pipeline,v_proposal,'Missing required forecast evidence',
      '00000000-0000-0000-0000-00000000c001',
      'MANUAL','pipeline-v2-required-policy-reject',
      'USER','00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Stage policy allowed missing amount/expected-close evidence';
  exception when others then
    if sqlerrm not like 'CRM stage policy requires Deal amount%' then raise; end if;
  end;
end;
$pipeline_v2_required_policy$;

do $pipeline_v2_team_and_weighted$
declare
  v_pipeline uuid;
  v_proposal uuid;
  v_deal uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Forecast Policy';
  select id into v_proposal from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and name='Proposal';

  insert into public.crm_deals(
    organization_id,business_id,pipeline_id,stage_id,title,
    amount,currency,expected_close_at,owner_user_id,owner_team_id,
    probability_percent,forecast_category,
    source_type,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    v_pipeline,v_proposal,'Governed weighted forecast',
    1000,'OMR','2026-10-31T00:00:00Z',
    '00000000-0000-0000-0000-00000000c003',
    '85000000-0000-0000-0000-000000000c01',
    70,'BEST_CASE',
    'MANUAL','pipeline-v2-weighted',
    'USER','00000000-0000-0000-0000-00000000c001'
  ) returning id into v_deal;

  if not exists (
    select 1 from public.crm_deals
    where id=v_deal
      and probability_percent=70
      and forecast_category='BEST_CASE'
      and forecast_source='MANUAL'
      and weighted_amount=700.0000
      and owner_team_id='85000000-0000-0000-0000-000000000c01'
  ) then
    raise exception 'Manual forecast/Team ownership/weighted amount contract failed';
  end if;

  begin
    insert into public.crm_deals(
      organization_id,business_id,pipeline_id,stage_id,title,
      amount,currency,expected_close_at,owner_user_id,owner_team_id,
      source_type,request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      v_pipeline,v_proposal,'Invalid Team owner',
      100,'OMR','2026-10-31T00:00:00Z',
      '00000000-0000-0000-0000-00000000c001',
      '85000000-0000-0000-0000-000000000c01',
      'MANUAL','pipeline-v2-invalid-team',
      'USER','00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Deal accepted Team ownership without canonical Team assignment';
  exception when others then
    if sqlerrm not like 'CRM Deal owner Team requires an active canonical Team assignment%' then raise; end if;
  end;
end;
$pipeline_v2_team_and_weighted$;

do $pipeline_v2_policy_lock_and_stage_reset$
declare
  v_pipeline uuid;
  v_commit uuid;
  v_deal uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Forecast Policy';
  select id into v_commit from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and name='Commit';
  select id into v_deal from public.crm_deals
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='pipeline-v2-weighted';

  update public.crm_deals set stage_id=v_commit where id=v_deal;

  if not exists (
    select 1 from public.crm_deals
    where id=v_deal
      and probability_percent=85
      and forecast_category='COMMIT'
      and forecast_source='STAGE_DEFAULT'
      and weighted_amount=850.0000
  ) then
    raise exception 'Stage movement did not reset Deal forecast to destination policy';
  end if;

  begin
    update public.crm_pipeline_stages
    set default_probability_percent=90
    where id=v_commit;
    raise exception 'Active Stage policy changed while OPEN Deal existed';
  exception when others then
    if sqlerrm not like 'CRM active stage forecast policy cannot change while it has OPEN deals%' then raise; end if;
  end;
end;
$pipeline_v2_policy_lock_and_stage_reset$;

do $pipeline_v2_forecast_read$
declare
  v_pipeline uuid;
  v_count bigint;
  v_total numeric;
  v_weighted numeric;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Forecast Policy';

  select deal_count,total_amount,weighted_amount
    into v_count,v_total,v_weighted
  from public.get_crm_pipeline_forecast(
    '00000000-0000-0000-0000-000000000c01',
    v_pipeline,
    '00000000-0000-0000-0000-00000000c003',
    '85000000-0000-0000-0000-000000000c01',
    '2026-10-01T00:00:00Z',
    '2026-11-30T00:00:00Z'
  )
  where currency='OMR' and forecast_category='COMMIT';

  if v_count<>1 or v_total<>1000 or v_weighted<>850 then
    raise exception 'Pipeline forecast read model failed currency-safe weighted aggregation';
  end if;
end;
$pipeline_v2_forecast_read$;

do $pipeline_v2_won_evidence$
declare
  v_pipeline uuid;
  v_won uuid;
  v_deal uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Forecast Policy';
  select id into v_won from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and category='WON';
  select id into v_deal from public.crm_deals
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='pipeline-v2-weighted';

  update public.crm_deals set stage_id=v_won where id=v_deal;

  if not exists (
    select 1 from public.crm_deals
    where id=v_deal and state='WON' and won_at is not null
      and probability_percent=100 and forecast_category='CLOSED'
      and forecast_source='STAGE_DEFAULT' and weighted_amount=1000.0000
  ) then
    raise exception 'WON transition did not close forecast truth deterministically';
  end if;
end;
$pipeline_v2_won_evidence$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $pipeline_v2_cross_tenant_forecast$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.get_crm_pipeline_forecast(
    '00000000-0000-0000-0000-000000000c01',
    null,null,null,null,null
  );
  if v_count<>0 then raise exception 'Pipeline forecast leaked another Organization'; end if;
end;
$pipeline_v2_cross_tenant_forecast$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $pipeline_v2_audit_and_side_effects$
begin
  if not exists (
    select 1 from public.audit_logs
    where entity_type='crm_deals'
      and action='CRM_DEAL_STAGE_CHANGED'
      and after_data->>'forecast_category'='CLOSED'
      and (after_data->>'probability_percent')::integer=100
      and (after_data->>'weighted_amount')::numeric=1000
  ) then
    raise exception 'Pipeline V2 audit evidence omitted governed forecast fields';
  end if;

  if (select count(*) from public.outreach_messages)
       <>(select outreach_count from sales_pipeline_v2_side_effect_baseline)
     or (select count(*) from public.conversation_messages)
       <>(select message_count from sales_pipeline_v2_side_effect_baseline)
  then
    raise exception 'SALES-PIPELINE-V2 caused outbound/conversation side effects';
  end if;
end;
$pipeline_v2_audit_and_side_effects$;
