-- Smart Visions AI Business OS 2027
-- Control Plane Foundation
--
-- Additive only:
-- - keeps organizations as the canonical tenant root;
-- - keeps public.businesses as the existing CRM/Hunter business table;
-- - introduces tenant_businesses for the tenant-owned Business hierarchy;
-- - does not alter outbound/runtime safety behavior;
-- - does not create provider side effects.

-- ---------------------------------------------------------------------------
-- Organization -> Brand -> Business -> Branch -> Department -> Team
-- ---------------------------------------------------------------------------

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, slug)
);

create table if not exists public.tenant_businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  legal_name text,
  country_code text,
  timezone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (brand_id, slug),
  foreign key (organization_id, brand_id)
    references public.brands(organization_id, id)
    on delete restrict
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  code text not null check (length(trim(code)) > 0),
  country_code text,
  timezone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (tenant_business_id, code),
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  code text not null check (length(trim(code)) > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (branch_id, code),
  foreign key (organization_id, branch_id)
    references public.branches(organization_id, id)
    on delete restrict
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  code text not null check (length(trim(code)) > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (department_id, code),
  foreign key (organization_id, department_id)
    references public.departments(organization_id, id)
    on delete restrict
);

create index if not exists brands_org_status_idx
  on public.brands(organization_id, status);
create index if not exists tenant_businesses_org_brand_status_idx
  on public.tenant_businesses(organization_id, brand_id, status);
create index if not exists branches_org_business_status_idx
  on public.branches(organization_id, tenant_business_id, status);
create index if not exists departments_org_branch_status_idx
  on public.departments(organization_id, branch_id, status);
create index if not exists teams_org_department_status_idx
  on public.teams(organization_id, department_id, status);

-- ---------------------------------------------------------------------------
-- IAM: preserve organization_members as organization-level RBAC source of truth.
-- Lower-scope assignments only extend the existing membership.
-- ---------------------------------------------------------------------------

create table if not exists public.member_scope_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  scope_type text not null check (scope_type in ('BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM')),
  role text not null check (role in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')),
  brand_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  department_id uuid,
  team_id uuid,
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade,
  foreign key (organization_id, brand_id)
    references public.brands(organization_id, id)
    on delete cascade,
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete cascade,
  foreign key (organization_id, branch_id)
    references public.branches(organization_id, id)
    on delete cascade,
  foreign key (organization_id, department_id)
    references public.departments(organization_id, id)
    on delete cascade,
  foreign key (organization_id, team_id)
    references public.teams(organization_id, id)
    on delete cascade,
  constraint member_scope_assignments_shape check (
    (scope_type = 'BRAND'
      and brand_id is not null
      and tenant_business_id is null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BUSINESS'
      and brand_id is null
      and tenant_business_id is not null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BRANCH'
      and brand_id is null and tenant_business_id is null
      and branch_id is not null and department_id is null and team_id is null)
    or
    (scope_type = 'DEPARTMENT'
      and brand_id is null and tenant_business_id is null and branch_id is null
      and department_id is not null and team_id is null)
    or
    (scope_type = 'TEAM'
      and brand_id is null and tenant_business_id is null and branch_id is null and department_id is null
      and team_id is not null)
  )
);

create unique index if not exists member_scope_assignments_brand_unique
  on public.member_scope_assignments(organization_id, user_id, brand_id)
  where scope_type = 'BRAND';
create unique index if not exists member_scope_assignments_business_unique
  on public.member_scope_assignments(organization_id, user_id, tenant_business_id)
  where scope_type = 'BUSINESS';
create unique index if not exists member_scope_assignments_branch_unique
  on public.member_scope_assignments(organization_id, user_id, branch_id)
  where scope_type = 'BRANCH';
create unique index if not exists member_scope_assignments_department_unique
  on public.member_scope_assignments(organization_id, user_id, department_id)
  where scope_type = 'DEPARTMENT';
create unique index if not exists member_scope_assignments_team_unique
  on public.member_scope_assignments(organization_id, user_id, team_id)
  where scope_type = 'TEAM';

create index if not exists member_scope_assignments_user_idx
  on public.member_scope_assignments(organization_id, user_id, scope_type);

-- ---------------------------------------------------------------------------
-- Configuration inheritance and feature-flag overrides.
-- Existing organization_settings.config remains the legacy organization base.
-- Safety controls are deliberately not moved into these tables.
-- ---------------------------------------------------------------------------

create table if not exists public.scope_configuration_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope_type text not null check (scope_type in ('ORGANIZATION','BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM')),
  brand_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  department_id uuid,
  team_id uuid,
  namespace text not null default 'default' check (length(trim(namespace)) > 0),
  config_key text not null
    check (length(trim(config_key)) > 0)
    check (lower(config_key) not in (
      'shadow_mode',
      'global_kill_switch',
      'email_paused',
      'whatsapp_ai_paused',
      'agents_paused'
    )),
  config_value jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, brand_id)
    references public.brands(organization_id, id)
    on delete cascade,
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete cascade,
  foreign key (organization_id, branch_id)
    references public.branches(organization_id, id)
    on delete cascade,
  foreign key (organization_id, department_id)
    references public.departments(organization_id, id)
    on delete cascade,
  foreign key (organization_id, team_id)
    references public.teams(organization_id, id)
    on delete cascade,
  constraint scope_configuration_overrides_shape check (
    (scope_type = 'ORGANIZATION'
      and brand_id is null and tenant_business_id is null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BRAND'
      and brand_id is not null
      and tenant_business_id is null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BUSINESS'
      and brand_id is null
      and tenant_business_id is not null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BRANCH'
      and brand_id is null and tenant_business_id is null
      and branch_id is not null and department_id is null and team_id is null)
    or
    (scope_type = 'DEPARTMENT'
      and brand_id is null and tenant_business_id is null and branch_id is null
      and department_id is not null and team_id is null)
    or
    (scope_type = 'TEAM'
      and brand_id is null and tenant_business_id is null and branch_id is null and department_id is null
      and team_id is not null)
  )
);

