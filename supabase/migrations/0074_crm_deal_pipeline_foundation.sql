-- Smart Visions AI Business OS 2027
-- Phase 3 / CRM Deal + Pipeline Foundation
--
-- Commercial truth only. Existing Growth/Intent Opportunities remain
-- acquisition evidence and existing Lead/Conversation states remain unchanged.
-- No pipeline/deal rows are seeded by this migration.

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),
  is_default boolean not null default false,
  created_by_user_id uuid not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create unique index if not exists crm_pipelines_org_name_uidx
  on public.crm_pipelines(organization_id, lower(name));

create unique index if not exists crm_pipelines_one_active_default_uidx
  on public.crm_pipelines(organization_id)
  where is_default and status = 'ACTIVE';

create index if not exists crm_pipelines_org_created_by_fk_idx
  on public.crm_pipelines(organization_id, created_by_user_id);

create index if not exists crm_pipelines_org_status_idx
  on public.crm_pipelines(organization_id, status, created_at desc);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  position integer not null check (position >= 1),
  category text not null
    check (category in ('OPEN','WON','LOST')),
  is_active boolean not null default true,
  created_by_user_id uuid not null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, id, pipeline_id),
  unique (organization_id, pipeline_id, position),
  foreign key (organization_id, pipeline_id)
    references public.crm_pipelines(organization_id, id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create unique index if not exists crm_pipeline_stages_one_won_uidx
  on public.crm_pipeline_stages(organization_id, pipeline_id)
  where category = 'WON';

create unique index if not exists crm_pipeline_stages_one_lost_uidx
  on public.crm_pipeline_stages(organization_id, pipeline_id)
  where category = 'LOST';

create index if not exists crm_pipeline_stages_org_pipeline_active_idx
  on public.crm_pipeline_stages(organization_id, pipeline_id, is_active, position);

create index if not exists crm_pipeline_stages_org_created_by_fk_idx
  on public.crm_pipeline_stages(organization_id, created_by_user_id);

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null,
  lead_id uuid,
  pipeline_id uuid not null,
  stage_id uuid not null,

  title text not null check (length(trim(title)) between 1 and 240),
  state text not null default 'OPEN'
    check (state in ('OPEN','WON','LOST')),

  amount numeric(18,4)
    check (amount is null or amount >= 0),
  currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  expected_close_at timestamptz,

  owner_user_id uuid not null,
  lost_reason text
    check (lost_reason is null or length(lost_reason) <= 2000),
  won_at timestamptz,
  lost_at timestamptz,

  source_type text not null default 'MANUAL'
    check (source_type in ('MANUAL','LEAD','IMPORT','OTHER')),
  source_id text,
  request_key text not null
    check (length(trim(request_key)) between 1 and 200),

  creator_type text not null default 'USER'
    check (creator_type in ('USER','SYSTEM')),
  created_by_user_id uuid,
  version integer not null default 1 check (version >= 1),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, request_key),

  check (
    (amount is null and currency is null)
    or (amount is not null and currency is not null)
  ),
  check (
    (creator_type = 'USER' and created_by_user_id is not null)
    or (creator_type = 'SYSTEM' and created_by_user_id is null)
  ),
  check (
    (source_type = 'MANUAL' and source_id is null)
    or (source_type <> 'MANUAL' and nullif(trim(source_id), '') is not null)
  ),
  check (
    (state = 'OPEN' and won_at is null and lost_at is null and lost_reason is null)
    or (state = 'WON' and won_at is not null and lost_at is null and lost_reason is null)
    or (state = 'LOST' and lost_at is not null and won_at is null and nullif(trim(lost_reason), '') is not null)
  ),

  foreign key (organization_id, business_id)
    references public.businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, lead_id, business_id)
    references public.leads(organization_id, id, business_id)
    on delete restrict,
  foreign key (organization_id, pipeline_id)
    references public.crm_pipelines(organization_id, id)
    on delete restrict,
  foreign key (organization_id, stage_id, pipeline_id)
    references public.crm_pipeline_stages(organization_id, id, pipeline_id)
    on delete restrict,
  foreign key (organization_id, owner_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create index if not exists crm_deals_org_business_state_idx
  on public.crm_deals(organization_id, business_id, state, updated_at desc);

create index if not exists crm_deals_org_lead_state_idx
  on public.crm_deals(organization_id, lead_id, state, updated_at desc)
  where lead_id is not null;

create index if not exists crm_deals_org_pipeline_stage_idx
  on public.crm_deals(organization_id, pipeline_id, stage_id, state);

create index if not exists crm_deals_org_owner_state_close_idx
  on public.crm_deals(organization_id, owner_user_id, state, expected_close_at);

create index if not exists crm_deals_org_created_by_fk_idx
  on public.crm_deals(organization_id, created_by_user_id)
  where created_by_user_id is not null;

create index if not exists crm_deals_org_lead_business_fk_idx
  on public.crm_deals(organization_id, lead_id, business_id)
  where lead_id is not null;

create index if not exists crm_deals_org_stage_pipeline_fk_idx
  on public.crm_deals(organization_id, stage_id, pipeline_id);

create or replace function public.crm_pipeline_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $pipeline_manage$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER','ADMIN','SALES_MANAGER')
  );
