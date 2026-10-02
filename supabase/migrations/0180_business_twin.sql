-- 0180: BRAIN-BUSINESS-TWIN
-- Versioned read-model snapshots over existing canonical business authorities.
-- No second Catalog, CRM, pricing, Knowledge Base, tenant hierarchy or payment truth.

create table public.business_twin_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version>=1),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{32}$'),
  payload jsonb not null check (
    jsonb_typeof(payload)='object'
    and payload<>'{}'::jsonb
    and octet_length(payload::text)<=1048576
  ),
  published_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,version),
  unique (organization_id,source_hash),
  foreign key (organization_id,published_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict
);

comment on table public.business_twin_versions is
  'Immutable compiled Business Twin read-model versions. Canonical business/config/catalog/booking/payment/locale/knowledge authorities remain upstream truth.';

create index business_twin_versions_org_created_idx
  on public.business_twin_versions(organization_id,created_at desc,id desc);
create index business_twin_versions_publisher_idx
  on public.business_twin_versions(organization_id,published_by_user_id);

alter table public.business_twin_versions enable row level security;

create policy business_twin_versions_member_read
  on public.business_twin_versions for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on table public.business_twin_versions from public,anon,authenticated,service_role;
grant select on table public.business_twin_versions to authenticated;
grant select,insert on table public.business_twin_versions to service_role;

create or replace function public.guard_business_twin_version_immutable()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  raise exception 'Business Twin versions are immutable';
end;
$$;

create trigger business_twin_versions_immutable
before update or delete on public.business_twin_versions
for each row execute function public.guard_business_twin_version_immutable();

create or replace function public.guard_business_twin_scope_configuration()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_old_namespace text:=case when tg_op='INSERT' then null else old.namespace end;
  v_new_namespace text:=case when tg_op='DELETE' then null else new.namespace end;
begin
  if (v_old_namespace='business_twin' or v_new_namespace='business_twin')
     and coalesce(current_setting('app.business_twin_config_mutation',true),'')<>'allowed'
  then
    raise exception 'Business Twin configuration requires governed command';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger scope_configuration_business_twin_guard
before insert or update or delete on public.scope_configuration_overrides
for each row execute function public.guard_business_twin_scope_configuration();

create unique index business_twin_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'BUSINESS_TWIN_%' and correlation_id is not null;

create or replace function private.business_twin_assert_manager(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'Business Twin Organization and actor are required';
  end if;
  if not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_actor_user_id
      and m.role in ('OWNER','ADMIN')
  ) then
    raise exception 'Business Twin mutation requires OWNER or ADMIN';
  end if;
end;
$$;

create or replace function private.business_twin_scope_ref(
  p_scope_type text,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid
)
returns text
language plpgsql
immutable
security invoker
set search_path=pg_catalog
as $$
declare
  v_scope text:=upper(btrim(coalesce(p_scope_type,'')));
begin
  if v_scope='ORGANIZATION' and p_brand_id is null and p_tenant_business_id is null and p_branch_id is null then
    return 'ORGANIZATION';
  elsif v_scope='BRAND' and p_brand_id is not null and p_tenant_business_id is null and p_branch_id is null then
    return 'BRAND:'||p_brand_id::text;
  elsif v_scope='BUSINESS' and p_brand_id is null and p_tenant_business_id is not null and p_branch_id is null then
    return 'BUSINESS:'||p_tenant_business_id::text;
  elsif v_scope='BRANCH' and p_brand_id is null and p_tenant_business_id is null and p_branch_id is not null then
    return 'BRANCH:'||p_branch_id::text;
  end if;
  raise exception 'Business Twin configuration scope is invalid';
end;
$$;

create or replace function private.business_twin_validate_scope(
  p_organization_id uuid,
  p_scope_type text,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid
)
returns void
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_scope text:=upper(btrim(coalesce(p_scope_type,'')));
begin
  perform private.business_twin_scope_ref(v_scope,p_brand_id,p_tenant_business_id,p_branch_id);

  if v_scope='BRAND' and not exists(
    select 1 from public.brands b
    where b.organization_id=p_organization_id and b.id=p_brand_id and b.status='ACTIVE'
  ) then raise exception 'Business Twin Brand scope not found or inactive'; end if;

  if v_scope='BUSINESS' and not exists(
    select 1 from public.tenant_businesses b
    where b.organization_id=p_organization_id and b.id=p_tenant_business_id and b.status='ACTIVE'
  ) then raise exception 'Business Twin Business scope not found or inactive'; end if;

  if v_scope='BRANCH' and not exists(
    select 1 from public.branches b
    where b.organization_id=p_organization_id and b.id=p_branch_id and b.status='ACTIVE'
  ) then raise exception 'Business Twin Branch scope not found or inactive'; end if;
