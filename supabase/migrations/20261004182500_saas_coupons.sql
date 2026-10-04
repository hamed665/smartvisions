-- SAAS-COUPONS
--
-- Canonical Smart Visions platform-billing coupon authority.
-- Extends SAAS-BILLING only; does not replace plans/pricing/subscriptions,
-- tenant-facing invoices/payments, payment collection, entitlements or usage truth.
--
-- Coupon application is statement-scoped evidence:
--   coupon -> immutable redemption -> canonical SAAS-BILLING DISCOUNT line.
-- Taxes are recomputed from the existing billing profile after discount.
-- Payment collection remains a separate concern.

create table public.saas_coupons (
  id uuid primary key,
  issuer_organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null unique
    check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,62}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','ACTIVE','RETIRED')),
  benefit_type text not null
    check (benefit_type in ('FIXED','PERCENTAGE','FREE_SETUP','TRIAL')),
  fixed_amount numeric(18,6),
  currency text,
  percent_bps integer,
  trial_periods integer,
  valid_from timestamptz not null,
  valid_to timestamptz,
  max_redemptions_total integer,
  max_redemptions_per_organization integer,
  max_redemptions_per_subscription integer,
  request_key text not null unique
    check (request_key ~ '^[A-Za-z0-9._:-]{3,180}$'),
  request_hash text not null
    check (request_hash ~ '^[a-f0-9]{32}$'),
  activated_at timestamptz,
  activation_request_key text,
  retired_at timestamptz,
  retire_request_key text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saas_coupons_window check (
    valid_to is null or valid_to > valid_from
  ),
  constraint saas_coupons_total_cap check (
    max_redemptions_total is null or max_redemptions_total > 0
  ),
  constraint saas_coupons_org_cap check (
    max_redemptions_per_organization is null or max_redemptions_per_organization > 0
  ),
  constraint saas_coupons_subscription_cap check (
    max_redemptions_per_subscription is null or max_redemptions_per_subscription > 0
  ),
  constraint saas_coupons_activation_key check (
    activation_request_key is null
    or activation_request_key ~ '^[A-Za-z0-9._:-]{3,180}$'
  ),
  constraint saas_coupons_retire_key check (
    retire_request_key is null
    or retire_request_key ~ '^[A-Za-z0-9._:-]{3,180}$'
  ),
  constraint saas_coupons_benefit_shape check (
    (
      benefit_type='FIXED'
      and fixed_amount is not null and fixed_amount > 0
      and currency is not null
      and currency ~ '^[A-Z]{3}
    )
    or (
      benefit_type='PERCENTAGE'
      and fixed_amount is null
      and currency is null
      and percent_bps is not null
      and percent_bps between 1 and 10000
      and trial_periods is null
    )
    or (
      benefit_type='FREE_SETUP'
      and fixed_amount is null
      and currency is null
      and percent_bps is null
      and trial_periods is null
    )
    or (
      benefit_type='TRIAL'
      and fixed_amount is null
      and currency is null
      and percent_bps is null
      and trial_periods is not null
      and trial_periods between 1 and 12
    )
  ),
  constraint saas_coupons_state_evidence check (
    (status='DRAFT' and activated_at is null and retired_at is null)
    or (status='ACTIVE' and activated_at is not null and activation_request_key is not null and retired_at is null)
    or (status='RETIRED' and activated_at is not null and activation_request_key is not null and retired_at is not null and retire_request_key is not null)
  )
);

create index saas_coupons_status_window_idx
  on public.saas_coupons(status,valid_from,valid_to,code);
create index saas_coupons_issuer_fk_idx
  on public.saas_coupons(issuer_organization_id);
create index saas_coupons_created_by_fk_idx
  on public.saas_coupons(created_by_user_id)
  where created_by_user_id is not null;

create table public.saas_coupon_scopes (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.saas_coupons(id) on delete cascade,
  scope_type text not null
    check (scope_type in ('ALL','COMPONENT','METER_PREFIX')),
  component text,
  meter_prefix text,
  created_at timestamptz not null default now(),
  constraint saas_coupon_scopes_shape check (
    (scope_type='ALL' and component is null and meter_prefix is null)
    or (
      scope_type='COMPONENT'
      and component in (
        'SETUP','PLATFORM','FEATURE','CHANNEL','SEAT',
        'AI_USAGE','THIRD_PARTY_USAGE','OVERAGE'
      )
      and meter_prefix is null
    )
    or (
      scope_type='METER_PREFIX'
      and component is null
      and meter_prefix ~ '^(FEATURE|CHANNEL|ADDON|API|STORAGE|OVERAGE)\.[A-Z0-9_.:-]{0,110}$'
    )
  )
);

create unique index saas_coupon_scopes_all_unique
  on public.saas_coupon_scopes(coupon_id)
  where scope_type='ALL';
create unique index saas_coupon_scopes_component_unique
  on public.saas_coupon_scopes(coupon_id,component)
  where scope_type='COMPONENT';
