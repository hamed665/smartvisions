import {
  adjustInventoryStockV1,
  configureInventoryItemV1,
  configureInventoryLocationV1,
  fulfillOrderInventoryV1,
  releaseInventoryReservationV1,
  reserveOrderInventoryV1,
} from './actions';

import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

const MANAGER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER']);
function qty(value:unknown){const n=Number(value);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:4}):'0';}
function asNumber(value:unknown){const n=Number(value);return Number.isFinite(n)?n:0;}

export default async function InventoryPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const canManage=MANAGER_ROLES.has(String(role));

  const [
    {data:businesses},{data:branches},{data:products},{data:variants},
    {data:locations},{data:items},{data:balances},{data:reservations},
    {data:movements},{data:lowStock},{data:orders}
  ]=await Promise.all([
    supabase.from('tenant_businesses').select('id,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('branches').select('id,tenant_business_id,name,code').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_products').select('id,tenant_business_id,sku,name,status,inventory_mode').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_product_variants').select('id,product_id,sku,name,status,inventory_mode').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('inventory_locations').select('id,tenant_business_id,location_kind,branch_id,code,name,status,metadata,version').eq('organization_id',organizationId).order('name'),
    supabase.from('inventory_items').select('id,tenant_business_id,product_id,variant_id,unit_code,low_stock_threshold,status,version').eq('organization_id',organizationId).order('updated_at',{ascending:false}),
    supabase.from('inventory_stock_balances').select('item_id,location_id,on_hand_quantity,reserved_quantity,version,updated_at').eq('organization_id',organizationId),
    supabase.from('inventory_reservations').select('id,order_id,order_line_item_id,item_id,location_id,reserved_quantity,consumed_quantity,released_quantity,status,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(100),
    supabase.from('inventory_movements').select('id,item_id,location_id,movement_type,on_hand_delta,reserved_delta,on_hand_after,reserved_after,low_stock_after,order_id,request_key,occurred_at').eq('organization_id',organizationId).order('occurred_at',{ascending:false}).limit(100),
    supabase.from('inventory_low_stock_v').select('item_id,location_id,product_sku,product_name,variant_sku,variant_name,location_code,location_name,on_hand_quantity,reserved_quantity,available_quantity,low_stock_threshold,updated_at').eq('organization_id',organizationId).order('updated_at',{ascending:false}),
    supabase.from('orders').select('id,order_number,tenant_business_id,branch_id,status').eq('organization_id',organizationId).in('status',['CONFIRMED','PROCESSING','PARTIALLY_RETURNED']).order('updated_at',{ascending:false}).limit(100),
  ]);

  const orderIds=(orders??[]).map(o=>String(o.id));
  const {data:orderLines}=orderIds.length
    ?await supabase.from('order_line_items').select('id,order_id,subject_kind,product_id,variant_id,description,quantity').eq('organization_id',organizationId).in('order_id',orderIds).in('subject_kind',['PRODUCT','VARIANT']).order('line_no')
    :{data:[] as Array<{id:string;order_id:string;subject_kind:string;product_id:string|null;variant_id:string|null;description:string;quantity:number}>};
  const lineIds=(orderLines??[]).map(line=>String(line.id));
  const {data:fulfillment}=lineIds.length
    ?await supabase.from('order_line_fulfillment').select('order_line_item_id,fulfilled_quantity,returned_quantity').eq('organization_id',organizationId).in('order_line_item_id',lineIds)
    :{data:[] as Array<{order_line_item_id:string;fulfilled_quantity:number;returned_quantity:number}>};

  const businessById=new Map((businesses??[]).map(x=>[String(x.id),String(x.name)]));
  const branchById=new Map((branches??[]).map(x=>[String(x.id),String(x.name)+' · '+String(x.code)]));
  const productById=new Map((products??[]).map(x=>[String(x.id),x]));
  const variantById=new Map((variants??[]).map(x=>[String(x.id),x]));
  const locationById=new Map((locations??[]).map(x=>[String(x.id),x]));
  const itemById=new Map((items??[]).map(x=>[String(x.id),x]));
  const orderById=new Map((orders??[]).map(x=>[String(x.id),x]));
  const fulfilledByLine=new Map((fulfillment??[]).map(x=>[String(x.order_line_item_id),asNumber(x.fulfilled_quantity)]));
  const activeReservedByLine=new Map<string,number>();
  for(const r of reservations??[]){
    if(!['ACTIVE','PARTIAL'].includes(String(r.status)))continue;
    const k=String(r.order_line_item_id);
    const outstanding=asNumber(r.reserved_quantity)-asNumber(r.consumed_quantity)-asNumber(r.released_quantity);
    activeReservedByLine.set(k,(activeReservedByLine.get(k)??0)+Math.max(0,outstanding));
  }

  const variantsByProduct=new Map<string,typeof variants>();
  for(const v of variants??[]){
    const k=String(v.product_id);
    variantsByProduct.set(k,[...(variantsByProduct.get(k)??[]),v]);
  }

  const stockSubjects:Array<{value:string;label:string}>=[];
  for(const p of products??[]){
    const activeVariants=variantsByProduct.get(String(p.id))??[];
    if(!activeVariants.length&&String(p.inventory_mode)==='STOCKED'){
      stockSubjects.push({value:String(p.id)+'||'+String(p.tenant_business_id),label:'Product · '+String(p.name)+' · '+String(p.sku)});
    }
    for(const v of activeVariants){
      const effective=String(v.inventory_mode)==='INHERIT'?String(p.inventory_mode):String(v.inventory_mode);
      if(effective==='STOCKED'){
        stockSubjects.push({value:String(p.id)+'|'+String(v.id)+'|'+String(p.tenant_business_id),label:'Variant · '+String(p.name)+' / '+String(v.name)+' · '+String(v.sku)});
      }
    }
  }

  const configuredSubjectKeys=new Set((items??[]).map(i=>String(i.product_id)+'|'+String(i.variant_id??'')));
  const unconfiguredSubjects=stockSubjects.filter(subject=>{
    const [productId,variantId]=subject.value.split('|');
    return !configuredSubjectKeys.has(productId+'|'+variantId);
  });
  const subjectLabel=(item:{product_id:unknown;variant_id:unknown})=>{
    const p=productById.get(String(item.product_id));
    const v=item.variant_id?variantById.get(String(item.variant_id)):null;
    return v?String(p?.name??'Product')+' / '+String(v.name):String(p?.name??'Product');
  };

  const reservableLines=(orderLines??[]).flatMap(line=>{
    const order=orderById.get(String(line.order_id));
    const item=(items??[]).find(i=>String(i.product_id)===String(line.product_id)&&String(i.variant_id??'')===String(line.variant_id??'')&&String(i.status)==='ACTIVE');
    const remaining=asNumber(line.quantity)-(fulfilledByLine.get(String(line.id))??0)-(activeReservedByLine.get(String(line.id))??0);
    if(!order||!item||remaining<=0)return [];
    return [{value:String(line.order_id)+'|'+String(line.id),label:String(order.order_number)+' · '+String(line.description)+' · remaining '+qty(remaining),remaining}];
  });

  const activeLocations=(locations??[]).filter(x=>String(x.status)==='ACTIVE');
  const activeItems=(items??[]).filter(x=>String(x.status)==='ACTIVE');
  const activeReservations=(reservations??[]).filter(r=>['ACTIVE','PARTIAL'].includes(String(r.status)));

  return <div>
    <div className="headerRow">
      <div><h1>Inventory</h1><p className="muted">Canonical stock, reservations, warehouse/branch locations, immutable movements and Order fulfillment.</p></div>
      <span className="status">{activeItems.length} tracked items</span>
    </div>

    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">Catalog owns Product/Variant identity and pricing. Branches stay canonical. Inventory owns only stock locations, balances, reservations and movement evidence. Fulfillment consumes reserved stock and updates the existing canonical Order in one transaction.</p>
    </section>

    <section className="panel settingsCreate">
      <h2>Stock locations</h2>
      {!canManage?<p className="muted">Owner, Admin or Sales Manager permission is required for inventory mutations.</p>
      :!(businesses?.length)?<p className="muted">No active Business exists. Inventory configuration stays closed rather than inventing scope.</p>
      :<form action={configureInventoryLocationV1} className="settingsGrid">
        <input type="hidden" name="location_id" value={crypto.randomUUID()} />
        <input type="hidden" name="request_key" value={'inventory-location:'+crypto.randomUUID()} />
        <input type="hidden" name="metadata_json" value="{}" />
        <label>Business<select name="tenant_business_id" required>{(businesses??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Kind<select name="location_kind" defaultValue="BRANCH"><option value="BRANCH">Branch stock</option><option value="WAREHOUSE">Warehouse</option></select></label>
        <label>Branch<select name="branch_id" defaultValue=""><option value="">None (Warehouse)</option>{(branches??[]).map(b=><option key={b.id} value={b.id}>{b.name} · {b.code}</option>)}</select></label>
        <label>Code<input name="code" placeholder="MAIN-STOCK" required /></label>
        <label>Name<input name="name" placeholder="Main stock" required /></label>
        <input type="hidden" name="status" value="ACTIVE" />
        <button>Add location</button>
      </form>}
      <div className="settingsList">
        {(locations??[]).map(location=><form action={configureInventoryLocationV1} className="settingsRow" key={location.id}>
          <input type="hidden" name="location_id" value={location.id} />
          <input type="hidden" name="tenant_business_id" value={location.tenant_business_id} />
          <input type="hidden" name="location_kind" value={location.location_kind} />
          <input type="hidden" name="branch_id" value={location.branch_id??''} />
          <input type="hidden" name="metadata_json" value={JSON.stringify(location.metadata??{})} />
          <input type="hidden" name="expected_version" value={location.version} />
          <input type="hidden" name="request_key" value={'inventory-location:'+location.id+':'+crypto.randomUUID()} />
          <div><strong>{location.name}</strong><span className="muted smallText">{location.location_kind} · {businessById.get(String(location.tenant_business_id))??'Business'}{location.branch_id?' · '+(branchById.get(String(location.branch_id))??'Branch'):''} · v{location.version}</span></div>
          <label>Code<input name="code" defaultValue={location.code} required disabled={!canManage} /></label>
          <label>Name<input name="name" defaultValue={location.name} required disabled={!canManage} /></label>
          <label>Status<select name="status" defaultValue={location.status} disabled={!canManage}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
          <button disabled={!canManage}>Save</button>
        </form>)}
        {!(locations?.length)?<p className="muted">No Inventory locations yet.</p>:null}
      </div>
    </section>

    <section className="panel settingsCreate">
      <h2>Tracked Catalog items</h2>
      <p className="muted smallText">Only Catalog subjects explicitly marked STOCKED can become Inventory items. Product names, SKUs and prices remain Catalog-owned.</p>
      {canManage&&unconfiguredSubjects.length?<form action={configureInventoryItemV1} className="settingsGrid">
        <input type="hidden" name="item_id" value={crypto.randomUUID()} />
        <input type="hidden" name="request_key" value={'inventory-item:'+crypto.randomUUID()} />
        <label>Catalog item<select name="subject_ref" required>{unconfiguredSubjects.map(s=><option value={s.value} key={s.value}>{s.label}</option>)}</select></label>
        <label>Unit<input name="unit_code" defaultValue="EA" required /></label>
        <label>Low-stock threshold<input name="low_stock_threshold" type="number" min="0" step="0.0001" defaultValue="0" required /></label>
        <input type="hidden" name="status" value="ACTIVE" />
        <button>Track stock</button>
      </form>:null}
      {!stockSubjects.length?<p className="muted">No active Catalog Product/Variant is marked STOCKED. Enable stock management in Catalog first.</p>:null}
      <div className="settingsList">
        {(items??[]).map(item=>{
          const subjectRef=String(item.product_id)+'|'+String(item.variant_id??'')+'|'+String(item.tenant_business_id);
          return <form action={configureInventoryItemV1} className="settingsRow" key={item.id}>
            <input type="hidden" name="item_id" value={item.id} />
            <input type="hidden" name="subject_ref" value={subjectRef} />
            <input type="hidden" name="expected_version" value={item.version} />
            <input type="hidden" name="request_key" value={'inventory-item:'+item.id+':'+crypto.randomUUID()} />
            <div><strong>{subjectLabel(item)}</strong><span className="muted smallText">{businessById.get(String(item.tenant_business_id))??'Business'} · v{item.version}</span></div>
            <label>Unit<input name="unit_code" defaultValue={item.unit_code} required disabled={!canManage} /></label>
            <label>Low stock<input name="low_stock_threshold" type="number" min="0" step="0.0001" defaultValue={item.low_stock_threshold} required disabled={!canManage} /></label>
            <label>Status<select name="status" defaultValue={item.status} disabled={!canManage}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
            <button disabled={!canManage}>Save</button>
          </form>;
        })}
        {!(items?.length)?<p className="muted">No tracked Inventory items yet.</p>:null}
      </div>
    </section>

    <section className="panel settingsCreate">
      <h2>Stock adjustment</h2>
      {canManage&&activeItems.length&&activeLocations.length?<form action={adjustInventoryStockV1} className="settingsGrid">
        <input type="hidden" name="request_key" value={'inventory-adjust:'+crypto.randomUUID()} />
        <label>Item<select name="item_id">{activeItems.map(i=><option value={i.id} key={i.id}>{subjectLabel(i)}</option>)}</select></label>
        <label>Location<select name="location_id">{activeLocations.map(l=><option value={l.id} key={l.id}>{l.name} · {l.code}</option>)}</select></label>
        <label>Quantity delta<input name="on_hand_delta" type="number" step="0.0001" placeholder="10 or -2" required /></label>
        <label>Reason<input name="reason" minLength={3} required /></label>
        <label>Evidence note<input name="evidence_note" minLength={3} required /></label>
        <button>Post adjustment</button>
      </form>:<p className="muted">An active tracked item and active stock location are required before adjustments.</p>}
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Current balances</h2><p className="muted smallText">Available = on hand − reserved.</p></div><span className="status">{balances?.length??0} balances</span></div>
      <div className="settingsList">
        {(balances??[]).map(balance=>{
          const item=itemById.get(String(balance.item_id));
          const location=locationById.get(String(balance.location_id));
          return <div className="settingsRow" key={String(balance.item_id)+':'+String(balance.location_id)}>
            <div><strong>{item?subjectLabel(item):'Inventory item'}</strong><span className="muted smallText">{location?.name??'Location'} · {location?.code??''}</span></div>
            <span>On hand {qty(balance.on_hand_quantity)}</span><span>Reserved {qty(balance.reserved_quantity)}</span><span>Available {qty(asNumber(balance.on_hand_quantity)-asNumber(balance.reserved_quantity))}</span>
          </div>;
        })}
        {!(balances?.length)?<p className="muted">No stock balances yet.</p>:null}
      </div>
    </section>

    <section className="panel settingsCreate">
      <h2>Reserve stock for Orders</h2>
      {canManage&&reservableLines.length&&activeLocations.length?<form action={reserveOrderInventoryV1} className="settingsGrid">
        <input type="hidden" name="reservation_id" value={crypto.randomUUID()} />
        <input type="hidden" name="request_key" value={'inventory-reserve:'+crypto.randomUUID()} />
        <label>Order line<select name="order_line_ref">{reservableLines.map(line=><option value={line.value} key={line.value}>{line.label}</option>)}</select></label>
        <label>Location<select name="location_id">{activeLocations.map(l=><option value={l.id} key={l.id}>{l.name} · {l.code}</option>)}</select></label>
        <label>Quantity<input name="quantity" type="number" min="0.0001" step="0.0001" required /></label>
        <label>Evidence note<input name="evidence_note" minLength={3} required /></label>
        <button>Reserve</button>
      </form>:<p className="muted">No reservable Product/Variant Order line has both an active Inventory item and remaining quantity.</p>}
    </section>

    <section className="panel">
      <h2>Active reservations</h2>
      <div className="settingsList">
        {activeReservations.map(reservation=>{
          const outstanding=asNumber(reservation.reserved_quantity)-asNumber(reservation.consumed_quantity)-asNumber(reservation.released_quantity);
          const item=itemById.get(String(reservation.item_id));
          const location=locationById.get(String(reservation.location_id));
          const order=orderById.get(String(reservation.order_id));
          return <div className="settingsRow" key={reservation.id}>
            <div><strong>{order?.order_number??'Order'} · {item?subjectLabel(item):'Item'}</strong><span className="muted smallText">{location?.name??'Location'} · outstanding {qty(outstanding)} · {reservation.status}</span></div>
            {canManage&&outstanding>0?<form action={fulfillOrderInventoryV1}>
              <input type="hidden" name="reservation_id" value={reservation.id} /><input type="hidden" name="order_id" value={reservation.order_id} />
              <input type="hidden" name="request_key" value={'inventory-fulfill:'+reservation.id+':'+crypto.randomUUID()} />
              <input name="quantity" type="number" min="0.0001" max={outstanding} step="0.0001" defaultValue={outstanding} required />
              <input name="evidence_note" placeholder="Pick/dispatch evidence" minLength={3} required />
              <button>Fulfill</button>
            </form>:null}
            {canManage&&outstanding>0?<form action={releaseInventoryReservationV1}>
              <input type="hidden" name="reservation_id" value={reservation.id} /><input type="hidden" name="order_id" value={reservation.order_id} />
              <input type="hidden" name="request_key" value={'inventory-release:'+reservation.id+':'+crypto.randomUUID()} />
              <input name="quantity" type="number" min="0.0001" max={outstanding} step="0.0001" defaultValue={outstanding} required />
              <input name="reason" placeholder="Release reason" minLength={3} required />
              <input name="evidence_note" placeholder="Release evidence" minLength={3} required />
              <button>Release</button>
            </form>:null}
          </div>;
        })}
        {!activeReservations.length?<p className="muted">No active stock reservations.</p>:null}
      </div>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Low stock</h2><p className="muted smallText">Derived from canonical balances and configured thresholds.</p></div><span className="status">{lowStock?.length??0} low</span></div>
      <div className="settingsList">
        {(lowStock??[]).map(row=><div className="settingsRow" key={String(row.item_id)+':'+String(row.location_id)}>
          <div><strong>{row.variant_name?String(row.product_name)+' / '+String(row.variant_name):String(row.product_name)}</strong><span className="muted smallText">{row.location_name} · {row.location_code}</span></div>
          <span>Available {qty(row.available_quantity)}</span><span>Threshold {qty(row.low_stock_threshold)}</span>
        </div>)}
        {!(lowStock?.length)?<p className="muted">No low-stock balances.</p>:null}
      </div>
    </section>

    <section className="panel">
      <h2>Movement ledger</h2>
      <div className="settingsList">
        {(movements??[]).map(m=>{
          const item=itemById.get(String(m.item_id));
          const location=locationById.get(String(m.location_id));
          return <div className="settingsRow" key={m.id}>
            <div><strong>{m.movement_type} · {item?subjectLabel(item):'Item'}</strong><span className="muted smallText">{location?.name??'Location'} · {new Date(String(m.occurred_at)).toLocaleString()}</span></div>
            <span>On hand Δ {qty(m.on_hand_delta)} → {qty(m.on_hand_after)}</span><span>Reserved Δ {qty(m.reserved_delta)} → {qty(m.reserved_after)}</span>{m.low_stock_after?<span className="status">Low stock</span>:null}
          </div>;
        })}
        {!(movements?.length)?<p className="muted">No Inventory movements yet.</p>:null}
      </div>
    </section>
  </div>;
}