end;
$$;

create or replace function private.business_twin_config_key(p_key text)
returns text
language plpgsql
immutable
security invoker
set search_path=pg_catalog
as $$
declare
  v_key text:=upper(btrim(coalesce(p_key,'')));
begin
  if v_key not in (
    'BUSINESS_HOURS',
    'CUSTOMER_POLICIES',
    'REFUND_POLICY',
    'WARRANTY_POLICY',
    'BOOKING_RULES',
    'PAYMENT_RULES',
    'DELIVERY_RULES',
    'BRAND_TONE',
    'LANGUAGE_PREFERENCES',
    'ESCALATION_RULES',
    'OPERATIONAL_CONSTRAINTS'
  ) then
    raise exception 'Unsupported Business Twin configuration key';
  end if;
  return v_key;
end;
$$;

create or replace function public.set_business_twin_configuration_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_scope_type text,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_config_key text,
  p_config_value jsonb,
  p_expected_version integer,
  p_request_key text
)
returns public.scope_configuration_overrides
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_scope text:=upper(btrim(coalesce(p_scope_type,'')));
  v_key text:=private.business_twin_config_key(p_config_key);
  v_scope_ref text;
  v_entity_id text;
  v_hash text;
  v_existing public.scope_configuration_overrides%rowtype;
  v_result public.scope_configuration_overrides%rowtype;
  v_audit_hash text;
  v_now timestamptz:=statement_timestamp();
begin
  if current_user<>'service_role' then raise exception 'Business Twin mutation is service-only'; end if;
  perform private.business_twin_assert_manager(p_organization_id,p_actor_user_id);
  perform private.business_twin_validate_scope(
    p_organization_id,v_scope,p_brand_id,p_tenant_business_id,p_branch_id
  );
  if p_config_value is null
     or jsonb_typeof(p_config_value)<>'object'
     or p_config_value='{}'::jsonb
     or octet_length(p_config_value::text)>32768
  then raise exception 'Business Twin configuration value must be a bounded non-empty object'; end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Business Twin request key is invalid';
  end if;

  v_scope_ref:=private.business_twin_scope_ref(v_scope,p_brand_id,p_tenant_business_id,p_branch_id);
  v_entity_id:=v_scope_ref||':'||v_key;
  v_hash:=md5(jsonb_build_object(
    'scopeType',v_scope,'brandId',p_brand_id,'businessId',p_tenant_business_id,'branchId',p_branch_id,
    'key',v_key,'value',p_config_value,'expectedVersion',p_expected_version
  )::text);

  select a.after_data->>'requestHash' into v_audit_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='BUSINESS_TWIN_CONFIGURATION_SET'
    and a.entity_type='business_twin_configuration'
    and a.entity_id=v_entity_id
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_audit_hash is not null then
    if v_audit_hash<>v_hash then raise exception 'Business Twin request key conflict'; end if;
    select * into v_result
    from public.scope_configuration_overrides s
    where s.organization_id=p_organization_id
      and s.namespace='business_twin'
      and s.config_key=v_key
      and s.scope_type=v_scope
      and s.brand_id is not distinct from p_brand_id
      and s.tenant_business_id is not distinct from p_tenant_business_id
      and s.branch_id is not distinct from p_branch_id
      and s.department_id is null and s.team_id is null;
    if not found then raise exception 'Business Twin replay target is missing'; end if;
    return v_result;
  end if;

  select * into v_existing
  from public.scope_configuration_overrides s
  where s.organization_id=p_organization_id
    and s.namespace='business_twin'
    and s.config_key=v_key
    and s.scope_type=v_scope
    and s.brand_id is not distinct from p_brand_id
    and s.tenant_business_id is not distinct from p_tenant_business_id
    and s.branch_id is not distinct from p_branch_id
    and s.department_id is null and s.team_id is null
  for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_existing.version then
      raise exception 'Business Twin configuration version changed';
    end if;
  elsif p_expected_version is not null then
    raise exception 'Business Twin configuration does not exist at expected version';
  end if;

  perform set_config('app.business_twin_config_mutation','allowed',true);

  if v_existing.id is null then
    insert into public.scope_configuration_overrides(
      organization_id,scope_type,brand_id,tenant_business_id,branch_id,department_id,team_id,
      namespace,config_key,config_value,version,updated_by,created_at,updated_at
    ) values (
      p_organization_id,v_scope,p_brand_id,p_tenant_business_id,p_branch_id,null,null,
      'business_twin',v_key,p_config_value,1,p_actor_user_id,v_now,v_now
    ) returning * into v_result;
  else
    update public.scope_configuration_overrides
    set config_value=p_config_value,
        version=version+1,
        updated_by=p_actor_user_id,
        updated_at=v_now
    where id=v_existing.id
    returning * into v_result;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id,brand_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'BUSINESS_TWIN_CONFIGURATION_SET',
    'business_twin_configuration',v_entity_id,
    case when v_existing.id is null then null else jsonb_build_object(
      'version',v_existing.version,'value',v_existing.config_value
    ) end,
    jsonb_build_object(
      'requestHash',v_hash,'version',v_result.version,'scopeType',v_scope,
      'configKey',v_key,'value',v_result.config_value
    ),
    p_request_key,p_brand_id,p_tenant_business_id,p_branch_id
  );

  return v_result;