create unique index saas_coupon_scopes_meter_unique
  on public.saas_coupon_scopes(coupon_id,meter_prefix)
  where scope_type='METER_PREFIX';

create table public.saas_coupon_targets (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.saas_coupons(id) on delete cascade,
  target_type text not null
    check (target_type in ('ORGANIZATION','PLAN','PRICING_VERSION','SUBSCRIPTION')),
  organization_id uuid references public.organizations(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete cascade,
  pricing_version_id uuid references public.pricing_versions(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saas_coupon_targets_shape check (
    (target_type='ORGANIZATION' and organization_id is not null and plan_id is null and pricing_version_id is null and subscription_id is null)
    or (target_type='PLAN' and organization_id is null and plan_id is not null and pricing_version_id is null and subscription_id is null)
    or (target_type='PRICING_VERSION' and organization_id is null and plan_id is null and pricing_version_id is not null and subscription_id is null)
    or (target_type='SUBSCRIPTION' and organization_id is null and plan_id is null and pricing_version_id is null and subscription_id is not null)
  )
);

create unique index saas_coupon_targets_org_unique
  on public.saas_coupon_targets(coupon_id,organization_id)
  where target_type='ORGANIZATION';
create unique index saas_coupon_targets_plan_unique
  on public.saas_coupon_targets(coupon_id,plan_id)
  where target_type='PLAN';
create unique index saas_coupon_targets_pricing_unique
  on public.saas_coupon_targets(coupon_id,pricing_version_id)
  where target_type='PRICING_VERSION';
create unique index saas_coupon_targets_subscription_unique
  on public.saas_coupon_targets(coupon_id,subscription_id)
  where target_type='SUBSCRIPTION';

create index saas_coupon_targets_org_fk_idx
  on public.saas_coupon_targets(organization_id)
  where organization_id is not null;
create index saas_coupon_targets_plan_fk_idx
  on public.saas_coupon_targets(plan_id)
  where plan_id is not null;
create index saas_coupon_targets_pricing_fk_idx
  on public.saas_coupon_targets(pricing_version_id)
  where pricing_version_id is not null;
create index saas_coupon_targets_subscription_fk_idx
  on public.saas_coupon_targets(subscription_id)
  where subscription_id is not null;

create unique index if not exists subscriptions_organization_id_id_coupon_fk_idx
  on public.subscriptions(organization_id,id);

create table public.saas_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.saas_coupons(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null,
  statement_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  discount_amount numeric(18,6) not null check (discount_amount > 0),
  request_key text not null
    check (request_key ~ '^[A-Za-z0-9._:-]{3,180}$'),
  request_hash text not null
    check (request_hash ~ '^[a-f0-9]{32}$'),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence)='object'),
  redeemed_at timestamptz not null default now(),
  unique (organization_id,request_key),
  unique (coupon_id,statement_id),
  foreign key (organization_id,subscription_id)
    references public.subscriptions(organization_id,id) on delete restrict,
  foreign key (organization_id,statement_id)
    references public.saas_billing_statements(organization_id,id) on delete restrict
);

create index saas_coupon_redemptions_org_created_idx
  on public.saas_coupon_redemptions(organization_id,redeemed_at desc,id);
create index saas_coupon_redemptions_subscription_idx
  on public.saas_coupon_redemptions(organization_id,subscription_id,redeemed_at desc,id);
create index saas_coupon_redemptions_statement_idx
  on public.saas_coupon_redemptions(organization_id,statement_id);
create index saas_coupon_redemptions_coupon_idx
  on public.saas_coupon_redemptions(coupon_id,redeemed_at desc,id);

comment on table public.saas_coupons is
  'Canonical Smart Visions platform-billing coupon definitions. Not tenant customer promotions and not a pricing/subscription/payment authority.';
comment on table public.saas_coupon_scopes is
  'Coupon applicability over existing SAAS-BILLING components or meter-key prefixes.';
comment on table public.saas_coupon_targets is
  'Optional eligibility constraints over canonical Organization/Plan/Pricing-Version/Subscription authorities.';
comment on table public.saas_coupon_redemptions is
  'Immutable evidence that one platform coupon was applied to one DRAFT SAAS-BILLING statement.';

alter table public.saas_coupons enable row level security;
alter table public.saas_coupon_scopes enable row level security;
alter table public.saas_coupon_targets enable row level security;
alter table public.saas_coupon_redemptions enable row level security;

