-- 0170: Business OS 2027 CATALOG-V2
-- Extends existing canonical service/pricing authorities and adds the first
-- canonical product/variant catalog. It does not create a second service
-- catalog, second service-pricing truth, inventory stock ledger, Quote, Order,
-- Invoice or Payment authority.
--
-- Existing ownership preserved:
--   public.services       = canonical Service identity/state
--   public.service_prices = canonical Service pricing
-- New ownership:
--   public.catalog_products        = canonical Product identity/state
--   public.catalog_product_variants= canonical Product Variant identity/state
--   public.catalog_product_prices  = canonical Product/Variant pricing
-- Child metadata:
--   service catalog profile, branch availability, media references,
--   bundle/add-on relationships.
-- Inventory quantity/reservation/fulfillment remains deferred to
-- INVENTORY-FULFILLMENT. CATALOG-V2 stores only NONE/REFERENCE_ONLY pointers.

create table public.catalog_service_profiles (
  organization_id uuid not null,
  service_id text not null,
  description text,
  warranty_text text,
  availability_mode text not null default 'ALL_ACTIVE_BRANCHES'
    check (availability_mode in ('ALL_ACTIVE_BRANCHES','EXPLICIT_BRANCHES','ONLINE_ONLY','NOT_OFFERED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384),
  version integer not null default 1 check (version>=1),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,service_id),
  foreign key (organization_id,service_id)
    references public.services(organization_id,id) on delete cascade,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (description is null or length(btrim(description)) between 1 and 8000),
  check (warranty_text is null or length(btrim(warranty_text)) between 1 and 4000)
);
comment on table public.catalog_service_profiles is
  'CATALOG-V2 child metadata for canonical public.services. Service identity and service pricing remain owned by services/service_prices.';

create table public.catalog_products (
  id uuid primary key,
  organization_id uuid not null,
  tenant_business_id uuid not null,
  sku text not null,
  name text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  warranty_text text,
  availability_mode text not null default 'ALL_ACTIVE_BRANCHES'
    check (availability_mode in ('ALL_ACTIVE_BRANCHES','EXPLICIT_BRANCHES','ONLINE_ONLY','NOT_OFFERED')),
  inventory_mode text not null default 'NONE'
    check (inventory_mode in ('NONE','REFERENCE_ONLY')),
  inventory_reference text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384),
  version integer not null default 1 check (version>=1),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,sku),
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (sku=upper(btrim(sku)) and sku ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'),
  check (length(btrim(name)) between 1 and 240),
  check (description is null or length(btrim(description)) between 1 and 8000),
  check (warranty_text is null or length(btrim(warranty_text)) between 1 and 4000),
  check (
    (inventory_mode='NONE' and inventory_reference is null)
    or
    (inventory_mode='REFERENCE_ONLY' and inventory_reference is not null
      and length(btrim(inventory_reference)) between 1 and 512)
  )
);
comment on table public.catalog_products is
  'Canonical Product authority for CATALOG-V2. Stock quantities/reservations are intentionally absent until INVENTORY-FULFILLMENT.';

create table public.catalog_product_variants (
  id uuid primary key,
  organization_id uuid not null,
  product_id uuid not null,
  sku text not null,
  name text not null,
  attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes)='object' and octet_length(attributes::text)<=8192),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  inventory_mode text not null default 'INHERIT'
    check (inventory_mode in ('INHERIT','NONE','REFERENCE_ONLY')),
  inventory_reference text,
  version integer not null default 1 check (version>=1),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,id,product_id),
  unique (organization_id,sku),
  foreign key (organization_id,product_id)
    references public.catalog_products(organization_id,id) on delete cascade,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (sku=upper(btrim(sku)) and sku ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'),
  check (length(btrim(name)) between 1 and 240),
  check (
    (inventory_mode in ('INHERIT','NONE') and inventory_reference is null)
    or
    (inventory_mode='REFERENCE_ONLY' and inventory_reference is not null
      and length(btrim(inventory_reference)) between 1 and 512)
  )
);
comment on table public.catalog_product_variants is
  'Canonical Product Variant authority. Variant stock quantities remain outside CATALOG-V2.';

create table public.catalog_product_prices (
  id uuid primary key,
  organization_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  country_code text not null,
  currency text not null,
  price numeric(18,4) not null check (price>=0),
  minimum_price numeric(18,4),
  compare_at_price numeric(18,4),
  version integer not null default 1 check (version>=1),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,product_id)
    references public.catalog_products(organization_id,id) on delete cascade,
  foreign key (organization_id,variant_id,product_id)
    references public.catalog_product_variants(organization_id,id,product_id) on delete cascade,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (country_code=upper(btrim(country_code)) and country_code ~ '^[A-Z]{2}$'),
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (minimum_price is null or (minimum_price>=0 and minimum_price<=price)),
  check (compare_at_price is null or compare_at_price>=price)
);
create unique index catalog_product_prices_subject_country_currency_uidx
  on public.catalog_product_prices(
    organization_id,
    product_id,
    coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid),
    country_code,
    currency
  );
comment on table public.catalog_product_prices is
  'Canonical Product/Variant pricing. Service pricing remains exclusively public.service_prices.';

