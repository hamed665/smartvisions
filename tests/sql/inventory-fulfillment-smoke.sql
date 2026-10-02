\set ON_ERROR_STOP on

-- INVENTORY-FULFILLMENT controlled disposable acceptance.
-- Reuses Catalog/Order fixtures from earlier smoke files; Production never receives fixtures.

reset role;
set role service_role;

do $enable_stocked_catalog$
declare p public.catalog_products%rowtype;
begin
  select * into p from public.catalog_products
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and id='00000000-0000-0000-0000-00000000c771';
  perform public.upsert_catalog_product_v2(
    p.organization_id,'00000000-0000-0000-0000-00000000c711',p.id,p.tenant_business_id,
    p.sku,p.name,p.description,p.status,p.warranty_text,p.availability_mode,
    'STOCKED',null,p.version,
    array['00000000-0000-0000-0000-00000000c741'::uuid],
    'inventory-enable-stocked-product-1'
  );
  if (select inventory_mode from public.catalog_products where id=p.id)<>'STOCKED' then
    raise exception 'INVENTORY-FULFILLMENT did not enable Catalog STOCKED mode';
  end if;
end;
$enable_stocked_catalog$;

do $configure_inventory$
declare l public.inventory_locations%rowtype; i public.inventory_items%rowtype; b public.inventory_stock_balances%rowtype;
begin
  select * into l from public.configure_inventory_location_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000e701','00000000-0000-0000-0000-00000000c731',
    'BRANCH','00000000-0000-0000-0000-00000000c741','MAIN-STOCK','Main Branch Stock','ACTIVE',
    '{"source":"CI"}'::jsonb,null,'inventory-location-ci-1'
  );
  if l.location_kind<>'BRANCH' or l.branch_id<>'00000000-0000-0000-0000-00000000c741' then
    raise exception 'INVENTORY-FULFILLMENT Branch location is wrong';
  end if;

  select * into i from public.configure_inventory_item_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000e711','00000000-0000-0000-0000-00000000c731',
    '00000000-0000-0000-0000-00000000c771','00000000-0000-0000-0000-00000000c781',
    'EA',2,'ACTIVE',null,'inventory-item-ci-1'
  );
  if i.low_stock_threshold<>2 or i.variant_id is null then raise exception 'INVENTORY-FULFILLMENT item is wrong'; end if;

  select * into b from public.adjust_inventory_stock_v1(
    i.organization_id,'00000000-0000-0000-0000-00000000c711',i.id,l.id,5,
    'Initial controlled receipt','{"proof":"ci-adjustment"}'::jsonb,'inventory-adjust-ci-1'
  );
  if b.on_hand_quantity<>5 or b.reserved_quantity<>0 then raise exception 'INVENTORY-FULFILLMENT adjustment failed'; end if;

  select * into b from public.adjust_inventory_stock_v1(
    i.organization_id,'00000000-0000-0000-0000-00000000c711',i.id,l.id,5,
    'Initial controlled receipt','{"proof":"ci-adjustment"}'::jsonb,'inventory-adjust-ci-1'
  );
  if b.on_hand_quantity<>5 then raise exception 'INVENTORY-FULFILLMENT adjustment replay duplicated stock'; end if;
end;
$configure_inventory$;

do $direct_guard$
begin
  begin
    update public.inventory_stock_balances set on_hand_quantity=999
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and item_id='00000000-0000-0000-0000-00000000e711';
    raise exception 'Direct inventory balance mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'INVENTORY-FULFILLMENT state requires governed command%' then raise; end if;
  end;
end;
$direct_guard$;

do $reserve_and_fulfill$
declare
  oid uuid:='00000000-0000-0000-0000-00000000e721';
  rid uuid:='00000000-0000-0000-0000-00000000e731';
  line_id uuid; o public.orders%rowtype; b public.inventory_stock_balances%rowtype; s text;
