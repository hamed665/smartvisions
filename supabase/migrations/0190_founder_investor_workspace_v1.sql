-- Smart Visions AI Business OS 2027
-- FOUNDER-INVESTOR-WORKSPACE-V1 foundation.
-- Reuses businesses/crm_people/crm_person_business_relationships and the canonical CRM pipeline.
-- Adds only fundraising-specific authority and explicit SALES/FUNDRAISING purpose isolation.
-- External investor discovery remains evidence, not a confirmed CRM identity, until OWNER confirmation.

alter table public.crm_pipelines
  add column if not exists pipeline_purpose text not null default 'SALES';

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_pipelines'::regclass
      and conname='crm_pipelines_pipeline_purpose_check'
  ) then
    alter table public.crm_pipelines
      add constraint crm_pipelines_pipeline_purpose_check
      check (pipeline_purpose in ('SALES','FUNDRAISING'));
  end if;
end;
$constraints$;

alter table public.crm_deals
  add column if not exists deal_purpose text not null default 'SALES',
  add column if not exists fundraising_round_id uuid;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_deals'::regclass
      and conname='crm_deals_deal_purpose_check'
  ) then
    alter table public.crm_deals
      add constraint crm_deals_deal_purpose_check
      check (deal_purpose in ('SALES','FUNDRAISING'));
  end if;
end;
$constraints$;

create table if not exists public.founder_fundraising_rounds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','ACTIVE','PAUSED','CLOSED','CANCELED')),
  instrument text not null default 'EQUITY'
    check (instrument in ('EQUITY','SAFE','CONVERTIBLE_NOTE','OTHER')),
  currency text not null
    check (currency=upper(trim(currency)) and currency ~ '^[A-Z]{3}$'),
  target_raise numeric not null check (target_raise > 0),
  pre_money_valuation_assumption numeric
    check (pre_money_valuation_assumption is null or pre_money_valuation_assumption >= 0),
  valuation_cap_assumption numeric
    check (valuation_cap_assumption is null or valuation_cap_assumption >= 0),
  discount_bps_assumption integer
    check (discount_bps_assumption is null or discount_bps_assumption between 0 and 10000),
  target_runway_months_assumption numeric
    check (target_runway_months_assumption is null or (target_runway_months_assumption > 0 and target_runway_months_assumption <= 120)),
  use_of_funds jsonb not null default '{}'::jsonb
    check (jsonb_typeof(use_of_funds)='object' and octet_length(use_of_funds::text) <= 32768),
  assumption_source_ref text not null
    check (length(trim(assumption_source_ref)) between 1 and 512),
  assumption_evidence jsonb not null
    check (
      jsonb_typeof(assumption_evidence)='object'
      and assumption_evidence <> '{}'::jsonb
      and octet_length(assumption_evidence::text) <= 32768
    ),
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create table if not exists public.founder_investor_research_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_state text not null default 'DISCOVERED_EXTERNAL'
    check (record_state in ('DISCOVERED_EXTERNAL','CRM_CONFIRMED')),
  fund_name text not null check (length(trim(fund_name)) between 1 and 240),
  person_name text check (person_name is null or length(trim(person_name)) between 1 and 200),
  geography text check (geography is null or length(trim(geography)) <= 160),
  stage_fit text check (stage_fit is null or length(trim(stage_fit)) <= 160),
  ticket_min numeric check (ticket_min is null or ticket_min >= 0),
  ticket_max numeric check (ticket_max is null or ticket_max >= 0),
  currency text check (currency is null or (currency=upper(trim(currency)) and currency ~ '^[A-Z]{3}$')),
  sector_fit text check (sector_fit is null or length(trim(sector_fit)) <= 500),
  ai_saas_fit boolean,
  mena_gcc_fit boolean,
  source_url text not null
    check (source_url ~ '^https?://' and length(source_url) <= 2048),
  source_title text check (source_title is null or length(trim(source_title)) <= 500),
  last_verified_at timestamptz not null,
  business_id uuid,
  person_id uuid,
  confirmation_method text
    check (confirmation_method is null or confirmation_method in ('MANUAL_CONFIRMED','IMPORT_VERIFIED')),
  confirmed_by_user_id uuid,
  confirmed_at timestamptz,
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_investor_candidate_ticket_check
    check (ticket_min is null or ticket_max is null or ticket_max >= ticket_min),
  constraint founder_investor_candidate_business_fk
    foreign key (organization_id,business_id)
    references public.businesses(organization_id,id)
    on delete restrict,
  constraint founder_investor_candidate_person_fk
    foreign key (organization_id,person_id)
    references public.crm_people(organization_id,id)
    on delete restrict,
  constraint founder_investor_candidate_confirmed_by_fk
    foreign key (confirmed_by_user_id)
    references auth.users(id)
    on delete restrict,
  constraint founder_investor_candidate_state_check
    check (
      (
        record_state='DISCOVERED_EXTERNAL'
        and business_id is null
        and person_id is null
        and confirmation_method is null
        and confirmed_by_user_id is null
        and confirmed_at is null
      )
      or
      (
        record_state='CRM_CONFIRMED'
        and business_id is not null
        and confirmation_method is not null
        and confirmed_by_user_id is not null
        and confirmed_at is not null
      )
    )
);

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_deals'::regclass
      and conname='crm_deals_fundraising_round_fk'
  ) then
    alter table public.crm_deals
      add constraint crm_deals_fundraising_round_fk
      foreign key (organization_id,fundraising_round_id)
      references public.founder_fundraising_rounds(organization_id,id)
      on delete restrict;
  end if;
