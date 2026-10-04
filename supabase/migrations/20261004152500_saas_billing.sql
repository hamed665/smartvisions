-- SAAS-BILLING
--
-- Canonical Smart Visions platform-billing ledger for tenant subscriptions.
-- This is intentionally distinct from tenant-facing INVOICE-ENGINE/PAYMENT-CORE:
-- those domains represent a tenant billing its own customers.
--
-- Source authorities reused:
--   plans / pricing_versions / subscriptions
--   plan_entitlements / organization_entitlement_overrides
--   organization_members / communication_channel_bindings
--   usage_events + usage_classification
--   audit_logs
--
-- No external payment collection is performed here. Provider collection remains
-- configuration/evidence gated and must never be inferred from a billing row.

create table public.saas_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tax_bps integer not null default 0 check (tax_bps between 0 and 10000),
  tax_label text,
  tax_source text,
  provider_cost_usd_to_currency_rate numeric(18,8) not null default 1
    check (provider_cost_usd_to_currency_rate > 0),
  rate_source text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  request_key text not null check (request_key ~ '^[A-Za-z0-9._:-]{3,180}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{32}$'),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,request_key),
  unique (organization_id,id),
  constraint saas_billing_profiles_window check (
    valid_to is null or valid_to > valid_from
  ),
  constraint saas_billing_profiles_tax_source check (
    tax_bps=0 or nullif(btrim(tax_source),'') is not null
  ),
  constraint saas_billing_profiles_rate_source check (
    (currency='USD' and provider_cost_usd_to_currency_rate=1)
    or (
      currency<>'USD'
      and nullif(btrim(rate_source),'') is not null
    )
  )
);

create unique index saas_billing_profiles_one_open_lane
  on public.saas_billing_profiles(organization_id,currency)
  where valid_to is null;

create index saas_billing_profiles_creator_idx
  on public.saas_billing_profiles(organization_id,created_by_user_id)
  where created_by_user_id is not null;

create table public.saas_billing_statements (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  pricing_version_id uuid not null references public.pricing_versions(id) on delete restrict,
  billing_profile_id uuid not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','FINALIZED','VOID')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  setup_total numeric(18,6) not null default 0 check (setup_total>=0),
  platform_total numeric(18,6) not null default 0 check (platform_total>=0),
  feature_total numeric(18,6) not null default 0 check (feature_total>=0),
  channel_total numeric(18,6) not null default 0 check (channel_total>=0),
  seat_total numeric(18,6) not null default 0 check (seat_total>=0),
  ai_usage_total numeric(18,6) not null default 0 check (ai_usage_total>=0),
  third_party_usage_total numeric(18,6) not null default 0 check (third_party_usage_total>=0),
  overage_total numeric(18,6) not null default 0 check (overage_total>=0),
  discount_total numeric(18,6) not null default 0 check (discount_total>=0),
  tax_total numeric(18,6) not null default 0 check (tax_total>=0),
  subtotal numeric(18,6) not null default 0 check (subtotal>=0),
  total numeric(18,6) not null default 0 check (total>=0),
  source_snapshot jsonb not null default '{}'::jsonb,
  request_key text not null check (request_key ~ '^[A-Za-z0-9._:-]{3,180}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{32}$'),
  finalize_request_key text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,request_key),
  unique (organization_id,id),
  unique (subscription_id,period_start,period_end),
  foreign key (organization_id,billing_profile_id)
    references public.saas_billing_profiles(organization_id,id) on delete restrict,
  constraint saas_billing_statements_window check (period_end>period_start),
  constraint saas_billing_statements_finalize_key check (
    finalize_request_key is null
    or finalize_request_key ~ '^[A-Za-z0-9._:-]{3,180}$'
  ),
  constraint saas_billing_statements_finalize_state check (
    (status='FINALIZED' and finalized_at is not null and finalize_request_key is not null)
    or (status<>'FINALIZED' and finalized_at is null)
  ),
  constraint saas_billing_statements_total_formula check (
    total = greatest(subtotal-discount_total,0::numeric)+tax_total
  )
);

create index saas_billing_statements_org_status_idx
  on public.saas_billing_statements(organization_id,status,period_end desc,id);
create index saas_billing_statements_subscription_idx
  on public.saas_billing_statements(organization_id,subscription_id,period_end desc,id);
create index saas_billing_statements_pricing_idx
  on public.saas_billing_statements(organization_id,pricing_version_id,period_end desc,id);
create index saas_billing_statements_profile_idx
  on public.saas_billing_statements(organization_id,billing_profile_id,period_end desc,id);