create policy saas_coupon_redemptions_admin_read
on public.saas_coupon_redemptions
for select to authenticated
using (
  exists(
    select 1
    from public.organization_members m
    where m.organization_id=saas_coupon_redemptions.organization_id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
);

create policy saas_coupons_redeemed_admin_read
on public.saas_coupons
for select to authenticated
using (
  exists(
    select 1
    from public.saas_coupon_redemptions r
    join public.organization_members m
      on m.organization_id=r.organization_id
    where r.coupon_id=saas_coupons.id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
);

revoke all on table public.saas_coupons,
  public.saas_coupon_scopes,
  public.saas_coupon_targets,
  public.saas_coupon_redemptions
from public,anon,authenticated,service_role;

grant select on table public.saas_coupons,
  public.saas_coupon_redemptions
to authenticated;

grant select,insert,update,delete on table public.saas_coupons,
  public.saas_coupon_scopes,
  public.saas_coupon_targets
to service_role;

grant select,insert on table public.saas_coupon_redemptions
to service_role;

create or replace function public.guard_saas_coupon_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_status text;
begin
  if current_user<>'service_role'
     or coalesce(current_setting('app.saas_coupon_mutation',true),'')<>'allowed'
  then
    raise exception 'SAAS-COUPONS state requires governed service command';
  end if;

  if tg_table_name='saas_coupons' then
    if tg_op='DELETE' then
      raise exception 'SAAS-COUPONS coupon definitions cannot be deleted';
    end if;

    if tg_op='INSERT' and new.status<>'DRAFT' then
      raise exception 'SAAS-COUPONS definitions must start as DRAFT';
    end if;

    if tg_op='UPDATE' and old.status='RETIRED' then
      raise exception 'SAAS-COUPONS retired definition is immutable';
    end if;

    if tg_op='UPDATE' and old.status='ACTIVE' then
      if new.status<>'RETIRED'
         or new.id is distinct from old.id
         or new.issuer_organization_id is distinct from old.issuer_organization_id
         or new.code is distinct from old.code
         or new.name is distinct from old.name
         or new.benefit_type is distinct from old.benefit_type
         or new.fixed_amount is distinct from old.fixed_amount
         or new.currency is distinct from old.currency
         or new.percent_bps is distinct from old.percent_bps
         or new.trial_periods is distinct from old.trial_periods
         or new.valid_from is distinct from old.valid_from
         or new.valid_to is distinct from old.valid_to
         or new.max_redemptions_total is distinct from old.max_redemptions_total
         or new.max_redemptions_per_organization is distinct from old.max_redemptions_per_organization
         or new.max_redemptions_per_subscription is distinct from old.max_redemptions_per_subscription
         or new.request_key is distinct from old.request_key
         or new.request_hash is distinct from old.request_hash
         or new.activated_at is distinct from old.activated_at
         or new.activation_request_key is distinct from old.activation_request_key
         or new.created_by_user_id is distinct from old.created_by_user_id
         or new.metadata is distinct from old.metadata
         or new.created_at is distinct from old.created_at
         or new.retired_at is null
         or new.retire_request_key is null
      then
        raise exception 'SAAS-COUPONS active commercial contract is immutable except retirement';
      end if;
    end if;
  end if;

  if tg_table_name in ('saas_coupon_scopes','saas_coupon_targets') then
    if tg_op='DELETE' then
      select c.status into v_status
      from public.saas_coupons c
      where c.id=old.coupon_id;
    else
      select c.status into v_status
      from public.saas_coupons c
      where c.id=new.coupon_id;
    end if;

    if v_status is distinct from 'DRAFT' then
      raise exception 'SAAS-COUPONS scopes/targets are mutable only while coupon is DRAFT';
    end if;
  end if;

  if tg_table_name='saas_coupon_redemptions'
     and tg_op<>'INSERT'
  then
    raise exception 'SAAS-COUPONS redemption evidence is immutable';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger saas_coupons_guard
before insert or update or delete on public.saas_coupons
for each row execute function public.guard_saas_coupon_mutation();

create trigger saas_coupon_scopes_guard
before insert or update or delete on public.saas_coupon_scopes
for each row execute function public.guard_saas_coupon_mutation();

create trigger saas_coupon_targets_guard
before insert or update or delete on public.saas_coupon_targets
for each row execute function public.guard_saas_coupon_mutation();

create trigger saas_coupon_redemptions_guard
before insert or update or delete on public.saas_coupon_redemptions
for each row execute function public.guard_saas_coupon_mutation();

create or replace function public.saas_coupon_statement_snapshot_bridge()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  new.source_snapshot:=jsonb_set(
    coalesce(new.source_snapshot,'{}'::jsonb),
    '{discountAuthority}',
    to_jsonb('SAAS_COUPONS_V1'::text),
    true
  );
  return new;
end;
$$;

create trigger saas_coupon_statement_snapshot_bridge
before insert on public.saas_billing_statements
for each row execute function public.saas_coupon_statement_snapshot_bridge();

create or replace function public.create_saas_coupon_v1(
  p_coupon_id uuid,
  p_issuer_organization_id uuid,
  p_code text,
  p_name text,
  p_benefit_type text,
  p_fixed_amount numeric,
  p_currency text,
  p_percent_bps integer,
  p_trial_periods integer,
  p_valid_from timestamptz,
  p_valid_to timestamptz,
  p_max_redemptions_total integer,
  p_max_redemptions_per_organization integer,
  p_max_redemptions_per_subscription integer,
  p_scopes jsonb,
  p_targets jsonb,
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
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_name text:=btrim(coalesce(p_name,''));
  v_type text:=upper(btrim(coalesce(p_benefit_type,'')));
  v_currency text:=case when p_currency is null then null else upper(btrim(p_currency)) end;
  v_request text:=btrim(coalesce(p_request_key,''));
  v_hash text;
  v_existing public.saas_coupons%rowtype;
  v_item jsonb;
  v_scope_type text;
  v_scope_value text;
  v_target_type text;
  v_target_id uuid;
begin
  if current_user<>'service_role'
     or p_coupon_id is null
     or p_issuer_organization_id is null
     or v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,62}$'
     or length(v_name) not between 1 and 160
     or v_type not in ('FIXED','PERCENTAGE','FREE_SETUP','TRIAL')
     or p_valid_from is null
     or (p_valid_to is not null and p_valid_to<=p_valid_from)
     or v_request !~ '^[A-Za-z0-9._:-]{3,180}$'
     or jsonb_typeof(coalesce(p_scopes,'null'::jsonb))<>'array'
     or jsonb_array_length(p_scopes)=0
     or jsonb_typeof(coalesce(p_targets,'[]'::jsonb))<>'array'
  then
    raise exception 'SAAS-COUPONS create command is invalid';
  end if;

  if not exists(
    select 1 from public.organizations o where o.id=p_issuer_organization_id
  ) then
    raise exception 'SAAS-COUPONS issuer Organization does not exist';
  end if;

  if p_actor_user_id is not null
     and not exists(
       select 1
       from public.organization_members m
       where m.organization_id=p_issuer_organization_id
         and m.user_id=p_actor_user_id
         and m.role in ('OWNER','ADMIN')
     )
  then
    raise exception 'SAAS-COUPONS actor is not issuer OWNER/ADMIN';
  end if;

  if v_type='FIXED' and (
       p_fixed_amount is null or p_fixed_amount<=0
       or v_currency is null
       or v_currency !~ '^[A-Z]{3}
       or p_percent_bps is not null
       or p_trial_periods is not null
     ) then
    raise exception 'SAAS-COUPONS FIXED benefit is invalid';
  elsif v_type='PERCENTAGE' and (
       p_fixed_amount is not null
       or v_currency is not null
       or p_percent_bps is null
       or p_percent_bps not between 1 and 10000
       or p_trial_periods is not null
     ) then
    raise exception 'SAAS-COUPONS PERCENTAGE benefit is invalid';
  elsif v_type='FREE_SETUP' and (
       p_fixed_amount is not null or v_currency is not null
       or p_percent_bps is not null or p_trial_periods is not null
     ) then
    raise exception 'SAAS-COUPONS FREE_SETUP benefit is invalid';
  elsif v_type='TRIAL' and (
       p_fixed_amount is not null or v_currency is not null
       or p_percent_bps is not null
       or p_trial_periods is null
       or p_trial_periods not between 1 and 12
     ) then
    raise exception 'SAAS-COUPONS TRIAL benefit is invalid';
  end if;

  if (p_max_redemptions_total is not null and p_max_redemptions_total<=0)
     or (p_max_redemptions_per_organization is not null and p_max_redemptions_per_organization<=0)
     or (p_max_redemptions_per_subscription is not null and p_max_redemptions_per_subscription<=0)
  then
    raise exception 'SAAS-COUPONS redemption caps are invalid';
  end if;

  v_hash:=md5(jsonb_build_object(
    'couponId',p_coupon_id,
    'issuerOrganizationId',p_issuer_organization_id,
    'code',v_code,
    'name',v_name,
    'benefitType',v_type,
    'fixedAmount',p_fixed_amount,
    'currency',v_currency,
    'percentBps',p_percent_bps,
    'trialPeriods',p_trial_periods,
    'validFrom',p_valid_from,
    'validTo',p_valid_to,
    'maxRedemptionsTotal',p_max_redemptions_total,
    'maxRedemptionsPerOrganization',p_max_redemptions_per_organization,
    'maxRedemptionsPerSubscription',p_max_redemptions_per_subscription,
    'scopes',p_scopes,
    'targets',coalesce(p_targets,'[]'::jsonb)
  )::text);

  select * into v_existing
  from public.saas_coupons
  where request_key=v_request;

  if found then
    if v_existing.request_hash<>v_hash then
      raise exception 'SAAS-COUPONS request key conflict';
    end if;
    return v_existing.id;
  end if;

  if exists(select 1 from public.saas_coupons where code=v_code) then
    raise exception 'SAAS-COUPONS code already exists';
  end if;

  perform set_config('app.saas_coupon_mutation','allowed',true);

  insert into public.saas_coupons(
    id,issuer_organization_id,code,name,status,benefit_type,fixed_amount,currency,percent_bps,trial_periods,
    valid_from,valid_to,max_redemptions_total,max_redemptions_per_organization,
    max_redemptions_per_subscription,request_key,request_hash,created_by_user_id
  ) values (
    p_coupon_id,p_issuer_organization_id,v_code,v_name,'DRAFT',v_type,p_fixed_amount,v_currency,p_percent_bps,p_trial_periods,
    p_valid_from,p_valid_to,p_max_redemptions_total,p_max_redemptions_per_organization,
    p_max_redemptions_per_subscription,v_request,v_hash,p_actor_user_id
  );

  for v_item in select value from jsonb_array_elements(p_scopes)
  loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'SAAS-COUPONS scope entry must be an object';
    end if;
    v_scope_type:=upper(btrim(coalesce(v_item->>'type','')));
    v_scope_value:=upper(btrim(coalesce(v_item->>'value','')));

    if v_scope_type='ALL' then
      insert into public.saas_coupon_scopes(coupon_id,scope_type)
      values (p_coupon_id,'ALL');
    elsif v_scope_type='COMPONENT'
          and v_scope_value in (
            'SETUP','PLATFORM','FEATURE','CHANNEL','SEAT',
            'AI_USAGE','THIRD_PARTY_USAGE','OVERAGE'
          ) then
      insert into public.saas_coupon_scopes(coupon_id,scope_type,component)
      values (p_coupon_id,'COMPONENT',v_scope_value);
    elsif v_scope_type='METER_PREFIX'
          and v_scope_value ~ '^(FEATURE|CHANNEL|ADDON|API|STORAGE|OVERAGE)\.[A-Z0-9_.:-]{0,110}$' then
      insert into public.saas_coupon_scopes(coupon_id,scope_type,meter_prefix)
      values (p_coupon_id,'METER_PREFIX',v_scope_value);
    else
      raise exception 'SAAS-COUPONS scope is invalid';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_targets,'[]'::jsonb))
  loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'SAAS-COUPONS target entry must be an object';
    end if;
    v_target_type:=upper(btrim(coalesce(v_item->>'type','')));
    begin
      v_target_id:=(v_item->>'id')::uuid;
    exception when others then
      raise exception 'SAAS-COUPONS target id is invalid';
    end;

    if v_target_type='ORGANIZATION' then
      insert into public.saas_coupon_targets(coupon_id,target_type,organization_id)
      values (p_coupon_id,'ORGANIZATION',v_target_id);
    elsif v_target_type='PLAN' then
      insert into public.saas_coupon_targets(coupon_id,target_type,plan_id)
      values (p_coupon_id,'PLAN',v_target_id);
    elsif v_target_type='PRICING_VERSION' then
      insert into public.saas_coupon_targets(coupon_id,target_type,pricing_version_id)
      values (p_coupon_id,'PRICING_VERSION',v_target_id);
    elsif v_target_type='SUBSCRIPTION' then
      insert into public.saas_coupon_targets(coupon_id,target_type,subscription_id)
      values (p_coupon_id,'SUBSCRIPTION',v_target_id);
    else
      raise exception 'SAAS-COUPONS target type is invalid';
    end if;
  end loop;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_issuer_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'saas-coupons-runtime'),
    'SAAS_COUPON_CREATED',
    'saas_coupon',p_coupon_id::text,null,
    jsonb_build_object(
      'code',v_code,'benefitType',v_type,'status','DRAFT',
      'paymentCollectionExecuted',false
    ),
    v_request
  );

  perform set_config('app.saas_coupon_mutation','0',true);
  return p_coupon_id;