create unique index if not exists scope_config_org_unique
  on public.scope_configuration_overrides(organization_id, namespace, config_key)
  where scope_type = 'ORGANIZATION';
create unique index if not exists scope_config_brand_unique
  on public.scope_configuration_overrides(organization_id, brand_id, namespace, config_key)
  where scope_type = 'BRAND';
create unique index if not exists scope_config_business_unique
  on public.scope_configuration_overrides(organization_id, tenant_business_id, namespace, config_key)
  where scope_type = 'BUSINESS';
create unique index if not exists scope_config_branch_unique
  on public.scope_configuration_overrides(organization_id, branch_id, namespace, config_key)
  where scope_type = 'BRANCH';
create unique index if not exists scope_config_department_unique
  on public.scope_configuration_overrides(organization_id, department_id, namespace, config_key)
  where scope_type = 'DEPARTMENT';
create unique index if not exists scope_config_team_unique
  on public.scope_configuration_overrides(organization_id, team_id, namespace, config_key)
  where scope_type = 'TEAM';

create table if not exists public.feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope_type text not null check (scope_type in ('ORGANIZATION','BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM')),
  brand_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  department_id uuid,
  team_id uuid,
  flag_key text not null
    check (length(trim(flag_key)) > 0)
    check (lower(flag_key) not in (
      'shadow_mode',
      'global_kill_switch',
      'email_paused',
      'whatsapp_ai_paused',
      'agents_paused'
    )),
  enabled boolean not null,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, brand_id)
    references public.brands(organization_id, id)
    on delete cascade,
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete cascade,
  foreign key (organization_id, branch_id)
    references public.branches(organization_id, id)
    on delete cascade,
  foreign key (organization_id, department_id)
    references public.departments(organization_id, id)
    on delete cascade,
  foreign key (organization_id, team_id)
    references public.teams(organization_id, id)
    on delete cascade,
  constraint feature_flag_overrides_shape check (
    (scope_type = 'ORGANIZATION'
      and brand_id is null and tenant_business_id is null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BRAND'
      and brand_id is not null
      and tenant_business_id is null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BUSINESS'
      and brand_id is null
      and tenant_business_id is not null and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type = 'BRANCH'
      and brand_id is null and tenant_business_id is null
      and branch_id is not null and department_id is null and team_id is null)
    or
    (scope_type = 'DEPARTMENT'
      and brand_id is null and tenant_business_id is null and branch_id is null
      and department_id is not null and team_id is null)
    or
    (scope_type = 'TEAM'
      and brand_id is null and tenant_business_id is null and branch_id is null and department_id is null
      and team_id is not null)
  )
);

