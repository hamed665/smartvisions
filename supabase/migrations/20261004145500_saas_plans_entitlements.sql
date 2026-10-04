-- SAAS-PLANS-ENTITLEMENTS
--
-- Completes the governed SaaS plan/entitlement contract by extending the
-- existing Control Plane authority. No second plan, subscription, feature,
-- usage, billing or tenant authority is introduced.
--
-- Commercial pricing is deliberately NOT invented here. Canonical plan
-- identities are migration-managed and remain DRAFT until SAAS-BILLING
-- publishes real pricing versions.

insert into public.plans(code,name,status,description,metadata)
values
  ('STARTER','Starter','DRAFT','Canonical Starter plan identity.',jsonb_build_object('canonical',true,'sortOrder',10,'commercialActivation','PENDING_SAAS_BILLING')),
  ('GROWTH','Growth','DRAFT','Canonical Growth plan identity.',jsonb_build_object('canonical',true,'sortOrder',20,'commercialActivation','PENDING_SAAS_BILLING')),
  ('PRO','Pro','DRAFT','Canonical Pro plan identity.',jsonb_build_object('canonical',true,'sortOrder',30,'commercialActivation','PENDING_SAAS_BILLING')),
  ('BUSINESS','Business','DRAFT','Canonical Business plan identity.',jsonb_build_object('canonical',true,'sortOrder',40,'commercialActivation','PENDING_SAAS_BILLING')),
  ('AGENCY','Agency','DRAFT','Canonical Agency plan identity.',jsonb_build_object('canonical',true,'sortOrder',50,'commercialActivation','PENDING_SAAS_BILLING')),
  ('ENTERPRISE','Enterprise','DRAFT','Canonical Enterprise plan identity.',jsonb_build_object('canonical',true,'sortOrder',60,'commercialActivation','PENDING_SAAS_BILLING'))
on conflict(code) do nothing;

do $canonical_plan_identity$
begin
  if exists (
    select 1
    from public.plans
    where code in ('STARTER','GROWTH','PRO','BUSINESS','AGENCY','ENTERPRISE')
      and (
        name <> initcap(lower(code))
        or coalesce((metadata->>'canonical')::boolean,false) <> true
      )
  ) then
    raise exception 'Canonical SaaS plan identity conflicts with an existing plan row';
  end if;

  if (
    select count(*)
    from public.plans
    where code in ('STARTER','GROWTH','PRO','BUSINESS','AGENCY','ENTERPRISE')
  ) <> 6 then
    raise exception 'Canonical SaaS plan identity set is incomplete';
  end if;
end;
$canonical_plan_identity$;

