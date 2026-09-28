\set ON_ERROR_STOP on

do $deal_initial$
begin
  if (select count(*) from public.crm_pipelines) <> 0
     or (select count(*) from public.crm_pipeline_stages) <> 0
     or (select count(*) from public.crm_deals) <> 0
  then
    raise exception 'CRM Deal migration fabricated commercial rows';
  end if;

  if not (
    select relrowsecurity from pg_class where oid='public.crm_pipelines'::regclass
  ) or not (
    select relrowsecurity from pg_class where oid='public.crm_pipeline_stages'::regclass
  ) or not (
    select relrowsecurity from pg_class where oid='public.crm_deals'::regclass
  ) then
    raise exception 'CRM Deal/Pipeline RLS is not fully enabled';
  end if;

  if has_table_privilege('anon','public.crm_deals','SELECT')
     or has_table_privilege('service_role','public.crm_deals','SELECT')
     or has_table_privilege('authenticated','public.crm_deals','DELETE')
  then
    raise exception 'CRM Deal grants are too broad';
  end if;

  if (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_crm_deals'
    limit 1
  ) then
    raise exception 'CRM Deal query unexpectedly SECURITY DEFINER';
  end if;

  if (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_crm_deal_from_lead'
    limit 1
  ) then
    raise exception 'Lead-to-Deal conversion unexpectedly SECURITY DEFINER';
  end if;
end;
$deal_initial$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

insert into public.crm_pipelines(
  organization_id,name,status,is_default,created_by_user_id
) values (
  '00000000-0000-0000-0000-000000000c01',
  'Incomplete Pipeline',
  'ACTIVE',
  true,
  '00000000-0000-0000-0000-00000000c001'
);

do $draft_activation_guard$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Incomplete Pipeline';

  if not exists (
    select 1 from public.crm_pipelines
    where id=v_pipeline and status='DRAFT' and not is_default
  ) then
    raise exception 'Direct Pipeline insert did not fail closed to DRAFT';
  end if;

  begin
    update public.crm_pipelines
    set status='ACTIVE'
    where id=v_pipeline;
    raise exception 'Incomplete Pipeline unexpectedly activated';
  exception when others then
    if sqlerrm not like 'CRM pipeline activation requires active OPEN stage(s), exactly one WON stage and exactly one LOST stage%' then
      raise;
    end if;
  end;
end;
$draft_activation_guard$;

select public.create_crm_pipeline_with_stages(
  '00000000-0000-0000-0000-000000000c01',
  'Sales',
  true,
  '[
    {"name":"New","position":1,"category":"OPEN"},
    {"name":"Qualified","position":2,"category":"OPEN"},
    {"name":"Won","position":3,"category":"WON"},
    {"name":"Lost","position":4,"category":"LOST"}
  ]'::jsonb
);

do $pipeline_contract$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Sales';

  if v_pipeline is null then
    raise exception 'CRM pipeline create command failed';
  end if;

  if (
    select count(*) from public.crm_pipeline_stages
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and pipeline_id=v_pipeline
  ) <> 4 then
    raise exception 'CRM pipeline stage creation failed';
  end if;

  if (
    select count(*) from public.crm_pipeline_stages
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and pipeline_id=v_pipeline and category='WON'
  ) <> 1 or (
    select count(*) from public.crm_pipeline_stages
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and pipeline_id=v_pipeline and category='LOST'
  ) <> 1 then
    raise exception 'CRM pipeline terminal stage contract failed';
  end if;
end;
$pipeline_contract$;

do $manual_deal$
declare
  v_pipeline uuid;
  v_stage uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Sales';

  select id into v_stage from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=1;

  insert into public.crm_deals(
    organization_id,business_id,lead_id,pipeline_id,stage_id,
    title,amount,currency,expected_close_at,owner_user_id,
    source_type,source_id,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    v_pipeline,v_stage,
    'Manual Deal',1250,'OMR','2026-10-15T00:00:00Z',
    '00000000-0000-0000-0000-00000000c001',
    'MANUAL',null,'fixture-deal-manual',
    'USER','00000000-0000-0000-0000-00000000c001'
  );
end;
$manual_deal$;

do $lead_conversion$
declare
  v_pipeline uuid;
  v_stage uuid;
  v_first uuid;
  v_second uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Sales';

  select id into v_stage from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=2;

  v_first := public.create_crm_deal_from_lead(
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c02',
    v_pipeline,v_stage,
    'Converted Lead Deal',
    500,'OMR','2026-10-20T00:00:00Z',
    '00000000-0000-0000-0000-00000000c001',
    'fixture-lead-conversion',
    '{"source":"fixture"}'::jsonb
  );

  v_second := public.create_crm_deal_from_lead(
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c02',
    v_pipeline,v_stage,
    'Converted Lead Deal',
    500,'OMR','2026-10-20T00:00:00Z',
    '00000000-0000-0000-0000-00000000c001',
    'fixture-lead-conversion',
    '{"source":"fixture"}'::jsonb
  );

  if v_first is null or v_first is distinct from v_second then
    raise exception 'Lead-to-Deal conversion is not idempotent';
  end if;

  if not exists (
    select 1 from public.crm_deals
    where id=v_first
      and source_type='LEAD'
      and source_id='20000000-0000-0000-0000-000000000c02'
      and business_id='10000000-0000-0000-0000-000000000c02'
  ) then
    raise exception 'Lead-to-Deal provenance/lineage failed';
  end if;