create unique index if not exists feature_flag_org_unique
  on public.feature_flag_overrides(organization_id, flag_key)
  where scope_type = 'ORGANIZATION';
create unique index if not exists feature_flag_brand_unique
  on public.feature_flag_overrides(organization_id, brand_id, flag_key)
  where scope_type = 'BRAND';
create unique index if not exists feature_flag_business_unique
  on public.feature_flag_overrides(organization_id, tenant_business_id, flag_key)
  where scope_type = 'BUSINESS';
create unique index if not exists feature_flag_branch_unique
  on public.feature_flag_overrides(organization_id, branch_id, flag_key)
  where scope_type = 'BRANCH';
create unique index if not exists feature_flag_department_unique
  on public.feature_flag_overrides(organization_id, department_id, flag_key)
  where scope_type = 'DEPARTMENT';
create unique index if not exists feature_flag_team_unique
  on public.feature_flag_overrides(organization_id, team_id, flag_key)
  where scope_type = 'TEAM';

-- ---------------------------------------------------------------------------
-- SaaS plan, immutable pricing-version, subscription, and entitlement contract.
-- Existing service_prices remains the agency/service catalog and is not replaced.
-- ---------------------------------------------------------------------------

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_]{0,62}$'),
  name text not null check (length(trim(name)) > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','RETIRED')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','RETIRED')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_period text not null check (billing_period in ('MONTHLY','ANNUAL')),
  recurring_amount numeric(14,3) not null default 0 check (recurring_amount >= 0),
  setup_fee_amount numeric(14,3) not null default 0 check (setup_fee_amount >= 0),
  ai_cost_multiplier numeric(10,4) not null default 4 check (ai_cost_multiplier = 4),
  included_units jsonb not null default '{}'::jsonb,
  unit_prices jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, currency, billing_period, version),
  constraint pricing_versions_effective_window check (
    effective_to is null or effective_from is null or effective_to > effective_from
  )
);

create unique index if not exists pricing_versions_one_active_per_lane
  on public.pricing_versions(plan_id, currency, billing_period)
  where status = 'ACTIVE';

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  pricing_version_id uuid not null references public.pricing_versions(id) on delete cascade,
  feature_key text not null check (length(trim(feature_key)) > 0),
  entitlement_value jsonb not null,
  created_at timestamptz not null default now(),
  unique (pricing_version_id, feature_key)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pricing_version_id uuid not null references public.pricing_versions(id) on delete restrict,
  status text not null check (status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELED','EXPIRED')),
  provider text,
  provider_subscription_id text,
  started_at timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  lock_version integer not null default 1 check (lock_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_window check (
    current_period_end is null or current_period_start is null or current_period_end > current_period_start
  )
);

create unique index if not exists subscriptions_provider_id_unique
  on public.subscriptions(provider, provider_subscription_id)
  where provider is not null and provider_subscription_id is not null;
create index if not exists subscriptions_org_status_idx
  on public.subscriptions(organization_id, status, created_at desc);

create unique index if not exists subscriptions_one_live_per_org
  on public.subscriptions(organization_id)
  where status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED');

create table if not exists public.organization_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null check (length(trim(feature_key)) > 0),
  entitlement_value jsonb not null,
  source_type text not null check (source_type in ('ADDON','PROMOTIONAL','MANUAL','MIGRATION')),
  source_id text,
  reason text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_entitlement_overrides_window check (
    valid_to is null or valid_to > valid_from
  )
);

create unique index if not exists organization_entitlement_one_open_override
  on public.organization_entitlement_overrides(organization_id, feature_key)
  where valid_to is null;

create or replace function public.enforce_catalog_state_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'DRAFT' and new.status = 'ACTIVE' then
    return new;
  end if;

  if old.status = 'ACTIVE' and new.status = 'RETIRED' then
    return new;
  end if;

  raise exception 'invalid catalog state transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists plans_state_transition_guard on public.plans;
create trigger plans_state_transition_guard
before update of status on public.plans
for each row execute function public.enforce_catalog_state_transition();

drop trigger if exists pricing_versions_state_transition_guard on public.pricing_versions;
create trigger pricing_versions_state_transition_guard
before update of status on public.pricing_versions
for each row execute function public.enforce_catalog_state_transition();