create table public.catalog_branch_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  service_id text,
  product_id uuid,
  variant_id uuid,
  enabled boolean not null default true,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,branch_id)
    references public.branches(organization_id,id) on delete cascade,
  foreign key (organization_id,service_id)
    references public.services(organization_id,id) on delete cascade,
  foreign key (organization_id,product_id)
    references public.catalog_products(organization_id,id) on delete cascade,
  foreign key (organization_id,variant_id)
    references public.catalog_product_variants(organization_id,id) on delete cascade,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (num_nonnulls(service_id,product_id,variant_id)=1)
);
create unique index catalog_branch_availability_subject_branch_uidx
  on public.catalog_branch_availability(
    organization_id,
    branch_id,
    coalesce(service_id,''),
    coalesce(product_id::text,''),
    coalesce(variant_id::text,'')
  );
comment on table public.catalog_branch_availability is
  'General commerce/catalog branch availability. Booking-specific branch eligibility remains owned by service_booking_branches.';

create unique index if not exists portfolio_items_org_id_uidx
  on public.portfolio_items(organization_id,id);

create table public.catalog_media_assets (
  id uuid primary key,
  organization_id uuid not null,
  service_id text,
  product_id uuid,
  variant_id uuid,
  media_type text not null check (media_type in ('IMAGE','VIDEO','DOCUMENT')),
  source_type text not null check (source_type in ('HTTPS_URL','PORTFOLIO_ITEM')),
  public_url text,
  portfolio_item_id uuid,
  alt_text text,
  sort_order integer not null default 0 check (sort_order between -100000 and 100000),
  approved boolean not null default true,
  version integer not null default 1 check (version>=1),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,service_id)
    references public.services(organization_id,id) on delete cascade,
  foreign key (organization_id,product_id)
    references public.catalog_products(organization_id,id) on delete cascade,
  foreign key (organization_id,variant_id)
    references public.catalog_product_variants(organization_id,id) on delete cascade,
  foreign key (organization_id,portfolio_item_id)
    references public.portfolio_items(organization_id,id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (num_nonnulls(service_id,product_id,variant_id)=1),
  check (
    (source_type='HTTPS_URL' and public_url is not null and portfolio_item_id is null
      and public_url ~ '^https://')
    or
    (source_type='PORTFOLIO_ITEM' and public_url is null and portfolio_item_id is not null)
  ),
  check (public_url is null or length(public_url)<=2048),
  check (alt_text is null or length(btrim(alt_text)) between 1 and 500)
);
comment on table public.catalog_media_assets is
  'Catalog media metadata only. Approved portfolio evidence is reused for Services; no second binary media store is introduced.';

create table public.catalog_item_relations (
  id uuid primary key,
  organization_id uuid not null,
  source_service_id text,
  source_product_id uuid,
  source_variant_id uuid,
  target_service_id text,
  target_product_id uuid,
  target_variant_id uuid,
  relation_type text not null check (relation_type in ('BUNDLE_COMPONENT','ADD_ON')),
  quantity numeric(18,4) not null default 1 check (quantity>0 and quantity<=1000000),
  required boolean not null default false,
  sort_order integer not null default 0 check (sort_order between -100000 and 100000),
  version integer not null default 1 check (version>=1),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,source_service_id)
    references public.services(organization_id,id) on delete cascade,
  foreign key (organization_id,source_product_id)
    references public.catalog_products(organization_id,id) on delete cascade,
  foreign key (organization_id,source_variant_id)
    references public.catalog_product_variants(organization_id,id) on delete cascade,
  foreign key (organization_id,target_service_id)
    references public.services(organization_id,id) on delete restrict,
  foreign key (organization_id,target_product_id)
    references public.catalog_products(organization_id,id) on delete restrict,
  foreign key (organization_id,target_variant_id)
    references public.catalog_product_variants(organization_id,id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (num_nonnulls(source_service_id,source_product_id,source_variant_id)=1),
  check (num_nonnulls(target_service_id,target_product_id,target_variant_id)=1),
  check (
    coalesce(source_service_id,'')<>coalesce(target_service_id,'')
    or coalesce(source_product_id::text,'')<>coalesce(target_product_id::text,'')
    or coalesce(source_variant_id::text,'')<>coalesce(target_variant_id::text,'')
  )
);
create unique index catalog_item_relations_subject_uidx
  on public.catalog_item_relations(
    organization_id,
    relation_type,
    coalesce(source_service_id,''),
    coalesce(source_product_id::text,''),
    coalesce(source_variant_id::text,''),
    coalesce(target_service_id,''),
    coalesce(target_product_id::text,''),
    coalesce(target_variant_id::text,'')
  );
comment on table public.catalog_item_relations is
  'CATALOG-V2 bundle/add-on relationships across canonical Service/Product/Variant identities.';

-- FK/performance coverage.
create index catalog_service_profiles_updated_by_idx
  on public.catalog_service_profiles(organization_id,updated_by_user_id);
create index catalog_products_business_idx
  on public.catalog_products(organization_id,tenant_business_id,status);
create index catalog_products_created_by_idx
  on public.catalog_products(organization_id,created_by_user_id);
create index catalog_products_updated_by_idx
  on public.catalog_products(organization_id,updated_by_user_id);
create index catalog_variants_product_idx
  on public.catalog_product_variants(organization_id,product_id,status);