begin
  perform public.create_direct_order_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    oid,'00000000-0000-0000-0000-00000000c731','00000000-0000-0000-0000-00000000c741',
    null,'00000000-0000-0000-0000-00000000d801',null,null,
    '00000000-0000-0000-0000-00000000c711','OM','OMR',null,
    'Inventory fulfillment CI order','{"confirmed":true}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT','variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',3,'discountBps',0,'taxBps',0
    )),
    'inventory-order-create-ci-1'
  );
  select id into line_id from public.order_line_items where order_id=oid and line_no=1;

  if public.reserve_order_inventory_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    rid,oid,line_id,'00000000-0000-0000-0000-00000000e701',3,
    '{"proof":"ci-reservation"}'::jsonb,'inventory-reserve-ci-1'
  )<>rid then raise exception 'INVENTORY-FULFILLMENT reservation failed'; end if;

  if public.reserve_order_inventory_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    rid,oid,line_id,'00000000-0000-0000-0000-00000000e701',3,
    '{"proof":"ci-reservation"}'::jsonb,'inventory-reserve-ci-1'
  )<>rid then raise exception 'INVENTORY-FULFILLMENT reservation replay failed'; end if;

  select * into b from public.inventory_stock_balances
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and item_id='00000000-0000-0000-0000-00000000e711'
    and location_id='00000000-0000-0000-0000-00000000e701';
  if b.on_hand_quantity<>5 or b.reserved_quantity<>3 then raise exception 'INVENTORY-FULFILLMENT reserved balance is wrong'; end if;
  if not exists(select 1 from public.inventory_low_stock_v where item_id=b.item_id and location_id=b.location_id) then
    raise exception 'INVENTORY-FULFILLMENT low-stock evidence is missing';
  end if;

  begin
    perform public.reserve_order_inventory_v1(
      '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000e732',oid,line_id,
      '00000000-0000-0000-0000-00000000e701',1,
      '{"proof":"over-reserve"}'::jsonb,'inventory-over-reserve-ci-1'
    );
    raise exception 'INVENTORY-FULFILLMENT over-reservation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'INVENTORY-FULFILLMENT reservation exceeds unfulfilled Order quantity%' then raise; end if;
  end;

  s:=public.fulfill_order_inventory_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    rid,2,'{"proof":"ci-pick-2"}'::jsonb,'inventory-fulfill-ci-1'
  );
  if s<>'PROCESSING' then raise exception 'INVENTORY-FULFILLMENT partial Order projection failed: %',s; end if;

  s:=public.fulfill_order_inventory_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    rid,2,'{"proof":"ci-pick-2"}'::jsonb,'inventory-fulfill-ci-1'
  );
  if s<>'PROCESSING' then raise exception 'INVENTORY-FULFILLMENT fulfillment replay failed'; end if;

  s:=public.fulfill_order_inventory_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    rid,1,'{"proof":"ci-pick-final"}'::jsonb,'inventory-fulfill-ci-2'
  );
  if s<>'COMPLETED' then raise exception 'INVENTORY-FULFILLMENT final Order projection failed: %',s; end if;

  select * into b from public.inventory_stock_balances
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and item_id='00000000-0000-0000-0000-00000000e711'
    and location_id='00000000-0000-0000-0000-00000000e701';
  select * into o from public.orders where id=oid;
  if b.on_hand_quantity<>2 or b.reserved_quantity<>0
     or o.fulfillment_status<>'FULFILLED'
     or (select fulfilled_quantity from public.order_line_fulfillment where order_line_item_id=line_id)<>3
  then raise exception 'INVENTORY-FULFILLMENT stock/Order atomic fulfillment result is wrong'; end if;

  if (select count(*) from public.inventory_movements where reservation_id=rid and movement_type='FULFILL')<>2 then
    raise exception 'INVENTORY-FULFILLMENT movement ledger did not preserve immutable fulfillment evidence';
  end if;
