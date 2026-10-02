-- 0176: INVENTORY-FULFILLMENT integrity hardening
-- Prevents STOCKED Order fulfillment from bypassing canonical Inventory and
-- adds covering indexes for composite Inventory foreign keys.

create index if not exists inventory_items_variant_product_fk_idx
  on public.inventory_items(organization_id,variant_id,product_id)
  where variant_id is not null;

create index if not exists inventory_reservations_line_order_fk_idx
  on public.inventory_reservations(organization_id,order_line_item_id,order_id);

create index if not exists inventory_movements_line_order_fk_idx
  on public.inventory_movements(organization_id,order_line_item_id,order_id)
  where order_line_item_id is not null;

-- FULFILL movement is written immediately before INVENTORY-FULFILLMENT calls
-- ORDER-ENGINE. Mint a one-use, transaction-local proof bound to the exact
-- Order line and quantity. No second fulfillment authority is introduced.
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

  if new.movement_type='FULFILL' then
    if new.order_line_item_id is null
       or new.on_hand_delta>=0
       or new.reserved_delta>=0
       or abs(new.on_hand_delta)<>abs(new.reserved_delta)
    then
      raise exception 'INVENTORY-FULFILLMENT fulfillment movement proof is invalid';
    end if;
    perform set_config('app.inventory_fulfillment_line',new.order_line_item_id::text,true);
    perform set_config('app.inventory_fulfillment_qty',abs(new.on_hand_delta)::text,true);
  end if;

  return new;
end;
$$;

create or replace function public.guard_stocked_order_fulfillment()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_stocked boolean:=false;
  v_delta numeric;
  v_proof_line text;
  v_proof_qty text;
begin
  v_delta:=new.fulfilled_quantity-old.fulfilled_quantity;
  if v_delta<=0 then return new; end if;

  select case
    when ol.subject_kind='PRODUCT' then p.inventory_mode='STOCKED'
    when ol.subject_kind='VARIANT' then
      (case when v.inventory_mode='INHERIT' then p.inventory_mode else v.inventory_mode end)='STOCKED'
    else false
  end
  into v_stocked
  from public.order_line_items ol
  join public.catalog_products p
    on p.organization_id=ol.organization_id and p.id=ol.product_id
  left join public.catalog_product_variants v
    on v.organization_id=ol.organization_id and v.id=ol.variant_id
  where ol.organization_id=new.organization_id
    and ol.id=new.order_line_item_id;

  if coalesce(v_stocked,false) then
    v_proof_line:=nullif(current_setting('app.inventory_fulfillment_line',true),'');
    v_proof_qty:=nullif(current_setting('app.inventory_fulfillment_qty',true),'');
    if v_proof_line is distinct from new.order_line_item_id::text
       or v_proof_qty is null
       or v_proof_qty::numeric<>v_delta
    then
      raise exception 'INVENTORY-FULFILLMENT STOCKED Order lines require Inventory fulfillment';
    end if;

    -- One movement proof authorizes exactly one matching fulfillment update.
    perform set_config('app.inventory_fulfillment_line','',true);
    perform set_config('app.inventory_fulfillment_qty','',true);
  end if;

  return new;
end;
$$;

drop trigger if exists order_fulfillment_stock_guard on public.order_line_fulfillment;
create trigger order_fulfillment_stock_guard
before update of fulfilled_quantity on public.order_line_fulfillment
for each row execute function public.guard_stocked_order_fulfillment();

revoke all on function public.guard_stocked_order_fulfillment()
  from public,anon,authenticated,service_role;