create table public.saas_billing_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  statement_id uuid not null,
  line_no integer not null check (line_no>0),
  component text not null check (component in (
    'SETUP','PLATFORM','FEATURE','CHANNEL','SEAT',
    'AI_USAGE','THIRD_PARTY_USAGE','OVERAGE','DISCOUNT','TAX'
  )),
  direction text not null default 'CHARGE' check (direction in ('CHARGE','CREDIT')),
  meter_key text,
  quantity numeric(24,8) not null default 1 check (quantity>=0),
  included_quantity numeric(24,8) not null default 0 check (included_quantity>=0),
  billable_quantity numeric(24,8) not null default 1 check (billable_quantity>=0),
  unit_price numeric(24,8) not null default 0 check (unit_price>=0),
  amount numeric(18,6) not null check (amount>=0),
  source_type text not null,
  source_id text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id,statement_id,line_no),
  foreign key (organization_id,statement_id)
    references public.saas_billing_statements(organization_id,id) on delete restrict,
  constraint saas_billing_line_direction check (
    (component='DISCOUNT' and direction='CREDIT')
    or (component<>'DISCOUNT' and direction='CHARGE')
  )
);

create index saas_billing_lines_statement_idx
  on public.saas_billing_line_items(organization_id,statement_id,line_no);

comment on table public.saas_billing_statements is
  'Canonical Smart Visions platform subscription-billing ledger. Tenant INVOICE-ENGINE remains a separate downstream-business commercial authority.';
comment on table public.saas_billing_line_items is
  'Immutable component evidence for one platform billing statement. Discount lines are reserved for governed SAAS-COUPONS evidence.';
comment on table public.saas_billing_profiles is
  'Versioned tenant billing context for tax and deterministic provider-cost USD conversion. No live FX or tax rate is invented.';

alter table public.saas_billing_profiles enable row level security;
alter table public.saas_billing_statements enable row level security;
alter table public.saas_billing_line_items enable row level security;

