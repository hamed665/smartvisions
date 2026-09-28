-- 0139: SALES-PIPELINE-V2 forecast/team/policy extension over canonical CRM commercial truth.
--
-- Authority stays on crm_pipelines + crm_pipeline_stages + crm_deals.
-- This migration does not create a second pipeline, deal, ownership or forecast store.
-- Existing commercial truth is extended with typed stage forecast policy, per-deal
-- deterministic probability/weighted amount, canonical Team ownership and a bounded
-- RLS-governed forecast read model.
--
-- Production currently has zero pipelines/stages/deals, so this migration fabricates
-- no Production commercial rows. Existing non-Production rows, if any, receive only
-- deterministic defaults derived from their current canonical stage category.

alter table public.crm_pipeline_stages
  add column if not exists default_probability_percent integer,
  add column if not exists forecast_category text,
  add column if not exists requires_amount boolean not null default false,
  add column if not exists requires_expected_close boolean not null default false;

update public.crm_pipeline_stages
set default_probability_percent = case
      when category='WON' then 100
      when category='LOST' then 0
      else 0
    end,
    forecast_category = case
      when category='WON' then 'CLOSED'
      when category='LOST' then 'OMITTED'
      else 'PIPELINE'
    end
where default_probability_percent is null
   or forecast_category is null;

alter table public.crm_pipeline_stages
  alter column default_probability_percent set not null,
  alter column forecast_category set not null;

alter table public.crm_pipeline_stages
  add constraint crm_pipeline_stages_probability_check
    check (default_probability_percent between 0 and 100),
  add constraint crm_pipeline_stages_forecast_category_check
    check (forecast_category in ('PIPELINE','BEST_CASE','COMMIT','CLOSED','OMITTED')),
  add constraint crm_pipeline_stages_forecast_semantics_check
    check (
      (category='WON' and default_probability_percent=100 and forecast_category='CLOSED')
      or
      (category='LOST' and default_probability_percent=0 and forecast_category='OMITTED')
      or
      (
        category='OPEN'
        and default_probability_percent between 0 and 99
        and forecast_category in ('PIPELINE','BEST_CASE','COMMIT','OMITTED')
      )
    );

alter table public.crm_deals
  add column if not exists probability_percent integer,
  add column if not exists forecast_category text,
  add column if not exists forecast_source text,
  add column if not exists owner_team_id uuid,
  add column if not exists weighted_amount numeric(18,4)
    generated always as (
      case
        when amount is null or probability_percent is null then null
        else round((amount * probability_percent::numeric) / 100::numeric, 4)
      end
    ) stored;

-- Deterministically align pre-existing rows to their canonical stage policy.
-- On canonical Production the tables are empty, so this updates zero rows.
update public.crm_deals d
set probability_percent=s.default_probability_percent,
    forecast_category=s.forecast_category,
    forecast_source='STAGE_DEFAULT'
from public.crm_pipeline_stages s
where s.organization_id=d.organization_id
  and s.id=d.stage_id
  and s.pipeline_id=d.pipeline_id
  and (
    d.probability_percent is null
    or d.forecast_category is null
    or d.forecast_source is null
  );

alter table public.crm_deals
  alter column probability_percent set not null,
  alter column forecast_category set not null,
  alter column forecast_source set not null;

alter table public.crm_deals
  add constraint crm_deals_probability_check
    check (probability_percent between 0 and 100),
  add constraint crm_deals_forecast_category_check
    check (forecast_category in ('PIPELINE','BEST_CASE','COMMIT','CLOSED','OMITTED')),
  add constraint crm_deals_forecast_source_check
    check (forecast_source in ('STAGE_DEFAULT','MANUAL')),
  add constraint crm_deals_terminal_forecast_check
    check (
      (state='WON' and probability_percent=100 and forecast_category='CLOSED')
      or
      (state='LOST' and probability_percent=0 and forecast_category='OMITTED')
      or
      (
        state='OPEN'
        and probability_percent between 0 and 99
        and forecast_category in ('PIPELINE','BEST_CASE','COMMIT','OMITTED')
      )
    ),
  add constraint crm_deals_owner_team_fk
    foreign key (organization_id, owner_team_id)
    references public.teams(organization_id, id)
    on delete restrict;

