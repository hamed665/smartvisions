-- 0175: INVENTORY-FULFILLMENT
-- First canonical stock, reservation and inventory movement authority.
-- Reuses Catalog Product/Variant identity, Branch identity and ORDER-ENGINE
-- customer-facing fulfillment. It does not create a second Catalog, Branch,
-- Order, Booking, Field Service, Invoice or Payment truth.

alter table public.catalog_products
  drop constraint catalog_products_inventory_mode_check,
  drop constraint catalog_products_check;
alter table public.catalog_products
  add constraint catalog_products_inventory_mode_check
    check (inventory_mode in ('NONE','REFERENCE_ONLY','STOCKED')),
  add constraint catalog_products_check
    check (
      (inventory_mode in ('NONE','STOCKED') and inventory_reference is null)
      or
      (inventory_mode='REFERENCE_ONLY' and inventory_reference is not null
        and length(btrim(inventory_reference)) between 1 and 512)
    );

alter table public.catalog_product_variants
  drop constraint catalog_product_variants_inventory_mode_check,
  drop constraint catalog_product_variants_check;
alter table public.catalog_product_variants
  add constraint catalog_product_variants_inventory_mode_check
    check (inventory_mode in ('INHERIT','NONE','REFERENCE_ONLY','STOCKED')),
  add constraint catalog_product_variants_check
    check (
      (inventory_mode in ('INHERIT','NONE','STOCKED') and inventory_reference is null)
      or
      (inventory_mode='REFERENCE_ONLY' and inventory_reference is not null
        and length(btrim(inventory_reference)) between 1 and 512)
    );