end;
$fk$;

create index if not exists founder_fundraising_rounds_org_status_idx
  on public.founder_fundraising_rounds(organization_id,status,updated_at desc);
create index if not exists founder_fundraising_rounds_created_by_fk_idx
  on public.founder_fundraising_rounds(created_by_user_id);
create index if not exists founder_fundraising_rounds_updated_by_fk_idx
  on public.founder_fundraising_rounds(updated_by_user_id);

create index if not exists founder_investor_candidates_org_state_idx
  on public.founder_investor_research_candidates(organization_id,record_state,last_verified_at desc);
create index if not exists founder_investor_candidates_business_fk_idx
  on public.founder_investor_research_candidates(organization_id,business_id)
  where business_id is not null;
create index if not exists founder_investor_candidates_person_fk_idx
  on public.founder_investor_research_candidates(organization_id,person_id)
  where person_id is not null;
create index if not exists founder_investor_candidates_created_by_fk_idx
  on public.founder_investor_research_candidates(created_by_user_id);
create index if not exists founder_investor_candidates_updated_by_fk_idx
  on public.founder_investor_research_candidates(updated_by_user_id);
create index if not exists founder_investor_candidates_confirmed_by_fk_idx
  on public.founder_investor_research_candidates(confirmed_by_user_id)
  where confirmed_by_user_id is not null;

create index if not exists crm_deals_purpose_round_state_idx
  on public.crm_deals(organization_id,deal_purpose,fundraising_round_id,state,updated_at desc);
create index if not exists crm_deals_fundraising_round_fk_idx
  on public.crm_deals(organization_id,fundraising_round_id)
  where fundraising_round_id is not null;

create unique index if not exists crm_pipelines_one_live_fundraising_idx
  on public.crm_pipelines(organization_id)
  where pipeline_purpose='FUNDRAISING' and status in ('DRAFT','ACTIVE');

create or replace function public.guard_founder_fundraising_deal_purpose()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_fundraising_deal$
declare
  v_pipeline_purpose text;
begin
  select p.pipeline_purpose
    into v_pipeline_purpose
  from public.crm_pipelines p
  where p.organization_id=new.organization_id
    and p.id=new.pipeline_id;

  if v_pipeline_purpose is null then
    raise exception 'CRM pipeline not found for deal purpose validation';
  end if;

  if v_pipeline_purpose is distinct from new.deal_purpose then
    raise exception 'Deal purpose must match pipeline purpose';
  end if;

  if new.deal_purpose='SALES' and new.fundraising_round_id is not null then
    raise exception 'SALES deal cannot reference a fundraising round';
  end if;

  if new.deal_purpose='FUNDRAISING' and new.fundraising_round_id is null then
    raise exception 'FUNDRAISING deal requires a fundraising round';
  end if;

  return new;
end;
$guard_fundraising_deal$;

drop trigger if exists crm_deals_fundraising_purpose_guard on public.crm_deals;
create trigger crm_deals_fundraising_purpose_guard
before insert or update of organization_id,pipeline_id,deal_purpose,fundraising_round_id
on public.crm_deals
for each row execute function public.guard_founder_fundraising_deal_purpose();

create or replace function public.guard_founder_fundraising_round_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_fundraising_round$
begin
  if new.organization_id is distinct from old.organization_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Fundraising round identity fields are immutable';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by_user_id := auth.uid();
  return new;
end;
$guard_fundraising_round$;

drop trigger if exists founder_fundraising_rounds_guard on public.founder_fundraising_rounds;
create trigger founder_fundraising_rounds_guard
before update on public.founder_fundraising_rounds
for each row execute function public.guard_founder_fundraising_round_update();

create or replace function public.guard_founder_investor_candidate_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_investor_candidate$
begin
  if new.organization_id is distinct from old.organization_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at
     or new.source_url is distinct from old.source_url then
    raise exception 'Investor research candidate identity/source fields are immutable';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by_user_id := auth.uid();
  return new;
end;
$guard_investor_candidate$;

