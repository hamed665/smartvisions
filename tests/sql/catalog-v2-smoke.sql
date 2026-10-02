\set ON_ERROR_STOP on

-- CATALOG-V2 disposable controlled acceptance. No Production data is involved.

insert into public.organizations(id,name)
values ('00000000-0000-0000-0000-00000000c701','CATALOG-V2 CI')
on conflict (id) do nothing;

insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000c711')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values (
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c711',
  'OWNER'
)
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.brands(id,organization_id,name,slug,status,metadata)
values (
  '00000000-0000-0000-0000-00000000c721',
  '00000000-0000-0000-0000-00000000c701',
  'CATALOG Brand','catalog-v2-ci','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,country_code,timezone,status,metadata
) values
(
  '00000000-0000-0000-0000-00000000c731',
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c721',
  'CATALOG Business A','catalog-business-a','OM','Asia/Muscat','ACTIVE','{}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000c732',
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c721',
  'CATALOG Business B','catalog-business-b','OM','Asia/Muscat','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.branches(
  id,organization_id,tenant_business_id,name,code,country_code,timezone,status,metadata
) values
(
  '00000000-0000-0000-0000-00000000c741',
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c731',
  'Business A Muscat','CATALOG_A','OM','Asia/Muscat','ACTIVE','{}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000c742',
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c732',
  'Business B Muscat','CATALOG_B','OM','Asia/Muscat','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.services(id,organization_id,name,enabled,config,updated_at)
values (
  'catalog_ci_service',
  '00000000-0000-0000-0000-00000000c701',
  'CATALOG CI Service',true,'{}'::jsonb,now()
)
on conflict (organization_id,id) do update set name=excluded.name,enabled=true;

insert into public.service_prices(
  id,organization_id,service_id,country_code,currency,price,minimum_price,
  max_auto_discount_pct,max_discount_with_approval_pct,premium_price
) values (
  '00000000-0000-0000-0000-00000000c751',
  '00000000-0000-0000-0000-00000000c701',
  'catalog_ci_service','OM','OMR',100,90,5,10,120
)
on conflict (organization_id,service_id,country_code)
do update set price=excluded.price,minimum_price=excluded.minimum_price;

insert into public.portfolio_items(
  id,organization_id,title,service_id,approved,public_url,summary,tags
) values (
  '00000000-0000-0000-0000-00000000c761',
  '00000000-0000-0000-0000-00000000c701',
  'CATALOG service media','catalog_ci_service',true,
  'https://example.com/catalog-service.jpg','CI media','[]'::jsonb
)
on conflict (id) do update set approved=true,service_id=excluded.service_id;

-- Direct service-role writes must still go through governed commands.
reset role;
set role service_role;

do $direct_catalog_mutation_guard$
begin
  begin
    insert into public.catalog_products(
      id,organization_id,tenant_business_id,sku,name,inventory_mode,
      created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000c799',
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c731',
      'DIRECT-BLOCK','Must fail','NONE',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c711'
    );
    raise exception 'Direct CATALOG-V2 mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 state requires governed command%' then
      raise;
    end if;
  end;
end;
$direct_catalog_mutation_guard$;

do $service_profile_and_replay$
declare
  r public.catalog_service_profiles%rowtype;
begin
  select * into r from public.upsert_catalog_service_profile_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    'catalog_ci_service',
    'Governed service description',
    '12 month service workmanship warranty',
    'EXPLICIT_BRANCHES',
    null,
    array['00000000-0000-0000-0000-00000000c741'::uuid],
    'catalog-v2-service-ci-1'
  );

  if r.version<>1 or r.availability_mode<>'EXPLICIT_BRANCHES' then
    raise exception 'CATALOG-V2 service profile was not created';
  end if;

  select * into r from public.upsert_catalog_service_profile_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    'catalog_ci_service',
    'Governed service description',
    '12 month service workmanship warranty',
    'EXPLICIT_BRANCHES',
    null,
    array['00000000-0000-0000-0000-00000000c741'::uuid],
    'catalog-v2-service-ci-1'
  );

  if r.version<>1 then
    raise exception 'CATALOG-V2 service replay mutated version';
  end if;

  if (
    select count(*) from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and action='CATALOG_V2_SERVICE_CONFIGURED'
      and correlation_id='catalog-v2-service-ci-1'
  )<>1 then
    raise exception 'CATALOG-V2 service replay duplicated audit evidence';
  end if;

  if not exists(
    select 1 from public.catalog_branch_availability
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and service_id='catalog_ci_service'
      and branch_id='00000000-0000-0000-0000-00000000c741'
      and enabled=true
  ) then
    raise exception 'CATALOG-V2 service branch availability was not persisted';
  end if;

  if (select price from public.service_prices
      where organization_id='00000000-0000-0000-0000-00000000c701'
        and service_id='catalog_ci_service' and country_code='OM')<>100
  then
    raise exception 'CATALOG-V2 changed canonical Service pricing';
  end if;

  begin
    perform public.upsert_catalog_service_profile_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      'catalog_ci_service','Changed',null,'ALL_ACTIVE_BRANCHES',
      99,'{}'::uuid[],'catalog-v2-service-ci-stale'
    );
    raise exception 'Stale CATALOG-V2 service version unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 service profile version changed%' then raise; end if;
  end;