create or replace function public.enforce_pricing_version_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('ACTIVE','RETIRED') and (
    new.plan_id is distinct from old.plan_id
    or new.version is distinct from old.version
    or new.currency is distinct from old.currency
    or new.billing_period is distinct from old.billing_period
    or new.recurring_amount is distinct from old.recurring_amount
    or new.setup_fee_amount is distinct from old.setup_fee_amount
    or new.ai_cost_multiplier is distinct from old.ai_cost_multiplier
    or new.included_units is distinct from old.included_units
    or new.unit_prices is distinct from old.unit_prices
    or new.effective_from is distinct from old.effective_from
    or (
      new.effective_to is distinct from old.effective_to
      and not (
        old.status = 'ACTIVE'
        and new.status = 'RETIRED'
        and old.effective_to is null
        and new.effective_to is not null
      )
    )
    or new.metadata is distinct from old.metadata
  ) then
    raise exception 'published pricing version commercial fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists pricing_versions_immutability_guard on public.pricing_versions;
create trigger pricing_versions_immutability_guard
before update on public.pricing_versions
for each row execute function public.enforce_pricing_version_immutability();

create or replace function public.enforce_plan_entitlement_draft_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pricing_version_id uuid;
begin
  v_pricing_version_id := case when tg_op = 'DELETE' then old.pricing_version_id else new.pricing_version_id end;

  if not exists (
    select 1
    from public.pricing_versions pv
    where pv.id = v_pricing_version_id
      and pv.status = 'DRAFT'
  ) then
    raise exception 'plan entitlements are mutable only while pricing version is DRAFT';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists plan_entitlements_draft_guard on public.plan_entitlements;
create trigger plan_entitlements_draft_guard
before insert or update or delete on public.plan_entitlements
for each row execute function public.enforce_plan_entitlement_draft_only();

create or replace function public.enforce_subscription_state_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'TRIAL' and new.status = 'ACTIVE' then return new; end if;
  if old.status = 'ACTIVE' and new.status = 'PAST_DUE' then return new; end if;
  if old.status = 'PAST_DUE' and new.status in ('ACTIVE','GRACE_PERIOD') then return new; end if;
  if old.status = 'GRACE_PERIOD' and new.status = 'SUSPENDED' then return new; end if;
  if old.status = 'SUSPENDED' and new.status in ('CANCELED','EXPIRED') then return new; end if;

  raise exception 'invalid subscription state transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists subscriptions_state_transition_guard on public.subscriptions;
create trigger subscriptions_state_transition_guard
before update of status on public.subscriptions
for each row execute function public.enforce_subscription_state_transition();

create or replace function public.enforce_subscription_pricing_version()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.pricing_versions pv
    join public.plans p on p.id = pv.plan_id
    where pv.id = new.pricing_version_id
      and pv.status = 'ACTIVE'
      and p.status = 'ACTIVE'
  ) then
    raise exception 'subscription requires an ACTIVE pricing version on an ACTIVE plan';
  end if;

  return new;
end;
$$;

drop trigger if exists subscriptions_pricing_version_guard on public.subscriptions;
create trigger subscriptions_pricing_version_guard
before insert or update of pricing_version_id on public.subscriptions
for each row execute function public.enforce_subscription_pricing_version();

-- ---------------------------------------------------------------------------
-- Extend canonical usage and audit primitives instead of creating replacements.
-- ---------------------------------------------------------------------------

alter table public.usage_events
  add column if not exists usage_classification text not null default 'INTERNAL';

alter table public.usage_events
  drop constraint if exists usage_events_usage_classification_check;

alter table public.usage_events
  add constraint usage_events_usage_classification_check
  check (usage_classification in (
    'BILLABLE',
    'NON_BILLABLE',
    'SYSTEM_RETRY',
    'CACHED',
    'PROMOTIONAL',
    'INTERNAL'
  ));

create index if not exists usage_events_org_class_created_idx
  on public.usage_events(organization_id, usage_classification, created_at desc);

-- Preserve the existing authenticated append capability without allowing a
-- tenant client to self-classify customer-billing usage. Omitted classification
-- receives the fail-closed INTERNAL default. Backend service_role may classify
-- evidence after trusted runtime reconciliation.
revoke insert on table public.usage_events from authenticated;
grant insert (
  id,
  organization_id,
  provider,
  operation,
  cost_usd,
  input_tokens,
  output_tokens,
  units,
  lead_id,
  metadata,
  created_at
) on table public.usage_events to authenticated;

grant update (usage_classification)
  on table public.usage_events to service_role;