end;
$$;

create or replace function public.delete_business_twin_configuration_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_configuration_id uuid,
  p_expected_version integer,
  p_request_key text
)
returns boolean
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_existing public.scope_configuration_overrides%rowtype;
  v_scope_ref text;
  v_entity_id text;
  v_hash text;
  v_audit_hash text;
begin
  if current_user<>'service_role' then raise exception 'Business Twin mutation is service-only'; end if;
  perform private.business_twin_assert_manager(p_organization_id,p_actor_user_id);
  if p_configuration_id is null or p_expected_version is null or p_expected_version<1 then
    raise exception 'Business Twin delete requires configuration ID and expected version';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Business Twin request key is invalid';
  end if;

  select * into v_existing
  from public.scope_configuration_overrides
  where organization_id=p_organization_id
    and id=p_configuration_id
    and namespace='business_twin'
  for update;

  if not found then
    select a.after_data->>'requestHash',a.entity_id
      into v_audit_hash,v_entity_id
    from public.audit_logs a
    where a.organization_id=p_organization_id
      and a.action='BUSINESS_TWIN_CONFIGURATION_DELETED'
      and a.entity_type='business_twin_configuration'
      and a.correlation_id=p_request_key
    order by a.created_at desc,a.id desc limit 1;
    if v_audit_hash is not null then return true; end if;
    raise exception 'Business Twin configuration not found';
  end if;

  if v_existing.version<>p_expected_version then
    raise exception 'Business Twin configuration version changed';
  end if;

  v_scope_ref:=private.business_twin_scope_ref(
    v_existing.scope_type,v_existing.brand_id,v_existing.tenant_business_id,v_existing.branch_id
  );
  v_entity_id:=v_scope_ref||':'||v_existing.config_key;
  v_hash:=md5(jsonb_build_object(
    'configurationId',p_configuration_id,'expectedVersion',p_expected_version
  )::text);

  select a.after_data->>'requestHash' into v_audit_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='BUSINESS_TWIN_CONFIGURATION_DELETED'
    and a.entity_type='business_twin_configuration'
    and a.entity_id=v_entity_id
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_audit_hash is not null then
    if v_audit_hash<>v_hash then raise exception 'Business Twin request key conflict'; end if;
    return true;
  end if;

  perform set_config('app.business_twin_config_mutation','allowed',true);
  delete from public.scope_configuration_overrides where id=v_existing.id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id,brand_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'BUSINESS_TWIN_CONFIGURATION_DELETED',
    'business_twin_configuration',v_entity_id,
    jsonb_build_object('version',v_existing.version,'value',v_existing.config_value),
    jsonb_build_object('requestHash',v_hash,'deleted',true),
    p_request_key,v_existing.brand_id,v_existing.tenant_business_id,v_existing.branch_id
  );

  return true;
