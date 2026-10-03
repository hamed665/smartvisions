\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000019001','Founder Investor CI')
on conflict (id) do nothing;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000019011'),
  ('00000000-0000-4000-8000-000000019012')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000019001','00000000-0000-4000-8000-000000019011','OWNER'),
  ('00000000-0000-4000-8000-000000019001','00000000-0000-4000-8000-000000019012','VIEWER')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.businesses(id,organization_id,name,country_code) values
  ('00000000-0000-4000-8000-000000019021','00000000-0000-4000-8000-000000019001','CI Investor Fund','OM')
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000019011',false);

insert into public.founder_fundraising_rounds(
  id,organization_id,name,status,instrument,currency,target_raise,
  pre_money_valuation_assumption,target_runway_months_assumption,
  use_of_funds,assumption_source_ref,assumption_evidence,
  created_by_user_id,updated_by_user_id
) values (
  '00000000-0000-4000-8000-000000019031',
  '00000000-0000-4000-8000-000000019001',
  'Seed 2027','ACTIVE','EQUITY','USD',1000000,4000000,18,
  '{"product":40,"go_to_market":35,"operations":25}'::jsonb,
  'owner-plan:ci','{"confirmation":"OWNER_ASSUMPTION"}'::jsonb,
  '00000000-0000-4000-8000-000000019011',
  '00000000-0000-4000-8000-000000019011'
);

insert into public.founder_investor_research_candidates(
  id,organization_id,fund_name,geography,stage_fit,ticket_min,ticket_max,currency,
  sector_fit,ai_saas_fit,mena_gcc_fit,source_url,source_title,last_verified_at,
  created_by_user_id,updated_by_user_id
) values (
  '00000000-0000-4000-8000-000000019041',
  '00000000-0000-4000-8000-000000019001',
  'External Research Candidate','GCC','Seed',250000,1000000,'USD',
  'B2B SaaS',true,true,'https://example.com/investor-source','CI source',now(),
  '00000000-0000-4000-8000-000000019011',
  '00000000-0000-4000-8000-000000019011'
);

select public.ensure_founder_fundraising_pipeline(
  '00000000-0000-4000-8000-000000019001',
  'Investor Fundraising'
);

insert into public.crm_deals(
  organization_id,business_id,pipeline_id,stage_id,title,state,
  amount,currency,expected_close_at,owner_user_id,source_type,request_key,
  creator_type,created_by_user_id,metadata,deal_purpose,fundraising_round_id
)
select
  '00000000-0000-4000-8000-000000019001',
  '00000000-0000-4000-8000-000000019021',
  p.id,s.id,'CI Investor Conversation','OPEN',
  500000,'USD',now()+interval '90 days',
  '00000000-0000-4000-8000-000000019011',
  'MANUAL','ci-founder-investor-deal',
  'USER','00000000-0000-4000-8000-000000019011',
  '{"evidenceClass":"OWNER_ENTERED"}'::jsonb,
  'FUNDRAISING','00000000-0000-4000-8000-000000019031'
from public.crm_pipelines p
join public.crm_pipeline_stages s
  on s.organization_id=p.organization_id
 and s.pipeline_id=p.id
 and s.name='IDENTIFIED'
where p.organization_id='00000000-0000-4000-8000-000000019001'
  and p.pipeline_purpose='FUNDRAISING';

do $owner_checks$
declare
  v_pipeline uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-4000-8000-000000019001'
    and pipeline_purpose='FUNDRAISING';

  if v_pipeline is null then raise exception 'Fundraising pipeline missing'; end if;

  if (select count(*) from public.crm_pipeline_stages where pipeline_id=v_pipeline) <> 11
  then raise exception 'Fundraising stage catalog mismatch'; end if;

  if not exists (
    select 1 from public.crm_pipeline_stages
    where pipeline_id=v_pipeline and name='CLOSED' and category='WON' and probability_bps=10000
  ) then raise exception 'CLOSED stage contract mismatch'; end if;

  if not exists (
    select 1 from public.crm_pipeline_stages
    where pipeline_id=v_pipeline and name='PASSED' and category='LOST' and probability_bps=0
  ) then raise exception 'PASSED stage contract mismatch'; end if;

  if not exists (
    select 1 from public.crm_deals
    where organization_id='00000000-0000-4000-8000-000000019001'
      and deal_purpose='FUNDRAISING'
      and fundraising_round_id='00000000-0000-4000-8000-000000019031'
  ) then raise exception 'Fundraising deal missing'; end if;

  if exists (
    select 1 from public.crm_deal_forecast_rows
    where organization_id='00000000-0000-4000-8000-000000019001'
  ) then raise exception 'Fundraising deal leaked into SALES forecast'; end if;

  if (select record_state from public.founder_investor_research_candidates
      where id='00000000-0000-4000-8000-000000019041') <> 'DISCOVERED_EXTERNAL'
  then raise exception 'External research state mismatch'; end if;
end;
$owner_checks$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000019012',false);

do $viewer_denied$
begin
  if exists (
    select 1 from public.founder_fundraising_rounds
    where organization_id='00000000-0000-4000-8000-000000019001'
  ) then raise exception 'VIEWER unexpectedly read fundraising rounds'; end if;

  if exists (
    select 1 from public.founder_investor_research_candidates
    where organization_id='00000000-0000-4000-8000-000000019001'
  ) then raise exception 'VIEWER unexpectedly read investor research'; end if;
end;
$viewer_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $acl$
begin
  if has_table_privilege('anon','public.founder_fundraising_rounds','SELECT')
     or has_table_privilege('anon','public.founder_investor_research_candidates','SELECT')
  then raise exception 'anon has Founder investor access'; end if;

  if not has_table_privilege('service_role','public.founder_fundraising_rounds','SELECT')
     or has_table_privilege('service_role','public.founder_fundraising_rounds','INSERT')
  then raise exception 'service_role fundraising ACL mismatch'; end if;

  if not has_table_privilege('service_role','public.founder_investor_research_candidates','SELECT')
     or has_table_privilege('service_role','public.founder_investor_research_candidates','UPDATE')
  then raise exception 'service_role investor research ACL mismatch'; end if;
end;
$acl$;

rollback;