create or replace function public.upsert_catalog_product_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_product_id uuid,
  p_tenant_business_id uuid,
  p_sku text,
  p_name text,
  p_description text,
  p_status text,
  p_warranty_text text,
  p_availability_mode text,
  p_inventory_mode text,
  p_inventory_reference text,
  p_expected_version integer,
  p_branch_ids uuid[],
  p_request_key text
)
returns public.catalog_products
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_current public.catalog_products%rowtype;
  v_result public.catalog_products%rowtype;
  v_sku text:=upper(btrim(coalesce(p_sku,'')));
  v_name text:=btrim(coalesce(p_name,''));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_mode text:=upper(btrim(coalesce(p_availability_mode,'')));
  v_inventory text:=upper(btrim(coalesce(p_inventory_mode,'')));
  v_inventory_ref text:=nullif(btrim(coalesce(p_inventory_reference,'')),'');
  v_branches uuid[];
  v_hash text;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.catalog_v2_assert_owner(p_organization_id,p_actor_user_id);
  if p_product_id is null or p_tenant_business_id is null
     or v_sku !~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'
     or length(v_name) not between 1 and 240
     or v_status not in ('ACTIVE','ARCHIVED')
     or v_mode not in ('ALL_ACTIVE_BRANCHES','EXPLICIT_BRANCHES','ONLINE_ONLY','NOT_OFFERED')
     or v_inventory not in ('NONE','REFERENCE_ONLY','STOCKED')
     or (v_inventory in ('NONE','STOCKED') and v_inventory_ref is not null)
     or (v_inventory='REFERENCE_ONLY' and (v_inventory_ref is null or length(v_inventory_ref)>512))
     or (p_description is not null and length(btrim(p_description)) not between 1 and 8000)
     or (p_warranty_text is not null and length(btrim(p_warranty_text)) not between 1 and 4000)
  then raise exception 'CATALOG-V2 product payload is invalid'; end if;

  if not exists(
    select 1 from public.tenant_businesses tb
    where tb.organization_id=p_organization_id
      and tb.id=p_tenant_business_id
      and tb.status='ACTIVE'
  ) then raise exception 'CATALOG-V2 product Business is missing or inactive'; end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[])
    into v_branches from unnest(coalesce(p_branch_ids,'{}'::uuid[])) x;

  if v_mode='EXPLICIT_BRANCHES' and cardinality(v_branches)=0 then
    raise exception 'CATALOG-V2 explicit product availability requires a branch';
  end if;
  if v_mode<>'EXPLICIT_BRANCHES' and cardinality(v_branches)>0 then
    raise exception 'CATALOG-V2 product branch IDs are valid only for EXPLICIT_BRANCHES';
  end if;
  if exists(
    select 1 from unnest(v_branches) x
    where not exists(
      select 1 from public.branches b
      where b.organization_id=p_organization_id
        and b.tenant_business_id=p_tenant_business_id
        and b.id=x and b.status='ACTIVE'
    )
  ) then raise exception 'CATALOG-V2 product branch scope is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'productId',p_product_id,'businessId',p_tenant_business_id,'sku',v_sku,
    'name',v_name,'description',nullif(btrim(coalesce(p_description,'')),''),
    'status',v_status,'warranty',nullif(btrim(coalesce(p_warranty_text,'')),''),
    'availabilityMode',v_mode,'inventoryMode',v_inventory,
    'inventoryReference',v_inventory_ref,'branchIds',to_jsonb(v_branches),
    'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_PRODUCT_CONFIGURED','catalog_product',
    p_product_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_products
    where organization_id=p_organization_id and id=p_product_id;
    return v_result;
  end if;

  select * into v_current from public.catalog_products
  where organization_id=p_organization_id and id=p_product_id
  for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_current.version then
      raise exception 'CATALOG-V2 product version changed';
    end if;
    if v_current.tenant_business_id<>p_tenant_business_id then
      raise exception 'CATALOG-V2 product Business ownership is immutable';
    end if;
  elsif p_expected_version is not null then
    raise exception 'CATALOG-V2 product does not exist at expected version';
  end if;

  v_hash:=md5(jsonb_build_object(
    'productId',p_product_id,'businessId',p_tenant_business_id,'sku',v_sku,
    'name',v_name,'description',nullif(btrim(coalesce(p_description,'')),''),
    'status',v_status,'warranty',nullif(btrim(coalesce(p_warranty_text,'')),''),
    'availabilityMode',v_mode,'inventoryMode',v_inventory,
    'inventoryReference',v_inventory_ref,'branchIds',to_jsonb(v_branches),
    'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_PRODUCT_CONFIGURED','catalog_product',
    p_product_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_products
    where organization_id=p_organization_id and id=p_product_id;
    return v_result;
  end if;

  perform set_config('app.catalog_v2_mutation','allowed',true);

  insert into public.catalog_products(
    id,organization_id,tenant_business_id,sku,name,description,status,warranty_text,
    availability_mode,inventory_mode,inventory_reference,version,
    created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_product_id,p_organization_id,p_tenant_business_id,v_sku,v_name,
    nullif(btrim(coalesce(p_description,'')),''),
    v_status,nullif(btrim(coalesce(p_warranty_text,'')),''),
    v_mode,v_inventory,v_inventory_ref,1,
    p_actor_user_id,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,id) do update set
    sku=excluded.sku,name=excluded.name,description=excluded.description,
    status=excluded.status,warranty_text=excluded.warranty_text,
    availability_mode=excluded.availability_mode,
    inventory_mode=excluded.inventory_mode,
    inventory_reference=excluded.inventory_reference,
    version=public.catalog_products.version+1,
    updated_by_user_id=excluded.updated_by_user_id,
    updated_at=v_now
  returning * into v_result;

  delete from public.catalog_branch_availability
  where organization_id=p_organization_id and product_id=p_product_id and variant_id is null;

  if v_mode='EXPLICIT_BRANCHES' then
    insert into public.catalog_branch_availability(
      organization_id,branch_id,product_id,enabled,created_by_user_id,updated_by_user_id
    )
    select p_organization_id,x,p_product_id,true,p_actor_user_id,p_actor_user_id
    from unnest(v_branches) x;
  end if;

  perform set_config('app.catalog_v2_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CATALOG_V2_PRODUCT_CONFIGURED','catalog_product',p_product_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'version',v_result.version,'sku',v_sku,
      'availabilityMode',v_mode,'branchIds',to_jsonb(v_branches),
      'inventoryMode',v_inventory,'stockTruthCreated',false,
      'pricingAuthority','catalog_product_prices'
    ),
    p_request_key,p_tenant_business_id
  );

  return v_result;
end;
$$;

create or replace function public.upsert_catalog_product_variant_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_variant_id uuid,
  p_product_id uuid,
  p_sku text,
  p_name text,
  p_attributes jsonb,
  p_status text,
  p_inventory_mode text,
  p_inventory_reference text,
  p_expected_version integer,
  p_request_key text
)
returns public.catalog_product_variants
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_current public.catalog_product_variants%rowtype;
  v_result public.catalog_product_variants%rowtype;
  v_sku text:=upper(btrim(coalesce(p_sku,'')));
  v_name text:=btrim(coalesce(p_name,''));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_inventory text:=upper(btrim(coalesce(p_inventory_mode,'')));
  v_inventory_ref text:=nullif(btrim(coalesce(p_inventory_reference,'')),'');
  v_attrs jsonb:=coalesce(p_attributes,'{}'::jsonb);
  v_hash text;
  v_business uuid;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.catalog_v2_assert_owner(p_organization_id,p_actor_user_id);
  select tenant_business_id into v_business from public.catalog_products
  where organization_id=p_organization_id and id=p_product_id;
  if not found then raise exception 'CATALOG-V2 variant product not found'; end if;

  if p_variant_id is null
     or v_sku !~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'
     or length(v_name) not between 1 and 240
     or v_status not in ('ACTIVE','ARCHIVED')
     or v_inventory not in ('INHERIT','NONE','REFERENCE_ONLY','STOCKED')
     or (v_inventory in ('INHERIT','NONE','STOCKED') and v_inventory_ref is not null)
     or (v_inventory='REFERENCE_ONLY' and (v_inventory_ref is null or length(v_inventory_ref)>512))
     or jsonb_typeof(v_attrs)<>'object' or octet_length(v_attrs::text)>8192
  then raise exception 'CATALOG-V2 variant payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'variantId',p_variant_id,'productId',p_product_id,'sku',v_sku,'name',v_name,
    'attributes',v_attrs,'status',v_status,'inventoryMode',v_inventory,
    'inventoryReference',v_inventory_ref,'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_VARIANT_CONFIGURED','catalog_variant',
    p_variant_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_product_variants
    where organization_id=p_organization_id and id=p_variant_id;
    return v_result;
  end if;

  select * into v_current from public.catalog_product_variants
  where organization_id=p_organization_id and id=p_variant_id
  for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_current.version then
      raise exception 'CATALOG-V2 variant version changed';
    end if;
    if v_current.product_id<>p_product_id then
      raise exception 'CATALOG-V2 variant Product ownership is immutable';
    end if;
  elsif p_expected_version is not null then
    raise exception 'CATALOG-V2 variant does not exist at expected version';
  end if;

  v_hash:=md5(jsonb_build_object(
    'variantId',p_variant_id,'productId',p_product_id,'sku',v_sku,'name',v_name,
    'attributes',v_attrs,'status',v_status,'inventoryMode',v_inventory,
    'inventoryReference',v_inventory_ref,'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_VARIANT_CONFIGURED','catalog_variant',
    p_variant_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_product_variants
    where organization_id=p_organization_id and id=p_variant_id;
    return v_result;
  end if;

  perform set_config('app.catalog_v2_mutation','allowed',true);
  insert into public.catalog_product_variants(
    id,organization_id,product_id,sku,name,attributes,status,
    inventory_mode,inventory_reference,version,
    created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_variant_id,p_organization_id,p_product_id,v_sku,v_name,v_attrs,v_status,
    v_inventory,v_inventory_ref,1,p_actor_user_id,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,id) do update set
    sku=excluded.sku,name=excluded.name,attributes=excluded.attributes,status=excluded.status,
    inventory_mode=excluded.inventory_mode,inventory_reference=excluded.inventory_reference,
    version=public.catalog_product_variants.version+1,
    updated_by_user_id=excluded.updated_by_user_id,updated_at=v_now
  returning * into v_result;
  perform set_config('app.catalog_v2_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CATALOG_V2_VARIANT_CONFIGURED','catalog_variant',p_variant_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'version',v_result.version,'productId',p_product_id,
      'inventoryMode',v_inventory,'stockTruthCreated',false
    ),
    p_request_key,v_business
  );
  return v_result;
end;
$$;

create table public.inventory_locations (
  id uuid primary key,
  organization_id uuid not null,
  tenant_business_id uuid not null,
  location_kind text not null check (location_kind in ('BRANCH','WAREHOUSE')),
  branch_id uuid,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384),
  version integer not null default 1 check (version>=1),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,tenant_business_id,code),
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,branch_id)
    references public.branches(organization_id,id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (code=upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'),
  check (length(btrim(name)) between 1 and 240),
  check ((location_kind='BRANCH' and branch_id is not null) or (location_kind='WAREHOUSE' and branch_id is null))
);
create unique index inventory_locations_branch_uidx
  on public.inventory_locations(organization_id,branch_id)
  where branch_id is not null;
create index inventory_locations_business_idx on public.inventory_locations(organization_id,tenant_business_id,status,code);
create index inventory_locations_creator_idx on public.inventory_locations(organization_id,created_by_user_id);
create index inventory_locations_updater_idx on public.inventory_locations(organization_id,updated_by_user_id);

create table public.inventory_items (
  id uuid primary key,
  organization_id uuid not null,
  tenant_business_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  unit_code text not null default 'EA',
  low_stock_threshold numeric(18,4) not null default 0 check (low_stock_threshold>=0 and low_stock_threshold<=1000000000000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  version integer not null default 1 check (version>=1),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,product_id)
    references public.catalog_products(organization_id,id) on delete restrict,
  foreign key (organization_id,variant_id,product_id)
    references public.catalog_product_variants(organization_id,id,product_id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (unit_code=upper(btrim(unit_code)) and unit_code ~ '^[A-Z][A-Z0-9_-]{0,15}$')
);
create unique index inventory_items_subject_uidx
  on public.inventory_items(
    organization_id,product_id,
    coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)
  );
create index inventory_items_business_idx on public.inventory_items(organization_id,tenant_business_id,status);
create index inventory_items_variant_idx on public.inventory_items(organization_id,variant_id) where variant_id is not null;
create index inventory_items_creator_idx on public.inventory_items(organization_id,created_by_user_id);
create index inventory_items_updater_idx on public.inventory_items(organization_id,updated_by_user_id);

create table public.inventory_stock_balances (
  organization_id uuid not null,
  item_id uuid not null,
  location_id uuid not null,
  on_hand_quantity numeric(18,4) not null default 0 check (on_hand_quantity>=0),
  reserved_quantity numeric(18,4) not null default 0 check (reserved_quantity>=0),
  version integer not null default 1 check (version>=1),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,item_id,location_id),
  foreign key (organization_id,item_id)
    references public.inventory_items(organization_id,id) on delete restrict,
  foreign key (organization_id,location_id)
    references public.inventory_locations(organization_id,id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (reserved_quantity<=on_hand_quantity)
);
create index inventory_balances_location_idx on public.inventory_stock_balances(organization_id,location_id,item_id);
create index inventory_balances_updater_idx on public.inventory_stock_balances(organization_id,updated_by_user_id);

create table public.inventory_reservations (
  id uuid primary key,
  organization_id uuid not null,
  order_id uuid not null,
  order_line_item_id uuid not null,
  item_id uuid not null,
  location_id uuid not null,
  reserved_quantity numeric(18,4) not null check (reserved_quantity>0 and reserved_quantity<=1000000000000),
  consumed_quantity numeric(18,4) not null default 0 check (consumed_quantity>=0),
  released_quantity numeric(18,4) not null default 0 check (released_quantity>=0),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','PARTIAL','CONSUMED','RELEASED','CLOSED')),
  source_evidence jsonb not null
    check (jsonb_typeof(source_evidence)='object' and source_evidence<>'{}'::jsonb and octet_length(source_evidence::text)<=16384),
  request_key text not null,
  request_hash text not null,
  version integer not null default 1 check (version>=1),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,request_key),
  foreign key (organization_id,order_id)
    references public.orders(organization_id,id) on delete restrict,
  foreign key (organization_id,order_line_item_id,order_id)
    references public.order_line_items(organization_id,id,order_id) on delete restrict,
  foreign key (organization_id,item_id)
    references public.inventory_items(organization_id,id) on delete restrict,
  foreign key (organization_id,location_id)
    references public.inventory_locations(organization_id,id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (consumed_quantity+released_quantity<=reserved_quantity),
  check (length(btrim(request_key)) between 8 and 240),
  check (request_hash ~ '^[0-9a-f]{32}$')
);
create unique index inventory_reservations_active_line_location_uidx
  on public.inventory_reservations(organization_id,order_line_item_id,location_id)
  where status in ('ACTIVE','PARTIAL');
create index inventory_reservations_order_idx on public.inventory_reservations(organization_id,order_id,status,created_at,id);
create index inventory_reservations_line_idx on public.inventory_reservations(organization_id,order_line_item_id,status);
create index inventory_reservations_item_idx on public.inventory_reservations(organization_id,item_id,status);
create index inventory_reservations_location_idx on public.inventory_reservations(organization_id,location_id,status);
create index inventory_reservations_creator_idx on public.inventory_reservations(organization_id,created_by_user_id);
create index inventory_reservations_updater_idx on public.inventory_reservations(organization_id,updated_by_user_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  item_id uuid not null,
  location_id uuid not null,
  movement_type text not null
    check (movement_type in ('ADJUSTMENT','RESERVE','RELEASE','FULFILL')),
  on_hand_delta numeric(18,4) not null,
  reserved_delta numeric(18,4) not null,
  on_hand_after numeric(18,4) not null check (on_hand_after>=0),
  reserved_after numeric(18,4) not null check (reserved_after>=0),
  low_stock_threshold_snapshot numeric(18,4) not null check (low_stock_threshold_snapshot>=0),
  low_stock_after boolean not null,
  reservation_id uuid,
  order_id uuid,
  order_line_item_id uuid,
  actor_type text not null check (actor_type in ('USER','SYSTEM')),
  actor_user_id uuid,
  reason text,
  evidence jsonb not null
    check (jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb and octet_length(evidence::text)<=16384),
  request_key text not null,
  request_hash text not null,
  occurred_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,request_key),
  foreign key (organization_id,item_id)
    references public.inventory_items(organization_id,id) on delete restrict,
  foreign key (organization_id,location_id)
    references public.inventory_locations(organization_id,id) on delete restrict,
  foreign key (organization_id,reservation_id)
    references public.inventory_reservations(organization_id,id) on delete restrict,
  foreign key (organization_id,order_id)
    references public.orders(organization_id,id) on delete restrict,
  foreign key (organization_id,order_line_item_id,order_id)
    references public.order_line_items(organization_id,id,order_id) on delete restrict,
  foreign key (organization_id,actor_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (reserved_after<=on_hand_after),
  check (on_hand_delta<>0 or reserved_delta<>0),
  check ((actor_type='USER' and actor_user_id is not null) or (actor_type='SYSTEM' and actor_user_id is null)),
  check (reason is null or length(btrim(reason)) between 1 and 2000),
  check (length(btrim(request_key)) between 8 and 240),
  check (request_hash ~ '^[0-9a-f]{32}$')
);
create index inventory_movements_item_idx on public.inventory_movements(organization_id,item_id,occurred_at desc,id);
create index inventory_movements_location_idx on public.inventory_movements(organization_id,location_id,occurred_at desc,id);
create index inventory_movements_reservation_idx on public.inventory_movements(organization_id,reservation_id) where reservation_id is not null;
create index inventory_movements_order_idx on public.inventory_movements(organization_id,order_id,occurred_at desc,id) where order_id is not null;
create index inventory_movements_line_idx on public.inventory_movements(organization_id,order_line_item_id,occurred_at desc,id) where order_line_item_id is not null;
create index inventory_movements_actor_idx on public.inventory_movements(organization_id,actor_user_id) where actor_user_id is not null;

comment on table public.inventory_locations is
  'Inventory-only physical stock locations. BRANCH reuses canonical public.branches; WAREHOUSE is owned only by Inventory and never replaces Branch identity.';
comment on table public.inventory_items is
  'Inventory tracking configuration over canonical Catalog Product/Variant identity. Product names, SKUs and prices remain Catalog-owned.';
comment on table public.inventory_stock_balances is
  'Canonical current stock balance. Governed commands keep it consistent with immutable inventory_movements.';
comment on table public.inventory_reservations is
  'Canonical stock reservation evidence linked to ORDER-ENGINE lines. It does not replace Order fulfillment truth.';
comment on table public.inventory_movements is
  'Immutable stock/reservation ledger. FULFILL movements atomically project into canonical ORDER-ENGINE customer-facing fulfillment.';

alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_stock_balances enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_locations_member_read on public.inventory_locations for select to authenticated
  using (public.is_org_member(organization_id));
create policy inventory_items_member_read on public.inventory_items for select to authenticated
  using (public.is_org_member(organization_id));
create policy inventory_balances_member_read on public.inventory_stock_balances for select to authenticated
  using (public.is_org_member(organization_id));
create policy inventory_reservations_member_read on public.inventory_reservations for select to authenticated
  using (public.is_org_member(organization_id));
create policy inventory_movements_member_read on public.inventory_movements for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on table
  public.inventory_locations,public.inventory_items,public.inventory_stock_balances,
  public.inventory_reservations,public.inventory_movements
from public,anon,authenticated,service_role;

grant select on table
  public.inventory_locations,public.inventory_items,public.inventory_stock_balances,
  public.inventory_reservations,public.inventory_movements
to authenticated;

grant select,insert,update on table
  public.inventory_locations,public.inventory_items,public.inventory_stock_balances,
  public.inventory_reservations
to service_role;
grant select,insert on table public.inventory_movements to service_role;

create or replace function public.guard_inventory_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.inventory_mutation',true),'')<>'allowed' then
    raise exception 'INVENTORY-FULFILLMENT state requires governed command';
  end if;
  if tg_op='DELETE' then
    raise exception 'INVENTORY-FULFILLMENT canonical state cannot be deleted';
  end if;
  return new;
end;
$$;

create or replace function public.guard_inventory_movement()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.inventory_mutation',true),'')<>'allowed' then
    raise exception 'INVENTORY-FULFILLMENT movement requires governed command';
  end if;
  if tg_op<>'INSERT' then
    raise exception 'INVENTORY-FULFILLMENT movement evidence is immutable';
  end if;
  return new;
end;
$$;

create trigger inventory_locations_guard before insert or update or delete on public.inventory_locations
for each row execute function public.guard_inventory_mutation();
create trigger inventory_items_guard before insert or update or delete on public.inventory_items
for each row execute function public.guard_inventory_mutation();
create trigger inventory_balances_guard before insert or update or delete on public.inventory_stock_balances
for each row execute function public.guard_inventory_mutation();
create trigger inventory_reservations_guard before insert or update or delete on public.inventory_reservations
for each row execute function public.guard_inventory_mutation();
create trigger inventory_movements_guard before insert or update or delete on public.inventory_movements
for each row execute function public.guard_inventory_movement();

create unique index inventory_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'INVENTORY_%' and correlation_id is not null;

create or replace function private.inventory_actor_role(p_organization_id uuid,p_actor_user_id uuid)
returns text
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select m.role from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
  limit 1
$$;

create or replace function private.inventory_assert_manager(p_organization_id uuid,p_actor_user_id uuid)
returns void
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare v_role text;
begin
  if current_user<>'service_role' then raise exception 'INVENTORY-FULFILLMENT trusted runtime is required'; end if;
  v_role:=private.inventory_actor_role(p_organization_id,p_actor_user_id);
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'INVENTORY-FULFILLMENT manager permission is required';
  end if;
end;
$$;

create or replace function private.inventory_audit_replay(
  p_organization_id uuid,p_action text,p_entity_type text,p_entity_id text,
  p_request_key text,p_hash text
)
returns boolean
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare v_existing text;
begin
  if p_request_key is null or length(btrim(p_request_key)) not between 8 and 240 then
    raise exception 'INVENTORY-FULFILLMENT request key is invalid';
  end if;
  select a.after_data->>'requestHash' into v_existing
  from public.audit_logs a
  where a.organization_id=p_organization_id and a.action=p_action
    and a.entity_type=p_entity_type and a.entity_id=p_entity_id
    and a.correlation_id=p_request_key
  limit 1;
  if found and v_existing<>p_hash then
    raise exception 'INVENTORY-FULFILLMENT request key was reused with different payload';
  end if;
  return found;
end;
$$;

create or replace function private.inventory_existing_movement(
  p_organization_id uuid,p_request_key text,p_hash text,p_movement_type text
)
returns public.inventory_movements
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare v public.inventory_movements%rowtype;
begin
  if p_request_key is null or length(btrim(p_request_key)) not between 8 and 240 then
    raise exception 'INVENTORY-FULFILLMENT request key is invalid';
  end if;
  select * into v from public.inventory_movements
  where organization_id=p_organization_id and request_key=p_request_key;
  if found then
    if v.request_hash<>p_hash or v.movement_type<>p_movement_type then
      raise exception 'INVENTORY-FULFILLMENT request key was reused with different payload';
    end if;
  end if;
  return v;
end;
$$;

create or replace function private.inventory_record_movement(
  p_organization_id uuid,p_item_id uuid,p_location_id uuid,p_movement_type text,
  p_on_hand_delta numeric,p_reserved_delta numeric,p_on_hand_after numeric,p_reserved_after numeric,
  p_reservation_id uuid,p_order_id uuid,p_order_line_item_id uuid,
  p_actor_type text,p_actor_user_id uuid,p_reason text,p_evidence jsonb,
  p_request_key text,p_request_hash text
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare v_id uuid; v_threshold numeric;
begin
  select low_stock_threshold into v_threshold from public.inventory_items
  where organization_id=p_organization_id and id=p_item_id;
  if not found then raise exception 'INVENTORY-FULFILLMENT item is missing'; end if;
  insert into public.inventory_movements(
    organization_id,item_id,location_id,movement_type,on_hand_delta,reserved_delta,
    on_hand_after,reserved_after,low_stock_threshold_snapshot,low_stock_after,
    reservation_id,order_id,order_line_item_id,actor_type,actor_user_id,reason,evidence,
    request_key,request_hash
  ) values (
    p_organization_id,p_item_id,p_location_id,p_movement_type,p_on_hand_delta,p_reserved_delta,
    p_on_hand_after,p_reserved_after,v_threshold,(p_on_hand_after-p_reserved_after)<=v_threshold,
    p_reservation_id,p_order_id,p_order_line_item_id,p_actor_type,p_actor_user_id,
    nullif(btrim(coalesce(p_reason,'')),''),p_evidence,p_request_key,p_request_hash
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.configure_inventory_location_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_location_id uuid,p_tenant_business_id uuid,
  p_location_kind text,p_branch_id uuid,p_code text,p_name text,p_status text,
  p_metadata jsonb,p_expected_version integer,p_request_key text
)
returns public.inventory_locations
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v public.inventory_locations%rowtype; r public.inventory_locations%rowtype;
  v_kind text:=upper(btrim(coalesce(p_location_kind,'')));
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_name text:=btrim(coalesce(p_name,''));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
  v_hash text; v_now timestamptz:=statement_timestamp();
begin
  perform private.inventory_assert_manager(p_organization_id,p_actor_user_id);
  if p_location_id is null or p_tenant_business_id is null
     or v_kind not in ('BRANCH','WAREHOUSE')
     or v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'
     or length(v_name) not between 1 and 240
     or v_status not in ('ACTIVE','ARCHIVED')
     or jsonb_typeof(v_meta)<>'object' or octet_length(v_meta::text)>16384
     or (v_kind='BRANCH' and p_branch_id is null)
     or (v_kind='WAREHOUSE' and p_branch_id is not null)
  then raise exception 'INVENTORY-FULFILLMENT location payload is invalid'; end if;

  if not exists(select 1 from public.tenant_businesses
    where organization_id=p_organization_id and id=p_tenant_business_id and status='ACTIVE')
  then raise exception 'INVENTORY-FULFILLMENT Business is missing or inactive'; end if;

  if v_kind='BRANCH' and not exists(select 1 from public.branches
    where organization_id=p_organization_id and id=p_branch_id
      and tenant_business_id=p_tenant_business_id and status='ACTIVE')
  then raise exception 'INVENTORY-FULFILLMENT Branch location is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'locationId',p_location_id,'businessId',p_tenant_business_id,'kind',v_kind,'branchId',p_branch_id,
    'code',v_code,'name',v_name,'status',v_status,'metadata',v_meta,'expectedVersion',p_expected_version
  )::text);
  if private.inventory_audit_replay(p_organization_id,'INVENTORY_LOCATION_CONFIGURED','inventory_location',
    p_location_id::text,p_request_key,v_hash) then
    select * into r from public.inventory_locations where organization_id=p_organization_id and id=p_location_id;
    return r;
  end if;

  select * into v from public.inventory_locations
  where organization_id=p_organization_id and id=p_location_id for update;
  if found then
    if p_expected_version is null or p_expected_version<>v.version then
      raise exception 'INVENTORY-FULFILLMENT location version changed';
    end if;
    if v.tenant_business_id<>p_tenant_business_id or v.location_kind<>v_kind
       or v.branch_id is distinct from p_branch_id then
      raise exception 'INVENTORY-FULFILLMENT location ownership/kind is immutable';
    end if;
    if v_status='ARCHIVED' and exists(select 1 from public.inventory_stock_balances b
      where b.organization_id=p_organization_id and b.location_id=p_location_id
        and (b.on_hand_quantity<>0 or b.reserved_quantity<>0))
    then raise exception 'INVENTORY-FULFILLMENT non-empty location cannot be archived'; end if;
  elsif p_expected_version is not null then
    raise exception 'INVENTORY-FULFILLMENT location does not exist at expected version';
  end if;

  perform set_config('app.inventory_mutation','allowed',true);
  insert into public.inventory_locations(
    id,organization_id,tenant_business_id,location_kind,branch_id,code,name,status,metadata,
    version,created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_location_id,p_organization_id,p_tenant_business_id,v_kind,p_branch_id,v_code,v_name,v_status,v_meta,
    1,p_actor_user_id,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,id) do update set
    code=excluded.code,name=excluded.name,status=excluded.status,metadata=excluded.metadata,
    version=public.inventory_locations.version+1,updated_by_user_id=excluded.updated_by_user_id,updated_at=v_now
  returning * into r;
  perform set_config('app.inventory_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id)
  values(p_organization_id,'USER',p_actor_user_id::text,'INVENTORY_LOCATION_CONFIGURED','inventory_location',
    p_location_id::text,jsonb_build_object('requestHash',v_hash,'version',r.version,'kind',v_kind,'code',v_code),
    p_request_key,p_tenant_business_id,p_branch_id);
  return r;
exception when others then perform set_config('app.inventory_mutation','0',true); raise;
end;
$$;

create or replace function public.configure_inventory_item_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_item_id uuid,p_tenant_business_id uuid,
  p_product_id uuid,p_variant_id uuid,p_unit_code text,p_low_stock_threshold numeric,
  p_status text,p_expected_version integer,p_request_key text
)
returns public.inventory_items
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v public.inventory_items%rowtype; r public.inventory_items%rowtype;
  p public.catalog_products%rowtype; vr public.catalog_product_variants%rowtype;
  v_unit text:=upper(btrim(coalesce(p_unit_code,'')));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_effective_mode text; v_hash text; v_now timestamptz:=statement_timestamp();