$pipeline_manage$;

create or replace function public.crm_deal_can_manage(
  p_organization_id uuid,
  p_owner_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $deal_manage$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and (
        m.role in ('OWNER','ADMIN','SALES_MANAGER')
        or (m.role = 'SALES_AGENT' and p_owner_user_id = auth.uid())
      )
  );
$deal_manage$;

create or replace function public.guard_crm_pipeline_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $pipeline_guard$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or new.created_by_user_id is distinct from auth.uid() then
      raise exception 'CRM pipeline creator must match auth.uid()';
    end if;
    new.version := 1;
    new.updated_at := now();
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'CRM pipeline tenant/creator is immutable';
  end if;

  if old.status = 'ARCHIVED' and new.status <> 'ARCHIVED' then
    raise exception 'ARCHIVED CRM pipeline is terminal';
  end if;

  if old.status <> 'ARCHIVED' and new.status = 'ARCHIVED'
     and exists (
       select 1
       from public.crm_deals d
       where d.organization_id = old.organization_id
         and d.pipeline_id = old.id
         and d.state = 'OPEN'
     )
  then
    raise exception 'CRM pipeline with OPEN deals cannot be archived';
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$pipeline_guard$;

create or replace function public.guard_crm_pipeline_stage_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $pipeline_stage_guard$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or new.created_by_user_id is distinct from auth.uid() then
      raise exception 'CRM pipeline stage creator must match auth.uid()';
    end if;
    if not exists (
      select 1
      from public.crm_pipelines p
      where p.organization_id = new.organization_id
        and p.id = new.pipeline_id
        and p.status = 'ACTIVE'
    ) then
      raise exception 'CRM pipeline stage requires ACTIVE pipeline';
    end if;
    new.version := 1;
    new.updated_at := now();
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.pipeline_id is distinct from old.pipeline_id
     or new.category is distinct from old.category
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'CRM pipeline stage tenant/pipeline/category/creator is immutable';
  end if;

  if old.is_active and not new.is_active
     and exists (
       select 1
       from public.crm_deals d
       where d.organization_id = old.organization_id
         and d.stage_id = old.id
         and d.state = 'OPEN'
     )
  then
    raise exception 'CRM pipeline stage with OPEN deals cannot be deactivated';
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$pipeline_stage_guard$;

create or replace function public.guard_crm_deal_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $deal_guard$
declare
  v_actor uuid := auth.uid();
  v_stage_category text;
  v_stage_active boolean;
  v_pipeline_status text;