exception when others then
  perform set_config('app.saas_coupon_mutation','0',true);
  raise;
end;
$$;

create or replace function public.activate_saas_coupon_v1(
  p_coupon_id uuid,
  p_request_key text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  c public.saas_coupons%rowtype;
  v_request text:=btrim(coalesce(p_request_key,''));
  v_scope_count integer;
  v_all_count integer;
begin
  if current_user<>'service_role'
     or p_coupon_id is null
     or v_request !~ '^[A-Za-z0-9._:-]{3,180}$'
  then
    raise exception 'SAAS-COUPONS activation command is invalid';
  end if;

  select * into c
  from public.saas_coupons
  where id=p_coupon_id
  for update;

  if not found then raise exception 'SAAS-COUPONS coupon not found'; end if;

  if c.status='ACTIVE' then
    if c.activation_request_key=v_request then return c.id; end if;
    raise exception 'SAAS-COUPONS coupon is already active';
  end if;
  if c.status<>'DRAFT' then
    raise exception 'SAAS-COUPONS only DRAFT coupon can be activated';
  end if;

  select count(*),count(*) filter(where scope_type='ALL')
    into v_scope_count,v_all_count
  from public.saas_coupon_scopes
  where coupon_id=c.id;

  if v_scope_count=0 or (v_all_count>0 and v_scope_count>1) then
    raise exception 'SAAS-COUPONS coupon scope contract is invalid';
  end if;

  if c.benefit_type='FREE_SETUP'
     and not (
       v_scope_count=1
       and exists(
         select 1 from public.saas_coupon_scopes s
         where s.coupon_id=c.id
           and s.scope_type='COMPONENT'
           and s.component='SETUP'
       )
     )
  then
    raise exception 'SAAS-COUPONS FREE_SETUP must target SETUP only';
  end if;

  perform set_config('app.saas_coupon_mutation','allowed',true);

  update public.saas_coupons
  set status='ACTIVE',
      activated_at=statement_timestamp(),
      activation_request_key=v_request,
      updated_at=statement_timestamp()
  where id=c.id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    c.issuer_organization_id,'SYSTEM','saas-coupons-runtime','SAAS_COUPON_ACTIVATED',
    'saas_coupon',c.id::text,
    jsonb_build_object('status','DRAFT'),
    jsonb_build_object('status','ACTIVE','code',c.code,'paymentCollectionExecuted',false),
    v_request
  );

  perform set_config('app.saas_coupon_mutation','0',true);
  return c.id;