begin
  perform private.inventory_assert_manager(p_organization_id,p_actor_user_id);
  select * into p from public.catalog_products
  where organization_id=p_organization_id and id=p_product_id;
  if not found or p.status<>'ACTIVE' or p.tenant_business_id<>p_tenant_business_id then
    raise exception 'INVENTORY-FULFILLMENT Product scope is invalid';
  end if;

  if p_variant_id is not null then
    select * into vr from public.catalog_product_variants
    where organization_id=p_organization_id and id=p_variant_id and product_id=p_product_id;
    if not found or vr.status<>'ACTIVE' then raise exception 'INVENTORY-FULFILLMENT Variant scope is invalid'; end if;
    v_effective_mode:=case when vr.inventory_mode='INHERIT' then p.inventory_mode else vr.inventory_mode end;
  else
    if exists(select 1 from public.catalog_product_variants
      where organization_id=p_organization_id and product_id=p_product_id and status='ACTIVE')
    then raise exception 'INVENTORY-FULFILLMENT Product with active Variants must track stock per Variant'; end if;
    v_effective_mode:=p.inventory_mode;
  end if;

  if p_item_id is null or v_effective_mode<>'STOCKED'
     or v_unit !~ '^[A-Z][A-Z0-9_-]{0,15}$'
     or p_low_stock_threshold is null or p_low_stock_threshold<0 or p_low_stock_threshold>1000000000000
     or v_status not in ('ACTIVE','ARCHIVED')
  then raise exception 'INVENTORY-FULFILLMENT item payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'itemId',p_item_id,'businessId',p_tenant_business_id,'productId',p_product_id,'variantId',p_variant_id,
    'unitCode',v_unit,'lowStockThreshold',p_low_stock_threshold,'status',v_status,'expectedVersion',p_expected_version
  )::text);
  if private.inventory_audit_replay(p_organization_id,'INVENTORY_ITEM_CONFIGURED','inventory_item',
    p_item_id::text,p_request_key,v_hash) then
    select * into r from public.inventory_items where organization_id=p_organization_id and id=p_item_id;
    return r;
  end if;

  select * into v from public.inventory_items
  where organization_id=p_organization_id and id=p_item_id for update;
  if found then
    if p_expected_version is null or p_expected_version<>v.version then
      raise exception 'INVENTORY-FULFILLMENT item version changed';
    end if;
    if v.tenant_business_id<>p_tenant_business_id or v.product_id<>p_product_id
       or v.variant_id is distinct from p_variant_id then
      raise exception 'INVENTORY-FULFILLMENT item Catalog subject is immutable';
    end if;
    if v_status='ARCHIVED' and exists(select 1 from public.inventory_stock_balances b
      where b.organization_id=p_organization_id and b.item_id=p_item_id
        and (b.on_hand_quantity<>0 or b.reserved_quantity<>0))
    then raise exception 'INVENTORY-FULFILLMENT item with stock cannot be archived'; end if;
  elsif p_expected_version is not null then
    raise exception 'INVENTORY-FULFILLMENT item does not exist at expected version';
  end if;

  perform set_config('app.inventory_mutation','allowed',true);
  insert into public.inventory_items(
    id,organization_id,tenant_business_id,product_id,variant_id,unit_code,low_stock_threshold,status,
    version,created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_item_id,p_organization_id,p_tenant_business_id,p_product_id,p_variant_id,v_unit,p_low_stock_threshold,v_status,
    1,p_actor_user_id,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,id) do update set
    unit_code=excluded.unit_code,low_stock_threshold=excluded.low_stock_threshold,status=excluded.status,
    version=public.inventory_items.version+1,updated_by_user_id=excluded.updated_by_user_id,updated_at=v_now
  returning * into r;
  perform set_config('app.inventory_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id)
  values(p_organization_id,'USER',p_actor_user_id::text,'INVENTORY_ITEM_CONFIGURED','inventory_item',p_item_id::text,
    jsonb_build_object('requestHash',v_hash,'version',r.version,'productId',p_product_id,'variantId',p_variant_id,
      'lowStockThreshold',p_low_stock_threshold),
    p_request_key,p_tenant_business_id);
  return r;
exception when others then perform set_config('app.inventory_mutation','0',true); raise;
end;
$$;

create or replace function public.adjust_inventory_stock_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_item_id uuid,p_location_id uuid,
  p_on_hand_delta numeric,p_reason text,p_evidence jsonb,p_request_key text
)
returns public.inventory_stock_balances
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  b public.inventory_stock_balances%rowtype; i public.inventory_items%rowtype; l public.inventory_locations%rowtype;
  m public.inventory_movements%rowtype; v_hash text; v_new numeric; v_move uuid; v_now timestamptz:=statement_timestamp();