end;
$service_profile_and_replay$;

do $product_variant_price$
declare
  p public.catalog_products%rowtype;
  v public.catalog_product_variants%rowtype;
  pr public.catalog_product_prices%rowtype;
begin
  select * into p from public.upsert_catalog_product_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000c771',
    '00000000-0000-0000-0000-00000000c731',
    'CATALOG-PRODUCT','CATALOG Product',
    'Canonical Product for CI','ACTIVE','24 month product warranty',
    'EXPLICIT_BRANCHES','REFERENCE_ONLY','erp:catalog-product',null,
    array['00000000-0000-0000-0000-00000000c741'::uuid],
    'catalog-v2-product-ci-1'
  );

  if p.version<>1 or p.inventory_mode<>'REFERENCE_ONLY' then
    raise exception 'CATALOG-V2 Product was not created';
  end if;

  select * into p from public.upsert_catalog_product_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000c771',
    '00000000-0000-0000-0000-00000000c731',
    'CATALOG-PRODUCT','CATALOG Product',
    'Canonical Product for CI','ACTIVE','24 month product warranty',
    'EXPLICIT_BRANCHES','REFERENCE_ONLY','erp:catalog-product',null,
    array['00000000-0000-0000-0000-00000000c741'::uuid],
    'catalog-v2-product-ci-1'
  );
  if p.version<>1 then raise exception 'CATALOG-V2 Product replay mutated version'; end if;

  begin
    perform public.upsert_catalog_product_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c775',
      '00000000-0000-0000-0000-00000000c731',
      'WARRANTY-BOUND','Warranty bound check',null,'ACTIVE',repeat('w',4001),
      'ALL_ACTIVE_BRANCHES','NONE',null,null,'{}'::uuid[],
      'catalog-v2-product-warranty-bound'
    );
    raise exception 'Overlong CATALOG-V2 Product warranty unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 product payload is invalid%' then raise; end if;
  end;

  if not exists(
    select 1 from public.catalog_branch_availability
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and product_id='00000000-0000-0000-0000-00000000c771'
      and branch_id='00000000-0000-0000-0000-00000000c741'
  ) then raise exception 'CATALOG-V2 Product branch availability missing'; end if;

  begin
    perform public.upsert_catalog_product_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c772',
      '00000000-0000-0000-0000-00000000c731',
      'WRONG-BRANCH','Wrong branch Product',null,'ACTIVE',null,
      'EXPLICIT_BRANCHES','NONE',null,null,
      array['00000000-0000-0000-0000-00000000c742'::uuid],
      'catalog-v2-product-wrong-branch'
    );
    raise exception 'Cross-Business Product branch unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 product branch scope is invalid%' then raise; end if;
  end;

  select * into v from public.upsert_catalog_product_variant_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000c781',
    '00000000-0000-0000-0000-00000000c771',
    'CATALOG-PRODUCT-BLACK','Black',
    '{"color":"black","size":"standard"}'::jsonb,
    'ACTIVE','INHERIT',null,null,'catalog-v2-variant-ci-1'
  );
  if v.version<>1 or v.product_id<>'00000000-0000-0000-0000-00000000c771' then
    raise exception 'CATALOG-V2 Variant was not created';
  end if;

  select * into pr from public.upsert_catalog_product_price_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000c791',
    '00000000-0000-0000-0000-00000000c771',
    '00000000-0000-0000-0000-00000000c781',
    'OM','OMR',25,20,30,null,'catalog-v2-price-ci-1'
  );
  if pr.price<>25 or pr.currency<>'OMR' then
    raise exception 'CATALOG-V2 Product price was not created';
  end if;

  select * into pr from public.upsert_catalog_product_price_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000c792',
    '00000000-0000-0000-0000-00000000c771',
    '00000000-0000-0000-0000-00000000c781',
    'OM','USD',26,21,31,null,'catalog-v2-price-usd-ci-1'
  );
  if pr.currency<>'USD' then
    raise exception 'CATALOG-V2 country/currency pricing did not allow a distinct currency';
  end if;

  begin
    perform public.upsert_catalog_product_price_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c793',
      '00000000-0000-0000-0000-00000000c771',
      '00000000-0000-0000-0000-00000000c781',
      'OM','OMR',27,22,32,null,'catalog-v2-price-duplicate-ci-1'
    );
    raise exception 'Duplicate Product country/currency price unexpectedly succeeded';
  exception when unique_violation then
    null;
  end;
