-- Smart Visions AI Business OS 2027
-- SALES-PIPELINE-V2
--
-- Extends the existing canonical CRM pipeline/deal authority.
-- No second pipeline, Deal store, Team store, forecast truth or history store is created.
-- Production currently has zero Pipeline/Stage/Deal rows; this migration seeds none.

alter table public.crm_pipeline_stages
  add column if not exists probability_bps integer not null default 0,
  add column if not exists forecast_category text not null default 'PIPELINE',
  add column if not exists require_amount boolean not null default false,
  add column if not exists require_expected_close boolean not null default false,
  add column if not exists allow_probability_override boolean not null default false;

alter table public.crm_pipeline_stages
  add constraint crm_pipeline_stages_probability_bps_check
    check (probability_bps between 0 and 10000),
  add constraint crm_pipeline_stages_forecast_category_check
    check (forecast_category in ('PIPELINE','BEST_CASE','COMMIT','CLOSED_WON','CLOSED_LOST'));

alter table public.crm_deals
  add column if not exists team_id uuid,
  add column if not exists probability_override_bps integer,
  add column if not exists close_evidence jsonb,
  add column if not exists closed_by_user_id uuid;

alter table public.crm_deals
  add constraint crm_deals_probability_override_bps_check
    check (probability_override_bps is null or probability_override_bps between 0 and 10000),
  add constraint crm_deals_close_evidence_check
    check (
      close_evidence is null
      or (
        jsonb_typeof(close_evidence)='object'
        and close_evidence <> '{}'::jsonb
        and octet_length(close_evidence::text) <= 4096
      )
    ),
  add constraint crm_deals_team_fk
    foreign key (organization_id,team_id)
    references public.teams(organization_id,id)
    on delete restrict,
  add constraint crm_deals_closed_by_fk
    foreign key (organization_id,closed_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict;

create index if not exists crm_pipeline_stages_org_pipeline_forecast_idx
  on public.crm_pipeline_stages(
    organization_id,pipeline_id,category,forecast_category,position
  );

create index if not exists crm_deals_org_team_state_close_idx
  on public.crm_deals(organization_id,team_id,state,expected_close_at)
  where team_id is not null;

create index if not exists crm_deals_org_owner_state_close_idx
  on public.crm_deals(organization_id,owner_user_id,state,expected_close_at);

create index if not exists crm_deals_org_closed_by_fk_idx
  on public.crm_deals(organization_id,closed_by_user_id)
  where closed_by_user_id is not null;

create or replace function public.guard_crm_pipeline_stage_v2_policy()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $stage_v2_guard$
begin
  if new.category='OPEN' then
    if new.probability_bps=10000 then
      raise exception 'OPEN CRM pipeline stage probability must be below 10000 bps';
    end if;
    if new.forecast_category not in ('PIPELINE','BEST_CASE','COMMIT') then
      raise exception 'OPEN CRM pipeline stage requires open forecast category';
    end if;
  elsif new.category='WON' then
    if new.probability_bps<>10000
       or new.forecast_category<>'CLOSED_WON'
       or new.allow_probability_override
    then
      raise exception 'WON CRM pipeline stage requires 10000 bps CLOSED_WON and no override';
    end if;
  elsif new.category='LOST' then
    if new.probability_bps<>0
       or new.forecast_category<>'CLOSED_LOST'
       or new.allow_probability_override
    then
      raise exception 'LOST CRM pipeline stage requires 0 bps CLOSED_LOST and no override';
    end if;
  end if;

  return new;
end;
$stage_v2_guard$;

create or replace function public.guard_crm_deal_pipeline_v2()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $deal_v2_guard$
declare
  v_actor uuid:=auth.uid();
  v_stage record;
  v_team_status text;
  v_key text;
begin
  select
    s.category,
    s.require_amount,
    s.require_expected_close,
    s.allow_probability_override
  into v_stage
  from public.crm_pipeline_stages s
  where s.organization_id=new.organization_id
    and s.pipeline_id=new.pipeline_id
    and s.id=new.stage_id;

  if not found then
    raise exception 'CRM Deal V2 stage policy not found';
  end if;

  if new.team_id is not null
     and (
       tg_op='INSERT'
       or new.team_id is distinct from old.team_id
     )
  then
    select t.status into v_team_status
    from public.teams t
    where t.organization_id=new.organization_id
      and t.id=new.team_id;

    if v_team_status is null then
      raise exception 'CRM Deal Team not found in Organization';
    end if;
    if v_team_status<>'ACTIVE' then
      raise exception 'CRM Deal requires ACTIVE Team assignment';
    end if;
  end if;

  if tg_op='INSERT' and new.state<>'OPEN' then
    raise exception 'CRM Deal must enter Pipeline through an OPEN stage';
  end if;

  if tg_op='UPDATE' and old.state in ('WON','LOST') then
    if new.team_id is distinct from old.team_id
       or new.probability_override_bps is distinct from old.probability_override_bps
       or new.close_evidence is distinct from old.close_evidence
       or new.closed_by_user_id is distinct from old.closed_by_user_id
    then
      raise exception 'terminal CRM Deal V2 forecast/close evidence is immutable';
    end if;
    return new;
  end if;

  if new.state='OPEN' then
    if new.close_evidence is not null or new.closed_by_user_id is not null then
      raise exception 'OPEN CRM Deal cannot carry close evidence';
    end if;
    if v_stage.require_amount and new.amount is null then
      raise exception 'CRM Deal stage policy requires amount';
    end if;
    if v_stage.require_expected_close and new.expected_close_at is null then
      raise exception 'CRM Deal stage policy requires expected close';
    end if;
    if new.probability_override_bps is not null
       and not v_stage.allow_probability_override
    then
      raise exception 'CRM Deal stage policy does not allow probability override';
    end if;
  else
    if new.probability_override_bps is not null then
      new.probability_override_bps:=null;
    end if;

    if new.close_evidence is null
       or jsonb_typeof(new.close_evidence)<>'object'
       or new.close_evidence='{}'::jsonb
       or octet_length(new.close_evidence::text)>4096
       or nullif(trim(new.close_evidence->>'sourceType'),'') is null
       or nullif(trim(new.close_evidence->>'sourceRef'),'') is null
       or length(trim(new.close_evidence->>'sourceRef'))>512
       or new.close_evidence->>'sourceType' not in (
         'CUSTOMER_CONFIRMATION',
         'PAYMENT',
         'CONTRACT',
         'OPERATOR_CONFIRMED',
         'OTHER'
       )
    then
      raise exception 'terminal CRM Deal requires bounded close evidence';
    end if;

    for v_key in select jsonb_object_keys(new.close_evidence)
    loop
      if v_key not in ('sourceType','sourceRef') then
        raise exception 'CRM Deal close evidence contains unsupported field';
      end if;
    end loop;

    if v_actor is null then
      raise exception 'terminal CRM Deal close requires authenticated actor';
    end if;
    new.closed_by_user_id:=v_actor;
  end if;

  return new;
end;
$deal_v2_guard$;

drop trigger if exists crm_pipeline_stages_v2_policy_guard on public.crm_pipeline_stages;
create trigger crm_pipeline_stages_v2_policy_guard
before insert or update on public.crm_pipeline_stages
for each row execute function public.guard_crm_pipeline_stage_v2_policy();

drop trigger if exists crm_deals_pipeline_v2_guard on public.crm_deals;
create trigger crm_deals_pipeline_v2_guard
before insert or update on public.crm_deals
for each row execute function public.guard_crm_deal_pipeline_v2();

create or replace function public.audit_crm_pipeline_v2_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $pipeline_v2_audit$
declare
  v_before jsonb;
  v_after jsonb;
  v_action text;
begin
  if tg_table_name='crm_pipeline_stages' then
    if tg_op='UPDATE'
       and new.probability_bps is not distinct from old.probability_bps
       and new.forecast_category is not distinct from old.forecast_category
       and new.require_amount is not distinct from old.require_amount
       and new.require_expected_close is not distinct from old.require_expected_close
       and new.allow_probability_override is not distinct from old.allow_probability_override
    then
      return new;
    end if;

    v_action:='CRM_PIPELINE_STAGE_POLICY_CHANGED';
    v_before:=case when tg_op='UPDATE' then jsonb_build_object(
      'probabilityBps',old.probability_bps,
      'forecastCategory',old.forecast_category,
      'requireAmount',old.require_amount,
      'requireExpectedClose',old.require_expected_close,
      'allowProbabilityOverride',old.allow_probability_override,
      'version',old.version
    ) else null end;
    v_after:=jsonb_build_object(
      'probabilityBps',new.probability_bps,
      'forecastCategory',new.forecast_category,
      'requireAmount',new.require_amount,
      'requireExpectedClose',new.require_expected_close,
      'allowProbabilityOverride',new.allow_probability_override,
      'version',new.version
    );
  else
    if tg_op='UPDATE'
       and new.team_id is not distinct from old.team_id
       and new.probability_override_bps is not distinct from old.probability_override_bps
       and new.close_evidence is not distinct from old.close_evidence
       and new.closed_by_user_id is not distinct from old.closed_by_user_id
    then
      return new;
    end if;

    v_action:=case
      when new.close_evidence is not null
        and (tg_op='INSERT' or new.close_evidence is distinct from old.close_evidence)
      then 'CRM_DEAL_CLOSE_EVIDENCE_RECORDED'
      else 'CRM_DEAL_FORECAST_CONTEXT_CHANGED'
    end;

    v_before:=case when tg_op='UPDATE' then jsonb_strip_nulls(jsonb_build_object(
      'teamId',old.team_id,
      'probabilityOverrideBps',old.probability_override_bps,
      'closedByUserId',old.closed_by_user_id,
      'closeEvidenceSourceType',old.close_evidence->>'sourceType',
      'version',old.version
    )) else null end;

    v_after:=jsonb_strip_nulls(jsonb_build_object(
      'teamId',new.team_id,
      'probabilityOverrideBps',new.probability_override_bps,
      'closedByUserId',new.closed_by_user_id,
      'closeEvidenceSourceType',new.close_evidence->>'sourceType',
      'closeEvidencePresent',new.close_evidence is not null,
      'version',new.version
    ));
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,
    entity_type,entity_id,before_data,after_data,correlation_id
  ) values (
    new.organization_id,
    case when auth.uid() is null then 'SYSTEM' else 'USER' end,
    coalesce(auth.uid()::text,current_user),
    v_action,
    tg_table_name,
    new.id::text,
    v_before,
    v_after,
    'dbtx:'||txid_current()::text
  );

  return new;