create policy saas_billing_profiles_admin_read
on public.saas_billing_profiles
for select to authenticated
using (
  exists(
    select 1
    from public.organization_members m
    where m.organization_id=saas_billing_profiles.organization_id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
);

create policy saas_billing_statements_admin_read
on public.saas_billing_statements
for select to authenticated
using (
  exists(
    select 1
    from public.organization_members m
    where m.organization_id=saas_billing_statements.organization_id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
);

create policy saas_billing_lines_admin_read
on public.saas_billing_line_items
for select to authenticated
using (
  exists(
    select 1
    from public.organization_members m
    where m.organization_id=saas_billing_line_items.organization_id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
);

revoke all on table public.saas_billing_profiles,
  public.saas_billing_statements,
  public.saas_billing_line_items
from public,anon,authenticated,service_role;

grant select on table public.saas_billing_profiles,
  public.saas_billing_statements,
  public.saas_billing_line_items
to authenticated;

grant select,insert,update on table public.saas_billing_profiles,
  public.saas_billing_statements
to service_role;

grant select,insert,update,delete on table public.saas_billing_line_items
to service_role;

create or replace function public.validate_saas_billing_meter_maps(
  p_included_units jsonb,
  p_unit_prices jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v record;
  v_key text;
  v_number numeric;
begin
  if jsonb_typeof(coalesce(p_included_units,'{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_unit_prices,'{}'::jsonb))<>'object'
  then
    return false;
  end if;

  for v in select key,value from jsonb_each(coalesce(p_included_units,'{}'::jsonb))
  loop
    v_key:=upper(btrim(v.key));
    if v.key<>v_key
       or v_key !~ '^(SEATS|FEATURE\.[A-Z0-9_.:-]{1,110}|CHANNEL\.[A-Z0-9_.:-]{1,110}|ADDON\.[A-Z0-9_.:-]{1,110}|API\.[A-Z0-9_.:-]{1,110}|STORAGE\.[A-Z0-9_.:-]{1,110}|OVERAGE\.[A-Z0-9_.:-]{1,110})$'
       or jsonb_typeof(v.value)<>'number'
    then
      return false;
    end if;
    v_number:=(v.value#>>'{}')::numeric;
    if v_number<0 then return false; end if;
  end loop;

  for v in select key,value from jsonb_each(coalesce(p_unit_prices,'{}'::jsonb))
  loop
    v_key:=upper(btrim(v.key));
    if v.key<>v_key
       or v_key !~ '^(SEATS|FEATURE\.[A-Z0-9_.:-]{1,110}|CHANNEL\.[A-Z0-9_.:-]{1,110}|ADDON\.[A-Z0-9_.:-]{1,110}|API\.[A-Z0-9_.:-]{1,110}|STORAGE\.[A-Z0-9_.:-]{1,110}|OVERAGE\.[A-Z0-9_.:-]{1,110})$'
       or jsonb_typeof(v.value)<>'number'
    then
      return false;
    end if;
    v_number:=(v.value#>>'{}')::numeric;
    if v_number<0 then return false; end if;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.enforce_saas_billing_pricing_shape()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if not public.validate_saas_billing_meter_maps(new.included_units,new.unit_prices) then
    raise exception 'Invalid SAAS-BILLING included-unit/unit-price contract';
  end if;
  return new;
end;
$$;

drop trigger if exists pricing_versions_saas_billing_shape_guard
  on public.pricing_versions;
create trigger pricing_versions_saas_billing_shape_guard
before insert or update of included_units,unit_prices
on public.pricing_versions
for each row execute function public.enforce_saas_billing_pricing_shape();

create or replace function public.guard_saas_billing_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_statement_status text;
begin
  if current_user<>'service_role'
     or coalesce(current_setting('app.saas_billing_mutation',true),'')<>'allowed'
  then
    raise exception 'SAAS-BILLING state requires governed service command';
  end if;

  if tg_table_name='saas_billing_profiles' and tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.currency is distinct from old.currency
       or new.tax_bps is distinct from old.tax_bps
       or new.tax_label is distinct from old.tax_label
       or new.tax_source is distinct from old.tax_source
       or new.provider_cost_usd_to_currency_rate is distinct from old.provider_cost_usd_to_currency_rate
       or new.rate_source is distinct from old.rate_source
       or new.valid_from is distinct from old.valid_from
       or new.request_key is distinct from old.request_key
       or new.request_hash is distinct from old.request_hash
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at
    then
      raise exception 'SAAS-BILLING profile commercial evidence is immutable';
    end if;
  end if;

  if tg_table_name='saas_billing_statements' then
    if tg_op='DELETE' then
      raise exception 'SAAS-BILLING statement cannot be deleted';
    end if;

    if not exists(
      select 1
      from public.subscriptions s
      where s.id=new.subscription_id
        and s.organization_id=new.organization_id
        and s.pricing_version_id=new.pricing_version_id
    ) then
      raise exception 'SAAS-BILLING statement subscription/pricing tenant evidence is inconsistent';
    end if;

    if not exists(
      select 1
      from public.saas_billing_profiles bp
      where bp.id=new.billing_profile_id
        and bp.organization_id=new.organization_id
        and bp.currency=new.currency
    ) then
      raise exception 'SAAS-BILLING statement billing-profile currency evidence is inconsistent';
    end if;

    if tg_op='UPDATE' and old.status='FINALIZED' then
      raise exception 'SAAS-BILLING finalized statement is immutable';
    end if;

    if tg_op='UPDATE' and (
      new.organization_id is distinct from old.organization_id
      or new.subscription_id is distinct from old.subscription_id
      or new.pricing_version_id is distinct from old.pricing_version_id
      or new.billing_profile_id is distinct from old.billing_profile_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.currency is distinct from old.currency
      or new.source_snapshot is distinct from old.source_snapshot
      or new.request_key is distinct from old.request_key
      or new.request_hash is distinct from old.request_hash
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'SAAS-BILLING statement source evidence is immutable';
    end if;
  end if;

  if tg_table_name='saas_billing_line_items' then
    if tg_op='DELETE' then
      select s.status into v_statement_status
      from public.saas_billing_statements s
      where s.organization_id=old.organization_id
        and s.id=old.statement_id;
    else
      select s.status into v_statement_status
      from public.saas_billing_statements s
      where s.organization_id=new.organization_id
        and s.id=new.statement_id;
    end if;
    if v_statement_status is distinct from 'DRAFT' then
      raise exception 'SAAS-BILLING lines are mutable only while statement is DRAFT';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger saas_billing_profiles_guard
before insert or update or delete on public.saas_billing_profiles
for each row execute function public.guard_saas_billing_mutation();

create trigger saas_billing_statements_guard
before insert or update or delete on public.saas_billing_statements
for each row execute function public.guard_saas_billing_mutation();

create trigger saas_billing_lines_guard
before insert or update or delete on public.saas_billing_line_items
for each row execute function public.guard_saas_billing_mutation();

create or replace function private.saas_billing_meter_quantities(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table(meter_key text,quantity numeric,evidence_kind text)
language sql
stable
security invoker
set search_path=public,private,pg_catalog
as $$
  with raw as (
    select 'SEATS'::text as meter_key,
           count(*)::numeric as quantity,
           'ORGANIZATION_MEMBERS_SNAPSHOT'::text as evidence_kind
    from public.organization_members m
    where m.organization_id=p_organization_id

    union all

    select 'CHANNEL.'||upper(b.channel),
           count(*)::numeric,
           'ACTIVE_COMMUNICATION_BINDINGS'
    from public.communication_channel_bindings b
    where b.organization_id=p_organization_id
      and b.status='ACTIVE'
    group by upper(b.channel)

    union all

    select upper(e.feature_key),
           1::numeric,
           'EFFECTIVE_ENTITLEMENT'
    from public.get_effective_saas_entitlements(p_organization_id,p_period_end) e
    where upper(e.feature_key) like 'FEATURE.%'
      and e.entitlement_value->>'kind'='BOOLEAN'
      and coalesce((e.entitlement_value->>'enabled')::boolean,false)=true

    union all

    select upper(e.feature_key),
           1::numeric,
           'ADDON_OVERRIDE'
    from public.get_effective_saas_entitlements(p_organization_id,p_period_end) e
    where upper(e.feature_key) like 'ADDON.%'
      and e.source_type='OVERRIDE:ADDON'
      and e.entitlement_value->>'kind'='BOOLEAN'
      and coalesce((e.entitlement_value->>'enabled')::boolean,false)=true

    union all

    select upper(btrim(ue.metadata->>'billingUnitKey')),
           coalesce(sum(ue.units),0)::numeric,
           'BILLABLE_USAGE_UNITS'
    from public.usage_events ue
    where ue.organization_id=p_organization_id
      and ue.usage_classification='BILLABLE'
      and ue.provider<>'OPENAI'
      and ue.created_at>=p_period_start
      and ue.created_at<p_period_end
      and ue.units is not null
      and ue.units>=0
      and upper(btrim(coalesce(ue.metadata->>'billingUnitKey','')))
        ~ '^(API\.[A-Z0-9_.:-]{1,110}|STORAGE\.[A-Z0-9_.:-]{1,110}|OVERAGE\.[A-Z0-9_.:-]{1,110})$'
    group by upper(btrim(ue.metadata->>'billingUnitKey'))
  )
  select r.meter_key,sum(r.quantity)::numeric,min(r.evidence_kind)
  from raw r
  group by r.meter_key;
$$;

create or replace function public.put_saas_billing_profile_v1(
  p_organization_id uuid,
  p_currency text,
  p_tax_bps integer,
  p_tax_label text,
  p_tax_source text,
  p_provider_cost_usd_to_currency_rate numeric,
  p_rate_source text,
  p_valid_from timestamptz,
  p_actor_user_id uuid,
  p_request_key text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_request text:=btrim(coalesce(p_request_key,''));
  v_hash text;
  v_existing public.saas_billing_profiles%rowtype;
  v_id uuid:=gen_random_uuid();
  v_actor_type text;
  v_actor_id text;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or v_currency !~ '^[A-Z]{3}$'
     or p_tax_bps not between 0 and 10000
     or p_provider_cost_usd_to_currency_rate is null
     or p_provider_cost_usd_to_currency_rate<=0
     or p_valid_from is null
     or v_request !~ '^[A-Za-z0-9._:-]{3,180}$'
  then
    raise exception 'SAAS-BILLING profile command is invalid';
  end if;

  if p_tax_bps>0 and nullif(btrim(coalesce(p_tax_source,'')),'') is null then
    raise exception 'SAAS-BILLING tax evidence source is required';
  end if;
  if v_currency='USD' and p_provider_cost_usd_to_currency_rate<>1 then
    raise exception 'SAAS-BILLING USD conversion rate must equal 1';
  end if;
  if v_currency<>'USD' and nullif(btrim(coalesce(p_rate_source,'')),'') is null then
    raise exception 'SAAS-BILLING provider-cost conversion source is required';
  end if;
  if p_actor_user_id is not null and not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
  ) then
    raise exception 'SAAS-BILLING profile actor is not an Organization member';
  end if;

  v_hash:=md5(jsonb_build_object(
    'currency',v_currency,
    'taxBps',p_tax_bps,
    'taxLabel',nullif(btrim(coalesce(p_tax_label,'')),''),
    'taxSource',nullif(btrim(coalesce(p_tax_source,'')),''),
    'providerCostUsdToCurrencyRate',p_provider_cost_usd_to_currency_rate,
    'rateSource',nullif(btrim(coalesce(p_rate_source,'')),''),
    'validFrom',p_valid_from
  )::text);

  select * into v_existing
  from public.saas_billing_profiles
  where organization_id=p_organization_id and request_key=v_request;

  if found then
    if v_existing.request_hash<>v_hash then
      raise exception 'SAAS-BILLING profile request key conflict';
    end if;
    return v_existing.id;
  end if;

  perform set_config('app.saas_billing_mutation','allowed',true);

  update public.saas_billing_profiles
     set valid_to=p_valid_from
   where organization_id=p_organization_id
     and currency=v_currency
     and valid_to is null
     and valid_from<p_valid_from;

  if exists(
    select 1 from public.saas_billing_profiles
    where organization_id=p_organization_id
      and currency=v_currency
      and valid_to is null
  ) then
    raise exception 'SAAS-BILLING profile validity overlaps an existing open profile';
  end if;

  insert into public.saas_billing_profiles(
    id,organization_id,currency,tax_bps,tax_label,tax_source,
    provider_cost_usd_to_currency_rate,rate_source,valid_from,
    request_key,request_hash,created_by_user_id
  ) values (
    v_id,p_organization_id,v_currency,p_tax_bps,
    nullif(btrim(coalesce(p_tax_label,'')),''),
    nullif(btrim(coalesce(p_tax_source,'')),''),
    p_provider_cost_usd_to_currency_rate,
    nullif(btrim(coalesce(p_rate_source,'')),''),
    p_valid_from,v_request,v_hash,p_actor_user_id
  );

  v_actor_type:=case when p_actor_user_id is null then 'SYSTEM' else 'USER' end;
  v_actor_id:=coalesce(p_actor_user_id::text,'saas-billing-runtime');

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,v_actor_type,v_actor_id,'SAAS_BILLING_PROFILE_PUT',
    'saas_billing_profile',v_id::text,null,
    jsonb_build_object(
      'currency',v_currency,'taxBps',p_tax_bps,
      'validFrom',p_valid_from,'requestHash',v_hash
    ),
    v_request
  );

  perform set_config('app.saas_billing_mutation','0',true);
  return v_id;
exception when others then
  perform set_config('app.saas_billing_mutation','0',true);
  raise;
end;
$$;

create or replace function public.generate_saas_billing_statement_v1(
  p_organization_id uuid,
  p_subscription_id uuid,
  p_statement_id uuid,
  p_request_key text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  s public.subscriptions%rowtype;
  pv public.pricing_versions%rowtype;
  p public.plans%rowtype;
  bp public.saas_billing_profiles%rowtype;
  existing public.saas_billing_statements%rowtype;
  v_request text:=btrim(coalesce(p_request_key,''));
  v_hash text;
  v_line integer:=0;
  v_setup numeric:=0;
  v_platform numeric:=0;
  v_raw_ai_usd numeric:=0;
  v_raw_third_party_usd numeric:=0;
  v_rate numeric:=1;
  v_qty numeric;
  v_included numeric;
  v_billable numeric;
  v_price numeric;
  v_amount numeric;
  v_component text;
  v_meter record;
  v_subtotal numeric:=0;
  v_tax numeric:=0;
  v_source jsonb;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_subscription_id is null
     or p_statement_id is null
     or v_request !~ '^[A-Za-z0-9._:-]{3,180}$'
  then
    raise exception 'SAAS-BILLING statement command is invalid';
  end if;

  select * into existing
  from public.saas_billing_statements
  where organization_id=p_organization_id and request_key=v_request;

  select * into s
  from public.subscriptions
  where organization_id=p_organization_id and id=p_subscription_id
  for update;

  if not found then raise exception 'SAAS-BILLING subscription not found'; end if;
  if s.status not in ('ACTIVE','PAST_DUE','GRACE_PERIOD') then
    raise exception 'SAAS-BILLING subscription status is not billable: %',s.status;
  end if;
  if s.current_period_start is null or s.current_period_end is null then
    raise exception 'SAAS-BILLING subscription period is incomplete';
  end if;

  select * into pv from public.pricing_versions where id=s.pricing_version_id;
  if not found or pv.status<>'ACTIVE' then
    raise exception 'SAAS-BILLING requires ACTIVE pricing version';
  end if;
  select * into p from public.plans where id=pv.plan_id;
  if not found or p.status<>'ACTIVE' then
    raise exception 'SAAS-BILLING requires ACTIVE plan';
  end if;

  v_hash:=md5(jsonb_build_object(
    'subscriptionId',s.id,
    'pricingVersionId',pv.id,
    'periodStart',s.current_period_start,
    'periodEnd',s.current_period_end
  )::text);

  if existing.id is not null then
    if existing.request_hash<>v_hash
       or existing.subscription_id<>s.id
       or existing.period_start<>s.current_period_start
       or existing.period_end<>s.current_period_end
    then
      raise exception 'SAAS-BILLING statement request key conflict';
    end if;
    return existing.id;
  end if;

  if exists(
    select 1 from public.saas_billing_statements x
    where x.subscription_id=s.id
      and x.period_start=s.current_period_start
      and x.period_end=s.current_period_end
  ) then
    raise exception 'SAAS-BILLING statement already exists for subscription period';
  end if;

  select * into bp
  from public.saas_billing_profiles x
  where x.organization_id=p_organization_id
    and x.currency=pv.currency
    and x.valid_from<=s.current_period_start
    and (x.valid_to is null or s.current_period_start<x.valid_to)
  order by x.valid_from desc,x.created_at desc,x.id desc
  limit 1;

  if not found then
    raise exception 'SAAS-BILLING billing profile is not configured for subscription currency';
  end if;

  v_rate:=bp.provider_cost_usd_to_currency_rate;

  if not public.validate_saas_billing_meter_maps(pv.included_units,pv.unit_prices) then
    raise exception 'SAAS-BILLING pricing meter contract is invalid';
  end if;

  v_setup:=case
    when pv.setup_fee_amount>0 and not exists(
      select 1
      from public.saas_billing_statements prior
      where prior.organization_id=p_organization_id
        and prior.subscription_id=s.id
        and prior.status<>'VOID'
        and prior.setup_total>0
    )
    then pv.setup_fee_amount
    else 0
  end;
  v_platform:=pv.recurring_amount;

  select coalesce(sum(ue.cost_usd),0)
    into v_raw_ai_usd
  from public.usage_events ue
  where ue.organization_id=p_organization_id
    and ue.usage_classification='BILLABLE'
    and ue.provider='OPENAI'
    and ue.created_at>=s.current_period_start
    and ue.created_at<s.current_period_end;

  select coalesce(sum(ue.cost_usd),0)
    into v_raw_third_party_usd
  from public.usage_events ue
  where ue.organization_id=p_organization_id
    and ue.usage_classification='BILLABLE'
    and ue.provider not in ('OPENAI','INTERNAL')
    and ue.created_at>=s.current_period_start
    and ue.created_at<s.current_period_end
    and nullif(btrim(coalesce(ue.metadata->>'billingUnitKey','')),'') is null;

  v_source:=jsonb_build_object(
    'authority','SAAS_BILLING_V1',
    'planCode',p.code,
    'pricingVersionId',pv.id,
    'pricingVersion',pv.version,
    'currency',pv.currency,
    'billingPeriod',pv.billing_period,
    'subscriptionStatus',s.status,
    'profileId',bp.id,
    'taxBps',bp.tax_bps,
    'taxSource',bp.tax_source,
    'providerCostUsdToCurrencyRate',v_rate,
    'rateSource',bp.rate_source,
    'rawAiCostUsd',v_raw_ai_usd,
    'rawThirdPartyCostUsd',v_raw_third_party_usd,
    'aiCostMultiplier',pv.ai_cost_multiplier,
    'usageClassification','BILLABLE_ONLY',
    'discountAuthority','SAAS_COUPONS_PENDING',
    'paymentCollectionExecuted',false
  );

  perform set_config('app.saas_billing_mutation','allowed',true);

  insert into public.saas_billing_statements(
    id,organization_id,subscription_id,pricing_version_id,billing_profile_id,
    period_start,period_end,status,currency,source_snapshot,request_key,request_hash
  ) values (
    p_statement_id,p_organization_id,s.id,pv.id,bp.id,
    s.current_period_start,s.current_period_end,'DRAFT',pv.currency,
    v_source,v_request,v_hash
  );

  if v_setup>0 then
    v_line:=v_line+1;
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,meter_key,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      p_organization_id,p_statement_id,v_line,'SETUP','CHARGE',null,
      1,0,1,v_setup,round(v_setup,6),
      'PRICING_VERSION',pv.id::text,
      jsonb_build_object('setupFeeAmount',pv.setup_fee_amount)
    );
  end if;

  if v_platform>0 then
    v_line:=v_line+1;
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,meter_key,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      p_organization_id,p_statement_id,v_line,'PLATFORM','CHARGE',null,
      1,0,1,v_platform,round(v_platform,6),
      'PRICING_VERSION',pv.id::text,
      jsonb_build_object('recurringAmount',pv.recurring_amount,'billingPeriod',pv.billing_period)
    );
  end if;

  for v_meter in
    select
      upper(e.key) as meter_key,
      (e.value#>>'{}')::numeric as unit_price,
      coalesce((pv.included_units->>upper(e.key))::numeric,0) as included_quantity,
      coalesce(q.quantity,0) as quantity,
      q.evidence_kind
    from jsonb_each(pv.unit_prices) e
    left join private.saas_billing_meter_quantities(
      p_organization_id,s.current_period_start,s.current_period_end
    ) q on q.meter_key=upper(e.key)
    order by upper(e.key)
  loop
    v_qty:=greatest(coalesce(v_meter.quantity,0),0);
    v_included:=greatest(coalesce(v_meter.included_quantity,0),0);
    v_billable:=greatest(v_qty-v_included,0);
    v_price:=greatest(coalesce(v_meter.unit_price,0),0);
    v_amount:=round(v_billable*v_price,6);

    if v_amount<=0 then continue; end if;

    v_component:=case
      when v_meter.meter_key='SEATS' then 'SEAT'
      when v_meter.meter_key like 'FEATURE.%' then 'FEATURE'
      when v_meter.meter_key like 'CHANNEL.%' then 'CHANNEL'
      when v_meter.meter_key like 'ADDON.%' then 'FEATURE'
      else 'OVERAGE'
    end;

    v_line:=v_line+1;
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,meter_key,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      p_organization_id,p_statement_id,v_line,v_component,'CHARGE',v_meter.meter_key,
      v_qty,v_included,v_billable,v_price,v_amount,
      coalesce(v_meter.evidence_kind,'NO_METER_EVIDENCE'),null,
      jsonb_build_object(
        'quantity',v_qty,'includedQuantity',v_included,
        'billableQuantity',v_billable,'unitPrice',v_price
      )
    );
  end loop;

  v_amount:=round(v_raw_ai_usd*pv.ai_cost_multiplier*v_rate,6);
  if v_amount>0 then
    v_line:=v_line+1;
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,meter_key,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      p_organization_id,p_statement_id,v_line,'AI_USAGE','CHARGE','AI.RAW_COST_USD',
      v_raw_ai_usd,0,v_raw_ai_usd,pv.ai_cost_multiplier*v_rate,v_amount,
      'USAGE_EVENTS_BILLABLE',null,
      jsonb_build_object(
        'rawCostUsd',v_raw_ai_usd,'multiplier',pv.ai_cost_multiplier,
        'usdToBillingCurrencyRate',v_rate
      )
    );
  end if;

  v_amount:=round(v_raw_third_party_usd*v_rate,6);
  if v_amount>0 then
    v_line:=v_line+1;
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,meter_key,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      p_organization_id,p_statement_id,v_line,'THIRD_PARTY_USAGE','CHARGE','THIRD_PARTY.RAW_COST_USD',
      v_raw_third_party_usd,0,v_raw_third_party_usd,v_rate,v_amount,
      'USAGE_EVENTS_BILLABLE',null,
      jsonb_build_object(
        'rawCostUsd',v_raw_third_party_usd,
        'usdToBillingCurrencyRate',v_rate,
        'markupApplied',false
      )
    );
  end if;

  select coalesce(sum(li.amount),0)
    into v_subtotal
  from public.saas_billing_line_items li
  where li.organization_id=p_organization_id
    and li.statement_id=p_statement_id
    and li.direction='CHARGE'
    and li.component<>'TAX';

  v_tax:=round(v_subtotal*bp.tax_bps/10000.0,6);
  if v_tax>0 then
    v_line:=v_line+1;
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,meter_key,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      p_organization_id,p_statement_id,v_line,'TAX','CHARGE',null,
      1,0,1,v_tax,v_tax,
      'BILLING_PROFILE',bp.id::text,
      jsonb_build_object('taxBps',bp.tax_bps,'taxLabel',bp.tax_label,'taxSource',bp.tax_source)
    );
  end if;

  update public.saas_billing_statements st
  set
    setup_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='SETUP' and direction='CHARGE'),0),
    platform_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='PLATFORM' and direction='CHARGE'),0),
    feature_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='FEATURE' and direction='CHARGE'),0),
    channel_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='CHANNEL' and direction='CHARGE'),0),
    seat_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='SEAT' and direction='CHARGE'),0),
    ai_usage_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='AI_USAGE' and direction='CHARGE'),0),
    third_party_usage_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='THIRD_PARTY_USAGE' and direction='CHARGE'),0),
    overage_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='OVERAGE' and direction='CHARGE'),0),
    discount_total=coalesce((select sum(amount) from public.saas_billing_line_items where organization_id=p_organization_id and statement_id=p_statement_id and component='DISCOUNT' and direction='CREDIT'),0),
    tax_total=v_tax,
    subtotal=v_subtotal,
    total=greatest(v_subtotal,0)+v_tax,
    updated_at=statement_timestamp()
  where st.organization_id=p_organization_id and st.id=p_statement_id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'SYSTEM','saas-billing-runtime','SAAS_BILLING_STATEMENT_GENERATED',
    'saas_billing_statement',p_statement_id::text,null,
    jsonb_build_object(
      'subscriptionId',s.id,'pricingVersionId',pv.id,
      'periodStart',s.current_period_start,'periodEnd',s.current_period_end,
      'currency',pv.currency,'subtotal',v_subtotal,'taxTotal',v_tax,
      'paymentCollectionExecuted',false
    ),
    v_request
  );

  perform set_config('app.saas_billing_mutation','0',true);
  return p_statement_id;