create index catalog_variants_created_by_idx
  on public.catalog_product_variants(organization_id,created_by_user_id);
create index catalog_variants_updated_by_idx
  on public.catalog_product_variants(organization_id,updated_by_user_id);
create index catalog_product_prices_product_idx
  on public.catalog_product_prices(organization_id,product_id,country_code);
create index catalog_product_prices_variant_idx
  on public.catalog_product_prices(organization_id,variant_id,product_id)
  where variant_id is not null;
create index catalog_product_prices_updated_by_idx
  on public.catalog_product_prices(organization_id,updated_by_user_id);
create index catalog_branch_availability_branch_idx
  on public.catalog_branch_availability(organization_id,branch_id);
create index catalog_branch_availability_service_idx
  on public.catalog_branch_availability(organization_id,service_id)
  where service_id is not null;
create index catalog_branch_availability_product_idx
  on public.catalog_branch_availability(organization_id,product_id)
  where product_id is not null;
create index catalog_branch_availability_variant_idx
  on public.catalog_branch_availability(organization_id,variant_id)
  where variant_id is not null;
create index catalog_branch_availability_created_by_idx
  on public.catalog_branch_availability(organization_id,created_by_user_id);
create index catalog_branch_availability_updated_by_idx
  on public.catalog_branch_availability(organization_id,updated_by_user_id);
create index catalog_media_service_idx
  on public.catalog_media_assets(organization_id,service_id)
  where service_id is not null;
create index catalog_media_product_idx
  on public.catalog_media_assets(organization_id,product_id)
  where product_id is not null;
create index catalog_media_variant_idx
  on public.catalog_media_assets(organization_id,variant_id)
  where variant_id is not null;
create index catalog_media_portfolio_idx
  on public.catalog_media_assets(organization_id,portfolio_item_id)
  where portfolio_item_id is not null;
create index catalog_media_updated_by_idx
  on public.catalog_media_assets(organization_id,updated_by_user_id);
create index catalog_relations_source_service_idx
  on public.catalog_item_relations(organization_id,source_service_id)
  where source_service_id is not null;
create index catalog_relations_source_product_idx
  on public.catalog_item_relations(organization_id,source_product_id)
  where source_product_id is not null;
create index catalog_relations_source_variant_idx
  on public.catalog_item_relations(organization_id,source_variant_id)
  where source_variant_id is not null;
create index catalog_relations_target_service_idx
  on public.catalog_item_relations(organization_id,target_service_id)
  where target_service_id is not null;
create index catalog_relations_target_product_idx
  on public.catalog_item_relations(organization_id,target_product_id)
  where target_product_id is not null;
create index catalog_relations_target_variant_idx
  on public.catalog_item_relations(organization_id,target_variant_id)
  where target_variant_id is not null;
create index catalog_relations_updated_by_idx
  on public.catalog_item_relations(organization_id,updated_by_user_id);

-- Read access only for Organization members; writes are server-governed.
alter table public.catalog_service_profiles enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_product_variants enable row level security;
alter table public.catalog_product_prices enable row level security;
alter table public.catalog_branch_availability enable row level security;
alter table public.catalog_media_assets enable row level security;
alter table public.catalog_item_relations enable row level security;

create policy catalog_service_profiles_member_read
  on public.catalog_service_profiles for select to authenticated
  using (public.is_org_member(organization_id));
create policy catalog_products_member_read
  on public.catalog_products for select to authenticated
  using (public.is_org_member(organization_id));
create policy catalog_product_variants_member_read
  on public.catalog_product_variants for select to authenticated
  using (public.is_org_member(organization_id));
create policy catalog_product_prices_member_read
  on public.catalog_product_prices for select to authenticated
  using (public.is_org_member(organization_id));
create policy catalog_branch_availability_member_read
  on public.catalog_branch_availability for select to authenticated
  using (public.is_org_member(organization_id));
create policy catalog_media_assets_member_read
  on public.catalog_media_assets for select to authenticated
  using (public.is_org_member(organization_id));
create policy catalog_item_relations_member_read
  on public.catalog_item_relations for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on table
  public.catalog_service_profiles,
  public.catalog_products,
  public.catalog_product_variants,
  public.catalog_product_prices,
  public.catalog_branch_availability,
  public.catalog_media_assets,
  public.catalog_item_relations
from public,anon,authenticated,service_role;

grant select on table
  public.catalog_service_profiles,
  public.catalog_products,
  public.catalog_product_variants,
  public.catalog_product_prices,
  public.catalog_branch_availability,
  public.catalog_media_assets,
  public.catalog_item_relations
to authenticated;

grant select,insert,update,delete on table
  public.catalog_service_profiles,
  public.catalog_products,
  public.catalog_product_variants,
  public.catalog_product_prices,
  public.catalog_branch_availability,
  public.catalog_media_assets,
  public.catalog_item_relations
to service_role;

create or replace function public.guard_catalog_v2_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.catalog_v2_mutation',true),'')<>'allowed' then
    raise exception 'CATALOG-V2 state requires governed command';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger catalog_service_profiles_guard