end;
$product_variant_price$;

do $catalog_media_and_relations$
declare
  m public.catalog_media_assets%rowtype;
  r public.catalog_item_relations%rowtype;
begin
  select * into m from public.upsert_catalog_media_asset_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000ca01',
    'catalog_ci_service',null,null,
    'IMAGE','PORTFOLIO_ITEM',null,
    '00000000-0000-0000-0000-00000000c761',
    'Approved Service portfolio media',0,true,null,'catalog-v2-media-service-1'
  );
  if m.source_type<>'PORTFOLIO_ITEM' then raise exception 'Service portfolio media was not linked'; end if;

  select * into m from public.upsert_catalog_media_asset_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000ca02',
    null,'00000000-0000-0000-0000-00000000c771',null,
    'IMAGE','HTTPS_URL','https://example.com/catalog-product.jpg',
    null,'Product image',1,true,null,'catalog-v2-media-product-1'
  );
  if m.public_url<>'https://example.com/catalog-product.jpg' then
    raise exception 'Product HTTPS media was not linked';
  end if;

  begin
    perform public.upsert_catalog_media_asset_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000ca03',
      null,'00000000-0000-0000-0000-00000000c771',null,
      'IMAGE','HTTPS_URL','http://example.com/not-https.jpg',
      null,'Invalid URL',2,true,null,'catalog-v2-media-http-block'
    );
    raise exception 'Non-HTTPS CATALOG-V2 media unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 HTTPS media source is invalid%' then raise; end if;
  end;

  begin
    perform public.upsert_catalog_media_asset_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000ca04',
      null,'00000000-0000-0000-0000-00000000c771',null,
      'IMAGE','HTTPS_URL','https://' || repeat('x',2042),
      null,'Overlong URL',3,true,null,'catalog-v2-media-length-block'
    );
    raise exception 'Overlong CATALOG-V2 media URL unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 HTTPS media source is invalid%' then raise; end if;
  end;

  select * into r from public.upsert_catalog_item_relation_v2(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000cb01',
    null,'00000000-0000-0000-0000-00000000c771',null,
    'catalog_ci_service',null,null,
    'ADD_ON',1,false,0,null,'catalog-v2-relation-ci-1'
  );
  if r.relation_type<>'ADD_ON' then raise exception 'CATALOG-V2 Add-on relation was not created'; end if;

  begin
    perform public.upsert_catalog_item_relation_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000cb04',
      null,'00000000-0000-0000-0000-00000000c771',null,
      null,'00000000-0000-0000-0000-00000000c771',null,
      'BUNDLE_COMPONENT',1,true,0,null,'catalog-v2-self-relation'
    );
    raise exception 'Self-referential CATALOG-V2 relation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 relation payload is invalid%' then raise; end if;
  end;

  begin
    perform public.upsert_catalog_item_relation_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000cb03',
      'catalog_ci_service',null,null,
      null,'00000000-0000-0000-0000-00000000c771',null,
      'ADD_ON',1,false,0,null,'catalog-v2-direct-cycle'
    );
    raise exception 'Direct CATALOG-V2 relation cycle unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 relation cannot create a direct cycle%' then raise; end if;
  end;
end;
$catalog_media_and_relations$;

-- Product B uses a distinct Organization-scoped SKU and proves cross-Business
-- product relations fail closed without weakening canonical SKU ownership.
select public.upsert_catalog_product_v2(
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c711',
  '00000000-0000-0000-0000-00000000c773',
  '00000000-0000-0000-0000-00000000c732',
  'CATALOG-PRODUCT-B','Business B Product',null,'ACTIVE',null,
  'ALL_ACTIVE_BRANCHES','NONE',null,null,'{}'::uuid[],
  'catalog-v2-product-b-ci-1'
);