exception when others then
  perform set_config('app.saas_billing_mutation','0',true);
  raise;
end;
$$;

create or replace function public.finalize_saas_billing_statement_v1(
  p_organization_id uuid,
  p_statement_id uuid,
  p_request_key text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  st public.saas_billing_statements%rowtype;
  bp public.saas_billing_profiles%rowtype;
  v_request text:=btrim(coalesce(p_request_key,''));
  v_subtotal numeric:=0;
  v_discount numeric:=0;
  v_tax numeric:=0;
  v_line integer:=0;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_statement_id is null
     or v_request !~ '^[A-Za-z0-9._:-]{3,180}$'
  then
    raise exception 'SAAS-BILLING finalize command is invalid';
  end if;

  select * into st
  from public.saas_billing_statements
  where organization_id=p_organization_id and id=p_statement_id
  for update;

  if not found then raise exception 'SAAS-BILLING statement not found'; end if;
  if st.status='FINALIZED' then
    if st.finalize_request_key=v_request then return st.id; end if;
    raise exception 'SAAS-BILLING statement already finalized';
  end if;
  if st.status<>'DRAFT' then
    raise exception 'SAAS-BILLING only DRAFT statement can be finalized';
  end if;

  select * into bp
  from public.saas_billing_profiles
  where organization_id=p_organization_id and id=st.billing_profile_id;
  if not found then raise exception 'SAAS-BILLING profile evidence is missing'; end if;

  perform set_config('app.saas_billing_mutation','allowed',true);

  delete from public.saas_billing_line_items
  where organization_id=p_organization_id
    and statement_id=p_statement_id
    and component='TAX';

  select
    coalesce(sum(amount) filter(where direction='CHARGE' and component<>'TAX'),0),
    coalesce(sum(amount) filter(where direction='CREDIT' and component='DISCOUNT'),0),
    coalesce(max(line_no),0)
    into v_subtotal,v_discount,v_line
  from public.saas_billing_line_items
  where organization_id=p_organization_id and statement_id=p_statement_id;

  if v_discount>v_subtotal then
    raise exception 'SAAS-BILLING discount exceeds charge subtotal';
  end if;

  v_tax:=round((v_subtotal-v_discount)*bp.tax_bps/10000.0,6);

  if v_tax>0 then
    v_line:=v_line+1;
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      p_organization_id,p_statement_id,v_line,'TAX','CHARGE',
      1,0,1,v_tax,v_tax,
      'BILLING_PROFILE',bp.id::text,
      jsonb_build_object('taxBps',bp.tax_bps,'taxLabel',bp.tax_label,'taxSource',bp.tax_source)
    );
  end if;

  update public.saas_billing_statements x
  set
    discount_total=v_discount,
    tax_total=v_tax,
    subtotal=v_subtotal,
    total=(v_subtotal-v_discount)+v_tax,
    status='FINALIZED',
    finalize_request_key=v_request,
    finalized_at=statement_timestamp(),
    updated_at=statement_timestamp()
  where x.organization_id=p_organization_id and x.id=p_statement_id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id,causation_id
  ) values (
    p_organization_id,'SYSTEM','saas-billing-runtime','SAAS_BILLING_STATEMENT_FINALIZED',
    'saas_billing_statement',p_statement_id::text,
    jsonb_build_object('status','DRAFT'),
    jsonb_build_object(
      'status','FINALIZED','subtotal',v_subtotal,
      'discountTotal',v_discount,'taxTotal',v_tax,
      'total',(v_subtotal-v_discount)+v_tax,
      'paymentCollectionExecuted',false
    ),
    v_request,st.request_key
  );

  perform set_config('app.saas_billing_mutation','0',true);
  return p_statement_id;