exception when others then
  perform set_config('app.saas_coupon_mutation','0',true);
  raise;
end;
$$;

create or replace function public.retire_saas_coupon_v1(
  p_coupon_id uuid,
  p_request_key text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  c public.saas_coupons%rowtype;
  v_request text:=btrim(coalesce(p_request_key,''));
begin
  if current_user<>'service_role'
     or p_coupon_id is null
     or v_request !~ '^[A-Za-z0-9._:-]{3,180}$'
  then
    raise exception 'SAAS-COUPONS retirement command is invalid';
  end if;

  select * into c from public.saas_coupons where id=p_coupon_id for update;
  if not found then raise exception 'SAAS-COUPONS coupon not found'; end if;

  if c.status='RETIRED' then
    if c.retire_request_key=v_request then return c.id; end if;
    raise exception 'SAAS-COUPONS coupon is already retired';
  end if;
  if c.status<>'ACTIVE' then
    raise exception 'SAAS-COUPONS only ACTIVE coupon can be retired';
  end if;

  perform set_config('app.saas_coupon_mutation','allowed',true);

  update public.saas_coupons
  set status='RETIRED',
      retired_at=statement_timestamp(),
      retire_request_key=v_request,
      updated_at=statement_timestamp()
  where id=c.id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    c.issuer_organization_id,'SYSTEM','saas-coupons-runtime','SAAS_COUPON_RETIRED',
    'saas_coupon',c.id::text,
    jsonb_build_object('status','ACTIVE'),
    jsonb_build_object('status','RETIRED','code',c.code,'paymentCollectionExecuted',false),
    v_request
  );

  perform set_config('app.saas_coupon_mutation','0',true);
  return c.id;