begin
  perform private.inventory_assert_manager(p_organization_id,p_actor_user_id);
  if p_on_hand_delta is null or p_on_hand_delta=0 or abs(p_on_hand_delta)>1000000000000
     or p_reason is null or length(btrim(p_reason)) not between 3 and 2000
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
     or octet_length(p_evidence::text)>16384
  then raise exception 'INVENTORY-FULFILLMENT adjustment payload is invalid'; end if;

  select * into i from public.inventory_items where organization_id=p_organization_id and id=p_item_id and status='ACTIVE';
  select * into l from public.inventory_locations where organization_id=p_organization_id and id=p_location_id and status='ACTIVE';
  if not found or i.id is null or l.id is null or i.tenant_business_id<>l.tenant_business_id then
    raise exception 'INVENTORY-FULFILLMENT item/location scope is invalid';
  end if;

  v_hash:=md5(jsonb_build_object('itemId',p_item_id,'locationId',p_location_id,'delta',p_on_hand_delta,
    'reason',btrim(p_reason),'evidence',p_evidence)::text);
  m:=private.inventory_existing_movement(p_organization_id,p_request_key,v_hash,'ADJUSTMENT');
  if m.id is not null then
    select * into b from public.inventory_stock_balances
    where organization_id=p_organization_id and item_id=p_item_id and location_id=p_location_id;
    return b;
  end if;

  perform set_config('app.inventory_mutation','allowed',true);
  insert into public.inventory_stock_balances(organization_id,item_id,location_id,updated_by_user_id)
  values(p_organization_id,p_item_id,p_location_id,p_actor_user_id)
  on conflict do nothing;

  select * into b from public.inventory_stock_balances
  where organization_id=p_organization_id and item_id=p_item_id and location_id=p_location_id for update;
  v_new:=b.on_hand_quantity+p_on_hand_delta;
  if v_new<0 or v_new<b.reserved_quantity then
    raise exception 'INVENTORY-FULFILLMENT adjustment would make stock unavailable for active reservations';
  end if;

  update public.inventory_stock_balances
  set on_hand_quantity=v_new,version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and item_id=p_item_id and location_id=p_location_id
  returning * into b;

  v_move:=private.inventory_record_movement(p_organization_id,p_item_id,p_location_id,'ADJUSTMENT',
    p_on_hand_delta,0,b.on_hand_quantity,b.reserved_quantity,null,null,null,
    'USER',p_actor_user_id,p_reason,p_evidence,p_request_key,v_hash);
  perform set_config('app.inventory_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id)
  values(p_organization_id,'USER',p_actor_user_id::text,'INVENTORY_STOCK_ADJUSTED','inventory_item',p_item_id::text,
    jsonb_build_object('requestHash',v_hash,'movementId',v_move,'locationId',p_location_id,
      'onHand',b.on_hand_quantity,'reserved',b.reserved_quantity),
    p_request_key,i.tenant_business_id,l.branch_id);
  return b;
exception when others then perform set_config('app.inventory_mutation','0',true); raise;
end;
$$;

create or replace function public.reserve_order_inventory_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_reservation_id uuid,p_order_id uuid,
  p_order_line_item_id uuid,p_location_id uuid,p_quantity numeric,p_evidence jsonb,p_request_key text
)
returns uuid
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  o public.orders%rowtype; ol public.order_line_items%rowtype; f public.order_line_fulfillment%rowtype;
  i public.inventory_items%rowtype; l public.inventory_locations%rowtype; b public.inventory_stock_balances%rowtype;
  r public.inventory_reservations%rowtype; v_hash text; v_reserved_elsewhere numeric:=0; v_remaining numeric;
  v_move uuid; v_now timestamptz:=statement_timestamp();