begin
  select s.category, s.is_active, p.status
    into v_stage_category, v_stage_active, v_pipeline_status
  from public.crm_pipeline_stages s
  join public.crm_pipelines p
    on p.organization_id = s.organization_id
   and p.id = s.pipeline_id
  where s.organization_id = new.organization_id
    and s.id = new.stage_id
    and s.pipeline_id = new.pipeline_id;

  if v_stage_category is null then
    raise exception 'CRM deal stage/pipeline not found';
  end if;
  if not v_stage_active or v_pipeline_status <> 'ACTIVE' then
    raise exception 'CRM deal requires ACTIVE pipeline and stage';
  end if;

  if tg_op = 'INSERT' then
    if new.creator_type = 'USER' then
      if v_actor is null or new.created_by_user_id is distinct from v_actor then
        raise exception 'CRM deal USER creator must match auth.uid()';
      end if;
    end if;

    if v_stage_category = 'OPEN' then
      new.state := 'OPEN';
      new.won_at := null;
      new.lost_at := null;
      new.lost_reason := null;
    elsif v_stage_category = 'WON' then
      new.state := 'WON';
      new.won_at := now();
      new.lost_at := null;
      new.lost_reason := null;
    else
      if nullif(trim(new.lost_reason), '') is null then
        raise exception 'CRM LOST deal requires lost_reason';
      end if;
      new.state := 'LOST';
      new.won_at := null;
      new.lost_at := now();
    end if;

    new.version := 1;
    new.updated_at := now();
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

  if old.state in ('WON','LOST') and new.stage_id is distinct from old.stage_id then
    raise exception 'terminal CRM deal stage is immutable';
  end if;

  if new.stage_id is distinct from old.stage_id then
    if v_stage_category = 'OPEN' then
      new.state := 'OPEN';
      new.won_at := null;
      new.lost_at := null;
      new.lost_reason := null;
    elsif v_stage_category = 'WON' then
      new.state := 'WON';
      new.won_at := now();
      new.lost_at := null;
      new.lost_reason := null;
    elsif v_stage_category = 'LOST' then
      if nullif(trim(new.lost_reason), '') is null then
        raise exception 'CRM LOST deal requires lost_reason';
      end if;
      new.state := 'LOST';
      new.won_at := null;
      new.lost_at := now();
    end if;
  else
    new.state := old.state;
    new.won_at := old.won_at;
    new.lost_at := old.lost_at;
    if old.state <> 'LOST' then
      new.lost_reason := null;
    end if;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$deal_guard$;

create or replace function public.audit_crm_commercial_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $commercial_audit$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_table_name = 'crm_pipelines' then
    v_action := case when tg_op='INSERT' then 'CRM_PIPELINE_CREATED' else 'CRM_PIPELINE_UPDATED' end;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'status', old.status, 'is_default', old.is_default, 'version', old.version
    ) else null end;
    v_after := jsonb_build_object(
      'status', new.status, 'is_default', new.is_default, 'version', new.version
    );
  elsif tg_table_name = 'crm_pipeline_stages' then
    v_action := case when tg_op='INSERT' then 'CRM_PIPELINE_STAGE_CREATED' else 'CRM_PIPELINE_STAGE_UPDATED' end;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'pipeline_id', old.pipeline_id, 'position', old.position,
      'category', old.category, 'is_active', old.is_active, 'version', old.version
    ) else null end;
    v_after := jsonb_build_object(
      'pipeline_id', new.pipeline_id, 'position', new.position,
      'category', new.category, 'is_active', new.is_active, 'version', new.version
    );
  else
    if tg_op='INSERT' then
      v_action := 'CRM_DEAL_CREATED';
      v_before := null;
    elsif new.stage_id is distinct from old.stage_id then
      v_action := 'CRM_DEAL_STAGE_CHANGED';
      v_before := jsonb_strip_nulls(jsonb_build_object(
        'stage_id', old.stage_id, 'state', old.state,
        'amount', old.amount, 'currency', old.currency,
        'owner_user_id', old.owner_user_id,
        'expected_close_at', old.expected_close_at,
        'version', old.version
      ));
    else
      v_action := 'CRM_DEAL_UPDATED';
      v_before := jsonb_strip_nulls(jsonb_build_object(
        'stage_id', old.stage_id, 'state', old.state,
        'amount', old.amount, 'currency', old.currency,
        'owner_user_id', old.owner_user_id,
        'expected_close_at', old.expected_close_at,
        'version', old.version
      ));
    end if;
    v_after := jsonb_strip_nulls(jsonb_build_object(
      'business_id', new.business_id,
      'lead_id', new.lead_id,
      'pipeline_id', new.pipeline_id,
      'stage_id', new.stage_id,
      'state', new.state,
      'amount', new.amount,
      'currency', new.currency,
      'owner_user_id', new.owner_user_id,
      'expected_close_at', new.expected_close_at,
      'source_type', new.source_type,
      'source_id', new.source_id,
      'version', new.version
    ));
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action,
    entity_type, entity_id, before_data, after_data, correlation_id
  ) values (
    new.organization_id,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text, current_user),
    v_action,
    tg_table_name,
    new.id::text,
    v_before,
    v_after,
    'dbtx:' || txid_current()::text
  );

  return new;