end;
$$;

create or replace function public.compile_business_twin_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
select jsonb_build_object(
  'schemaVersion',1,
  'authority','CANONICAL_COMPOSITION',
  'organization',coalesce((
    select jsonb_build_object(
      'id',o.id,'name',o.name,
      'brandName',s.brand_name,
      'operatorLanguage',s.operator_language,
      'defaultCustomerLanguage',s.default_customer_language
    )
    from public.organizations o
    left join public.organization_settings s on s.organization_id=o.id
    where o.id=p_organization_id
  ),'{}'::jsonb),
  'hierarchy',jsonb_build_object(
    'brands',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'name',b.name,'slug',b.slug,'status',b.status,'metadata',b.metadata
      ) order by b.slug,b.id)
      from public.brands b where b.organization_id=p_organization_id
    ),'[]'::jsonb),
    'businesses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'brandId',b.brand_id,'name',b.name,'slug',b.slug,'legalName',b.legal_name,
        'countryCode',b.country_code,'timezone',b.timezone,'status',b.status,'metadata',b.metadata
      ) order by b.slug,b.id)
      from public.tenant_businesses b where b.organization_id=p_organization_id
    ),'[]'::jsonb),
    'branches',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'businessId',b.tenant_business_id,'name',b.name,'code',b.code,
        'countryCode',b.country_code,'timezone',b.timezone,'status',b.status,'metadata',b.metadata
      ) order by b.code,b.id)
      from public.branches b where b.organization_id=p_organization_id
    ),'[]'::jsonb)
  ),
  'staff',jsonb_build_object(
    'members',coalesce((
      select jsonb_agg(jsonb_build_object('userId',m.user_id,'role',m.role) order by m.role,m.user_id)
      from public.organization_members m where m.organization_id=p_organization_id
    ),'[]'::jsonb),
    'scopeAssignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId',a.user_id,'scopeType',a.scope_type,'role',a.role,
        'brandId',a.brand_id,'businessId',a.tenant_business_id,'branchId',a.branch_id,
        'departmentId',a.department_id,'teamId',a.team_id,'attributes',a.attributes
      ) order by a.user_id,a.scope_type,a.id)
      from public.member_scope_assignments a where a.organization_id=p_organization_id
    ),'[]'::jsonb)
  ),
  'localization',jsonb_build_object(
    'localeProfiles',coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode',l.country_code,'primaryLocale',l.primary_locale,'fallbackLocale',l.fallback_locale,
        'dialect',l.dialect,'toneProfile',l.tone_profile,'dialectIntensity',l.dialect_intensity,
        'maxFirstTouchWords',l.max_first_touch_words,'maxReplyWords',l.max_reply_words
      ) order by l.country_code,l.primary_locale,l.id)
      from public.locale_profiles l where l.organization_id=p_organization_id
    ),'[]'::jsonb),
    'markets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode',m.country_code,'enabled',m.enabled,'currency',m.currency,'timezone',m.timezone,
        'sendWindowStart',m.send_window_start,'sendWindowEnd',m.send_window_end
      ) order by m.country_code,m.id)
      from public.market_settings m where m.organization_id=p_organization_id
    ),'[]'::jsonb)
  ),
  'configuration',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',c.id,'scopeType',c.scope_type,'brandId',c.brand_id,'businessId',c.tenant_business_id,
      'branchId',c.branch_id,'key',c.config_key,'value',c.config_value,'version',c.version,
      'updatedAt',c.updated_at
    ) order by c.scope_type,c.config_key,c.id)
    from public.scope_configuration_overrides c
    where c.organization_id=p_organization_id and c.namespace='business_twin'
  ),'[]'::jsonb),
  'commerce',jsonb_build_object(
    'services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'enabled',s.enabled,
        'prices',coalesce((
          select jsonb_agg(jsonb_build_object(
            'countryCode',p.country_code,'currency',p.currency,'price',p.price,
            'minimumPrice',p.minimum_price,'premiumPrice',p.premium_price,
            'maxAutoDiscountPct',p.max_auto_discount_pct,
            'maxDiscountWithApprovalPct',p.max_discount_with_approval_pct
          ) order by p.country_code,p.currency,p.id)
          from public.service_prices p
          where p.organization_id=s.organization_id and p.service_id=s.id
        ),'[]'::jsonb),
        'catalogProfile',coalesce((
          select jsonb_build_object(
            'description',cp.description,'warrantyText',cp.warranty_text,
            'availabilityMode',cp.availability_mode,'metadata',cp.metadata,'version',cp.version
          )
          from public.catalog_service_profiles cp
          where cp.organization_id=s.organization_id and cp.service_id=s.id
        ),'null'::jsonb),
        'bookingProfile',coalesce((
          select jsonb_build_object(
            'enabled',bp.booking_enabled,'durationMinutes',bp.duration_minutes,
            'bufferBeforeMinutes',bp.buffer_before_minutes,'bufferAfterMinutes',bp.buffer_after_minutes,
            'capacityPerSlot',bp.capacity_per_slot,'locationMode',bp.location_mode,
            'staffMode',bp.staff_mode,'eligibleStaffRoles',to_jsonb(bp.eligible_staff_roles),
            'rules',bp.booking_rules
          )
          from public.service_booking_profiles bp
          where bp.organization_id=s.organization_id and bp.service_id=s.id
        ),'null'::jsonb)
      ) order by s.id)
      from public.services s where s.organization_id=p_organization_id
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'businessId',p.tenant_business_id,'sku',p.sku,'name',p.name,
        'description',p.description,'status',p.status,'warrantyText',p.warranty_text,
        'availabilityMode',p.availability_mode,'inventoryMode',p.inventory_mode,
        'inventoryReference',p.inventory_reference,'metadata',p.metadata,'version',p.version,
        'prices',coalesce((
          select jsonb_agg(jsonb_build_object(
            'variantId',pp.variant_id,'countryCode',pp.country_code,'currency',pp.currency,
            'price',pp.price,'minimumPrice',pp.minimum_price,'compareAtPrice',pp.compare_at_price,
            'version',pp.version
          ) order by pp.variant_id nulls first,pp.country_code,pp.currency,pp.id)
          from public.catalog_product_prices pp
          where pp.organization_id=p.organization_id and pp.product_id=p.id
        ),'[]'::jsonb),
        'variants',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',v.id,'sku',v.sku,'name',v.name,'attributes',v.attributes,'status',v.status,
            'inventoryMode',v.inventory_mode,'inventoryReference',v.inventory_reference,'version',v.version
          ) order by v.sku,v.id)
          from public.catalog_product_variants v
          where v.organization_id=p.organization_id and v.product_id=p.id
        ),'[]'::jsonb)
      ) order by p.sku,p.id)
      from public.catalog_products p where p.organization_id=p_organization_id
    ),'[]'::jsonb)
  ),
  'payments',jsonb_build_object(
    'providers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider',i.provider,'enabled',i.enabled,'status',i.status,
        'accountLabel',i.account_label,'lastCheckedAt',i.last_checked_at
      ) order by i.provider,i.id)
      from public.integration_connections i
      where i.organization_id=p_organization_id and i.channel='PAYMENT'
    ),'[]'::jsonb)
  ),
  'knowledgeReferences',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'key',k.knowledge_key,'version',k.version,'createdAt',k.created_at
    ) order by k.knowledge_key,k.version,k.id)
    from public.knowledge_versions k
    where k.organization_id=p_organization_id and k.active=true
  ),'[]'::jsonb),
  'sourceSummary',jsonb_build_object(
    'brandCount',(select count(*) from public.brands where organization_id=p_organization_id),
    'businessCount',(select count(*) from public.tenant_businesses where organization_id=p_organization_id),
    'branchCount',(select count(*) from public.branches where organization_id=p_organization_id),
    'staffCount',(select count(*) from public.organization_members where organization_id=p_organization_id),
    'serviceCount',(select count(*) from public.services where organization_id=p_organization_id),
    'productCount',(select count(*) from public.catalog_products where organization_id=p_organization_id),
    'localeCount',(select count(*) from public.locale_profiles where organization_id=p_organization_id),
    'businessTwinConfigCount',(select count(*) from public.scope_configuration_overrides where organization_id=p_organization_id and namespace='business_twin'),
    'activeKnowledgeReferenceCount',(select count(*) from public.knowledge_versions where organization_id=p_organization_id and active=true)
  )
)
where exists(select 1 from public.organizations o where o.id=p_organization_id);
$$;