drop trigger if exists founder_investor_candidates_guard on public.founder_investor_research_candidates;
create trigger founder_investor_candidates_guard
before update on public.founder_investor_research_candidates
for each row execute function public.guard_founder_investor_candidate_update();

create or replace function public.audit_founder_investor_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $audit_founder_investor$
declare
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_table_name='founder_fundraising_rounds' then
    v_action := 'FOUNDER_FUNDRAISING_ROUND_' || tg_op;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'status',old.status,'instrument',old.instrument,'currency',old.currency,'version',old.version
    ) else null end;
    v_after := jsonb_build_object(
      'status',new.status,
      'instrument',new.instrument,
      'currency',new.currency,
      'target_raise',new.target_raise,
      'version',new.version,
      'assumption_fields_present',true
    );
  else
    v_action := 'FOUNDER_INVESTOR_CANDIDATE_' || tg_op;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'record_state',old.record_state,'version',old.version
    ) else null end;
    v_after := jsonb_build_object(
      'record_state',new.record_state,
      'source_url',new.source_url,
      'business_id',new.business_id,
      'person_id',new.person_id,
      'version',new.version
    );
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    new.organization_id,'USER',auth.uid()::text,v_action,tg_table_name,new.id::text,v_before,v_after
  );
  return new;
end;
$audit_founder_investor$;

drop trigger if exists founder_fundraising_rounds_audit on public.founder_fundraising_rounds;
create trigger founder_fundraising_rounds_audit
after insert or update on public.founder_fundraising_rounds
for each row execute function public.audit_founder_investor_mutation();

drop trigger if exists founder_investor_candidates_audit on public.founder_investor_research_candidates;
create trigger founder_investor_candidates_audit
after insert or update on public.founder_investor_research_candidates
for each row execute function public.audit_founder_investor_mutation();

create or replace function public.ensure_founder_fundraising_pipeline(
  p_organization_id uuid,
  p_name text default 'Investor Fundraising'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_catalog
as $ensure_fundraising_pipeline$
declare
  v_pipeline_id uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_org_owner(p_organization_id) then
    raise exception 'Founder fundraising pipeline requires OWNER permission';
  end if;

  select id into v_pipeline_id
  from public.crm_pipelines
  where organization_id=p_organization_id
    and pipeline_purpose='FUNDRAISING'
    and status in ('DRAFT','ACTIVE')
  order by created_at
  limit 1;

  if v_pipeline_id is not null then
    return v_pipeline_id;
  end if;

  insert into public.crm_pipelines(
    organization_id,name,status,is_default,created_by_user_id,pipeline_purpose
  ) values (
    p_organization_id,
    left(coalesce(nullif(trim(p_name),''),'Investor Fundraising'),160),
    'DRAFT',false,v_actor,'FUNDRAISING'
  )
  returning id into v_pipeline_id;

  insert into public.crm_pipeline_stages(
    organization_id,pipeline_id,name,position,category,is_active,created_by_user_id,
    probability_bps,forecast_category,require_amount,require_expected_close,allow_probability_override
  ) values
    (p_organization_id,v_pipeline_id,'IDENTIFIED',1,'OPEN',true,v_actor,500,'PIPELINE',false,false,false),
    (p_organization_id,v_pipeline_id,'QUALIFIED',2,'OPEN',true,v_actor,1000,'PIPELINE',false,false,false),
    (p_organization_id,v_pipeline_id,'INTRO_REQUESTED',3,'OPEN',true,v_actor,1500,'PIPELINE',false,false,false),
    (p_organization_id,v_pipeline_id,'CONTACTED',4,'OPEN',true,v_actor,2000,'PIPELINE',false,false,false),
    (p_organization_id,v_pipeline_id,'FIRST_MEETING',5,'OPEN',true,v_actor,3000,'BEST_CASE',false,false,false),
    (p_organization_id,v_pipeline_id,'PARTNER_MEETING',6,'OPEN',true,v_actor,4500,'BEST_CASE',false,false,false),
    (p_organization_id,v_pipeline_id,'DUE_DILIGENCE',7,'OPEN',true,v_actor,6000,'BEST_CASE',false,false,false),
    (p_organization_id,v_pipeline_id,'TERM_SHEET',8,'OPEN',true,v_actor,7500,'COMMIT',true,true,false),
    (p_organization_id,v_pipeline_id,'COMMITTED',9,'OPEN',true,v_actor,9000,'COMMIT',true,true,false),
    (p_organization_id,v_pipeline_id,'CLOSED',10,'WON',true,v_actor,10000,'CLOSED_WON',true,true,false),
    (p_organization_id,v_pipeline_id,'PASSED',11,'LOST',true,v_actor,0,'CLOSED_LOST',false,false,false);

  update public.crm_pipelines
  set status='ACTIVE'
  where organization_id=p_organization_id
    and id=v_pipeline_id;

  return v_pipeline_id;
end;
$ensure_fundraising_pipeline$;

create or replace view public.crm_deal_forecast_rows
with (security_invoker=true)
as
select
  d.organization_id,
  d.id as deal_id,
  d.pipeline_id,
  d.stage_id,
  d.business_id,
  d.lead_id,
  d.owner_user_id,
  d.team_id,
  d.state,
  d.currency,
  d.amount,
  d.expected_close_at,
  s.probability_bps as stage_probability_bps,
  d.probability_override_bps,
  case
    when d.state='WON' then 10000
    when d.state='LOST' then 0
    else coalesce(d.probability_override_bps,s.probability_bps)
  end as effective_probability_bps,
  s.forecast_category,
  case
    when d.amount is null then null
    else round(
      d.amount * (
        case
          when d.state='WON' then 10000
          when d.state='LOST' then 0
          else coalesce(d.probability_override_bps,s.probability_bps)
        end
      )::numeric / 10000::numeric,
      4
    )
  end as weighted_amount,
  d.updated_at
from public.crm_deals d
join public.crm_pipeline_stages s
  on s.organization_id=d.organization_id
 and s.pipeline_id=d.pipeline_id
 and s.id=d.stage_id
where d.deal_purpose='SALES';

alter table public.founder_fundraising_rounds enable row level security;
alter table public.founder_investor_research_candidates enable row level security;

drop policy if exists founder_fundraising_rounds_owner_read on public.founder_fundraising_rounds;
create policy founder_fundraising_rounds_owner_read
on public.founder_fundraising_rounds for select to authenticated
using (public.is_org_owner(organization_id));

drop policy if exists founder_fundraising_rounds_owner_insert on public.founder_fundraising_rounds;
create policy founder_fundraising_rounds_owner_insert
on public.founder_fundraising_rounds for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id=(select auth.uid())
  and updated_by_user_id=(select auth.uid())
);