end;
$commercial_audit$;

drop trigger if exists crm_pipelines_guard_mutation on public.crm_pipelines;
create trigger crm_pipelines_guard_mutation
before insert or update on public.crm_pipelines
for each row execute function public.guard_crm_pipeline_mutation();

drop trigger if exists crm_pipeline_stages_guard_mutation on public.crm_pipeline_stages;
create trigger crm_pipeline_stages_guard_mutation
before insert or update on public.crm_pipeline_stages
for each row execute function public.guard_crm_pipeline_stage_mutation();

drop trigger if exists crm_deals_guard_mutation on public.crm_deals;
create trigger crm_deals_guard_mutation
before insert or update on public.crm_deals
for each row execute function public.guard_crm_deal_mutation();

drop trigger if exists crm_pipelines_audit_mutation on public.crm_pipelines;
create trigger crm_pipelines_audit_mutation
after insert or update on public.crm_pipelines
for each row execute function public.audit_crm_commercial_mutation();

drop trigger if exists crm_pipeline_stages_audit_mutation on public.crm_pipeline_stages;
create trigger crm_pipeline_stages_audit_mutation
after insert or update on public.crm_pipeline_stages
for each row execute function public.audit_crm_commercial_mutation();

drop trigger if exists crm_deals_audit_mutation on public.crm_deals;
create trigger crm_deals_audit_mutation
after insert or update on public.crm_deals
for each row execute function public.audit_crm_commercial_mutation();

alter table public.crm_pipelines enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_deals enable row level security;

create policy crm_pipelines_member_read
on public.crm_pipelines for select to authenticated
using (public.is_org_member(organization_id));

create policy crm_pipelines_manager_insert
on public.crm_pipelines for insert to authenticated
with check (
  public.crm_pipeline_can_manage(organization_id)
  and created_by_user_id = (select auth.uid())
);

create policy crm_pipelines_manager_update
on public.crm_pipelines for update to authenticated
using (public.crm_pipeline_can_manage(organization_id))
with check (public.crm_pipeline_can_manage(organization_id));

create policy crm_pipeline_stages_member_read
on public.crm_pipeline_stages for select to authenticated
using (public.is_org_member(organization_id));

create policy crm_pipeline_stages_manager_insert
on public.crm_pipeline_stages for insert to authenticated
with check (
  public.crm_pipeline_can_manage(organization_id)
  and created_by_user_id = (select auth.uid())
);

create policy crm_pipeline_stages_manager_update
on public.crm_pipeline_stages for update to authenticated
using (public.crm_pipeline_can_manage(organization_id))
with check (public.crm_pipeline_can_manage(organization_id));

create policy crm_deals_member_read
on public.crm_deals for select to authenticated
using (public.is_org_member(organization_id));

create policy crm_deals_manager_insert
on public.crm_deals for insert to authenticated
with check (
  creator_type = 'USER'
  and created_by_user_id = (select auth.uid())
  and source_type = 'MANUAL'
  and source_id is null
  and public.crm_deal_can_manage(organization_id, owner_user_id)
);

create policy crm_deals_manager_update
on public.crm_deals for update to authenticated
using (public.crm_deal_can_manage(organization_id, owner_user_id))
with check (public.crm_deal_can_manage(organization_id, owner_user_id));

