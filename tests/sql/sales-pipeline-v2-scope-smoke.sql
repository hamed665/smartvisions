\set ON_ERROR_STOP on

create temp table sales_pipeline_scope_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000c003'),
  ('00000000-0000-0000-0000-00000000c004'),
  ('00000000-0000-0000-0000-00000000c005'),
  ('00000000-0000-0000-0000-00000000c006')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c003','VIEWER'),
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c004','VIEWER'),
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c005','VIEWER'),
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c006','VIEWER')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.teams(
  id,organization_id,department_id,name,code,status
) values (
  '51000000-0000-0000-0000-000000000c02',
  '00000000-0000-0000-0000-000000000c01',
  '41000000-0000-0000-0000-000000000c01',
  'Pipeline V2 Team C2',
  'PIPE-TEAM-C2',
  'ACTIVE'
)
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

select public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c003',
  'TEAM','SALES_AGENT',
  null,null,null,null,
  '51000000-0000-0000-0000-000000000c01',
  '{}'::jsonb,
  'pipeline-scope-c003'
);
select public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c004',
  'TEAM','SALES_AGENT',
  null,null,null,null,
  '51000000-0000-0000-0000-000000000c02',
  '{}'::jsonb,
  'pipeline-scope-c004'
);
select public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c005',
  'TEAM','VIEWER',
  null,null,null,null,
  '51000000-0000-0000-0000-000000000c01',
  '{}'::jsonb,
  'pipeline-scope-c005'
);
select public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c006',
  'TEAM','SALES_AGENT',
  null,null,null,null,
  '51000000-0000-0000-0000-000000000c01',
  '{"channel":"WHATSAPP"}'::jsonb,
  'pipeline-scope-c006'
);