create or replace function public.classify_usage_event(
  p_organization_id uuid,
  p_event_id uuid,
  p_usage_classification text,
  p_reason text default null,
  p_correlation_id text default null,
  p_causation_id text default null,
  p_actor_id text default 'billing-runtime'
)
returns table(
  usage_event_id uuid,
  previous_classification text,
  current_classification text,
  changed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_previous text;
begin
  if p_usage_classification not in (
    'BILLABLE',
    'NON_BILLABLE',
    'SYSTEM_RETRY',
    'CACHED',
    'PROMOTIONAL',
    'INTERNAL'
  ) then
    raise exception 'invalid usage classification';
  end if;

  select ue.usage_classification
    into v_previous
    from public.usage_events ue
   where ue.id = p_event_id
     and ue.organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'usage event not found for organization';
  end if;

  if v_previous = p_usage_classification then
    return query select p_event_id, v_previous, p_usage_classification, false;
    return;
  end if;

  update public.usage_events
     set usage_classification = p_usage_classification
   where id = p_event_id
     and organization_id = p_organization_id;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    correlation_id,
    causation_id
  ) values (
    p_organization_id,
    'SYSTEM',
    coalesce(nullif(p_actor_id, ''), 'billing-runtime'),
    'USAGE_CLASSIFICATION_CHANGED',
    'usage_event',
    p_event_id::text,
    jsonb_build_object('usage_classification', v_previous),
    jsonb_build_object(
      'usage_classification', p_usage_classification,
      'reason', p_reason
    ),
    coalesce(nullif(trim(p_correlation_id), ''), 'dbtx:' || txid_current()::text),
    nullif(trim(p_causation_id), '')
  );

  return query select p_event_id, v_previous, p_usage_classification, true;
end;
$$;

revoke all on function public.classify_usage_event(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.classify_usage_event(uuid, uuid, text, text, text, text, text)
  to service_role;

alter table public.audit_logs
  add column if not exists correlation_id text,
  add column if not exists causation_id text,
  add column if not exists brand_id uuid,
  add column if not exists tenant_business_id uuid,
  add column if not exists branch_id uuid,
  add column if not exists department_id uuid,
  add column if not exists team_id uuid;

alter table public.audit_logs
  add constraint audit_logs_brand_scope_fk
    foreign key (organization_id, brand_id)
    references public.brands(organization_id, id),
  add constraint audit_logs_business_scope_fk
    foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id),
  add constraint audit_logs_branch_scope_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id),
  add constraint audit_logs_department_scope_fk
    foreign key (organization_id, department_id)
    references public.departments(organization_id, id),
  add constraint audit_logs_team_scope_fk
    foreign key (organization_id, team_id)
    references public.teams(organization_id, id);

create index if not exists audit_logs_correlation_idx
  on public.audit_logs(organization_id, correlation_id, created_at desc)
  where correlation_id is not null;

create or replace function public.audit_control_plane_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_org_id uuid;
  v_entity_id text;
  v_brand_id uuid;
  v_tenant_business_id uuid;
  v_branch_id uuid;
  v_department_id uuid;
  v_team_id uuid;
  v_actor uuid;
  v_correlation_id text;
begin
  v_before := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_after := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_row := coalesce(v_after, v_before);
  v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;
  v_entity_id := v_row ->> 'id';
  v_actor := auth.uid();
  v_correlation_id := 'dbtx:' || txid_current()::text;

  v_brand_id := case
    when tg_table_name = 'brands' then nullif(v_entity_id, '')::uuid
    else nullif(v_row ->> 'brand_id', '')::uuid
  end;
  v_tenant_business_id := case
    when tg_table_name = 'tenant_businesses' then nullif(v_entity_id, '')::uuid
    else nullif(v_row ->> 'tenant_business_id', '')::uuid
  end;
  v_branch_id := case
    when tg_table_name = 'branches' then nullif(v_entity_id, '')::uuid
    else nullif(v_row ->> 'branch_id', '')::uuid
  end;
  v_department_id := case
    when tg_table_name = 'departments' then nullif(v_entity_id, '')::uuid
    else nullif(v_row ->> 'department_id', '')::uuid
  end;
  v_team_id := case
    when tg_table_name = 'teams' then nullif(v_entity_id, '')::uuid
    else nullif(v_row ->> 'team_id', '')::uuid
  end;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    brand_id,
    tenant_business_id,
    branch_id,
    department_id,
    team_id,
    correlation_id
  ) values (
    v_org_id,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text, current_user),
    'CONTROL_PLANE_' || tg_op,
    tg_table_name,
    v_entity_id,
    v_before,
    v_after,
    v_brand_id,
    v_tenant_business_id,
    v_branch_id,
    v_department_id,
    v_team_id,
    v_correlation_id
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_control_plane_mutation()
  from public, anon, authenticated;