exception when others then
  perform set_config('app.saas_coupon_mutation','0',true);
  raise;
end;
$$;

create or replace function private.recalculate_saas_billing_draft_v1(
  p_organization_id uuid,
  p_statement_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  st public.saas_billing_statements%rowtype;
  bp public.saas_billing_profiles%rowtype;
  v_subtotal numeric:=0;
  v_discount numeric:=0;
  v_tax numeric:=0;
  v_line integer:=0;
begin
  if current_user<>'service_role'
     or coalesce(current_setting('app.saas_billing_mutation',true),'')<>'allowed'
  then
    raise exception 'SAAS-BILLING draft recalculation requires governed service command';
  end if;

  select * into st
  from public.saas_billing_statements
  where organization_id=p_organization_id and id=p_statement_id
  for update;

  if not found or st.status<>'DRAFT' then
    raise exception 'SAAS-BILLING draft statement is required';
  end if;

  select * into bp
  from public.saas_billing_profiles
  where organization_id=p_organization_id and id=st.billing_profile_id;

  if not found then raise exception 'SAAS-BILLING profile evidence is missing'; end if;

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
      jsonb_build_object(
        'taxBps',bp.tax_bps,
        'taxLabel',bp.tax_label,
        'taxSource',bp.tax_source,
        'discountAware',true
      )
    );
  end if;

  update public.saas_billing_statements x
  set discount_total=v_discount,
      tax_total=v_tax,
      subtotal=v_subtotal,
      total=(v_subtotal-v_discount)+v_tax,
      updated_at=statement_timestamp()
  where x.organization_id=p_organization_id and x.id=p_statement_id;
end;
$$;