create or replace function public.publish_business_twin_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.business_twin_versions
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_payload jsonb;
  v_hash text;
  v_latest public.business_twin_versions%rowtype;
  v_result public.business_twin_versions%rowtype;
  v_audit_hash text;
  v_audit_version_id uuid;
  v_next_version integer;
begin
  if current_user<>'service_role' then raise exception 'Business Twin publish is service-only'; end if;
  perform private.business_twin_assert_manager(p_organization_id,p_actor_user_id);
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Business Twin request key is invalid';
  end if;

  perform 1 from public.organizations where id=p_organization_id for update;
  if not found then raise exception 'Business Twin Organization not found'; end if;

  v_payload:=public.compile_business_twin_v1(p_organization_id);
  if v_payload is null or v_payload='{}'::jsonb then
    raise exception 'Business Twin compilation produced no canonical truth';
  end if;
  v_hash:=md5(v_payload::text);

  select a.after_data->>'requestHash',(a.after_data->>'versionId')::uuid
    into v_audit_hash,v_audit_version_id
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='BUSINESS_TWIN_PUBLISHED'
    and a.entity_type='business_twin'
    and a.entity_id=p_organization_id::text
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_audit_hash is not null then
    if v_audit_hash<>v_hash then raise exception 'Business Twin request key conflict'; end if;
    select * into v_result from public.business_twin_versions
    where organization_id=p_organization_id and id=v_audit_version_id;
    if not found then raise exception 'Business Twin replay version is missing'; end if;
    return v_result;
  end if;

  select * into v_latest
  from public.business_twin_versions
  where organization_id=p_organization_id
  order by version desc limit 1
  for update;

  if v_latest.id is not null and v_latest.source_hash=v_hash then
    v_result:=v_latest;
  else
    v_next_version:=coalesce(v_latest.version,0)+1;
    insert into public.business_twin_versions(
      organization_id,version,source_hash,payload,published_by_user_id
    ) values (
      p_organization_id,v_next_version,v_hash,v_payload,p_actor_user_id
    ) returning * into v_result;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'BUSINESS_TWIN_PUBLISHED',
    'business_twin',p_organization_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'versionId',v_result.id,'version',v_result.version,
      'sourceHash',v_result.source_hash,'reusedExistingVersion',v_latest.id=v_result.id
    ),
    p_request_key
  );

  return v_result;