create index if not exists crm_deals_org_owner_team_state_close_idx
  on public.crm_deals(organization_id, owner_team_id, state, expected_close_at)
  where owner_team_id is not null;

create index if not exists crm_deals_org_pipeline_forecast_currency_close_idx
  on public.crm_deals(
    organization_id,pipeline_id,state,forecast_category,currency,expected_close_at
  );

create index if not exists crm_deals_org_stage_forecast_idx
  on public.crm_deals(organization_id,stage_id,state,forecast_category);

create or replace function public.crm_deal_team_owner_valid(
  p_organization_id uuid,
  p_owner_user_id uuid,
  p_owner_team_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path=public,auth,pg_catalog
as $$
  select
    p_owner_team_id is null
    or (
      exists (
        select 1
        from public.teams t
        where t.organization_id=p_organization_id
          and t.id=p_owner_team_id
          and t.status='ACTIVE'
      )
      and exists (
        select 1
        from public.member_scope_assignments a
        where a.organization_id=p_organization_id
          and a.user_id=p_owner_user_id
          and a.scope_type='TEAM'
          and a.team_id=p_owner_team_id
          and a.role in ('ADMIN','SALES_MANAGER','SALES_AGENT')
          and coalesce(a.attributes,'{}'::jsonb)='{}'::jsonb
      )
    );
$$;

create or replace function public.guard_crm_pipeline_stage_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_pipeline_status text;
  v_policy_changed boolean;
begin
  select p.status into v_pipeline_status
  from public.crm_pipelines p
  where p.organization_id=coalesce(new.organization_id,old.organization_id)
    and p.id=coalesce(new.pipeline_id,old.pipeline_id);

  if v_pipeline_status is null or v_pipeline_status='ARCHIVED' then
    raise exception 'CRM pipeline stage requires non-ARCHIVED pipeline';
  end if;

  if new.default_probability_percent is null then
    new.default_probability_percent:=case
      when new.category='WON' then 100
      when new.category='LOST' then 0
      else 0
    end;
  end if;

  if new.forecast_category is null then
    new.forecast_category:=case
      when new.category='WON' then 'CLOSED'
      when new.category='LOST' then 'OMITTED'
      else 'PIPELINE'
    end;
  end if;

  new.forecast_category:=upper(trim(new.forecast_category));

  if new.default_probability_percent not between 0 and 100
     or new.forecast_category not in ('PIPELINE','BEST_CASE','COMMIT','CLOSED','OMITTED')
  then
    raise exception 'CRM pipeline stage forecast policy is invalid';
  end if;

  if new.category='WON'
     and (new.default_probability_percent<>100 or new.forecast_category<>'CLOSED')
  then
    raise exception 'CRM WON stage requires 100 percent CLOSED forecast policy';
  elsif new.category='LOST'
     and (new.default_probability_percent<>0 or new.forecast_category<>'OMITTED')
  then
    raise exception 'CRM LOST stage requires 0 percent OMITTED forecast policy';
  elsif new.category='OPEN'
     and (
       new.default_probability_percent>=100
       or new.forecast_category not in ('PIPELINE','BEST_CASE','COMMIT','OMITTED')
     )
  then
    raise exception 'CRM OPEN stage forecast policy is invalid';
  end if;

  if tg_op='INSERT' then
    if auth.uid() is null or new.created_by_user_id is distinct from auth.uid() then
      raise exception 'CRM pipeline stage creator must match auth.uid()';
    end if;

    if v_pipeline_status='ACTIVE' and new.category in ('WON','LOST') then
      raise exception 'terminal CRM pipeline stages cannot be added after activation';
    end if;

    new.version:=1;
    new.updated_at:=now();
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.pipeline_id is distinct from old.pipeline_id
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'CRM pipeline stage tenant/pipeline/creator is immutable';
  end if;

  if v_pipeline_status='ACTIVE'
     and new.category is distinct from old.category
  then
    raise exception 'ACTIVE CRM pipeline stage category is immutable';
  end if;

  if v_pipeline_status='ACTIVE'
     and old.category in ('WON','LOST')
     and old.is_active
     and not new.is_active
  then
    raise exception 'terminal CRM pipeline stage cannot be deactivated';
  end if;

  if v_pipeline_status='ACTIVE'
     and old.category='OPEN'
     and old.is_active
     and not new.is_active
     and not exists (
       select 1
       from public.crm_pipeline_stages s
       where s.organization_id=old.organization_id
         and s.pipeline_id=old.pipeline_id
         and s.id<>old.id
         and s.category='OPEN'
         and s.is_active
     )
  then
    raise exception 'CRM pipeline requires at least one active OPEN stage';
  end if;

  if old.is_active and not new.is_active
     and exists (
       select 1
       from public.crm_deals d
       where d.organization_id=old.organization_id
         and d.stage_id=old.id
         and d.state='OPEN'
     )
  then
    raise exception 'CRM pipeline stage with OPEN deals cannot be deactivated';
  end if;

  v_policy_changed :=
    new.default_probability_percent is distinct from old.default_probability_percent
    or new.forecast_category is distinct from old.forecast_category
    or new.requires_amount is distinct from old.requires_amount
    or new.requires_expected_close is distinct from old.requires_expected_close;

  if v_pipeline_status='ACTIVE'
     and v_policy_changed
     and exists (
       select 1
       from public.crm_deals d
       where d.organization_id=old.organization_id
         and d.stage_id=old.id
         and d.state='OPEN'
     )
  then
    raise exception 'CRM active stage forecast policy cannot change while it has OPEN deals';
  end if;

  new.version:=old.version+1;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.guard_crm_deal_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_actor uuid:=auth.uid();
  v_stage_category text;
  v_stage_active boolean;
  v_pipeline_status text;
  v_stage_probability integer;
  v_stage_forecast text;
  v_requires_amount boolean;
  v_requires_expected_close boolean;
  v_manual_forecast_requested boolean;
begin
  -- Customer 360 may attach/correct Person context on historical Deals without
  -- reopening or mutating commercial truth. This exception remains narrowly
  -- service-bound and does not permit forecast/team/commercial mutation.
  if tg_op='UPDATE'
     and current_user='service_role'
     and (
       new.person_id is distinct from old.person_id
       or new.person_link_method is distinct from old.person_link_method
       or new.person_link_source_ref is distinct from old.person_link_source_ref
       or new.person_link_evidence is distinct from old.person_link_evidence
       or new.person_linked_by_user_id is distinct from old.person_linked_by_user_id
       or new.person_linked_at is distinct from old.person_linked_at
     )
     and (
       to_jsonb(new)-array[
         'person_id','person_link_method','person_link_source_ref',
         'person_link_evidence','person_linked_by_user_id','person_linked_at',
         'version','updated_at'
       ]
     )=(
       to_jsonb(old)-array[
         'person_id','person_link_method','person_link_source_ref',
         'person_link_evidence','person_linked_by_user_id','person_linked_at',
         'version','updated_at'
       ]
     )
  then
    new.version:=old.version+1;
    new.updated_at:=now();
    return new;
  end if;

  select
    s.category,s.is_active,p.status,
    s.default_probability_percent,s.forecast_category,
    s.requires_amount,s.requires_expected_close
  into
    v_stage_category,v_stage_active,v_pipeline_status,
    v_stage_probability,v_stage_forecast,
    v_requires_amount,v_requires_expected_close
  from public.crm_pipeline_stages s
  join public.crm_pipelines p
    on p.organization_id=s.organization_id
   and p.id=s.pipeline_id
  where s.organization_id=new.organization_id
    and s.id=new.stage_id
    and s.pipeline_id=new.pipeline_id;

  if v_stage_category is null then
    raise exception 'CRM deal stage/pipeline not found';
  end if;
  if not v_stage_active or v_pipeline_status<>'ACTIVE' then
    raise exception 'CRM deal requires ACTIVE pipeline and stage';
  end if;

  if not public.crm_deal_team_owner_valid(
    new.organization_id,new.owner_user_id,new.owner_team_id
  ) then
    raise exception 'CRM Deal owner Team requires an active canonical Team assignment for the owner';
  end if;

  if tg_op='INSERT' then
    if new.creator_type='USER' then
      if v_actor is null or new.created_by_user_id is distinct from v_actor then
        raise exception 'CRM deal USER creator must match auth.uid()';
      end if;
    end if;

    v_manual_forecast_requested :=
      new.probability_percent is not null
      or new.forecast_category is not null;

    if v_stage_category='OPEN' then
      new.state:='OPEN';
      new.won_at:=null;
      new.lost_at:=null;
      new.lost_reason:=null;
      if v_manual_forecast_requested then
        new.probability_percent:=coalesce(new.probability_percent,v_stage_probability);
        new.forecast_category:=upper(trim(coalesce(new.forecast_category,v_stage_forecast)));
        new.forecast_source:='MANUAL';
      else
        new.probability_percent:=v_stage_probability;
        new.forecast_category:=v_stage_forecast;
        new.forecast_source:='STAGE_DEFAULT';
      end if;
    elsif v_stage_category='WON' then
      new.state:='WON';
      new.won_at:=now();
      new.lost_at:=null;
      new.lost_reason:=null;
      new.probability_percent:=100;
      new.forecast_category:='CLOSED';
      new.forecast_source:='STAGE_DEFAULT';
    else
      if nullif(trim(new.lost_reason),'') is null then
        raise exception 'CRM LOST deal requires lost_reason';
      end if;
      new.state:='LOST';
      new.won_at:=null;
      new.lost_at:=now();
      new.probability_percent:=0;
      new.forecast_category:='OMITTED';
      new.forecast_source:='STAGE_DEFAULT';
    end if;

    if new.state='OPEN'
       and (
         new.probability_percent not between 0 and 99
         or new.forecast_category not in ('PIPELINE','BEST_CASE','COMMIT','OMITTED')
       )
    then
      raise exception 'CRM OPEN deal forecast is invalid';
    end if;

    if v_requires_amount and new.amount is null then
      raise exception 'CRM stage policy requires Deal amount';
    end if;
    if v_requires_expected_close and new.expected_close_at is null then
      raise exception 'CRM stage policy requires expected close';
    end if;

    new.version:=1;
    new.updated_at:=now();
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.business_id is distinct from old.business_id
     or new.lead_id is distinct from old.lead_id
     or new.pipeline_id is distinct from old.pipeline_id
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.request_key is distinct from old.request_key
     or new.creator_type is distinct from old.creator_type
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'CRM deal tenant/scope/source/creator is immutable';
  end if;

  if old.state in ('WON','LOST') then
    if new.stage_id is distinct from old.stage_id then
      raise exception 'terminal CRM deal stage is immutable';
    end if;
    if new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.owner_user_id is distinct from old.owner_user_id
       or new.owner_team_id is distinct from old.owner_team_id
       or new.expected_close_at is distinct from old.expected_close_at
       or new.probability_percent is distinct from old.probability_percent
       or new.forecast_category is distinct from old.forecast_category
       or new.forecast_source is distinct from old.forecast_source
       or new.lost_reason is distinct from old.lost_reason
    then
      raise exception 'terminal CRM deal commercial truth is immutable';
    end if;
  end if;

  if new.stage_id is distinct from old.stage_id then
    if v_stage_category='OPEN' then
      new.state:='OPEN';
      new.won_at:=null;
      new.lost_at:=null;
      new.lost_reason:=null;
      -- Stage movement deliberately resets a previous manual forecast to the
      -- destination Stage policy so ownership of the new stage stays deterministic.
      new.probability_percent:=v_stage_probability;
      new.forecast_category:=v_stage_forecast;
      new.forecast_source:='STAGE_DEFAULT';
    elsif v_stage_category='WON' then
      new.state:='WON';
      new.won_at:=now();
      new.lost_at:=null;
      new.lost_reason:=null;
      new.probability_percent:=100;
      new.forecast_category:='CLOSED';
      new.forecast_source:='STAGE_DEFAULT';
    elsif v_stage_category='LOST' then
      if nullif(trim(new.lost_reason),'') is null then
        raise exception 'CRM LOST deal requires lost_reason';
      end if;
      new.state:='LOST';
      new.won_at:=null;
      new.lost_at:=now();
      new.probability_percent:=0;
      new.forecast_category:='OMITTED';
      new.forecast_source:='STAGE_DEFAULT';
    end if;
  else
    new.state:=old.state;
    new.won_at:=old.won_at;
    new.lost_at:=old.lost_at;
    if old.state<>'LOST' then
      new.lost_reason:=null;
    end if;

    if new.probability_percent is distinct from old.probability_percent
       or new.forecast_category is distinct from old.forecast_category
    then
      new.forecast_category:=upper(trim(new.forecast_category));
      new.forecast_source:='MANUAL';
    else
      new.forecast_source:=old.forecast_source;
    end if;
  end if;

  if new.state='OPEN'
     and (
       new.probability_percent not between 0 and 99
       or new.forecast_category not in ('PIPELINE','BEST_CASE','COMMIT','OMITTED')
     )
  then
    raise exception 'CRM OPEN deal forecast is invalid';
  end if;

  if v_requires_amount and new.amount is null then
    raise exception 'CRM stage policy requires Deal amount';
  end if;
  if v_requires_expected_close and new.expected_close_at is null then
    raise exception 'CRM stage policy requires expected close';
  end if;

  new.version:=old.version+1;
  new.updated_at:=now();
  return new;
end;
$$;

create or replace function public.create_crm_pipeline_with_stages(
  p_organization_id uuid,
  p_name text,
  p_is_default boolean,
  p_stages jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_pipeline_id uuid;
  v_stage jsonb;
  v_category text;
  v_open_count integer;
  v_won_count integer;
  v_lost_count integer;
  v_probability integer;
  v_forecast text;
begin
  if nullif(trim(p_name),'') is null or length(trim(p_name))>160 then
    raise exception 'invalid CRM pipeline name';
  end if;

  if p_stages is null or jsonb_typeof(p_stages)<>'array'
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

    v_probability:=coalesce(
      nullif(v_stage->>'defaultProbabilityPercent','')::integer,
      case when v_category='WON' then 100 when v_category='LOST' then 0 else 0 end
    );
    v_forecast:=upper(coalesce(
      nullif(v_stage->>'forecastCategory',''),
      case when v_category='WON' then 'CLOSED' when v_category='LOST' then 'OMITTED' else 'PIPELINE' end
    ));

    insert into public.crm_pipeline_stages(
      organization_id,pipeline_id,name,position,category,
      is_active,created_by_user_id,
      default_probability_percent,forecast_category,
      requires_amount,requires_expected_close
    ) values (
      p_organization_id,
      v_pipeline_id,
      trim(coalesce(v_stage->>'name','')),
      (v_stage->>'position')::integer,
      v_category,
      true,
      auth.uid(),
      v_probability,
      v_forecast,
      coalesce((v_stage->>'requiresAmount')::boolean,false),
      coalesce((v_stage->>'requiresExpectedClose')::boolean,false)
    );
  end loop;

  update public.crm_pipelines
  set status='ACTIVE',
      is_default=coalesce(p_is_default,false)
  where organization_id=p_organization_id
    and id=v_pipeline_id;

  return v_pipeline_id;
end;
$$;

create or replace function public.audit_crm_commercial_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_actor uuid:=auth.uid();
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_table_name='crm_pipelines' then
    v_action:=case when tg_op='INSERT' then 'CRM_PIPELINE_CREATED' else 'CRM_PIPELINE_UPDATED' end;
    v_before:=case when tg_op='UPDATE' then jsonb_build_object(
      'status',old.status,'is_default',old.is_default,'version',old.version
    ) else null end;
    v_after:=jsonb_build_object(
      'status',new.status,'is_default',new.is_default,'version',new.version
    );
  elsif tg_table_name='crm_pipeline_stages' then
    v_action:=case when tg_op='INSERT' then 'CRM_PIPELINE_STAGE_CREATED' else 'CRM_PIPELINE_STAGE_UPDATED' end;
    v_before:=case when tg_op='UPDATE' then jsonb_build_object(
      'pipeline_id',old.pipeline_id,'position',old.position,
      'category',old.category,'is_active',old.is_active,
      'default_probability_percent',old.default_probability_percent,
      'forecast_category',old.forecast_category,
      'requires_amount',old.requires_amount,
      'requires_expected_close',old.requires_expected_close,
      'version',old.version
    ) else null end;
    v_after:=jsonb_build_object(
      'pipeline_id',new.pipeline_id,'position',new.position,
      'category',new.category,'is_active',new.is_active,
      'default_probability_percent',new.default_probability_percent,
      'forecast_category',new.forecast_category,
      'requires_amount',new.requires_amount,
      'requires_expected_close',new.requires_expected_close,
      'version',new.version
    );
  else
    if tg_op='INSERT' then
      v_action:='CRM_DEAL_CREATED';
      v_before:=null;
    elsif new.stage_id is distinct from old.stage_id then
      v_action:='CRM_DEAL_STAGE_CHANGED';
      v_before:=jsonb_strip_nulls(jsonb_build_object(
        'stage_id',old.stage_id,'state',old.state,
        'amount',old.amount,'currency',old.currency,
        'probability_percent',old.probability_percent,
        'weighted_amount',old.weighted_amount,
        'forecast_category',old.forecast_category,
        'forecast_source',old.forecast_source,
        'owner_user_id',old.owner_user_id,
        'owner_team_id',old.owner_team_id,
        'expected_close_at',old.expected_close_at,
        'version',old.version
      ));
    else
      v_action:='CRM_DEAL_UPDATED';
      v_before:=jsonb_strip_nulls(jsonb_build_object(
        'stage_id',old.stage_id,'state',old.state,
        'amount',old.amount,'currency',old.currency,
        'probability_percent',old.probability_percent,
        'weighted_amount',old.weighted_amount,
        'forecast_category',old.forecast_category,
        'forecast_source',old.forecast_source,
        'owner_user_id',old.owner_user_id,
        'owner_team_id',old.owner_team_id,
        'expected_close_at',old.expected_close_at,
        'version',old.version
      ));
    end if;

    v_after:=jsonb_strip_nulls(jsonb_build_object(
      'business_id',new.business_id,
      'lead_id',new.lead_id,
      'pipeline_id',new.pipeline_id,
      'stage_id',new.stage_id,
      'state',new.state,
      'amount',new.amount,
      'currency',new.currency,
      'probability_percent',new.probability_percent,
      'weighted_amount',new.weighted_amount,
      'forecast_category',new.forecast_category,
      'forecast_source',new.forecast_source,
      'owner_user_id',new.owner_user_id,
      'owner_team_id',new.owner_team_id,
      'expected_close_at',new.expected_close_at,
      'source_type',new.source_type,
      'source_id',new.source_id,
      'version',new.version
    ));
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,
    entity_type,entity_id,before_data,after_data,correlation_id
  ) values (
    new.organization_id,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text,current_user),
    v_action,
    tg_table_name,
    new.id::text,
    v_before,
    v_after,
    'dbtx:'||txid_current()::text
  );

  return new;
