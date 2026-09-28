\set ON_ERROR_STOP on

create temp table sales_pipeline_v2_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

insert into public.brands(id,organization_id,name,slug) values (
  '11000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Brand C',
  'pipeline-v2-brand-c'
);

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values (
  '21000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '11000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Tenant Business C',
  'pipeline-v2-tenant-c'
);

insert into public.branches(id,organization_id,tenant_business_id,name,code) values (
  '31000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '21000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Branch C',
  'PIPE-C'
);

insert into public.departments(id,organization_id,branch_id,name,code) values (
  '41000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '31000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Sales',
  'PIPE-SALES-C'
);

insert into public.teams(id,organization_id,department_id,name,code) values (
  '51000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '41000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Team C',
  'PIPE-TEAM-C'
);

select public.create_crm_pipeline_with_stages(
  '00000000-0000-0000-0000-000000000c01',
  'Forecast Pipeline V2',
  false,
  '[
    {
      "name":"Prospect","position":1,"category":"OPEN",
      "probabilityBps":2000,"forecastCategory":"PIPELINE",
      "requireAmount":false,"requireExpectedClose":false,"allowProbabilityOverride":false
    },
    {
      "name":"Qualified","position":2,"category":"OPEN",
      "probabilityBps":5000,"forecastCategory":"BEST_CASE",
      "requireAmount":true,"requireExpectedClose":false,"allowProbabilityOverride":false
    },
    {
      "name":"Proposal","position":3,"category":"OPEN",
      "probabilityBps":7500,"forecastCategory":"COMMIT",
      "requireAmount":true,"requireExpectedClose":true,"allowProbabilityOverride":true
    },
    {"name":"Won","position":4,"category":"WON"},
    {"name":"Lost","position":5,"category":"LOST"}
  ]'::jsonb
);

do $pipeline_v2_stage_contract$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Pipeline V2';

  if not exists (
    select 1 from public.crm_pipeline_stages
    where pipeline_id=v_pipeline and position=3
      and probability_bps=7500
      and forecast_category='COMMIT'
      and require_amount
      and require_expected_close
      and allow_probability_override
  ) then
    raise exception 'SALES-PIPELINE-V2 configurable OPEN stage contract failed';
  end if;

  if not exists (
    select 1 from public.crm_pipeline_stages
    where pipeline_id=v_pipeline and category='WON'
      and probability_bps=10000
      and forecast_category='CLOSED_WON'
      and not allow_probability_override
  ) or not exists (
    select 1 from public.crm_pipeline_stages
    where pipeline_id=v_pipeline and category='LOST'
      and probability_bps=0
      and forecast_category='CLOSED_LOST'
      and not allow_probability_override
  ) then
    raise exception 'SALES-PIPELINE-V2 terminal probability contract failed';
  end if;
end;
$pipeline_v2_stage_contract$;