end;
$lead_conversion$;

do $archive_guard$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Sales';

  begin
    update public.crm_pipelines set status='ARCHIVED'
    where id=v_pipeline;
    raise exception 'Pipeline with OPEN Deals unexpectedly archived';
  exception when others then
    if sqlerrm not like 'CRM pipeline with OPEN deals cannot be archived%' then raise; end if;
  end;
end;
$archive_guard$;

do $won_transition$
declare
  v_deal uuid;
  v_won uuid;
begin
  select id into v_deal from public.crm_deals
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='fixture-deal-manual';

  select s.id into v_won
  from public.crm_pipeline_stages s
  join public.crm_deals d
    on d.organization_id=s.organization_id and d.pipeline_id=s.pipeline_id
  where d.id=v_deal and s.category='WON';

  update public.crm_deals set stage_id=v_won where id=v_deal;

  if not exists (
    select 1 from public.crm_deals
    where id=v_deal and state='WON' and won_at is not null and version=2
  ) then
    raise exception 'CRM Deal WON transition failed';
  end if;

  begin
    update public.crm_deals set amount=9999 where id=v_deal;
    raise exception 'WON Deal commercial truth unexpectedly mutated';
  exception when others then
    if sqlerrm not like 'terminal CRM deal commercial truth is immutable%' then raise; end if;
  end;
end;
$won_transition$;

do $lost_requires_reason$
declare
  v_pipeline uuid;
  v_open uuid;
  v_lost uuid;
  v_deal uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Sales';
  select id into v_open from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=1;
  select id into v_lost from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and category='LOST';

  insert into public.crm_deals(
    organization_id,business_id,pipeline_id,stage_id,title,
    owner_user_id,source_type,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    v_pipeline,v_open,'Lost fixture',
    '00000000-0000-0000-0000-00000000c001',
    'MANUAL','fixture-deal-lost',
    'USER','00000000-0000-0000-0000-00000000c001'
  ) returning id into v_deal;

  begin
    update public.crm_deals set stage_id=v_lost where id=v_deal;
    raise exception 'LOST transition without reason unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CRM LOST deal requires lost_reason%' then raise; end if;
  end;

  update public.crm_deals
  set lost_reason='Budget unavailable', stage_id=v_lost
  where id=v_deal;

  if not exists (
    select 1 from public.crm_deals
    where id=v_deal and state='LOST' and lost_at is not null
      and lost_reason='Budget unavailable'
  ) then
    raise exception 'CRM Deal LOST transition evidence failed';
  end if;
end;
$lost_requires_reason$;

do $stage_history$
declare
  v_deal uuid;
begin
  select id into v_deal from public.crm_deals
  where request_key='fixture-deal-manual';

  if (
    select count(*) from public.crm_deal_stage_history
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and deal_id=v_deal
  ) <> 2 then
    raise exception 'CRM Deal stage history should contain create + stage change';
  end if;
end;
$stage_history$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

do $sales_agent_scope$
declare
  v_pipeline uuid;
  v_open uuid;
begin
  select id into v_pipeline from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01' and name='Sales';
  select id into v_open from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=1;

  begin
    insert into public.crm_pipelines(
      organization_id,name,is_default,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01','Agent Pipeline',false,
      '00000000-0000-0000-0000-00000000c003'
    );
    raise exception 'Sales Agent unexpectedly created Pipeline';
  exception when insufficient_privilege then null;
  end;

  insert into public.crm_deals(
    organization_id,business_id,pipeline_id,stage_id,title,owner_user_id,
    source_type,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    v_pipeline,v_open,'Agent self Deal',
    '00000000-0000-0000-0000-00000000c003',
    'MANUAL','fixture-agent-deal',
    'USER','00000000-0000-0000-0000-00000000c003'
  );

  begin
    update public.crm_deals
    set owner_user_id='00000000-0000-0000-0000-00000000c001'
    where request_key='fixture-agent-deal';
    raise exception 'Sales Agent unexpectedly reassigned Deal to another owner';
  exception when insufficient_privilege then null;
  end;
end;
$sales_agent_scope$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c004',false);

do $viewer_scope$
begin
  if not exists (
    select 1 from public.crm_deals
    where organization_id='00000000-0000-0000-0000-000000000c01'
  ) then
    raise exception 'Viewer cannot read CRM Deals';
  end if;

  update public.crm_deals set title='Viewer mutation'
  where request_key='fixture-agent-deal';

  if found then
    raise exception 'Viewer unexpectedly updated CRM Deal';
  end if;
end;
$viewer_scope$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $cross_tenant_query$
begin
  if exists (
    select 1 from public.get_crm_deals(
      '00000000-0000-0000-0000-000000000d01',
      null,null,null,null,50,null,null
    )
  ) then
    raise exception 'CRM Deal query leaked another tenant';
  end if;
end;
$cross_tenant_query$;

reset role;
select set_config('request.jwt.claim.sub','',false);