do $owner_creates_scoped_fixtures$
declare
  v_pipeline uuid;
  v_proposal uuid;
  v_prospect uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Pipeline V2';

  select id into v_proposal
  from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=3;

  select id into v_prospect
  from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline and position=1;

  insert into public.crm_deals(
    organization_id,business_id,pipeline_id,stage_id,title,
    amount,currency,expected_close_at,owner_user_id,team_id,
    probability_override_bps,source_type,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    v_pipeline,v_proposal,'Scoped Agent C3 Deal',
    500,'OMR','2026-11-15T00:00:00Z',
    '00000000-0000-0000-0000-00000000c003',
    '51000000-0000-0000-0000-000000000c01',
    8200,'MANUAL','pipeline-scope-agent-c3','USER',
    '00000000-0000-0000-0000-00000000c001'
  );

  insert into public.crm_deals(
    organization_id,business_id,pipeline_id,stage_id,title,
    amount,currency,owner_user_id,team_id,
    source_type,request_key,creator_type,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c02',
    v_pipeline,v_prospect,'Scoped Agent C4 Deal',
    300,'OMR',
    '00000000-0000-0000-0000-00000000c004',
    '51000000-0000-0000-0000-000000000c02',
    'MANUAL','pipeline-scope-agent-c4','USER',
    '00000000-0000-0000-0000-00000000c001'
  );

  begin
    insert into public.crm_deals(
      organization_id,business_id,pipeline_id,stage_id,title,
      owner_user_id,team_id,source_type,request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      v_pipeline,v_prospect,'Invalid owner Team fixture',
      '00000000-0000-0000-0000-00000000c003',
      '51000000-0000-0000-0000-000000000c02',
      'MANUAL','pipeline-scope-invalid-owner-team','USER',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'mismatched scoped Deal owner/Team unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CRM Deal owner/Team scope is invalid%' then raise; end if;
  end;

  begin
    insert into public.crm_deals(
      organization_id,business_id,pipeline_id,stage_id,title,
      owner_user_id,team_id,source_type,request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      v_pipeline,v_prospect,'Constrained scope must not generalize',
      '00000000-0000-0000-0000-00000000c006',
      '51000000-0000-0000-0000-000000000c01',
      'MANUAL','pipeline-scope-constrained-owner','USER',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'attribute-constrained IAM was generalized into CRM Deal scope';
  exception when others then
    if sqlerrm not like 'CRM Deal owner/Team scope is invalid%' then raise; end if;
  end;
end;
$owner_creates_scoped_fixtures$;

do $live_stage_policy_lock$
declare
  v_stage uuid;
begin
  select stage_id into v_stage
  from public.crm_deals
  where request_key='pipeline-scope-agent-c4';

  begin
    update public.crm_pipeline_stages
    set probability_bps=2500
    where id=v_stage;
    raise exception 'live stage forecast policy changed while OPEN Deal referenced it';
  exception when others then
    if sqlerrm not like 'CRM Pipeline live stage policy is locked while OPEN Deals reference the stage%' then raise; end if;
  end;
end;
$live_stage_policy_lock$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

do $scoped_agent_read_and_mutate$
declare
  v_own uuid;
  v_other uuid;
  v_prospect uuid;
begin
  if not exists (
    select 1 from public.crm_pipelines
    where organization_id='00000000-0000-0000-0000-000000000c01'
  ) or not exists (
    select 1 from public.crm_pipeline_stages
    where organization_id='00000000-0000-0000-0000-000000000c01'
  ) then
    raise exception 'scoped Sales Agent cannot read Pipeline definitions';
  end if;

  select id into v_own from public.crm_deals
  where request_key='pipeline-scope-agent-c3';
  select id into v_other from public.crm_deals
  where request_key='pipeline-scope-agent-c4';

  if v_own is null then
    raise exception 'scoped Sales Agent cannot read own Team Deal';
  end if;
  if v_other is not null then
    raise exception 'scoped Sales Agent can read another Team Deal';
  end if;

  update public.crm_deals
  set title='Scoped Agent C3 Deal updated'
  where id=v_own;

  if not exists (
    select 1 from public.crm_deals
    where id=v_own and title='Scoped Agent C3 Deal updated'
  ) then
    raise exception 'scoped Sales Agent could not mutate own Deal';
  end if;

  select s.id into v_prospect
  from public.crm_pipeline_stages s
  join public.crm_deals d
    on d.organization_id=s.organization_id
   and d.pipeline_id=s.pipeline_id
  where d.id=v_own and s.position=1;

  update public.crm_deals
  set stage_id=v_prospect
  where id=v_own;

  if not exists (
    select 1 from public.crm_deals
    where id=v_own
      and stage_id=v_prospect
      and probability_override_bps is null
  ) then
    raise exception 'stage move did not reset stale Deal probability override';
  end if;
end;
$scoped_agent_read_and_mutate$;

do $scoped_agent_cannot_take_owner_deal$
declare
  v_owner_deal uuid;
  v_rows integer;
begin
  select id into v_owner_deal
  from public.crm_deals
  where request_key='pipeline-v2-lost';

  update public.crm_deals
  set title='must-not-change'
  where id=v_owner_deal;
  get diagnostics v_rows=row_count;

  if v_rows<>0 then
    raise exception 'scoped Sales Agent mutated another owner Deal';
  end if;
end;
$scoped_agent_cannot_take_owner_deal$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c004',false);
do $other_team_isolated$
begin
  if exists (
    select 1 from public.crm_deals
    where request_key='pipeline-scope-agent-c3'
  ) or not exists (
    select 1 from public.crm_deals
    where request_key='pipeline-scope-agent-c4'
  ) then
    raise exception 'scoped Team isolation failed for second Sales Agent';
  end if;
end;
$other_team_isolated$;
reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c005',false);
do $scoped_viewer_read_only$
declare
  v_deal uuid;
  v_rows integer;
begin
  select id into v_deal
  from public.crm_deals
  where request_key='pipeline-scope-agent-c3';
  if v_deal is null then
    raise exception 'scoped VIEWER cannot read its Team Deal';
  end if;

  update public.crm_deals set title='viewer-must-not-change' where id=v_deal;
  get diagnostics v_rows=row_count;
  if v_rows<>0 then
    raise exception 'scoped VIEWER mutated Deal';
  end if;
end;
$scoped_viewer_read_only$;
reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c006',false);
do $constrained_scope_not_generalized$
begin
  if exists (
    select 1 from public.crm_deals
    where organization_id='00000000-0000-0000-0000-000000000c01'
  ) then
    raise exception 'attribute-constrained scope leaked generic CRM Deals';
  end if;
end;
$constrained_scope_not_generalized$;
reset role;
select set_config('request.jwt.claim.sub','',false);

do $scope_security_contract$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='crm_deals'
      and policyname='unified_inbox_business_wide_boundary'
      and is_permissive='RESTRICTIVE'
      and qual ilike '%crm_deal_scope_can_read%'
      and with_check ilike '%crm_deal_scope_can_manage%'
  ) then
    raise exception 'CRM Deal restrictive scoped boundary is missing';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'guard_crm_deal_owner_team_scope',
        'guard_crm_pipeline_stage_live_policy',
        'guard_crm_deal_stage_move_forecast'
      )
      and p.prosecdef
  ) then
    raise exception 'Pipeline V2 mutation guards unexpectedly use SECURITY DEFINER';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='crm_scope_assignment_covers_team'
      and p.prosecdef
  ) then
    raise exception 'narrow scoped IAM boolean helper is not SECURITY DEFINER';
  end if;
end;
$scope_security_contract$;

do $scope_no_side_effect$
begin
  if (select count(*) from public.outreach_messages)
       <>(select outreach_count from sales_pipeline_scope_side_effect_baseline)
     or (select count(*) from public.conversation_messages)
       <>(select message_count from sales_pipeline_scope_side_effect_baseline)
  then
    raise exception 'SALES-PIPELINE-V2 scope hardening caused outbound side effects';
  end if;
end;
$scope_no_side_effect$;