create or replace function public.validate_saas_entitlement_value(
  p_feature_key text,
  p_value jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_key text := upper(btrim(coalesce(p_feature_key,'')));
  v_prefix text;
  v_kind text;
  v_limit numeric;
  v_count integer;
  v_distinct integer;
begin
  if v_key !~ '^(FEATURE|LIMIT|SEATS|CHANNELS|ADDON|API|STORAGE)\.[A-Z0-9][A-Z0-9_.:-]{0,110}$' then
    return false;
  end if;

  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return false;
  end if;

  v_prefix := split_part(v_key,'.',1);
  v_kind := upper(btrim(coalesce(p_value->>'kind','')));

  if v_prefix in ('FEATURE','ADDON') then
    return v_kind='BOOLEAN'
      and (p_value - array['kind','enabled']::text[])='{}'::jsonb
      and p_value ? 'enabled'
      and jsonb_typeof(p_value->'enabled')='boolean';
  end if;

  if v_prefix='CHANNELS' then
    if v_kind<>'SET'
       or (p_value - array['kind','values']::text[])<>'{}'::jsonb
       or jsonb_typeof(p_value->'values')<>'array'
       or jsonb_array_length(p_value->'values')>64
    then
      return false;
    end if;

    if exists(
      select 1
      from jsonb_array_elements(p_value->'values') x(value)
      where jsonb_typeof(x.value)<>'string'
         or trim(both '"' from x.value::text) !~ '^[A-Z][A-Z0-9_.:-]{0,63}$'
    ) then
      return false;
    end if;

    select count(*),count(distinct trim(both '"' from x.value::text))
      into v_count,v_distinct
    from jsonb_array_elements(p_value->'values') x(value);

    return v_count=v_distinct;
  end if;

  if v_prefix in ('LIMIT','SEATS','API','STORAGE') then
    if v_kind<>'LIMIT'
       or (p_value - array['kind','limit','unlimited','unit']::text[])<>'{}'::jsonb
       or nullif(btrim(p_value->>'unit'),'') is null
       or upper(btrim(p_value->>'unit')) !~ '^[A-Z][A-Z0-9_]{0,31}$'
    then
      return false;
    end if;

    if (p_value ? 'limit') = (p_value ? 'unlimited') then
      return false;
    end if;

    if p_value ? 'unlimited' then
      return jsonb_typeof(p_value->'unlimited')='boolean'
        and (p_value->>'unlimited')::boolean=true;
    end if;

    if jsonb_typeof(p_value->'limit')<>'number' then
      return false;
    end if;

    v_limit := (p_value->>'limit')::numeric;
    return v_limit>=0 and v_limit=trunc(v_limit);
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

create or replace function public.enforce_saas_entitlement_shape()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  new.feature_key := upper(btrim(new.feature_key));
  if not public.validate_saas_entitlement_value(new.feature_key,new.entitlement_value) then
    raise exception 'Invalid SaaS entitlement key/value contract';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_entitlements_saas_shape_guard
  on public.plan_entitlements;
create trigger plan_entitlements_saas_shape_guard
before insert or update of feature_key,entitlement_value
on public.plan_entitlements
for each row execute function public.enforce_saas_entitlement_shape();

drop trigger if exists organization_entitlement_overrides_saas_shape_guard
  on public.organization_entitlement_overrides;
create trigger organization_entitlement_overrides_saas_shape_guard
before insert or update of feature_key,entitlement_value
on public.organization_entitlement_overrides
for each row execute function public.enforce_saas_entitlement_shape();

alter table public.plan_entitlements
  drop constraint if exists plan_entitlements_saas_shape_check;
alter table public.plan_entitlements
  add constraint plan_entitlements_saas_shape_check
  check (public.validate_saas_entitlement_value(feature_key,entitlement_value));

alter table public.organization_entitlement_overrides
  drop constraint if exists organization_entitlement_overrides_saas_shape_check;
alter table public.organization_entitlement_overrides
  add constraint organization_entitlement_overrides_saas_shape_check
  check (public.validate_saas_entitlement_value(feature_key,entitlement_value));

create or replace function public.get_effective_saas_entitlements(
  p_organization_id uuid,
  p_at timestamptz default now()
)
returns table(
  feature_key text,
  entitlement_value jsonb,
  source_type text,
  subscription_id uuid,
  subscription_status text,
  plan_code text,
  pricing_version_id uuid,
  override_id uuid,
  valid_from timestamptz,
  valid_to timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
begin
  if p_organization_id is null or p_at is null then
    raise exception 'Organization and evaluation time are required';
  end if;

  if current_user='authenticated' then
    if not public.is_org_member(p_organization_id) then
      raise exception 'Organization membership required';
    end if;
  elsif current_user<>'service_role' then
    raise exception 'SaaS entitlement read requires authenticated membership or service role';
  end if;

  return query
  with live_subscription as (
    select
      s.id as subscription_id,
      s.status as subscription_status,
      s.pricing_version_id,
      p.code as plan_code
    from public.subscriptions s
    join public.pricing_versions pv on pv.id=s.pricing_version_id
    join public.plans p on p.id=pv.plan_id
    where s.organization_id=p_organization_id
      and s.status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED')
    order by s.started_at desc,s.id desc
    limit 1
  ),
  base as (
    select
      e.feature_key,
      e.entitlement_value,
      ls.subscription_id,
      ls.subscription_status,
      ls.plan_code,
      ls.pricing_version_id
    from live_subscription ls
    join public.plan_entitlements e
      on e.pricing_version_id=ls.pricing_version_id
  ),
  active_override as (
    select distinct on (o.feature_key)
      o.id,
      o.feature_key,
      o.entitlement_value,
      o.source_type,
      o.valid_from,
      o.valid_to
    from public.organization_entitlement_overrides o
    where o.organization_id=p_organization_id
      and o.valid_from<=p_at
      and (o.valid_to is null or p_at<o.valid_to)
    order by o.feature_key,o.valid_from desc,o.created_at desc,o.id desc
  ),
  keys as (
    select b.feature_key from base b
    union
    select o.feature_key from active_override o
  )
  select
    k.feature_key,
    coalesce(o.entitlement_value,b.entitlement_value) as entitlement_value,
    case when o.id is not null then 'OVERRIDE:'||o.source_type else 'PLAN' end as source_type,
    b.subscription_id,
    b.subscription_status,
    b.plan_code,
    b.pricing_version_id,
    o.id as override_id,
    o.valid_from,
    o.valid_to
  from keys k
  left join base b on b.feature_key=k.feature_key
  left join active_override o on o.feature_key=k.feature_key
  order by k.feature_key;
end;
$$;

revoke all on function public.validate_saas_entitlement_value(text,jsonb)
  from public,anon,authenticated;
grant execute on function public.validate_saas_entitlement_value(text,jsonb)
  to service_role;

revoke all on function public.enforce_saas_entitlement_shape()
  from public,anon,authenticated,service_role;

revoke all on function public.get_effective_saas_entitlements(uuid,timestamptz)
  from public,anon;
grant execute on function public.get_effective_saas_entitlements(uuid,timestamptz)
  to authenticated,service_role;

comment on function public.validate_saas_entitlement_value(text,jsonb) is
  'Canonical SAAS-PLANS-ENTITLEMENTS shape validator for FEATURE/LIMIT/SEATS/CHANNELS/ADDON/API/STORAGE entitlement keys.';
comment on function public.get_effective_saas_entitlements(uuid,timestamptz) is
  'Canonical effective entitlement read model: active Organization override wins over immutable subscribed pricing-version entitlement; no subscription/override means no granted row.';