end;
$reserve_and_fulfill$;

do $cancel_release$
declare
  oid uuid:='00000000-0000-0000-0000-00000000e722';
  rid uuid:='00000000-0000-0000-0000-00000000e733';
  line_id uuid; o public.orders%rowtype; b public.inventory_stock_balances%rowtype;
begin
  perform public.adjust_inventory_stock_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000e711','00000000-0000-0000-0000-00000000e701',2,
    'Add stock for cancellation test','{"proof":"cancel-stock"}'::jsonb,'inventory-adjust-cancel-ci-1'
  );
  perform public.create_direct_order_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    oid,'00000000-0000-0000-0000-00000000c731','00000000-0000-0000-0000-00000000c741',
    null,'00000000-0000-0000-0000-00000000d801',null,null,
    '00000000-0000-0000-0000-00000000c711','OM','OMR',null,
    'Inventory cancellation release CI','{"confirmed":true}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT','variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',1,'discountBps',0,'taxBps',0
    )),
    'inventory-cancel-order-create-ci-1'
  );
  select id into line_id from public.order_line_items where order_id=oid and line_no=1;
  perform public.reserve_order_inventory_v1(
    '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
    rid,oid,line_id,'00000000-0000-0000-0000-00000000e701',1,
    '{"proof":"cancel-reserve"}'::jsonb,'inventory-cancel-reserve-ci-1'
  );
  select * into o from public.orders where id=oid;
  perform public.cancel_order_v1(
    o.organization_id,'00000000-0000-0000-0000-00000000c711',oid,o.version,
    'CI cancel reserved order','{"proof":"cancel"}'::jsonb,'inventory-cancel-order-ci-1'
  );
  if (select status from public.inventory_reservations where id=rid)<>'RELEASED' then
    raise exception 'INVENTORY-FULFILLMENT did not atomically release reservation on Order cancellation';
  end if;
  select * into b from public.inventory_stock_balances
  where organization_id=o.organization_id and item_id='00000000-0000-0000-0000-00000000e711'
    and location_id='00000000-0000-0000-0000-00000000e701';
  if b.reserved_quantity<>0 then raise exception 'INVENTORY-FULFILLMENT cancellation left reserved stock stranded'; end if;
end;
$cancel_release$;

do $inventory_acl$
begin
  if has_table_privilege('authenticated','public.inventory_stock_balances','UPDATE')
     or has_table_privilege('authenticated','public.inventory_movements','INSERT')
     or has_table_privilege('anon','public.inventory_items','SELECT')
     or not has_table_privilege('authenticated','public.inventory_items','SELECT')
  then raise exception 'INVENTORY-FULFILLMENT table ACL drifted'; end if;

  if has_function_privilege('authenticated',
      'public.adjust_inventory_stock_v1(uuid,uuid,uuid,uuid,numeric,text,jsonb,text)','EXECUTE')
     or not has_function_privilege('service_role',
      'public.adjust_inventory_stock_v1(uuid,uuid,uuid,uuid,numeric,text,jsonb,text)','EXECUTE')
  then raise exception 'INVENTORY-FULFILLMENT command ACL drifted'; end if;
end;
$inventory_acl$;

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c711',false);
set role authenticated;
do $inventory_owner_read$
begin
  if not exists(select 1 from public.inventory_items
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and id='00000000-0000-0000-0000-00000000e711')
  then raise exception 'Organization owner cannot read scoped Inventory'; end if;
end;
$inventory_owner_read$;

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c712',false);
set role authenticated;
do $inventory_cross_org_read$
begin
  if exists(select 1 from public.inventory_items
    where organization_id='00000000-0000-0000-0000-00000000c701')
  then raise exception 'INVENTORY-FULFILLMENT RLS leaked inventory to non-member'; end if;
end;
$inventory_cross_org_read$;
reset role;
select set_config('request.jwt.claim.sub','',false);