before insert or update or delete on public.catalog_service_profiles
for each row execute function public.guard_catalog_v2_mutation();
create trigger catalog_products_guard
before insert or update or delete on public.catalog_products
for each row execute function public.guard_catalog_v2_mutation();
create trigger catalog_product_variants_guard
before insert or update or delete on public.catalog_product_variants
for each row execute function public.guard_catalog_v2_mutation();
create trigger catalog_product_prices_guard
before insert or update or delete on public.catalog_product_prices
for each row execute function public.guard_catalog_v2_mutation();
create trigger catalog_branch_availability_guard
before insert or update or delete on public.catalog_branch_availability
for each row execute function public.guard_catalog_v2_mutation();
create trigger catalog_media_assets_guard
before insert or update or delete on public.catalog_media_assets
for each row execute function public.guard_catalog_v2_mutation();
create trigger catalog_item_relations_guard
before insert or update or delete on public.catalog_item_relations
for each row execute function public.guard_catalog_v2_mutation();

create unique index catalog_v2_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'CATALOG_V2_%' and correlation_id is not null;

create or replace function private.catalog_v2_assert_owner(
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
    raise exception 'CATALOG-V2 Organization and actor are required';
  end if;
  if not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_actor_user_id
      and m.role='OWNER'
  ) then
    raise exception 'CATALOG-V2 mutation requires Organization OWNER';
  end if;
end;
$$;

create or replace function private.catalog_v2_is_replay(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_request_key text,
  p_request_hash text
)
returns boolean
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_hash text;
begin
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'CATALOG-V2 request key is invalid';
  end if;
  select a.after_data->>'requestHash'
    into v_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action=p_action
    and a.entity_type=p_entity_type
    and a.entity_id=p_entity_id
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc
  limit 1;

  if v_hash is null then return false; end if;
  if v_hash<>p_request_hash then
    raise exception 'CATALOG-V2 request key conflict';
  end if;
  return true;
end;
$$;