create or replace function public.apply_saas_coupon_to_statement_v1(
  p_organization_id uuid,
  p_statement_id uuid,
  p_coupon_code text,
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
  c public.saas_coupons%rowtype;
  pv public.pricing_versions%rowtype;
  v_code text:=upper(btrim(coalesce(p_coupon_code,'')));
  v_request text:=btrim(coalesce(p_request_key,''));
  v_hash text;
  existing public.saas_coupon_redemptions%rowtype;
  v_redemption_id uuid:=gen_random_uuid();
  v_total_count integer:=0;
  v_org_count integer:=0;
  v_subscription_count integer:=0;
  v_eligible numeric:=0;
  v_discount numeric:=0;
  v_line integer:=0;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_statement_id is null
     or v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,62}$'
     or v_request !~ '^[A-Za-z0-9._:-]{3,180}$'
  then
    raise exception 'SAAS-COUPONS apply command is invalid';
  end if;

  select * into st
  from public.saas_billing_statements
  where organization_id=p_organization_id and id=p_statement_id
  for update;

  if not found then raise exception 'SAAS-COUPONS billing statement not found'; end if;
  if st.status<>'DRAFT' then
    raise exception 'SAAS-COUPONS can apply only to DRAFT billing statement';
  end if;

  select * into c
  from public.saas_coupons
  where code=v_code
  for update;

  if not found then raise exception 'SAAS-COUPONS coupon not found'; end if;

  v_hash:=md5(jsonb_build_object(
    'organizationId',p_organization_id,
    'statementId',p_statement_id,
    'couponId',c.id,
    'couponCode',c.code
  )::text);

  select * into existing
  from public.saas_coupon_redemptions
  where organization_id=p_organization_id and request_key=v_request;

  if found then
    if existing.request_hash<>v_hash then
      raise exception 'SAAS-COUPONS redemption request key conflict';
    end if;
    return existing.id;
  end if;

  if c.status<>'ACTIVE'
     or statement_timestamp()<c.valid_from
     or (c.valid_to is not null and statement_timestamp()>=c.valid_to)
  then
    raise exception 'SAAS-COUPONS coupon is not active in the redemption window';
  end if;

  select * into pv from public.pricing_versions where id=st.pricing_version_id;
  if not found then raise exception 'SAAS-COUPONS pricing evidence is missing'; end if;

  if exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='ORGANIZATION'
  ) and not exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='ORGANIZATION'
      and t.organization_id=p_organization_id
  ) then
    raise exception 'SAAS-COUPONS Organization target is not eligible';
  end if;

  if exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='PLAN'
  ) and not exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='PLAN'
      and t.plan_id=pv.plan_id
  ) then
    raise exception 'SAAS-COUPONS Plan target is not eligible';
  end if;

  if exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='PRICING_VERSION'
  ) and not exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='PRICING_VERSION'
      and t.pricing_version_id=st.pricing_version_id
  ) then
    raise exception 'SAAS-COUPONS Pricing Version target is not eligible';
  end if;

  if exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='SUBSCRIPTION'
  ) and not exists(
    select 1 from public.saas_coupon_targets t
    where t.coupon_id=c.id and t.target_type='SUBSCRIPTION'
      and t.subscription_id=st.subscription_id
  ) then
    raise exception 'SAAS-COUPONS Subscription target is not eligible';
  end if;

  if exists(
    select 1 from public.saas_coupon_redemptions r
    where r.organization_id=p_organization_id
      and r.statement_id=p_statement_id
  ) then
    raise exception 'SAAS-COUPONS stacking is not enabled for this billing version';
  end if;

  select
    count(*),
    count(*) filter(where organization_id=p_organization_id),
    count(*) filter(where subscription_id=st.subscription_id)
    into v_total_count,v_org_count,v_subscription_count
  from public.saas_coupon_redemptions
  where coupon_id=c.id;

  if c.max_redemptions_total is not null
     and v_total_count>=c.max_redemptions_total
  then
    raise exception 'SAAS-COUPONS total redemption cap reached';
  end if;

  if c.max_redemptions_per_organization is not null
     and v_org_count>=c.max_redemptions_per_organization
  then
    raise exception 'SAAS-COUPONS Organization redemption cap reached';
  end if;

  if c.max_redemptions_per_subscription is not null
     and v_subscription_count>=c.max_redemptions_per_subscription
  then
    raise exception 'SAAS-COUPONS Subscription redemption cap reached';
  end if;

  if c.benefit_type='TRIAL'
     and v_subscription_count>=c.trial_periods
  then
    raise exception 'SAAS-COUPONS trial billing periods exhausted';
  end if;

  select coalesce(sum(li.amount),0)
    into v_eligible
  from public.saas_billing_line_items li
  where li.organization_id=p_organization_id
    and li.statement_id=p_statement_id
    and li.direction='CHARGE'
    and li.component<>'TAX'
    and exists(
      select 1
      from public.saas_coupon_scopes s
      where s.coupon_id=c.id
        and (
          s.scope_type='ALL'
          or (s.scope_type='COMPONENT' and s.component=li.component)
          or (
            s.scope_type='METER_PREFIX'
            and li.meter_key is not null
            and li.meter_key like s.meter_prefix||'%'
          )
        )
    );

  if v_eligible<=0 then
    raise exception 'SAAS-COUPONS coupon has no eligible billing amount';
  end if;

  if c.benefit_type='FIXED' then
    if c.currency<>st.currency then
      raise exception 'SAAS-COUPONS fixed coupon currency does not match billing statement';
    end if;
    v_discount:=least(c.fixed_amount,v_eligible);
  elsif c.benefit_type='PERCENTAGE' then
    v_discount:=round(v_eligible*c.percent_bps/10000.0,6);
  elsif c.benefit_type in ('FREE_SETUP','TRIAL') then
    v_discount:=v_eligible;
  end if;

  if v_discount<=0 then
    raise exception 'SAAS-COUPONS computed discount is not positive';
  end if;

  perform set_config('app.saas_coupon_mutation','allowed',true);
  perform set_config('app.saas_billing_mutation','allowed',true);

  insert into public.saas_coupon_redemptions(
    id,coupon_id,organization_id,subscription_id,statement_id,currency,
    discount_amount,request_key,request_hash,evidence
  ) values (
    v_redemption_id,c.id,p_organization_id,st.subscription_id,p_statement_id,st.currency,
    v_discount,v_request,v_hash,
    jsonb_build_object(
      'authority','SAAS_COUPONS_V1',
      'couponCode',c.code,
      'benefitType',c.benefit_type,
      'eligibleAmount',v_eligible,
      'discountAmount',v_discount,
      'pricingVersionId',st.pricing_version_id,
      'planId',pv.plan_id,
      'paymentCollectionExecuted',false
    )
  );

  select coalesce(max(line_no),0)+1 into v_line
  from public.saas_billing_line_items
  where organization_id=p_organization_id and statement_id=p_statement_id;

  insert into public.saas_billing_line_items(
    organization_id,statement_id,line_no,component,direction,meter_key,
    quantity,included_quantity,billable_quantity,unit_price,amount,
    source_type,source_id,evidence
  ) values (
    p_organization_id,p_statement_id,v_line,'DISCOUNT','CREDIT','COUPON.'||c.code,
    1,0,1,v_discount,v_discount,
    'SAAS_COUPON_REDEMPTION',v_redemption_id::text,
    jsonb_build_object(
      'couponId',c.id,
      'couponCode',c.code,
      'benefitType',c.benefit_type,
      'eligibleAmount',v_eligible,
      'discountAmount',v_discount,
      'discountAuthority','SAAS_COUPONS_V1'
    )
  );

  perform private.recalculate_saas_billing_draft_v1(
    p_organization_id,p_statement_id
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id,causation_id
  ) values (
    p_organization_id,'SYSTEM','saas-coupons-runtime','SAAS_COUPON_REDEEMED',
    'saas_coupon_redemption',v_redemption_id::text,null,
    jsonb_build_object(
      'couponId',c.id,
      'couponCode',c.code,
      'statementId',p_statement_id,
      'subscriptionId',st.subscription_id,
      'discountAmount',v_discount,
      'currency',st.currency,
      'paymentCollectionExecuted',false
    ),
    v_request,st.request_key
  );

  perform set_config('app.saas_billing_mutation','0',true);
  perform set_config('app.saas_coupon_mutation','0',true);
  return v_redemption_id;