end;
$$;

revoke all on function public.compile_business_twin_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.set_business_twin_configuration_v1(uuid,uuid,text,uuid,uuid,uuid,text,jsonb,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.delete_business_twin_configuration_v1(uuid,uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.publish_business_twin_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.business_twin_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.business_twin_scope_ref(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.business_twin_validate_scope(uuid,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.business_twin_config_key(text) from public,anon,authenticated,service_role;

grant execute on function public.compile_business_twin_v1(uuid) to service_role;
grant execute on function public.set_business_twin_configuration_v1(uuid,uuid,text,uuid,uuid,uuid,text,jsonb,integer,text) to service_role;
grant execute on function public.delete_business_twin_configuration_v1(uuid,uuid,uuid,integer,text) to service_role;
grant execute on function public.publish_business_twin_v1(uuid,uuid,text) to service_role;
grant execute on function private.business_twin_assert_manager(uuid,uuid) to service_role;
grant execute on function private.business_twin_scope_ref(text,uuid,uuid,uuid) to service_role;
grant execute on function private.business_twin_validate_scope(uuid,text,uuid,uuid,uuid) to service_role;
grant execute on function private.business_twin_config_key(text) to service_role;

comment on function public.compile_business_twin_v1(uuid) is
  'Compiles canonical Business Twin read-model JSON from existing hierarchy, config, staff, locale, catalog, booking, payment and Knowledge references. Does not create source truth.';
comment on function public.publish_business_twin_v1(uuid,uuid,text) is
  'Publishes an immutable deduplicated Business Twin version from canonical truth. No external side effects.';