drop trigger if exists brands_audit_mutation on public.brands;
create trigger brands_audit_mutation
after insert or update on public.brands
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists tenant_businesses_audit_mutation on public.tenant_businesses;
create trigger tenant_businesses_audit_mutation
after insert or update on public.tenant_businesses
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists branches_audit_mutation on public.branches;
create trigger branches_audit_mutation
after insert or update on public.branches
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists departments_audit_mutation on public.departments;
create trigger departments_audit_mutation
after insert or update on public.departments
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists teams_audit_mutation on public.teams;
create trigger teams_audit_mutation
after insert or update on public.teams
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists member_scope_assignments_audit_mutation on public.member_scope_assignments;
create trigger member_scope_assignments_audit_mutation
after insert or update or delete on public.member_scope_assignments
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists scope_configuration_overrides_audit_mutation on public.scope_configuration_overrides;
create trigger scope_configuration_overrides_audit_mutation
after insert or update or delete on public.scope_configuration_overrides
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists feature_flag_overrides_audit_mutation on public.feature_flag_overrides;
create trigger feature_flag_overrides_audit_mutation
after insert or update or delete on public.feature_flag_overrides
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists subscriptions_audit_mutation on public.subscriptions;
create trigger subscriptions_audit_mutation
after insert or update or delete on public.subscriptions
for each row execute function public.audit_control_plane_mutation();

drop trigger if exists organization_entitlement_overrides_audit_mutation on public.organization_entitlement_overrides;
create trigger organization_entitlement_overrides_audit_mutation
after insert or update or delete on public.organization_entitlement_overrides
for each row execute function public.audit_control_plane_mutation();

-- ---------------------------------------------------------------------------
-- RLS and least privilege.
-- Existing is_org_member/is_org_owner remain the canonical tenant guards.
-- ---------------------------------------------------------------------------

alter table public.brands enable row level security;
alter table public.tenant_businesses enable row level security;
alter table public.branches enable row level security;
alter table public.departments enable row level security;
alter table public.teams enable row level security;
alter table public.member_scope_assignments enable row level security;
alter table public.scope_configuration_overrides enable row level security;
alter table public.feature_flag_overrides enable row level security;
alter table public.plans enable row level security;
alter table public.pricing_versions enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.organization_entitlement_overrides enable row level security;

create policy brands_member_read on public.brands
  for select to authenticated using (public.is_org_member(organization_id));
create policy brands_owner_insert on public.brands
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy brands_owner_update on public.brands
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy tenant_businesses_member_read on public.tenant_businesses
  for select to authenticated using (public.is_org_member(organization_id));
create policy tenant_businesses_owner_insert on public.tenant_businesses
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy tenant_businesses_owner_update on public.tenant_businesses
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy branches_member_read on public.branches
  for select to authenticated using (public.is_org_member(organization_id));
create policy branches_owner_insert on public.branches
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy branches_owner_update on public.branches
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy departments_member_read on public.departments
  for select to authenticated using (public.is_org_member(organization_id));
create policy departments_owner_insert on public.departments
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy departments_owner_update on public.departments
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy teams_member_read on public.teams
  for select to authenticated using (public.is_org_member(organization_id));
create policy teams_owner_insert on public.teams
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy teams_owner_update on public.teams
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy member_scope_assignments_member_read on public.member_scope_assignments
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.is_org_owner(organization_id)
  );
create policy member_scope_assignments_owner_insert on public.member_scope_assignments
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy member_scope_assignments_owner_update on public.member_scope_assignments
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));
create policy member_scope_assignments_owner_delete on public.member_scope_assignments
  for delete to authenticated using (public.is_org_owner(organization_id));

create policy scope_configuration_overrides_member_read on public.scope_configuration_overrides
  for select to authenticated using (public.is_org_member(organization_id));