drop policy if exists founder_fundraising_rounds_owner_update on public.founder_fundraising_rounds;
create policy founder_fundraising_rounds_owner_update
on public.founder_fundraising_rounds for update to authenticated
using (public.is_org_owner(organization_id))
with check (
  public.is_org_owner(organization_id)
  and updated_by_user_id=(select auth.uid())
);

drop policy if exists founder_investor_candidates_owner_read on public.founder_investor_research_candidates;
create policy founder_investor_candidates_owner_read
on public.founder_investor_research_candidates for select to authenticated
using (public.is_org_owner(organization_id));

drop policy if exists founder_investor_candidates_owner_insert on public.founder_investor_research_candidates;
create policy founder_investor_candidates_owner_insert
on public.founder_investor_research_candidates for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and record_state='DISCOVERED_EXTERNAL'
  and created_by_user_id=(select auth.uid())
  and updated_by_user_id=(select auth.uid())
);

drop policy if exists founder_investor_candidates_owner_update on public.founder_investor_research_candidates;
create policy founder_investor_candidates_owner_update
on public.founder_investor_research_candidates for update to authenticated
using (public.is_org_owner(organization_id))
with check (
  public.is_org_owner(organization_id)
  and updated_by_user_id=(select auth.uid())
);

revoke all on public.founder_fundraising_rounds from public,anon,authenticated,service_role;
revoke all on public.founder_investor_research_candidates from public,anon,authenticated,service_role;

grant select,insert,update on public.founder_fundraising_rounds to authenticated;
grant select,insert,update on public.founder_investor_research_candidates to authenticated;
grant select on public.founder_fundraising_rounds to service_role;
grant select on public.founder_investor_research_candidates to service_role;

revoke all on function public.ensure_founder_fundraising_pipeline(uuid,text)
  from public,anon,service_role;
grant execute on function public.ensure_founder_fundraising_pipeline(uuid,text)
  to authenticated;

revoke all on function public.guard_founder_fundraising_deal_purpose()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_founder_fundraising_round_update()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_founder_investor_candidate_update()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_founder_investor_mutation()
  from public,anon,authenticated,service_role;

comment on column public.crm_pipelines.pipeline_purpose is
  'Canonical CRM pipeline purpose. SALES remains commercial forecast authority; FUNDRAISING is Founder investor workflow.';
comment on column public.crm_deals.deal_purpose is
  'Canonical CRM deal purpose. Founder Finance and sales forecast must use SALES only.';
comment on column public.crm_deals.fundraising_round_id is
  'Present only for FUNDRAISING deals and references the governed Founder fundraising round.';
comment on table public.founder_fundraising_rounds is
  'OWNER-only fundraising planning authority. Valuation/runway fields are explicit assumptions, not verified market facts.';
comment on table public.founder_investor_research_candidates is
  'OWNER-only external investor research evidence. DISCOVERED_EXTERNAL is not a CRM-confirmed identity until explicitly linked by OWNER.';