exception when others then
  perform set_config('app.saas_billing_mutation','0',true);
  raise;
end;
$$;

revoke all on function public.validate_saas_billing_meter_maps(jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.validate_saas_billing_meter_maps(jsonb,jsonb)
  to service_role;

revoke all on function public.enforce_saas_billing_pricing_shape()
  from public,anon,authenticated,service_role;

revoke all on function public.guard_saas_billing_mutation()
  from public,anon,authenticated,service_role;

revoke all on function private.saas_billing_meter_quantities(uuid,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function private.saas_billing_meter_quantities(uuid,timestamptz,timestamptz)
  to service_role;

revoke all on function public.put_saas_billing_profile_v1(uuid,text,integer,text,text,numeric,text,timestamptz,uuid,text)
  from public,anon,authenticated;
grant execute on function public.put_saas_billing_profile_v1(uuid,text,integer,text,text,numeric,text,timestamptz,uuid,text)
  to service_role;

revoke all on function public.generate_saas_billing_statement_v1(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.generate_saas_billing_statement_v1(uuid,uuid,uuid,text)
  to service_role;

revoke all on function public.finalize_saas_billing_statement_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.finalize_saas_billing_statement_v1(uuid,uuid,text)
  to service_role;

comment on function public.generate_saas_billing_statement_v1(uuid,uuid,uuid,text) is
  'Deterministic platform billing draft from ACTIVE subscription/pricing, canonical seat/channel/entitlement evidence and BILLABLE usage only. No provider collection side effect.';
comment on function public.finalize_saas_billing_statement_v1(uuid,uuid,text) is
  'Finalizes immutable platform billing evidence, recomputing tax after governed discount lines. Payment collection is separate.';