create policy scope_configuration_overrides_owner_insert on public.scope_configuration_overrides
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy scope_configuration_overrides_owner_update on public.scope_configuration_overrides
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));
create policy scope_configuration_overrides_owner_delete on public.scope_configuration_overrides
  for delete to authenticated using (public.is_org_owner(organization_id));

create policy feature_flag_overrides_member_read on public.feature_flag_overrides
  for select to authenticated using (public.is_org_member(organization_id));
create policy feature_flag_overrides_owner_insert on public.feature_flag_overrides
  for insert to authenticated with check (public.is_org_owner(organization_id));
create policy feature_flag_overrides_owner_update on public.feature_flag_overrides
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));
create policy feature_flag_overrides_owner_delete on public.feature_flag_overrides
  for delete to authenticated using (public.is_org_owner(organization_id));

create policy plans_authenticated_read on public.plans
  for select to authenticated using (status in ('ACTIVE','RETIRED'));
create policy pricing_versions_authenticated_read on public.pricing_versions
  for select to authenticated using (status in ('ACTIVE','RETIRED'));
create policy plan_entitlements_authenticated_read on public.plan_entitlements
  for select to authenticated using (
    exists (
      select 1
      from public.pricing_versions pv
      where pv.id = pricing_version_id
        and pv.status in ('ACTIVE','RETIRED')
    )
  );

create policy subscriptions_member_read on public.subscriptions
  for select to authenticated using (public.is_org_member(organization_id));
create policy organization_entitlement_overrides_member_read on public.organization_entitlement_overrides
  for select to authenticated using (public.is_org_member(organization_id));

revoke all on public.brands,
  public.tenant_businesses,
  public.branches,
  public.departments,
  public.teams,
  public.member_scope_assignments,
  public.scope_configuration_overrides,
  public.feature_flag_overrides,
  public.plans,
  public.pricing_versions,
  public.plan_entitlements,
  public.subscriptions,
  public.organization_entitlement_overrides
from anon;

revoke all on public.brands,
  public.tenant_businesses,
  public.branches,
  public.departments,
  public.teams,
  public.member_scope_assignments,
  public.scope_configuration_overrides,
  public.feature_flag_overrides,
  public.plans,
  public.pricing_versions,
  public.plan_entitlements,
  public.subscriptions,
  public.organization_entitlement_overrides
from authenticated;

grant select, insert, update on public.brands,
  public.tenant_businesses,
  public.branches,
  public.departments,
  public.teams
to authenticated;

grant select, insert, update, delete on public.member_scope_assignments,
  public.scope_configuration_overrides,
  public.feature_flag_overrides
to authenticated;

grant select on public.plans,
  public.pricing_versions,
  public.plan_entitlements,
  public.subscriptions,
  public.organization_entitlement_overrides
to authenticated;

-- Runtime service access is deliberately narrower than database-owner access.
-- Catalog authoring stays migration-managed until a platform-audit command path exists.
-- Hierarchy/subscription lifecycle uses state changes instead of hard deletes.
revoke all on public.brands,
  public.tenant_businesses,
  public.branches,
  public.departments,
  public.teams,
  public.member_scope_assignments,
  public.scope_configuration_overrides,
  public.feature_flag_overrides,
  public.plans,
  public.pricing_versions,
  public.plan_entitlements,
  public.subscriptions,
  public.organization_entitlement_overrides
from service_role;

grant select, insert, update on public.brands,
  public.tenant_businesses,
  public.branches,
  public.departments,
  public.teams,
  public.subscriptions,
  public.organization_entitlement_overrides
to service_role;

grant select, insert, update, delete on public.member_scope_assignments,
  public.scope_configuration_overrides,
  public.feature_flag_overrides
to service_role;

grant select on public.plans,
  public.pricing_versions,
  public.plan_entitlements
to service_role;

revoke all on function public.enforce_catalog_state_transition() from public, anon, authenticated;
revoke all on function public.enforce_subscription_state_transition() from public, anon, authenticated;
revoke all on function public.enforce_subscription_pricing_version() from public, anon, authenticated;
revoke all on function public.enforce_pricing_version_immutability() from public, anon, authenticated;
revoke all on function public.enforce_plan_entitlement_draft_only() from public, anon, authenticated;

-- Explicitly preserve customer-billing fail-closed behavior for all historical
-- and currently unclassified usage. Cost Guard still sees cost_usd unchanged.
update public.usage_events
set usage_classification = 'INTERNAL'
where usage_classification is null;