create or replace function public.create_crm_pipeline_with_stages(
  p_organization_id uuid,
  p_name text,
  p_is_default boolean,
  p_stages jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $pipeline_create$
declare
  v_pipeline_id uuid;
  v_stage jsonb;
  v_category text;
  v_open_count integer;
  v_won_count integer;
  v_lost_count integer;
begin
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 160 then
    raise exception 'invalid CRM pipeline name';
  end if;

  if p_stages is null or jsonb_typeof(p_stages) <> 'array'
     or jsonb_array_length(p_stages) < 3
     or jsonb_array_length(p_stages) > 20
  then
    raise exception 'CRM pipeline requires between 3 and 20 stages';
  end if;

  select
    count(*) filter (where upper(value->>'category') = 'OPEN'),
    count(*) filter (where upper(value->>'category') = 'WON'),
    count(*) filter (where upper(value->>'category') = 'LOST')
  into v_open_count, v_won_count, v_lost_count
  from jsonb_array_elements(p_stages);

  if v_open_count < 1 or v_won_count <> 1 or v_lost_count <> 1 then
    raise exception 'CRM pipeline requires OPEN stage(s), exactly one WON stage and exactly one LOST stage';
  end if;

  insert into public.crm_pipelines(
    organization_id, name, status, is_default, created_by_user_id
  ) values (
    p_organization_id, trim(p_name), 'ACTIVE', coalesce(p_is_default,false), auth.uid()
  )
  returning id into v_pipeline_id;

  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    v_category := upper(coalesce(v_stage->>'category',''));
    if v_category not in ('OPEN','WON','LOST') then
      raise exception 'invalid CRM pipeline stage category';
    end if;

    insert into public.crm_pipeline_stages(
      organization_id, pipeline_id, name, position, category,
      is_active, created_by_user_id
    ) values (
      p_organization_id,
      v_pipeline_id,
      trim(coalesce(v_stage->>'name','')),
      (v_stage->>'position')::integer,
      v_category,
      true,
      auth.uid()
    );
  end loop;

  return v_pipeline_id;
end;
$pipeline_create$;

create or replace view public.crm_deal_stage_history
with (security_invoker = true)
as
select
  a.organization_id,
  a.entity_id::uuid as deal_id,
  nullif(a.before_data->>'stage_id','')::uuid as from_stage_id,
  nullif(a.after_data->>'stage_id','')::uuid as to_stage_id,
  a.before_data->>'state' as from_state,
  a.after_data->>'state' as to_state,
  a.actor_type,
  a.actor_id,
  a.correlation_id,
  a.created_at as occurred_at
from public.audit_logs a
where a.entity_type = 'crm_deals'
  and a.action in ('CRM_DEAL_CREATED','CRM_DEAL_STAGE_CHANGED');

create or replace function public.get_crm_deals(
  p_organization_id uuid,
  p_pipeline_id uuid default null,
  p_business_id uuid default null,
  p_owner_user_id uuid default null,
  p_state text default null,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns setof public.crm_deals
language sql
stable
security invoker
set search_path = public, pg_catalog
as $deal_query$
  select d.*
  from public.crm_deals d
  where d.organization_id = p_organization_id
    and (p_pipeline_id is null or d.pipeline_id = p_pipeline_id)
    and (p_business_id is null or d.business_id = p_business_id)
    and (p_owner_user_id is null or d.owner_user_id = p_owner_user_id)
    and (p_state is null or d.state = p_state)
    and (
      p_before_updated_at is null
      or d.updated_at < p_before_updated_at
      or (
        d.updated_at = p_before_updated_at
        and p_before_id is not null
        and d.id < p_before_id
      )
    )
  order by d.updated_at desc, d.id desc
  limit least(greatest(coalesce(p_limit,50),1),101);
$deal_query$;

revoke all on public.crm_pipelines from public, anon, authenticated, service_role;
revoke all on public.crm_pipeline_stages from public, anon, authenticated, service_role;
revoke all on public.crm_deals from public, anon, authenticated, service_role;
revoke all on public.crm_deal_stage_history from public, anon, authenticated, service_role;

grant select, insert, update on public.crm_pipelines to authenticated;
grant select, insert, update on public.crm_pipeline_stages to authenticated;
grant select, insert, update on public.crm_deals to authenticated;
grant select on public.crm_deal_stage_history to authenticated;

revoke all on function public.crm_pipeline_can_manage(uuid)
  from public, anon, service_role;
grant execute on function public.crm_pipeline_can_manage(uuid) to authenticated;

revoke all on function public.crm_deal_can_manage(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.crm_deal_can_manage(uuid, uuid) to authenticated;

revoke all on function public.create_crm_pipeline_with_stages(
  uuid, text, boolean, jsonb
) from public, anon, service_role;
grant execute on function public.create_crm_pipeline_with_stages(
  uuid, text, boolean, jsonb
) to authenticated;

revoke all on function public.get_crm_deals(
  uuid, uuid, uuid, uuid, text, integer, timestamptz, uuid
) from public, anon, service_role;
grant execute on function public.get_crm_deals(
  uuid, uuid, uuid, uuid, text, integer, timestamptz, uuid
) to authenticated;

revoke all on function public.guard_crm_pipeline_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_crm_pipeline_stage_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_crm_deal_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_crm_commercial_mutation()
  from public, anon, authenticated, service_role;