do $pipeline_v2_stage_policy$
declare
  v_pipeline uuid;
  v_qualified uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Pipeline V2';

  select id into v_qualified
  from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=2;

  begin
    insert into public.crm_deals(
      organization_id,business_id,pipeline_id,stage_id,title,
      owner_user_id,team_id,source_type,request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      v_pipeline,v_qualified,'Policy rejection fixture',
      '00000000-0000-0000-0000-00000000c001',
      '51000000-0000-0000-0000-000000000c01',
      'MANUAL','pipeline-v2-policy-reject',
      'USER','00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Stage requiring amount accepted missing amount';
  exception when others then
    if sqlerrm not like 'CRM Deal stage policy requires amount%' then raise; end if;
  end;
end;
$pipeline_v2_stage_policy$;

do $pipeline_v2_open_deal$
declare
  v_pipeline uuid;
  v_prospect uuid;
  v_deal uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Pipeline V2';

  select id into v_prospect
  from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=1;

  insert into public.crm_deals(
    organization_id,business_id,lead_id,pipeline_id,stage_id,
    title,amount,currency,owner_user_id,team_id,
    source_type,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    v_pipeline,v_prospect,
    'Pipeline V2 primary Deal',1000,'OMR',
    '00000000-0000-0000-0000-00000000c001',
    '51000000-0000-0000-0000-000000000c01',
    'MANUAL','pipeline-v2-primary',
    'USER','00000000-0000-0000-0000-00000000c001'
  ) returning id into v_deal;

  if not exists (
    select 1 from public.crm_deal_forecast_rows
    where deal_id=v_deal
      and team_id='51000000-0000-0000-0000-000000000c01'
      and stage_probability_bps=2000
      and effective_probability_bps=2000
      and weighted_amount=200
      and forecast_category='PIPELINE'
  ) then
    raise exception 'SALES-PIPELINE-V2 derived weighted amount failed';
  end if;

  begin
    update public.crm_deals
    set probability_override_bps=8500
    where id=v_deal;
    raise exception 'Stage without override permission accepted Deal probability override';
  exception when others then
    if sqlerrm not like 'CRM Deal stage policy does not allow probability override%' then raise; end if;
  end;

  begin
    update public.crm_deals
    set team_id='50000000-0000-0000-0000-000000000001'
    where id=v_deal;
    raise exception 'Cross-Organization Team assignment unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CRM Deal Team not found in Organization%' then raise; end if;
  end;
end;
$pipeline_v2_open_deal$;

do $pipeline_v2_commit_forecast$
declare
  v_pipeline uuid;
  v_proposal uuid;
  v_deal uuid;
  v_summary record;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Pipeline V2';

  select id into v_proposal
  from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=3;

  select id into v_deal
  from public.crm_deals
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='pipeline-v2-primary';

  update public.crm_deals
  set stage_id=v_proposal,
      expected_close_at='2026-10-31T00:00:00Z',
      probability_override_bps=8000
  where id=v_deal;

  if not exists (
    select 1 from public.crm_deal_forecast_rows
    where deal_id=v_deal
      and effective_probability_bps=8000
      and weighted_amount=800
      and forecast_category='COMMIT'
  ) then
    raise exception 'SALES-PIPELINE-V2 Deal override weighted forecast failed';
  end if;

  select * into v_summary
  from public.get_crm_pipeline_forecast(
    '00000000-0000-0000-0000-000000000c01',
    v_pipeline,
    '00000000-0000-0000-0000-00000000c001',
    '51000000-0000-0000-0000-000000000c01',
    'OMR',
    false
  )
  where forecast_category='COMMIT';

  if v_summary.pipeline_id is null
     or v_summary.deal_count<>1
     or v_summary.amount_total<>1000
     or v_summary.weighted_amount_total<>800
     or v_summary.earliest_expected_close is null
  then
    raise exception 'SALES-PIPELINE-V2 forecast summary failed';
  end if;
end;
$pipeline_v2_commit_forecast$;

do $pipeline_v2_won_evidence$
declare
  v_deal uuid;
  v_won uuid;
begin
  select d.id into v_deal
  from public.crm_deals d
  where d.request_key='pipeline-v2-primary';

  select s.id into v_won
  from public.crm_pipeline_stages s
  join public.crm_deals d
    on d.organization_id=s.organization_id
   and d.pipeline_id=s.pipeline_id
  where d.id=v_deal and s.category='WON';

  begin
    update public.crm_deals
    set stage_id=v_won
    where id=v_deal;
    raise exception 'WON transition without close evidence unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'terminal CRM Deal requires bounded close evidence%' then raise; end if;
  end;

  update public.crm_deals
  set stage_id=v_won,
      close_evidence='{"sourceType":"CONTRACT","sourceRef":"contract-fixture-private-ref"}'::jsonb
  where id=v_deal;

  if not exists (
    select 1 from public.crm_deal_forecast_rows
    where deal_id=v_deal
      and state='WON'
      and effective_probability_bps=10000
      and probability_override_bps is null
      and weighted_amount=1000
      and forecast_category='CLOSED_WON'
  ) then
    raise exception 'SALES-PIPELINE-V2 WON forecast finalization failed';
  end if;

  if not exists (
    select 1 from public.crm_deals
    where id=v_deal
      and closed_by_user_id='00000000-0000-0000-0000-00000000c001'
      and close_evidence->>'sourceType'='CONTRACT'
  ) then
    raise exception 'SALES-PIPELINE-V2 WON actor/evidence attribution failed';
  end if;

  begin
    update public.crm_deals
    set team_id=null
    where id=v_deal;
    raise exception 'Terminal Deal Team context unexpectedly mutated';
  exception when others then
    if sqlerrm not like 'terminal CRM Deal V2 forecast/close evidence is immutable%' then raise; end if;
  end;
end;
$pipeline_v2_won_evidence$;

do $pipeline_v2_lost_evidence$
declare
  v_pipeline uuid;
  v_open uuid;
  v_lost uuid;
  v_deal uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Pipeline V2';
  select id into v_open from public.crm_pipeline_stages
  where pipeline_id=v_pipeline and position=1;
  select id into v_lost from public.crm_pipeline_stages
  where pipeline_id=v_pipeline and category='LOST';

  insert into public.crm_deals(
    organization_id,business_id,pipeline_id,stage_id,title,amount,currency,
    owner_user_id,team_id,source_type,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c02',
    v_pipeline,v_open,'Pipeline V2 lost Deal',400,'OMR',
    '00000000-0000-0000-0000-00000000c001',
    '51000000-0000-0000-0000-000000000c01',
    'MANUAL','pipeline-v2-lost',
    'USER','00000000-0000-0000-0000-00000000c001'
  ) returning id into v_deal;

  begin
    update public.crm_deals
    set stage_id=v_lost,lost_reason='NO_BUDGET'
    where id=v_deal;
    raise exception 'LOST transition without bounded close evidence unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'terminal CRM Deal requires bounded close evidence%' then raise; end if;
  end;

  update public.crm_deals
  set stage_id=v_lost,
      lost_reason='NO_BUDGET',
      close_evidence='{"sourceType":"CUSTOMER_CONFIRMATION","sourceRef":"loss-fixture-private-ref"}'::jsonb
  where id=v_deal;

  if not exists (
    select 1 from public.crm_deal_forecast_rows
    where deal_id=v_deal
      and state='LOST'
      and effective_probability_bps=0
      and weighted_amount=0
      and forecast_category='CLOSED_LOST'
  ) then
    raise exception 'SALES-PIPELINE-V2 LOST forecast finalization failed';
  end if;
end;
$pipeline_v2_lost_evidence$;

do $pipeline_v2_audit_privacy$
begin
  if not exists (
    select 1 from public.audit_logs
    where action='CRM_PIPELINE_STAGE_POLICY_CHANGED'
      and entity_type='crm_pipeline_stages'
      and after_data ? 'probabilityBps'
  ) then
    raise exception 'SALES-PIPELINE-V2 stage policy audit evidence missing';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where action='CRM_DEAL_CLOSE_EVIDENCE_RECORDED'
      and entity_type='crm_deals'
      and after_data->>'closeEvidencePresent'='true'
      and after_data->>'closeEvidenceSourceType' in ('CONTRACT','CUSTOMER_CONFIRMATION')
  ) then
    raise exception 'SALES-PIPELINE-V2 bounded close evidence audit missing';
  end if;

  if exists (
    select 1 from public.audit_logs
    where action in ('CRM_DEAL_CLOSE_EVIDENCE_RECORDED','CRM_DEAL_FORECAST_CONTEXT_CHANGED')
      and (
        coalesce(before_data::text,'') ilike '%contract-fixture-private-ref%'
        or coalesce(after_data::text,'') ilike '%contract-fixture-private-ref%'
        or coalesce(before_data::text,'') ilike '%loss-fixture-private-ref%'
        or coalesce(after_data::text,'') ilike '%loss-fixture-private-ref%'
      )
  ) then
    raise exception 'SALES-PIPELINE-V2 audit leaked close evidence sourceRef';
  end if;
end;
$pipeline_v2_audit_privacy$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $pipeline_v2_cross_tenant_forecast$
begin
  if exists (
    select 1 from public.get_crm_pipeline_forecast(
      '00000000-0000-0000-0000-000000000c01',
      null,null,null,null,true
    )
  ) then
    raise exception 'SALES-PIPELINE-V2 forecast leaked another Organization';
  end if;
end;
$pipeline_v2_cross_tenant_forecast$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $pipeline_v2_no_side_effect$
begin
  if (select count(*) from public.outreach_messages)
       <>(select outreach_count from sales_pipeline_v2_side_effect_baseline)
     or (select count(*) from public.conversation_messages)
       <>(select message_count from sales_pipeline_v2_side_effect_baseline)
  then
    raise exception 'SALES-PIPELINE-V2 caused outbound/conversation side effects';
  end if;
end;
$pipeline_v2_no_side_effect$;