begin
  perform private.inventory_assert_manager(p_organization_id,p_actor_user_id);
  if p_reservation_id is null or p_quantity is null or p_quantity<=0 or p_quantity>1000000000000
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
     or octet_length(p_evidence::text)>16384
  then raise exception 'INVENTORY-FULFILLMENT reservation payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object('reservationId',p_reservation_id,'orderId',p_order_id,
    'orderLineId',p_order_line_item_id,'locationId',p_location_id,'quantity',p_quantity,'evidence',p_evidence)::text);

  select * into r from public.inventory_reservations
  where organization_id=p_organization_id and request_key=p_request_key;
  if found then
    if r.request_hash<>v_hash or r.id<>p_reservation_id then
      raise exception 'INVENTORY-FULFILLMENT request key was reused with different reservation payload';
    end if;
    return r.id;
  end if;

  select * into o from public.orders where organization_id=p_organization_id and id=p_order_id for update;
  if not found or o.status in ('CANCELLED','RETURNED') then
    raise exception 'INVENTORY-FULFILLMENT Order is not reservable';
  end if;
  select * into ol from public.order_line_items
  where organization_id=p_organization_id and id=p_order_line_item_id and order_id=p_order_id;
  if not found or ol.subject_kind not in ('PRODUCT','VARIANT') then
    raise exception 'INVENTORY-FULFILLMENT only Product/Variant Order lines can reserve stock';
  end if;
  select * into f from public.order_line_fulfillment
  where organization_id=p_organization_id and order_line_item_id=p_order_line_item_id;

  select * into i from public.inventory_items
  where organization_id=p_organization_id and product_id=ol.product_id
    and variant_id is not distinct from ol.variant_id and status='ACTIVE';
  if not found then raise exception 'INVENTORY-FULFILLMENT Order line has no active stock item'; end if;
  select * into l from public.inventory_locations
  where organization_id=p_organization_id and id=p_location_id and status='ACTIVE';
  if not found or l.tenant_business_id<>o.tenant_business_id or i.tenant_business_id<>o.tenant_business_id then
    raise exception 'INVENTORY-FULFILLMENT reservation location is outside Order seller scope';
  end if;
  if o.branch_id is not null and l.location_kind='BRANCH' and l.branch_id<>o.branch_id then
    raise exception 'INVENTORY-FULFILLMENT Branch stock location does not match Order Branch';
  end if;

  select coalesce(sum(reserved_quantity-consumed_quantity-released_quantity),0) into v_reserved_elsewhere
  from public.inventory_reservations
  where organization_id=p_organization_id and order_line_item_id=p_order_line_item_id
    and status in ('ACTIVE','PARTIAL');
  v_remaining:=ol.quantity-coalesce(f.fulfilled_quantity,0)-v_reserved_elsewhere;
  if p_quantity>v_remaining then
    raise exception 'INVENTORY-FULFILLMENT reservation exceeds unfulfilled Order quantity';
  end if;

  perform set_config('app.inventory_mutation','allowed',true);
  select * into b from public.inventory_stock_balances
  where organization_id=p_organization_id and item_id=i.id and location_id=p_location_id for update;
  if not found or (b.on_hand_quantity-b.reserved_quantity)<p_quantity then
    raise exception 'INVENTORY-FULFILLMENT insufficient available stock';
  end if;

  update public.inventory_stock_balances
  set reserved_quantity=reserved_quantity+p_quantity,version=version+1,
      updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and item_id=i.id and location_id=p_location_id
  returning * into b;

  insert into public.inventory_reservations(
    id,organization_id,order_id,order_line_item_id,item_id,location_id,reserved_quantity,
    source_evidence,request_key,request_hash,created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_reservation_id,p_organization_id,p_order_id,p_order_line_item_id,i.id,p_location_id,p_quantity,
    p_evidence,p_request_key,v_hash,p_actor_user_id,p_actor_user_id,v_now,v_now
  );

  v_move:=private.inventory_record_movement(p_organization_id,i.id,p_location_id,'RESERVE',
    0,p_quantity,b.on_hand_quantity,b.reserved_quantity,p_reservation_id,p_order_id,p_order_line_item_id,
    'USER',p_actor_user_id,'Order stock reservation',p_evidence,'movement:'||p_request_key,v_hash);
  perform set_config('app.inventory_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id)
  values(p_organization_id,'USER',p_actor_user_id::text,'INVENTORY_ORDER_RESERVED','inventory_reservation',
    p_reservation_id::text,jsonb_build_object('requestHash',v_hash,'movementId',v_move,'orderId',p_order_id,
      'orderLineId',p_order_line_item_id,'quantity',p_quantity,'locationId',p_location_id),
    p_request_key,o.tenant_business_id,l.branch_id);
  return p_reservation_id;
exception when others then perform set_config('app.inventory_mutation','0',true); raise;
end;
$$;

create or replace function public.release_inventory_reservation_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_reservation_id uuid,p_quantity numeric,
  p_reason text,p_evidence jsonb,p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  r public.inventory_reservations%rowtype; b public.inventory_stock_balances%rowtype;
  m public.inventory_movements%rowtype; l public.inventory_locations%rowtype;
  v_hash text; v_outstanding numeric; v_status text; v_move uuid; v_now timestamptz:=statement_timestamp();
begin
  perform private.inventory_assert_manager(p_organization_id,p_actor_user_id);
  if p_quantity is null or p_quantity<=0 or p_reason is null or length(btrim(p_reason)) not between 3 and 2000
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
     or octet_length(p_evidence::text)>16384
  then raise exception 'INVENTORY-FULFILLMENT reservation release payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object('reservationId',p_reservation_id,'quantity',p_quantity,
    'reason',btrim(p_reason),'evidence',p_evidence)::text);
  m:=private.inventory_existing_movement(p_organization_id,p_request_key,v_hash,'RELEASE');
  if m.id is not null then
    select status into v_status from public.inventory_reservations
    where organization_id=p_organization_id and id=p_reservation_id;
    return v_status;
  end if;

  perform set_config('app.inventory_mutation','allowed',true);
  select * into r from public.inventory_reservations
  where organization_id=p_organization_id and id=p_reservation_id for update;
  if not found or r.status not in ('ACTIVE','PARTIAL') then
    raise exception 'INVENTORY-FULFILLMENT reservation is not releasable';
  end if;
  v_outstanding:=r.reserved_quantity-r.consumed_quantity-r.released_quantity;
  if p_quantity>v_outstanding then raise exception 'INVENTORY-FULFILLMENT release exceeds outstanding reservation'; end if;

  select * into b from public.inventory_stock_balances
  where organization_id=p_organization_id and item_id=r.item_id and location_id=r.location_id for update;
  if not found or b.reserved_quantity<p_quantity then raise exception 'INVENTORY-FULFILLMENT reserved balance drift detected'; end if;
  select * into l from public.inventory_locations where organization_id=p_organization_id and id=r.location_id;

  v_status:=case
    when r.consumed_quantity+r.released_quantity+p_quantity=r.reserved_quantity and r.consumed_quantity=0 then 'RELEASED'
    when r.consumed_quantity+r.released_quantity+p_quantity=r.reserved_quantity then 'CLOSED'
    else 'PARTIAL' end;

  update public.inventory_reservations
  set released_quantity=released_quantity+p_quantity,status=v_status,version=version+1,
      updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_reservation_id;

  update public.inventory_stock_balances
  set reserved_quantity=reserved_quantity-p_quantity,version=version+1,
      updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and item_id=r.item_id and location_id=r.location_id
  returning * into b;

  v_move:=private.inventory_record_movement(p_organization_id,r.item_id,r.location_id,'RELEASE',
    0,-p_quantity,b.on_hand_quantity,b.reserved_quantity,p_reservation_id,r.order_id,r.order_line_item_id,
    'USER',p_actor_user_id,p_reason,p_evidence,p_request_key,v_hash);
  perform set_config('app.inventory_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,branch_id)
  values(p_organization_id,'USER',p_actor_user_id::text,'INVENTORY_RESERVATION_RELEASED','inventory_reservation',
    p_reservation_id::text,jsonb_build_object('requestHash',v_hash,'movementId',v_move,'quantity',p_quantity,'status',v_status),
    p_request_key,l.branch_id);
  return v_status;
exception when others then perform set_config('app.inventory_mutation','0',true); raise;
end;
$$;

create or replace function public.fulfill_order_inventory_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_reservation_id uuid,p_quantity numeric,
  p_evidence jsonb,p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  r public.inventory_reservations%rowtype; b public.inventory_stock_balances%rowtype;
  m public.inventory_movements%rowtype; o public.orders%rowtype; l public.inventory_locations%rowtype;
  v_hash text; v_outstanding numeric; v_res_status text; v_move uuid; v_order_status text;
  v_now timestamptz:=statement_timestamp(); v_order_evidence jsonb;
begin
  perform private.inventory_assert_manager(p_organization_id,p_actor_user_id);
  if p_quantity is null or p_quantity<=0
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
     or octet_length(p_evidence::text)>16384
  then raise exception 'INVENTORY-FULFILLMENT fulfillment payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object('reservationId',p_reservation_id,'quantity',p_quantity,'evidence',p_evidence)::text);
  m:=private.inventory_existing_movement(p_organization_id,p_request_key,v_hash,'FULFILL');
  if m.id is not null then
    select status into v_order_status from public.orders
    where organization_id=p_organization_id and id=m.order_id;
    return v_order_status;
  end if;

  perform set_config('app.inventory_mutation','allowed',true);
  select * into r from public.inventory_reservations
  where organization_id=p_organization_id and id=p_reservation_id for update;
  if not found or r.status not in ('ACTIVE','PARTIAL') then
    raise exception 'INVENTORY-FULFILLMENT reservation is not fulfillable';
  end if;
  v_outstanding:=r.reserved_quantity-r.consumed_quantity-r.released_quantity;
  if p_quantity>v_outstanding then raise exception 'INVENTORY-FULFILLMENT fulfillment exceeds outstanding reservation'; end if;

  select * into b from public.inventory_stock_balances
  where organization_id=p_organization_id and item_id=r.item_id and location_id=r.location_id for update;
  if not found or b.on_hand_quantity<p_quantity or b.reserved_quantity<p_quantity then
    raise exception 'INVENTORY-FULFILLMENT stock balance drift detected';
  end if;
  select * into o from public.orders where organization_id=p_organization_id and id=r.order_id for update;
  if not found or o.status in ('CANCELLED','RETURNED') then
    raise exception 'INVENTORY-FULFILLMENT Order is not fulfillable';
  end if;
  select * into l from public.inventory_locations where organization_id=p_organization_id and id=r.location_id;

  v_res_status:=case
    when r.consumed_quantity+p_quantity+r.released_quantity=r.reserved_quantity and r.released_quantity=0 then 'CONSUMED'
    when r.consumed_quantity+p_quantity+r.released_quantity=r.reserved_quantity then 'CLOSED'
    else 'PARTIAL' end;

  update public.inventory_reservations
  set consumed_quantity=consumed_quantity+p_quantity,status=v_res_status,version=version+1,
      updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_reservation_id;

  update public.inventory_stock_balances
  set on_hand_quantity=on_hand_quantity-p_quantity,reserved_quantity=reserved_quantity-p_quantity,
      version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and item_id=r.item_id and location_id=r.location_id
  returning * into b;

  v_move:=private.inventory_record_movement(p_organization_id,r.item_id,r.location_id,'FULFILL',
    -p_quantity,-p_quantity,b.on_hand_quantity,b.reserved_quantity,p_reservation_id,r.order_id,r.order_line_item_id,
    'USER',p_actor_user_id,'Reserved stock fulfillment',p_evidence,p_request_key,v_hash);

  v_order_evidence:=p_evidence||jsonb_build_object(
    'inventoryMovementId',v_move,'inventoryReservationId',p_reservation_id,'inventoryLocationId',r.location_id
  );
  v_order_status:=public.record_order_fulfillment_v1(
    p_organization_id,p_actor_user_id,r.order_id,o.version,
    jsonb_build_array(jsonb_build_object('orderLineId',r.order_line_item_id,'quantity',p_quantity)),
    v_order_evidence,'inventory-order:'||p_request_key
  );
  perform set_config('app.inventory_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id)
  values(p_organization_id,'USER',p_actor_user_id::text,'INVENTORY_ORDER_FULFILLED','inventory_reservation',
    p_reservation_id::text,jsonb_build_object('requestHash',v_hash,'movementId',v_move,'quantity',p_quantity,
      'reservationStatus',v_res_status,'orderStatus',v_order_status,'onHand',b.on_hand_quantity,'reserved',b.reserved_quantity),
    p_request_key,o.tenant_business_id,l.branch_id);
  return v_order_status;
exception when others then
  perform set_config('app.inventory_mutation','0',true);
  raise;
end;
$$;

-- Release outstanding stock reservations atomically when canonical ORDER-ENGINE cancels an Order.
create or replace function public.release_inventory_on_order_cancel()
returns trigger
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare r record; b public.inventory_stock_balances%rowtype; v_outstanding numeric; v_hash text; v_key text; v_move uuid;
begin
  if old.status is not distinct from new.status or new.status<>'CANCELLED' then return new; end if;
  perform set_config('app.inventory_mutation','allowed',true);
  for r in
    select * from public.inventory_reservations
    where organization_id=new.organization_id and order_id=new.id and status in ('ACTIVE','PARTIAL')
    order by id for update
  loop
    v_outstanding:=r.reserved_quantity-r.consumed_quantity-r.released_quantity;
    if v_outstanding<=0 then continue; end if;
    select * into b from public.inventory_stock_balances
    where organization_id=r.organization_id and item_id=r.item_id and location_id=r.location_id for update;
    if not found or b.reserved_quantity<v_outstanding then
      raise exception 'INVENTORY-FULFILLMENT cancellation release detected balance drift';
    end if;
    update public.inventory_reservations
      set released_quantity=released_quantity+v_outstanding,
          status=case when consumed_quantity=0 then 'RELEASED' else 'CLOSED' end,
          version=version+1,updated_by_user_id=new.updated_by_user_id,updated_at=statement_timestamp()
    where organization_id=r.organization_id and id=r.id;
    update public.inventory_stock_balances
      set reserved_quantity=reserved_quantity-v_outstanding,version=version+1,
          updated_by_user_id=new.updated_by_user_id,updated_at=statement_timestamp()
    where organization_id=r.organization_id and item_id=r.item_id and location_id=r.location_id
    returning * into b;
    v_key:='order-cancel:'||new.id::text||':'||r.id::text;
    v_hash:=md5(jsonb_build_object('orderId',new.id,'reservationId',r.id,'quantity',v_outstanding)::text);
    if not exists(select 1 from public.inventory_movements
      where organization_id=r.organization_id and request_key=v_key) then
      v_move:=private.inventory_record_movement(r.organization_id,r.item_id,r.location_id,'RELEASE',
        0,-v_outstanding,b.on_hand_quantity,b.reserved_quantity,r.id,new.id,r.order_line_item_id,
        'SYSTEM',null,'Canonical Order cancelled',jsonb_build_object('orderStatus','CANCELLED'),v_key,v_hash);
    end if;
  end loop;
  perform set_config('app.inventory_mutation','0',true);
  return new;
exception when others then perform set_config('app.inventory_mutation','0',true); raise;
end;
$$;

create trigger orders_inventory_cancel_release
after update of status on public.orders
for each row execute function public.release_inventory_on_order_cancel();

create or replace function public.guard_catalog_stocked_inventory_transition()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if tg_table_name='catalog_products' then
    if old.inventory_mode='STOCKED' and new.inventory_mode<>'STOCKED' and exists(
      select 1 from public.inventory_items i
      left join public.catalog_product_variants v
        on v.organization_id=i.organization_id and v.id=i.variant_id
      where i.organization_id=old.organization_id and i.product_id=old.id and i.status='ACTIVE'
        and (i.variant_id is null or v.inventory_mode='INHERIT')
    ) then
      raise exception 'INVENTORY-FULFILLMENT active stock items require Product STOCKED mode';
    end if;
    if old.status='ACTIVE' and new.status='ARCHIVED' and exists(
      select 1 from public.inventory_stock_balances b
      join public.inventory_items i on i.organization_id=b.organization_id and i.id=b.item_id
      where i.organization_id=old.organization_id and i.product_id=old.id
        and (b.on_hand_quantity<>0 or b.reserved_quantity<>0)
    ) then raise exception 'INVENTORY-FULFILLMENT Product with stock cannot be archived'; end if;
  else
    if (case when new.inventory_mode='INHERIT' then
          (select p.inventory_mode from public.catalog_products p
           where p.organization_id=new.organization_id and p.id=new.product_id)
        else new.inventory_mode end)<>'STOCKED'
       and exists(select 1 from public.inventory_items i
         where i.organization_id=old.organization_id and i.variant_id=old.id and i.status='ACTIVE')
    then raise exception 'INVENTORY-FULFILLMENT active stock item requires effective Variant STOCKED mode'; end if;
    if old.status='ACTIVE' and new.status='ARCHIVED' and exists(
      select 1 from public.inventory_stock_balances b
      join public.inventory_items i on i.organization_id=b.organization_id and i.id=b.item_id
      where i.organization_id=old.organization_id and i.variant_id=old.id
        and (b.on_hand_quantity<>0 or b.reserved_quantity<>0)
    ) then raise exception 'INVENTORY-FULFILLMENT Variant with stock cannot be archived'; end if;
  end if;
  return new;
end;
$$;

create trigger catalog_products_inventory_transition_guard
before update of inventory_mode,status on public.catalog_products
for each row execute function public.guard_catalog_stocked_inventory_transition();
create trigger catalog_variants_inventory_transition_guard
before update of inventory_mode,status on public.catalog_product_variants
for each row execute function public.guard_catalog_stocked_inventory_transition();

create view public.inventory_low_stock_v
with (security_invoker=true)
as
select
  b.organization_id,b.item_id,b.location_id,i.tenant_business_id,i.product_id,i.variant_id,
  p.sku as product_sku,p.name as product_name,v.sku as variant_sku,v.name as variant_name,
  l.location_kind,l.branch_id,l.code as location_code,l.name as location_name,
  b.on_hand_quantity,b.reserved_quantity,(b.on_hand_quantity-b.reserved_quantity) as available_quantity,
  i.low_stock_threshold,b.version as balance_version,b.updated_at
from public.inventory_stock_balances b
join public.inventory_items i on i.organization_id=b.organization_id and i.id=b.item_id
join public.inventory_locations l on l.organization_id=b.organization_id and l.id=b.location_id
join public.catalog_products p on p.organization_id=i.organization_id and p.id=i.product_id
left join public.catalog_product_variants v on v.organization_id=i.organization_id and v.id=i.variant_id
where i.status='ACTIVE' and l.status='ACTIVE'
  and (b.on_hand_quantity-b.reserved_quantity)<=i.low_stock_threshold;

revoke all on public.inventory_low_stock_v from public,anon,authenticated,service_role;
grant select on public.inventory_low_stock_v to authenticated,service_role;

revoke all on function public.guard_inventory_mutation() from public,anon,authenticated,service_role;
revoke all on function public.guard_inventory_movement() from public,anon,authenticated,service_role;
revoke all on function public.release_inventory_on_order_cancel() from public,anon,authenticated,service_role;
revoke all on function public.guard_catalog_stocked_inventory_transition() from public,anon,authenticated,service_role;
revoke all on function private.inventory_actor_role(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.inventory_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.inventory_audit_replay(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.inventory_existing_movement(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.inventory_record_movement(uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,uuid,uuid,uuid,text,uuid,text,jsonb,text,text)
  from public,anon,authenticated,service_role;

grant execute on function private.inventory_actor_role(uuid,uuid) to service_role;
grant execute on function private.inventory_assert_manager(uuid,uuid) to service_role;
grant execute on function private.inventory_audit_replay(uuid,text,text,text,text,text) to service_role;
grant execute on function private.inventory_existing_movement(uuid,text,text,text) to service_role;
grant execute on function private.inventory_record_movement(uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,uuid,uuid,uuid,text,uuid,text,jsonb,text,text)
  to service_role;

revoke all on function public.configure_inventory_location_v1(uuid,uuid,uuid,uuid,text,uuid,text,text,text,jsonb,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.configure_inventory_location_v1(uuid,uuid,uuid,uuid,text,uuid,text,text,text,jsonb,integer,text)
  to service_role;
revoke all on function public.configure_inventory_item_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,text,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.configure_inventory_item_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,numeric,text,integer,text)
  to service_role;
revoke all on function public.adjust_inventory_stock_v1(uuid,uuid,uuid,uuid,numeric,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.adjust_inventory_stock_v1(uuid,uuid,uuid,uuid,numeric,text,jsonb,text)
  to service_role;
revoke all on function public.reserve_order_inventory_v1(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.reserve_order_inventory_v1(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,text)
  to service_role;
revoke all on function public.release_inventory_reservation_v1(uuid,uuid,uuid,numeric,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.release_inventory_reservation_v1(uuid,uuid,uuid,numeric,text,jsonb,text)
  to service_role;
revoke all on function public.fulfill_order_inventory_v1(uuid,uuid,uuid,numeric,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.fulfill_order_inventory_v1(uuid,uuid,uuid,numeric,jsonb,text)
  to service_role;
