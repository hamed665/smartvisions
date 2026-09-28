-- 0140: SALES-PIPELINE-V2 scoped operator boundary.
--
-- Extends the already-merged 0139 Pipeline/Deal authority.
-- No new CRM, IAM, Team, forecast or ownership store is introduced.
-- Generic CRM Deal scope intentionally uses only unqualified scope assignments
-- (attributes = {}) so channel/region constrained IAM is never silently widened.

create or replace function public.crm_scope_assignment_covers_team(
  p_organization_id uuid,
  p_user_id uuid,
  p_team_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  select
    p_team_id is not null
    and exists (
      select 1
      from public.organization_members caller
      where caller.organization_id=p_organization_id
        and caller.user_id=auth.uid()
    )
    and exists (
      select 1
      from public.member_scope_assignments a
      join public.teams t
        on t.organization_id=a.organization_id
       and t.id=p_team_id
      join public.departments d
        on d.organization_id=t.organization_id
       and d.id=t.department_id
      join public.branches br
        on br.organization_id=d.organization_id
       and br.id=d.branch_id
      join public.tenant_businesses tb
        on tb.organization_id=br.organization_id
       and tb.id=br.tenant_business_id
      where a.organization_id=p_organization_id
        and a.user_id=p_user_id
        and coalesce(a.attributes,'{}'::jsonb)='{}'::jsonb
        and (
          p_allowed_roles is null
          or a.role=any(p_allowed_roles)
        )
        and (
          (a.scope_type='TEAM' and a.team_id=t.id)
          or (a.scope_type='DEPARTMENT' and a.department_id=d.id)
          or (a.scope_type='BRANCH' and a.branch_id=br.id)
          or (a.scope_type='BUSINESS' and a.tenant_business_id=tb.id)
          or (a.scope_type='BRAND' and a.brand_id=tb.brand_id)
        )
    );
$$;

create or replace function public.crm_deal_owner_team_valid(
  p_organization_id uuid,
  p_owner_user_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  with owner_membership as (
    select m.role
    from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_owner_user_id
  )
  select
    exists(select 1 from owner_membership)
    and (
      (
        exists (
          select 1 from owner_membership
          where role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')
        )
        and (
          p_team_id is null
          or exists (
            select 1 from public.teams t
            where t.organization_id=p_organization_id
              and t.id=p_team_id
              and t.status='ACTIVE'
          )
        )
      )
      or
      (
        p_team_id is not null
        and exists (
          select 1 from public.teams t
          where t.organization_id=p_organization_id
            and t.id=p_team_id
            and t.status='ACTIVE'
        )
        and public.crm_scope_assignment_covers_team(
          p_organization_id,
          p_owner_user_id,
          p_team_id,
          array['ADMIN','SALES_MANAGER','SALES_AGENT']::text[]
        )
      )
    );
$$;

create or replace function public.crm_deal_scope_can_read(
  p_organization_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  select
    public.is_unified_inbox_business_wide_member(p_organization_id)
    or (
      public.is_unified_inbox_scoped_only_member(p_organization_id)
      and p_team_id is not null
      and public.crm_scope_assignment_covers_team(
        p_organization_id,
        auth.uid(),
        p_team_id,
        array['ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER']::text[]
      )
    );
$$;

create or replace function public.crm_deal_scope_can_manage(
  p_organization_id uuid,
  p_owner_user_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  select
    exists (
      select 1
      from public.organization_members m
      where m.organization_id=p_organization_id
        and m.user_id=auth.uid()
        and (
          m.role in ('OWNER','ADMIN','SALES_MANAGER')
          or (m.role='SALES_AGENT' and p_owner_user_id=auth.uid())
        )
    )
    or (
      public.is_unified_inbox_scoped_only_member(p_organization_id)
      and p_team_id is not null
      and (
        public.crm_scope_assignment_covers_team(
          p_organization_id,
          auth.uid(),
          p_team_id,
          array['ADMIN','SALES_MANAGER']::text[]
        )
        or (
          p_owner_user_id=auth.uid()
          and public.crm_scope_assignment_covers_team(
            p_organization_id,
            auth.uid(),
            p_team_id,
            array['SALES_AGENT']::text[]
          )
        )
      )
    );
$$;

create or replace function public.guard_crm_pipeline_stage_live_policy()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $
begin
  if tg_op='UPDATE'
     and (
       new.probability_bps is distinct from old.probability_bps
       or new.forecast_category is distinct from old.forecast_category
       or new.require_amount is distinct from old.require_amount
       or new.require_expected_close is distinct from old.require_expected_close
       or new.allow_probability_override is distinct from old.allow_probability_override
       or (old.is_active and not new.is_active)
     )
     and exists (
       select 1
       from public.crm_deals d
       where d.organization_id=old.organization_id
         and d.pipeline_id=old.pipeline_id
         and d.stage_id=old.id
         and d.state='OPEN'
     )
  then
    raise exception 'CRM Pipeline live stage policy is locked while OPEN Deals reference the stage';
  end if;
  return new;
end;
$;

drop trigger if exists crm_pipeline_stages_live_policy_guard on public.crm_pipeline_stages;
create trigger crm_pipeline_stages_live_policy_guard
before update on public.crm_pipeline_stages
for each row execute function public.guard_crm_pipeline_stage_live_policy();

create or replace function public.guard_crm_deal_stage_move_forecast()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $
begin
  if tg_op='UPDATE'
     and new.stage_id is distinct from old.stage_id
     and new.probability_override_bps is not distinct from old.probability_override_bps
  then
    new.probability_override_bps:=null;
  end if;
  return new;
end;
$;

drop trigger if exists crm_deals_aa_stage_move_forecast_guard on public.crm_deals;
create trigger crm_deals_aa_stage_move_forecast_guard
before update of stage_id,probability_override_bps on public.crm_deals
for each row execute function public.guard_crm_deal_stage_move_forecast();

create or replace function public.guard_crm_deal_owner_team_scope()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
begin
  if not public.crm_deal_owner_team_valid(
    new.organization_id,
    new.owner_user_id,
    new.team_id
  ) then
    raise exception 'CRM Deal owner/Team scope is invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_deals_owner_team_scope_guard on public.crm_deals;
create trigger crm_deals_owner_team_scope_guard
before insert or update of owner_user_id,team_id
on public.crm_deals
for each row execute function public.guard_crm_deal_owner_team_scope();

drop policy if exists crm_deals_manager_insert on public.crm_deals;
create policy crm_deals_manager_insert
on public.crm_deals
for insert
to authenticated
with check (
  creator_type='USER'
  and created_by_user_id=(select auth.uid())
  and (
    (source_type='MANUAL' and source_id is null)
    or (source_type='LEAD' and lead_id is not null and source_id=lead_id::text)
  )
  and public.crm_deal_scope_can_manage(
    organization_id,
    owner_user_id,
    team_id
  )
  and public.crm_deal_owner_team_valid(
    organization_id,
    owner_user_id,
    team_id
  )
);

drop policy if exists crm_deals_manager_update on public.crm_deals;
create policy crm_deals_manager_update
on public.crm_deals
for update
to authenticated
using (
  public.crm_deal_scope_can_manage(
    organization_id,
    owner_user_id,
    team_id
  )
)
with check (
  public.crm_deal_scope_can_manage(
    organization_id,
    owner_user_id,
    team_id
  )
  and public.crm_deal_owner_team_valid(
    organization_id,
    owner_user_id,
    team_id
  )
);

drop policy if exists unified_inbox_business_wide_boundary on public.crm_deals;
create policy unified_inbox_business_wide_boundary
on public.crm_deals
as restrictive
for all
to authenticated
using (
  public.crm_deal_scope_can_read(organization_id,team_id)
)
with check (
  public.crm_deal_scope_can_manage(
    organization_id,
    owner_user_id,
    team_id
  )
);

-- Pipeline definitions contain configuration, not customer rows. Scoped operators
-- may read them to operate their allowed Deals, while existing manager policies
-- continue to block scoped mutation of Pipeline/Stage definitions.
drop policy if exists unified_inbox_business_wide_boundary on public.crm_pipelines;
create policy unified_inbox_business_wide_boundary
on public.crm_pipelines
as restrictive
for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_unified_inbox_business_wide_member(organization_id));

drop policy if exists unified_inbox_business_wide_boundary on public.crm_pipeline_stages;
create policy unified_inbox_business_wide_boundary
on public.crm_pipeline_stages
as restrictive
for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_unified_inbox_business_wide_member(organization_id));

create or replace function public.create_crm_deal_from_lead(
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
as $$
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

  if not public.crm_deal_scope_can_manage(
       p_organization_id,
       p_owner_user_id,
       p_team_id
     )
     or not public.crm_deal_owner_team_valid(
       p_organization_id,
       p_owner_user_id,
       p_team_id
     )
  then
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
$$;

revoke all on function public.crm_scope_assignment_covers_team(uuid,uuid,uuid,text[])
  from public,anon,authenticated,service_role;
grant execute on function public.crm_scope_assignment_covers_team(uuid,uuid,uuid,text[])
  to authenticated,service_role;

revoke all on function public.crm_deal_owner_team_valid(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_deal_owner_team_valid(uuid,uuid,uuid)
  to authenticated,service_role;

revoke all on function public.crm_deal_scope_can_read(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_deal_scope_can_read(uuid,uuid)
  to authenticated;

revoke all on function public.crm_deal_scope_can_manage(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_deal_scope_can_manage(uuid,uuid,uuid)
  to authenticated;

revoke all on function public.guard_crm_pipeline_stage_live_policy()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_crm_deal_stage_move_forecast()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_crm_deal_owner_team_scope()
  from public,anon,authenticated,service_role;

comment on function public.crm_scope_assignment_covers_team(uuid,uuid,uuid,text[]) is
  'Narrow boolean IAM projection for generic CRM Deal Team scope. Constrained assignment attributes are intentionally not generalized.';
comment on function public.crm_deal_scope_can_read(uuid,uuid) is
  'Business-wide operators retain Organization access; scoped-only operators require an unqualified canonical scope assignment covering the Deal Team.';