end;
$$;

create or replace function public.get_crm_pipeline_forecast(
  p_organization_id uuid,
  p_pipeline_id uuid default null,
  p_owner_user_id uuid default null,
  p_owner_team_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table(
  pipeline_id uuid,
  pipeline_name text,
  stage_id uuid,
  stage_name text,
  forecast_category text,
  currency text,
  owner_user_id uuid,
  owner_team_id uuid,
  deal_count bigint,
  total_amount numeric,
  weighted_amount numeric,
  earliest_expected_close_at timestamptz,
  latest_expected_close_at timestamptz
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select
    d.pipeline_id,
    p.name,
    d.stage_id,
    s.name,
    d.forecast_category,
    d.currency,
    d.owner_user_id,
    d.owner_team_id,
    count(*)::bigint,
    sum(d.amount),
    sum(d.weighted_amount),
    min(d.expected_close_at),
    max(d.expected_close_at)
  from public.crm_deals d
  join public.crm_pipelines p
    on p.organization_id=d.organization_id
   and p.id=d.pipeline_id
  join public.crm_pipeline_stages s
    on s.organization_id=d.organization_id
   and s.id=d.stage_id
   and s.pipeline_id=d.pipeline_id
  where d.organization_id=p_organization_id
    and d.state='OPEN'
    and (p_pipeline_id is null or d.pipeline_id=p_pipeline_id)
    and (p_owner_user_id is null or d.owner_user_id=p_owner_user_id)
    and (p_owner_team_id is null or d.owner_team_id=p_owner_team_id)
    and (p_from is null or d.expected_close_at>=p_from)
    and (p_to is null or d.expected_close_at<p_to)
  group by
    d.pipeline_id,p.name,d.stage_id,s.name,d.forecast_category,d.currency,
    d.owner_user_id,d.owner_team_id
  order by p.name,s.name,d.forecast_category,d.currency,d.owner_user_id,d.owner_team_id;
$$;

revoke all on function public.crm_deal_team_owner_valid(uuid,uuid,uuid)
  from public,anon;
grant execute on function public.crm_deal_team_owner_valid(uuid,uuid,uuid)
  to authenticated,service_role;

revoke all on function public.get_crm_pipeline_forecast(
  uuid,uuid,uuid,uuid,timestamptz,timestamptz
) from public,anon,service_role;
grant execute on function public.get_crm_pipeline_forecast(
  uuid,uuid,uuid,uuid,timestamptz,timestamptz
) to authenticated;

revoke all on function public.guard_crm_pipeline_stage_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_crm_deal_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_crm_commercial_mutation()
  from public,anon,authenticated,service_role;

comment on column public.crm_pipeline_stages.default_probability_percent is
  'Typed SALES-PIPELINE-V2 default probability applied when a Deal enters this stage without manual forecast override.';
comment on column public.crm_pipeline_stages.forecast_category is
  'Typed default forecast category: PIPELINE, BEST_CASE, COMMIT, CLOSED or OMITTED.';
comment on column public.crm_pipeline_stages.requires_amount is
  'Stage entry/update policy requiring canonical Deal amount.';
comment on column public.crm_pipeline_stages.requires_expected_close is
  'Stage entry/update policy requiring canonical Deal expected close timestamp.';
comment on column public.crm_deals.probability_percent is
  'Canonical Deal forecast probability. Stage movement resets to destination stage policy; in-stage operator edits are MANUAL.';
comment on column public.crm_deals.weighted_amount is
  'Deterministic generated amount * probability / 100 in the Deal currency; never aggregate across currencies without grouping.';
comment on column public.crm_deals.owner_team_id is
  'Optional canonical Team ownership classification. When set, owner_user_id must hold an active TEAM scope assignment.';