end;
$pipeline_v2_audit$;

drop trigger if exists crm_pipeline_stages_v2_audit on public.crm_pipeline_stages;
create trigger crm_pipeline_stages_v2_audit
after insert or update on public.crm_pipeline_stages
for each row execute function public.audit_crm_pipeline_v2_mutation();

drop trigger if exists crm_deals_v2_audit on public.crm_deals;
create trigger crm_deals_v2_audit
after insert or update on public.crm_deals
for each row execute function public.audit_crm_pipeline_v2_mutation();

drop function if exists public.create_crm_pipeline_with_stages(uuid,text,boolean,jsonb);
create function public.create_crm_pipeline_with_stages(
  p_organization_id uuid,
  p_name text,
  p_is_default boolean,
  p_stages jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $pipeline_create_v2$
declare
  v_pipeline_id uuid;
  v_stage jsonb;
  v_category text;
  v_probability_bps integer;
  v_forecast_category text;
  v_open_count integer;
  v_won_count integer;
  v_lost_count integer;
begin
  if nullif(trim(p_name),'') is null or length(trim(p_name))>160 then
    raise exception 'invalid CRM pipeline name';
  end if;

  if p_stages is null
     or jsonb_typeof(p_stages)<>'array'
     or jsonb_array_length(p_stages)<3
     or jsonb_array_length(p_stages)>20
  then
    raise exception 'CRM pipeline requires between 3 and 20 stages';
  end if;

  select
    count(*) filter (where upper(value->>'category')='OPEN'),
    count(*) filter (where upper(value->>'category')='WON'),
    count(*) filter (where upper(value->>'category')='LOST')
  into v_open_count,v_won_count,v_lost_count
  from jsonb_array_elements(p_stages);

  if v_open_count<1 or v_won_count<>1 or v_lost_count<>1 then
    raise exception 'CRM pipeline requires OPEN stage(s), exactly one WON stage and exactly one LOST stage';
  end if;

  insert into public.crm_pipelines(
    organization_id,name,status,is_default,created_by_user_id
  ) values (
    p_organization_id,trim(p_name),'DRAFT',false,auth.uid()
  )
  returning id into v_pipeline_id;

  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    v_category:=upper(coalesce(v_stage->>'category',''));
    if v_category not in ('OPEN','WON','LOST') then
      raise exception 'invalid CRM pipeline stage category';
    end if;

    if v_category='WON' then
      v_probability_bps:=10000;
      v_forecast_category:='CLOSED_WON';
    elsif v_category='LOST' then
      v_probability_bps:=0;
      v_forecast_category:='CLOSED_LOST';
    else
      v_probability_bps:=coalesce((v_stage->>'probabilityBps')::integer,0);
      v_forecast_category:=upper(coalesce(v_stage->>'forecastCategory','PIPELINE'));
    end if;

    insert into public.crm_pipeline_stages(
      organization_id,pipeline_id,name,position,category,
      is_active,created_by_user_id,
      probability_bps,forecast_category,
      require_amount,require_expected_close,allow_probability_override
    ) values (
      p_organization_id,
      v_pipeline_id,
      trim(coalesce(v_stage->>'name','')),
      (v_stage->>'position')::integer,
      v_category,
      true,
      auth.uid(),
      v_probability_bps,
      v_forecast_category,
      coalesce((v_stage->>'requireAmount')::boolean,false),
      coalesce((v_stage->>'requireExpectedClose')::boolean,false),
      coalesce((v_stage->>'allowProbabilityOverride')::boolean,false)
    );
  end loop;

  update public.crm_pipelines
  set status='ACTIVE',
      is_default=coalesce(p_is_default,false)
  where organization_id=p_organization_id
    and id=v_pipeline_id;

  return v_pipeline_id;
end;
$pipeline_create_v2$;

drop function if exists public.get_crm_deals(
  uuid,uuid,uuid,uuid,text,integer,timestamptz,uuid
);
create function public.get_crm_deals(
  p_organization_id uuid,
  p_pipeline_id uuid default null,
  p_business_id uuid default null,
  p_owner_user_id uuid default null,
  p_state text default null,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_team_id uuid default null
)
returns setof public.crm_deals
language sql
stable
security invoker
set search_path = public, pg_catalog
as $deal_query_v2$
  select d.*
  from public.crm_deals d
  where d.organization_id=p_organization_id
    and (p_pipeline_id is null or d.pipeline_id=p_pipeline_id)
    and (p_business_id is null or d.business_id=p_business_id)
    and (p_owner_user_id is null or d.owner_user_id=p_owner_user_id)
    and (p_team_id is null or d.team_id=p_team_id)
    and (p_state is null or d.state=p_state)
    and (
      p_before_updated_at is null
      or d.updated_at<p_before_updated_at
      or (
        d.updated_at=p_before_updated_at
        and p_before_id is not null
        and d.id<p_before_id
      )
    )
  order by d.updated_at desc,d.id desc
  limit least(greatest(coalesce(p_limit,50),1),101);
$deal_query_v2$;

drop function if exists public.create_crm_deal_from_lead(
  uuid,uuid,uuid,uuid,text,numeric,text,timestamptz,uuid,text,jsonb
);
create function public.create_crm_deal_from_lead(
  p_organization_id uuid,
  p_lead_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_title text,
  p_amount numeric,
  p_currency text,
  p_expected_close_at timestamptz,
  p_owner_user_id uuid,
  p_request_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_team_id uuid default null,
  p_probability_override_bps integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $deal_from_lead_v2$
declare
  v_business_id uuid;
  v_deal_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if nullif(trim(p_title),'') is null or length(trim(p_title))>240 then
    raise exception 'invalid CRM deal title';
  end if;
  if nullif(trim(p_request_key),'') is null or length(trim(p_request_key))>200 then
    raise exception 'invalid CRM deal request_key';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception 'CRM deal metadata must be a JSON object';
  end if;

  select l.business_id into v_business_id
  from public.leads l
  where l.organization_id=p_organization_id
    and l.id=p_lead_id;

  if v_business_id is null then
    raise exception 'CRM Deal conversion requires Lead with Business';
  end if;

  if not public.crm_deal_can_manage(p_organization_id,p_owner_user_id) then
    raise exception 'CRM Deal conversion not permitted';
  end if;

  select d.id into v_deal_id
  from public.crm_deals d
  where d.organization_id=p_organization_id
    and d.request_key=trim(p_request_key);

  if v_deal_id is not null then return v_deal_id; end if;

  insert into public.crm_deals(
    organization_id,business_id,lead_id,pipeline_id,stage_id,
    title,amount,currency,expected_close_at,owner_user_id,
    team_id,probability_override_bps,
    lost_reason,source_type,source_id,request_key,
    creator_type,created_by_user_id,metadata
  ) values (
    p_organization_id,v_business_id,p_lead_id,p_pipeline_id,p_stage_id,
    trim(p_title),p_amount,
    case when p_currency is null then null else upper(trim(p_currency)) end,
    p_expected_close_at,p_owner_user_id,
    p_team_id,p_probability_override_bps,
    null,'LEAD',p_lead_id::text,trim(p_request_key),
    'USER',auth.uid(),p_metadata
  )
  returning id into v_deal_id;

  return v_deal_id;
exception
  when unique_violation then
    select d.id into v_deal_id
    from public.crm_deals d
    where d.organization_id=p_organization_id
      and d.request_key=trim(p_request_key);
    if v_deal_id is not null then return v_deal_id; end if;
    raise;
end;
$deal_from_lead_v2$;

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
 and s.id=d.stage_id;

create or replace function public.get_crm_pipeline_forecast(
  p_organization_id uuid,
  p_pipeline_id uuid default null,
  p_owner_user_id uuid default null,
  p_team_id uuid default null,
  p_currency text default null,
  p_include_closed boolean default false
)
returns table(
  pipeline_id uuid,
  owner_user_id uuid,
  team_id uuid,
  currency text,
  forecast_category text,
  deal_count bigint,
  amount_total numeric,
  weighted_amount_total numeric,
  earliest_expected_close timestamptz,
  latest_expected_close timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $forecast_summary$
  select
    f.pipeline_id,
    f.owner_user_id,
    f.team_id,
    f.currency,
    f.forecast_category,
    count(*)::bigint,
    coalesce(sum(f.amount),0)::numeric,
    coalesce(sum(f.weighted_amount),0)::numeric,
    min(f.expected_close_at),
    max(f.expected_close_at)
  from public.crm_deal_forecast_rows f
  where f.organization_id=p_organization_id
    and (p_pipeline_id is null or f.pipeline_id=p_pipeline_id)
    and (p_owner_user_id is null or f.owner_user_id=p_owner_user_id)
    and (p_team_id is null or f.team_id=p_team_id)
    and (p_currency is null or f.currency=upper(trim(p_currency)))
    and (p_include_closed or f.state='OPEN')
  group by
    f.pipeline_id,f.owner_user_id,f.team_id,f.currency,f.forecast_category
  order by
    f.pipeline_id,f.currency,f.forecast_category,f.owner_user_id,f.team_id;
$forecast_summary$;

revoke all on public.crm_deal_forecast_rows
  from public,anon,authenticated,service_role;
grant select on public.crm_deal_forecast_rows to authenticated;

revoke all on function public.create_crm_pipeline_with_stages(uuid,text,boolean,jsonb)
  from public,anon,service_role;
grant execute on function public.create_crm_pipeline_with_stages(uuid,text,boolean,jsonb)
  to authenticated;

revoke all on function public.get_crm_deals(
  uuid,uuid,uuid,uuid,text,integer,timestamptz,uuid,uuid
) from public,anon,service_role;
grant execute on function public.get_crm_deals(
  uuid,uuid,uuid,uuid,text,integer,timestamptz,uuid,uuid
) to authenticated;

revoke all on function public.create_crm_deal_from_lead(
  uuid,uuid,uuid,uuid,text,numeric,text,timestamptz,uuid,text,jsonb,uuid,integer
) from public,anon,service_role;
grant execute on function public.create_crm_deal_from_lead(
  uuid,uuid,uuid,uuid,text,numeric,text,timestamptz,uuid,text,jsonb,uuid,integer
) to authenticated;

revoke all on function public.get_crm_pipeline_forecast(
  uuid,uuid,uuid,uuid,text,boolean
) from public,anon,service_role;
grant execute on function public.get_crm_pipeline_forecast(
  uuid,uuid,uuid,uuid,text,boolean
) to authenticated;

revoke all on function public.guard_crm_pipeline_stage_v2_policy()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_crm_deal_pipeline_v2()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_crm_pipeline_v2_mutation()
  from public,anon,authenticated,service_role;

comment on column public.crm_pipeline_stages.probability_bps is
  'Deterministic stage probability in basis points. WON=10000, LOST=0; OPEN must remain below 10000.';
comment on column public.crm_pipeline_stages.forecast_category is
  'Typed stage forecast bucket. Terminal categories are fixed by stage category.';
comment on column public.crm_deals.probability_override_bps is
  'Optional explicit Deal probability override, allowed only by the current OPEN stage policy.';
comment on column public.crm_deals.close_evidence is
  'Bounded typed terminal evidence {sourceType,sourceRef}; required for governed WON/LOST transition.';
comment on view public.crm_deal_forecast_rows is
  'Canonical derived forecast row model. Weighted amount is computed and is not a second persisted commercial truth.';