do $catalog_v2_org_scoped_skus$
begin
  begin
    perform public.upsert_catalog_product_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c774',
      '00000000-0000-0000-0000-00000000c732',
      'CATALOG-PRODUCT','Duplicate SKU in another Business',null,'ACTIVE',null,
      'ALL_ACTIVE_BRANCHES','NONE',null,null,'{}'::uuid[],
      'catalog-v2-product-org-sku-duplicate'
    );
    raise exception 'Product SKU was not Organization-scoped';
  exception when unique_violation then
    null;
  end;

  begin
    perform public.upsert_catalog_product_variant_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c782',
      '00000000-0000-0000-0000-00000000c773',
      'CATALOG-PRODUCT-BLACK','Duplicate Variant SKU',
      '{"color":"duplicate"}'::jsonb,
      'ACTIVE','INHERIT',null,null,'catalog-v2-variant-org-sku-duplicate'
    );
    raise exception 'Variant SKU was not Organization-scoped';
  exception when unique_violation then
    null;
  end;
end;
$catalog_v2_org_scoped_skus$;

do $cross_business_relation_block$
begin
  begin
    perform public.upsert_catalog_item_relation_v2(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000cb02',
      null,'00000000-0000-0000-0000-00000000c771',null,
      null,'00000000-0000-0000-0000-00000000c773',null,
      'BUNDLE_COMPONENT',1,true,0,null,'catalog-v2-cross-business-relation'
    );
    raise exception 'Cross-Business Product relation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CATALOG-V2 relation cannot cross Product Business ownership%' then raise; end if;
  end;
end;
$cross_business_relation_block$;

do $catalog_v2_no_inventory_truth$
begin
  if to_regclass('public.catalog_services') is not null
     or to_regclass('public.catalog_service_prices') is not null
     or to_regclass('public.catalog_item_registry') is not null
  then
    raise exception 'CATALOG-V2 introduced a parallel Service/catalog identity or Service pricing authority';
  end if;

  if exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='catalog_service_profiles'
      and column_name in ('name','enabled','price','minimum_price','premium_price')
  ) then
    raise exception 'CATALOG-V2 duplicated canonical Service identity or pricing columns';
  end if;
  if exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name in ('catalog_products','catalog_product_variants')
      and column_name in ('stock','stock_quantity','available_quantity','reserved_quantity')
  ) then
    raise exception 'CATALOG-V2 incorrectly introduced stock quantity truth';
  end if;

  if not exists(
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='field_service_material_usage'
      and pg_get_constraintdef(c.oid) like '%inventory_effect = ''NONE''%'
  ) then
    raise exception 'Field Service inventory non-ownership contract drifted';
  end if;
end;
$catalog_v2_no_inventory_truth$;

do $catalog_v2_acl$
begin
  if has_table_privilege('authenticated','public.catalog_products','INSERT')
     or has_table_privilege('authenticated','public.catalog_products','UPDATE')
     or has_table_privilege('anon','public.catalog_products','SELECT')
     or not has_table_privilege('authenticated','public.catalog_products','SELECT')
  then raise exception 'CATALOG-V2 Product table ACL drifted'; end if;

  if has_function_privilege(
       'authenticated',
       'public.upsert_catalog_product_v2(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,uuid[],text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.upsert_catalog_product_v2(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,uuid[],text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.upsert_catalog_product_v2(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,uuid[],text)',
       'EXECUTE'
     )
  then raise exception 'CATALOG-V2 Product command ACL drifted'; end if;

  if has_function_privilege(
       'authenticated',
       'public.upsert_catalog_service_profile_v2(uuid,uuid,text,text,text,text,integer,uuid[],text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.upsert_catalog_service_profile_v2(uuid,uuid,text,text,text,text,integer,uuid[],text)',
       'EXECUTE'
     )
  then raise exception 'CATALOG-V2 Service command ACL drifted'; end if;
end;
$catalog_v2_acl$;

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c711',false);
set role authenticated;
do $catalog_v2_owner_read_scope$
begin
  if not exists(
    select 1 from public.catalog_products
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and id='00000000-0000-0000-0000-00000000c771'
  ) then
    raise exception 'Organization owner could not read scoped CATALOG-V2 Product';
  end if;
end;
$catalog_v2_owner_read_scope$;

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c712',false);
set role authenticated;
do $catalog_v2_cross_org_read_scope$
begin
  if exists(
    select 1 from public.catalog_products
    where organization_id='00000000-0000-0000-0000-00000000c701'
  ) then
    raise exception 'CATALOG-V2 RLS leaked Product rows to a non-member';
  end if;
end;
$catalog_v2_cross_org_read_scope$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- The PostgreSQL CI database is disposable. Keep the isolated c701 fixture in-place
-- for later smoke files rather than deleting hierarchy rows referenced by canonical
-- audit evidence; Production verification never creates this fixture.