exception when others then
  perform set_config('app.saas_billing_mutation','0',true);
  perform set_config('app.saas_coupon_mutation','0',true);
  raise;
end;
$$;

revoke all on function public.guard_saas_coupon_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.saas_coupon_statement_snapshot_bridge()
  from public,anon,authenticated,service_role;

revoke all on function public.create_saas_coupon_v1(
  uuid,uuid,text,text,text,numeric,text,integer,integer,timestamptz,timestamptz,
  integer,integer,integer,jsonb,jsonb,uuid,text
) from public,anon,authenticated;
grant execute on function public.create_saas_coupon_v1(
  uuid,uuid,text,text,text,numeric,text,integer,integer,timestamptz,timestamptz,
  integer,integer,integer,jsonb,jsonb,uuid,text
) to service_role;

revoke all on function public.activate_saas_coupon_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.activate_saas_coupon_v1(uuid,text)
  to service_role;

revoke all on function public.retire_saas_coupon_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.retire_saas_coupon_v1(uuid,text)
  to service_role;

revoke all on function private.recalculate_saas_billing_draft_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function private.recalculate_saas_billing_draft_v1(uuid,uuid)
  to service_role;

revoke all on function public.apply_saas_coupon_to_statement_v1(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.apply_saas_coupon_to_statement_v1(uuid,uuid,text,text)
  to service_role;

comment on function public.create_saas_coupon_v1(
  uuid,uuid,text,text,text,numeric,text,integer,integer,timestamptz,timestamptz,
  integer,integer,integer,jsonb,jsonb,uuid,text
) is
  'Creates one DRAFT platform-billing coupon contract with bounded scopes/targets. No price, subscription or payment mutation.';

comment on function public.apply_saas_coupon_to_statement_v1(uuid,uuid,text,text) is
  'Applies one eligible ACTIVE platform coupon to one DRAFT SAAS-BILLING statement, creates immutable redemption + DISCOUNT evidence and recomputes tax. No payment collection.';