create or replace function private.catalog_v2_subject_exists(
  p_organization_id uuid,
  p_service_id text,
  p_product_id uuid,
  p_variant_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select case
    when num_nonnulls(p_service_id,p_product_id,p_variant_id)<>1 then false
    when p_service_id is not null then exists(
      select 1 from public.services s
      where s.organization_id=p_organization_id and s.id=p_service_id
    )
    when p_product_id is not null then exists(
      select 1 from public.catalog_products p
      where p.organization_id=p_organization_id and p.id=p_product_id
    )
    else exists(
      select 1 from public.catalog_product_variants v
      where v.organization_id=p_organization_id and v.id=p_variant_id
    )
  end;
$$;

create or replace function private.catalog_v2_subject_business(
  p_organization_id uuid,
  p_service_id text,
  p_product_id uuid,
  p_variant_id uuid
)
returns uuid
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select case
    when p_service_id is not null then null::uuid
    when p_product_id is not null then (
      select p.tenant_business_id
      from public.catalog_products p
      where p.organization_id=p_organization_id and p.id=p_product_id
    )
    else (
      select p.tenant_business_id
      from public.catalog_product_variants v
      join public.catalog_products p
        on p.organization_id=v.organization_id and p.id=v.product_id
      where v.organization_id=p_organization_id and v.id=p_variant_id
    )
  end;
$$;

create or replace function public.upsert_catalog_service_profile_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_service_id text,
  p_description text,
  p_warranty_text text,
  p_availability_mode text,
  p_expected_version integer,
  p_branch_ids uuid[],
  p_request_key text
)
returns public.catalog_service_profiles
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_current public.catalog_service_profiles%rowtype;
  v_result public.catalog_service_profiles%rowtype;
  v_mode text:=upper(btrim(coalesce(p_availability_mode,'')));
  v_branches uuid[];
  v_hash text;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.catalog_v2_assert_owner(p_organization_id,p_actor_user_id);
  if not exists(select 1 from public.services where organization_id=p_organization_id and id=p_service_id) then
    raise exception 'CATALOG-V2 service not found';
  end if;
  if v_mode not in ('ALL_ACTIVE_BRANCHES','EXPLICIT_BRANCHES','ONLINE_ONLY','NOT_OFFERED')
     or (p_description is not null and length(btrim(p_description)) not between 1 and 8000)
     or (p_warranty_text is not null and length(btrim(p_warranty_text)) not between 1 and 4000)
  then raise exception 'CATALOG-V2 service profile payload is invalid'; end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[])
    into v_branches from unnest(coalesce(p_branch_ids,'{}'::uuid[])) x;

  if v_mode='EXPLICIT_BRANCHES' and cardinality(v_branches)=0 then
    raise exception 'CATALOG-V2 explicit service availability requires a branch';
  end if;
  if v_mode<>'EXPLICIT_BRANCHES' and cardinality(v_branches)>0 then
    raise exception 'CATALOG-V2 branch IDs are valid only for EXPLICIT_BRANCHES';
  end if;
  if exists(
    select 1 from unnest(v_branches) x
    where not exists(
      select 1 from public.branches b
      where b.organization_id=p_organization_id and b.id=x and b.status='ACTIVE'
    )
  ) then raise exception 'CATALOG-V2 service references missing or inactive branch'; end if;

  v_hash:=md5(jsonb_build_object(
    'serviceId',p_service_id,'description',nullif(btrim(coalesce(p_description,'')),''),
    'warranty',nullif(btrim(coalesce(p_warranty_text,'')),''),
    'availabilityMode',v_mode,'branchIds',to_jsonb(v_branches),
    'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_SERVICE_CONFIGURED','catalog_service',
    p_service_id,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_service_profiles
    where organization_id=p_organization_id and service_id=p_service_id;
    return v_result;
  end if;

  select * into v_current from public.catalog_service_profiles
  where organization_id=p_organization_id and service_id=p_service_id
  for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_current.version then
      raise exception 'CATALOG-V2 service profile version changed';
    end if;
  elsif p_expected_version is not null then
    raise exception 'CATALOG-V2 service profile does not exist at expected version';
  end if;

  v_hash:=md5(jsonb_build_object(
    'serviceId',p_service_id,'description',nullif(btrim(coalesce(p_description,'')),''),
    'warranty',nullif(btrim(coalesce(p_warranty_text,'')),''),
    'availabilityMode',v_mode,'branchIds',to_jsonb(v_branches),
    'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_SERVICE_CONFIGURED','catalog_service',
    p_service_id,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_service_profiles
    where organization_id=p_organization_id and service_id=p_service_id;
    return v_result;
  end if;

  perform set_config('app.catalog_v2_mutation','allowed',true);

  insert into public.catalog_service_profiles(
    organization_id,service_id,description,warranty_text,availability_mode,
    version,updated_by_user_id,created_at,updated_at
  ) values (
    p_organization_id,p_service_id,nullif(btrim(coalesce(p_description,'')),''),
    nullif(btrim(coalesce(p_warranty_text,'')),''),
    v_mode,1,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,service_id) do update set
    description=excluded.description,
    warranty_text=excluded.warranty_text,
    availability_mode=excluded.availability_mode,
    version=public.catalog_service_profiles.version+1,
    updated_by_user_id=excluded.updated_by_user_id,
    updated_at=v_now
  returning * into v_result;

  delete from public.catalog_branch_availability
  where organization_id=p_organization_id and service_id=p_service_id;

  if v_mode='EXPLICIT_BRANCHES' then
    insert into public.catalog_branch_availability(
      organization_id,branch_id,service_id,enabled,created_by_user_id,updated_by_user_id
    )
    select p_organization_id,x,p_service_id,true,p_actor_user_id,p_actor_user_id
    from unnest(v_branches) x;
  end if;

  perform set_config('app.catalog_v2_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CATALOG_V2_SERVICE_CONFIGURED','catalog_service',p_service_id,
    jsonb_build_object(
      'requestHash',v_hash,'version',v_result.version,
      'availabilityMode',v_mode,'branchIds',to_jsonb(v_branches),
      'pricingAuthority','service_prices'
    ),
    p_request_key
  );

  return v_result;
end;
$$;

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
     or v_inventory not in ('NONE','REFERENCE_ONLY')
     or (v_inventory='NONE' and v_inventory_ref is not null)
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
     or v_inventory not in ('INHERIT','NONE','REFERENCE_ONLY')
     or (v_inventory in ('INHERIT','NONE') and v_inventory_ref is not null)
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

create or replace function public.upsert_catalog_product_price_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_price_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_country_code text,
  p_currency text,
  p_price numeric,
  p_minimum_price numeric,
  p_compare_at_price numeric,
  p_expected_version integer,
  p_request_key text
)
returns public.catalog_product_prices
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_current public.catalog_product_prices%rowtype;
  v_result public.catalog_product_prices%rowtype;
  v_country text:=upper(btrim(coalesce(p_country_code,'')));
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_hash text;
  v_business uuid;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.catalog_v2_assert_owner(p_organization_id,p_actor_user_id);
  select tenant_business_id into v_business from public.catalog_products
  where organization_id=p_organization_id and id=p_product_id;
  if not found then raise exception 'CATALOG-V2 price product not found'; end if;
  if p_variant_id is not null and not exists(
    select 1 from public.catalog_product_variants
    where organization_id=p_organization_id and id=p_variant_id and product_id=p_product_id
  ) then raise exception 'CATALOG-V2 price variant does not belong to Product'; end if;

  if p_price_id is null or v_country !~ '^[A-Z]{2}$' or v_currency !~ '^[A-Z]{3}$'
     or p_price is null or p_price<0
     or (p_minimum_price is not null and (p_minimum_price<0 or p_minimum_price>p_price))
     or (p_compare_at_price is not null and p_compare_at_price<p_price)
  then raise exception 'CATALOG-V2 price payload is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'priceId',p_price_id,'productId',p_product_id,'variantId',p_variant_id,
    'country',v_country,'currency',v_currency,'price',p_price,
    'minimumPrice',p_minimum_price,'compareAtPrice',p_compare_at_price,
    'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_PRODUCT_PRICE_CONFIGURED','catalog_product_price',
    p_price_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_product_prices
    where organization_id=p_organization_id and id=p_price_id;
    return v_result;
  end if;

  select * into v_current from public.catalog_product_prices
  where organization_id=p_organization_id and id=p_price_id
  for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_current.version then
      raise exception 'CATALOG-V2 price version changed';
    end if;
    if v_current.product_id<>p_product_id or v_current.variant_id is distinct from p_variant_id then
      raise exception 'CATALOG-V2 price subject is immutable';
    end if;
  elsif p_expected_version is not null then
    raise exception 'CATALOG-V2 price does not exist at expected version';
  end if;

  v_hash:=md5(jsonb_build_object(
    'priceId',p_price_id,'productId',p_product_id,'variantId',p_variant_id,
    'country',v_country,'currency',v_currency,'price',p_price,
    'minimumPrice',p_minimum_price,'compareAtPrice',p_compare_at_price,
    'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_PRODUCT_PRICE_CONFIGURED','catalog_product_price',
    p_price_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_product_prices
    where organization_id=p_organization_id and id=p_price_id;
    return v_result;
  end if;

  perform set_config('app.catalog_v2_mutation','allowed',true);
  insert into public.catalog_product_prices(
    id,organization_id,product_id,variant_id,country_code,currency,price,
    minimum_price,compare_at_price,version,updated_by_user_id,created_at,updated_at
  ) values (
    p_price_id,p_organization_id,p_product_id,p_variant_id,v_country,v_currency,p_price,
    p_minimum_price,p_compare_at_price,1,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,id) do update set
    country_code=excluded.country_code,currency=excluded.currency,price=excluded.price,
    minimum_price=excluded.minimum_price,compare_at_price=excluded.compare_at_price,
    version=public.catalog_product_prices.version+1,
    updated_by_user_id=excluded.updated_by_user_id,updated_at=v_now
  returning * into v_result;
  perform set_config('app.catalog_v2_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CATALOG_V2_PRODUCT_PRICE_CONFIGURED','catalog_product_price',p_price_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'version',v_result.version,'productId',p_product_id,
      'variantId',p_variant_id,'countryCode',v_country,'currency',v_currency,
      'canonicalPricingOwner','catalog_product_prices'
    ),
    p_request_key,v_business
  );
  return v_result;
end;
$$;

create or replace function public.upsert_catalog_media_asset_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_media_id uuid,
  p_service_id text,
  p_product_id uuid,
  p_variant_id uuid,
  p_media_type text,
  p_source_type text,
  p_public_url text,
  p_portfolio_item_id uuid,
  p_alt_text text,
  p_sort_order integer,
  p_approved boolean,
  p_expected_version integer,
  p_request_key text
)
returns public.catalog_media_assets
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_current public.catalog_media_assets%rowtype;
  v_result public.catalog_media_assets%rowtype;
  v_media_type text:=upper(btrim(coalesce(p_media_type,'')));
  v_source text:=upper(btrim(coalesce(p_source_type,'')));
  v_url text:=nullif(btrim(coalesce(p_public_url,'')),'');
  v_alt text:=nullif(btrim(coalesce(p_alt_text,'')),'');
  v_hash text;
  v_business uuid;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.catalog_v2_assert_owner(p_organization_id,p_actor_user_id);
  if p_media_id is null
     or not private.catalog_v2_subject_exists(p_organization_id,p_service_id,p_product_id,p_variant_id)
     or v_media_type not in ('IMAGE','VIDEO','DOCUMENT')
     or v_source not in ('HTTPS_URL','PORTFOLIO_ITEM')
     or p_sort_order not between -100000 and 100000
     or p_approved is null
     or (v_alt is not null and length(v_alt)>500)
  then raise exception 'CATALOG-V2 media payload is invalid'; end if;

  if v_source='HTTPS_URL' then
    if v_url is null or v_url !~ '^https://' or length(v_url)>2048 or p_portfolio_item_id is not null then
      raise exception 'CATALOG-V2 HTTPS media source is invalid';
    end if;
  else
    if p_portfolio_item_id is null or v_url is not null or p_service_id is null
       or p_product_id is not null or p_variant_id is not null
       or not exists(
         select 1 from public.portfolio_items pi
         where pi.organization_id=p_organization_id
           and pi.id=p_portfolio_item_id
           and pi.approved=true
           and pi.service_id=p_service_id
       )
    then raise exception 'CATALOG-V2 portfolio media must match an approved Service portfolio item'; end if;
  end if;

  v_business:=private.catalog_v2_subject_business(
    p_organization_id,p_service_id,p_product_id,p_variant_id
  );

  v_hash:=md5(jsonb_build_object(
    'mediaId',p_media_id,'serviceId',p_service_id,'productId',p_product_id,
    'variantId',p_variant_id,'mediaType',v_media_type,'sourceType',v_source,
    'publicUrl',v_url,'portfolioItemId',p_portfolio_item_id,'altText',v_alt,
    'sortOrder',p_sort_order,'approved',p_approved,'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_MEDIA_CONFIGURED','catalog_media',
    p_media_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_media_assets
    where organization_id=p_organization_id and id=p_media_id;
    return v_result;
  end if;

  select * into v_current from public.catalog_media_assets
  where organization_id=p_organization_id and id=p_media_id for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_current.version then
      raise exception 'CATALOG-V2 media version changed';
    end if;
    if v_current.service_id is distinct from p_service_id
       or v_current.product_id is distinct from p_product_id
       or v_current.variant_id is distinct from p_variant_id
    then raise exception 'CATALOG-V2 media subject is immutable'; end if;
  elsif p_expected_version is not null then
    raise exception 'CATALOG-V2 media does not exist at expected version';
  end if;

  v_hash:=md5(jsonb_build_object(
    'mediaId',p_media_id,'serviceId',p_service_id,'productId',p_product_id,
    'variantId',p_variant_id,'mediaType',v_media_type,'sourceType',v_source,
    'publicUrl',v_url,'portfolioItemId',p_portfolio_item_id,'altText',v_alt,
    'sortOrder',p_sort_order,'approved',p_approved,'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_MEDIA_CONFIGURED','catalog_media',
    p_media_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_media_assets
    where organization_id=p_organization_id and id=p_media_id;
    return v_result;
  end if;

  perform set_config('app.catalog_v2_mutation','allowed',true);
  insert into public.catalog_media_assets(
    id,organization_id,service_id,product_id,variant_id,media_type,source_type,
    public_url,portfolio_item_id,alt_text,sort_order,approved,version,
    updated_by_user_id,created_at,updated_at
  ) values (
    p_media_id,p_organization_id,p_service_id,p_product_id,p_variant_id,
    v_media_type,v_source,v_url,p_portfolio_item_id,v_alt,p_sort_order,p_approved,
    1,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,id) do update set
    media_type=excluded.media_type,source_type=excluded.source_type,
    public_url=excluded.public_url,portfolio_item_id=excluded.portfolio_item_id,
    alt_text=excluded.alt_text,sort_order=excluded.sort_order,approved=excluded.approved,
    version=public.catalog_media_assets.version+1,
    updated_by_user_id=excluded.updated_by_user_id,updated_at=v_now
  returning * into v_result;
  perform set_config('app.catalog_v2_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CATALOG_V2_MEDIA_CONFIGURED','catalog_media',p_media_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'version',v_result.version,'sourceType',v_source,
      'binaryMediaStoreCreated',false
    ),
    p_request_key,v_business
  );
  return v_result;
end;
$$;

create or replace function public.upsert_catalog_item_relation_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_relation_id uuid,
  p_source_service_id text,
  p_source_product_id uuid,
  p_source_variant_id uuid,
  p_target_service_id text,
  p_target_product_id uuid,
  p_target_variant_id uuid,
  p_relation_type text,
  p_quantity numeric,
  p_required boolean,
  p_sort_order integer,
  p_expected_version integer,
  p_request_key text
)
returns public.catalog_item_relations
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_current public.catalog_item_relations%rowtype;
  v_result public.catalog_item_relations%rowtype;
  v_type text:=upper(btrim(coalesce(p_relation_type,'')));
  v_source_business uuid;
  v_target_business uuid;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
begin
  perform private.catalog_v2_assert_owner(p_organization_id,p_actor_user_id);
  if p_relation_id is null
     or not private.catalog_v2_subject_exists(
       p_organization_id,p_source_service_id,p_source_product_id,p_source_variant_id
     )
     or not private.catalog_v2_subject_exists(
       p_organization_id,p_target_service_id,p_target_product_id,p_target_variant_id
     )
     or v_type not in ('BUNDLE_COMPONENT','ADD_ON')
     or p_quantity is null or p_quantity<=0 or p_quantity>1000000
     or p_required is null
     or p_sort_order not between -100000 and 100000
     or (
       coalesce(p_source_service_id,'')=coalesce(p_target_service_id,'')
       and coalesce(p_source_product_id::text,'')=coalesce(p_target_product_id::text,'')
       and coalesce(p_source_variant_id::text,'')=coalesce(p_target_variant_id::text,'')
     )
  then raise exception 'CATALOG-V2 relation payload is invalid'; end if;

  v_source_business:=private.catalog_v2_subject_business(
    p_organization_id,p_source_service_id,p_source_product_id,p_source_variant_id
  );
  v_target_business:=private.catalog_v2_subject_business(
    p_organization_id,p_target_service_id,p_target_product_id,p_target_variant_id
  );
  if v_source_business is not null and v_target_business is not null
     and v_source_business<>v_target_business
  then raise exception 'CATALOG-V2 relation cannot cross Product Business ownership'; end if;

  if exists(
    select 1
    from public.catalog_item_relations r
    where r.organization_id=p_organization_id
      and r.id<>p_relation_id
      and r.source_service_id is not distinct from p_target_service_id
      and r.source_product_id is not distinct from p_target_product_id
      and r.source_variant_id is not distinct from p_target_variant_id
      and r.target_service_id is not distinct from p_source_service_id
      and r.target_product_id is not distinct from p_source_product_id
      and r.target_variant_id is not distinct from p_source_variant_id
  ) then
    raise exception 'CATALOG-V2 relation cannot create a direct cycle';
  end if;

  v_hash:=md5(jsonb_build_object(
    'relationId',p_relation_id,
    'sourceServiceId',p_source_service_id,'sourceProductId',p_source_product_id,
    'sourceVariantId',p_source_variant_id,'targetServiceId',p_target_service_id,
    'targetProductId',p_target_product_id,'targetVariantId',p_target_variant_id,
    'relationType',v_type,'quantity',p_quantity,'required',p_required,
    'sortOrder',p_sort_order,'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_RELATION_CONFIGURED','catalog_relation',
    p_relation_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_item_relations
    where organization_id=p_organization_id and id=p_relation_id;
    return v_result;
  end if;

  select * into v_current from public.catalog_item_relations
  where organization_id=p_organization_id and id=p_relation_id for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_current.version then
      raise exception 'CATALOG-V2 relation version changed';
    end if;
    if v_current.source_service_id is distinct from p_source_service_id
       or v_current.source_product_id is distinct from p_source_product_id
       or v_current.source_variant_id is distinct from p_source_variant_id
    then raise exception 'CATALOG-V2 relation source is immutable'; end if;
  elsif p_expected_version is not null then
    raise exception 'CATALOG-V2 relation does not exist at expected version';
  end if;

  v_hash:=md5(jsonb_build_object(
    'relationId',p_relation_id,
    'sourceServiceId',p_source_service_id,'sourceProductId',p_source_product_id,
    'sourceVariantId',p_source_variant_id,'targetServiceId',p_target_service_id,
    'targetProductId',p_target_product_id,'targetVariantId',p_target_variant_id,
    'relationType',v_type,'quantity',p_quantity,'required',p_required,
    'sortOrder',p_sort_order,'expectedVersion',p_expected_version
  )::text);

  if private.catalog_v2_is_replay(
    p_organization_id,'CATALOG_V2_RELATION_CONFIGURED','catalog_relation',
    p_relation_id::text,p_request_key,v_hash
  ) then
    select * into v_result from public.catalog_item_relations
    where organization_id=p_organization_id and id=p_relation_id;
    return v_result;
  end if;

  perform set_config('app.catalog_v2_mutation','allowed',true);
  insert into public.catalog_item_relations(
    id,organization_id,source_service_id,source_product_id,source_variant_id,
    target_service_id,target_product_id,target_variant_id,relation_type,
    quantity,required,sort_order,version,updated_by_user_id,created_at,updated_at
  ) values (
    p_relation_id,p_organization_id,p_source_service_id,p_source_product_id,p_source_variant_id,
    p_target_service_id,p_target_product_id,p_target_variant_id,v_type,
    p_quantity,p_required,p_sort_order,1,p_actor_user_id,v_now,v_now
  )
  on conflict (organization_id,id) do update set
    target_service_id=excluded.target_service_id,
    target_product_id=excluded.target_product_id,
    target_variant_id=excluded.target_variant_id,
    relation_type=excluded.relation_type,quantity=excluded.quantity,
    required=excluded.required,sort_order=excluded.sort_order,
    version=public.catalog_item_relations.version+1,
    updated_by_user_id=excluded.updated_by_user_id,updated_at=v_now
  returning * into v_result;
  perform set_config('app.catalog_v2_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CATALOG_V2_RELATION_CONFIGURED','catalog_relation',p_relation_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'version',v_result.version,'relationType',v_type
    ),
    p_request_key,coalesce(v_source_business,v_target_business)
  );
  return v_result;
end;
$$;

-- Guard/helper functions are internal to commands/triggers.
revoke all on function public.guard_catalog_v2_mutation()
  from public,anon,authenticated,service_role;
revoke all on function private.catalog_v2_assert_owner(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.catalog_v2_is_replay(uuid,text,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function private.catalog_v2_subject_exists(uuid,text,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.catalog_v2_subject_business(uuid,text,uuid,uuid)
  from public,anon,authenticated,service_role;

grant execute on function private.catalog_v2_assert_owner(uuid,uuid) to service_role;
grant execute on function private.catalog_v2_is_replay(uuid,text,text,text,text,text) to service_role;
grant execute on function private.catalog_v2_subject_exists(uuid,text,uuid,uuid) to service_role;
grant execute on function private.catalog_v2_subject_business(uuid,text,uuid,uuid) to service_role;

-- Public mutation RPCs are trusted-server only.
revoke all on function public.upsert_catalog_service_profile_v2(
  uuid,uuid,text,text,text,text,integer,uuid[],text
) from public,anon,authenticated,service_role;
grant execute on function public.upsert_catalog_service_profile_v2(
  uuid,uuid,text,text,text,text,integer,uuid[],text
) to service_role;

revoke all on function public.upsert_catalog_product_v2(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,uuid[],text
) from public,anon,authenticated,service_role;
grant execute on function public.upsert_catalog_product_v2(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,uuid[],text
) to service_role;

revoke all on function public.upsert_catalog_product_variant_v2(
  uuid,uuid,uuid,uuid,text,text,jsonb,text,text,text,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.upsert_catalog_product_variant_v2(
  uuid,uuid,uuid,uuid,text,text,jsonb,text,text,text,integer,text
) to service_role;

revoke all on function public.upsert_catalog_product_price_v2(
  uuid,uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.upsert_catalog_product_price_v2(
  uuid,uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,integer,text
) to service_role;

revoke all on function public.upsert_catalog_media_asset_v2(
  uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,text,integer,boolean,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.upsert_catalog_media_asset_v2(
  uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,text,integer,boolean,integer,text
) to service_role;

revoke all on function public.upsert_catalog_item_relation_v2(
  uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,numeric,boolean,integer,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.upsert_catalog_item_relation_v2(
  uuid,uuid,uuid,text,uuid,uuid,text,uuid,uuid,text,numeric,boolean,integer,integer,text
) to service_role;
