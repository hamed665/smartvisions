import Link from 'next/link';
import {notFound} from 'next/navigation';

import {
 cancelOrderV1,decideOrderReturnV1,receiveOrderReturnV1,startOrderProcessingV1,
} from '../actions';
import {OrderFulfillmentForm,OrderReturnForm} from '../order-operations';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};
function money(v:unknown,c:unknown){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:4})+' '+String(c??''):'—';}

export default async function OrderDetailPage({params}:Props){
 const {id}=await params;
 const {supabase,organizationId,role,userId}=await getCurrentOrganization();
 const {data:order}=await supabase.from('orders').select('*').eq('organization_id',organizationId).eq('id',id).maybeSingle();
 if(!order)notFound();

 const [{data:lines},{data:fulfillment},{data:returns},{data:returnLines},{data:events}]=await Promise.all([
  supabase.from('order_line_items').select('*').eq('organization_id',organizationId).eq('order_id',id).order('line_no'),
  supabase.from('order_line_fulfillment').select('*').eq('organization_id',organizationId).eq('order_id',id),
  supabase.from('order_returns').select('*').eq('organization_id',organizationId).eq('order_id',id).order('requested_at',{ascending:false}),
  supabase.from('order_return_lines').select('*').eq('organization_id',organizationId).eq('order_id',id),
  supabase.from('order_lifecycle_events').select('id,transition,from_status,to_status,actor_type,occurred_at,evidence').eq('organization_id',organizationId).eq('order_id',id).order('occurred_at',{ascending:false}).limit(100),
 ]);
 const productIds=[...new Set((lines??[]).filter(x=>x.product_id).map(x=>String(x.product_id)))];
 const variantIds=[...new Set((lines??[]).filter(x=>x.variant_id).map(x=>String(x.variant_id)))];
 const productModes=productIds.length
  ?((await supabase.from('catalog_products').select('id,inventory_mode').eq('organization_id',organizationId).in('id',productIds)).data??[])
  :[];
 const variantModes=variantIds.length
  ?((await supabase.from('catalog_product_variants').select('id,product_id,inventory_mode').eq('organization_id',organizationId).in('id',variantIds)).data??[])
  :[];
 const productModeById=new Map(productModes.map(x=>[String(x.id),String(x.inventory_mode)]));
 const variantModeById=new Map(variantModes.map(x=>[String(x.id),String(x.inventory_mode)]));
 const stockedLineIds=new Set((lines??[]).filter(line=>{
  if(line.subject_kind==='PRODUCT')return productModeById.get(String(line.product_id))==='STOCKED';
  if(line.subject_kind==='VARIANT'){
   const mode=variantModeById.get(String(line.variant_id));
   const effective=mode==='INHERIT'?productModeById.get(String(line.product_id)):mode;
   return effective==='STOCKED';
  }
  return false;
 }).map(line=>String(line.id)));
 const roleText=String(role);
 const canManage=['OWNER','ADMIN','SALES_MANAGER'].includes(roleText)||(roleText==='SALES_AGENT'&&String(order.owner_user_id)===String(userId));
 const canManager=['OWNER','ADMIN','SALES_MANAGER'].includes(roleText);
 const fByLine=new Map((fulfillment??[]).map(x=>[String(x.order_line_item_id),x]));
 const opsLines=(lines??[]).map(x=>{const f=fByLine.get(String(x.id));return{
   id:String(x.id),name:String(x.name_snapshot),ordered:Number(x.quantity),
   fulfilled:Number(f?.fulfilled_quantity??0),returned:Number(f?.returned_quantity??0),
   stocked:stockedLineIds.has(String(x.id)),
 };});
 const directFulfillmentLines=opsLines.filter(x=>!x.stocked);
 const stockedFulfillmentLines=opsLines.filter(x=>x.stocked);
 const anyFulfilled=opsLines.some(x=>x.fulfilled>0);
 const anyDirectRemaining=directFulfillmentLines.some(x=>x.fulfilled<x.ordered);
 const anyStockedRemaining=stockedFulfillmentLines.some(x=>x.fulfilled<x.ordered);
 const anyReturnable=opsLines.some(x=>x.fulfilled>x.returned);
 const returnLinesBy=new Map<string,Array<Record<string,unknown>>>();
 for(const x of returnLines??[]){const k=String(x.return_id);returnLinesBy.set(k,[...(returnLinesBy.get(k)??[]),x as Record<string,unknown>]);}

 return <div>
  <div className="headerRow"><div><h1>{order.order_number}</h1><p className="muted">Canonical Order · {order.source_kind} · {order.status} · fulfillment {order.fulfillment_status} · row v{order.version}</p></div><Link className="textLink" href="/orders">← Orders</Link></div>

  <section className="statsGrid fourStats">
   <article><span>Total</span><strong>{money(order.total,order.currency)}</strong></article>
   <article><span>Subtotal</span><strong>{money(order.subtotal,order.currency)}</strong></article>
   <article><span>Tax</span><strong>{money(order.tax_total,order.currency)}</strong></article>
   <article><span>Source</span><strong>{order.source_kind}</strong></article>
  </section>

  <section className="panel"><h2>Commercial source</h2>
   <p className="muted">{order.source_kind==='QUOTE'?'Accepted Quote snapshot is the immutable commercial source.':'Direct Order resolved canonical Catalog prices at creation.'}</p>
   {order.quote_id?<p><Link className="textLink" href={'/quotes/'+order.quote_id}>Open source Quote →</Link></p>:null}
   {order.booking_id?<p className="muted">Linked Booking: {String(order.booking_id)}</p>:null}
   <p className="muted smallText">Inventory stock is owned by INVENTORY-FULFILLMENT. Invoice and Payment/refund remain in later Commerce packages.</p>
  </section>

  <section className="panel"><h2>Lines and fulfillment</h2><div className="settingsList">
   {(lines??[]).map(line=>{const f=fByLine.get(String(line.id));return <div className="settingsRow" key={line.id}><div>
    <strong>{line.name_snapshot}</strong>
    <span className="muted smallText">{line.subject_kind} · qty {line.quantity} · unit {money(line.unit_price,order.currency)} · line total {money(line.line_total,order.currency)}{stockedLineIds.has(String(line.id))?' · STOCKED':''}</span>
    <span className="muted smallText">fulfilled {String(f?.fulfilled_quantity??0)} / {String(f?.ordered_quantity??line.quantity)} · returned {String(f?.returned_quantity??0)} · {String(f?.status??'PENDING')}</span>
   </div></div>;})}
  </div></section>

  {canManage&&order.status==='CONFIRMED'?<section className="panel"><h2>Start processing</h2><form action={startOrderProcessingV1}>
   <input type="hidden" name="order_id" value={id}/><input type="hidden" name="expected_version" value={order.version}/>
   <input type="hidden" name="request_key" value={'order-processing:'+id+':v'+order.version}/>
   <button>Start processing</button>
  </form></section>:null}

  {['CONFIRMED','PROCESSING'].includes(String(order.status))&&anyStockedRemaining?<section className="panel"><h2>STOCKED fulfillment</h2>
   <p className="muted">These lines are Inventory-managed. Reserve and fulfill them through Inventory so physical stock and canonical Order fulfillment commit atomically.</p>
   <p><Link className="textLink" href="/inventory">Open Inventory →</Link></p>
  </section>:null}

  {canManage&&['CONFIRMED','PROCESSING'].includes(String(order.status))&&anyDirectRemaining?<section className="panel"><h2>Record non-stock fulfillment</h2>
   <p className="muted">Only Service or non-STOCKED Catalog lines can use direct ORDER-ENGINE fulfillment.</p>
   <OrderFulfillmentForm orderId={id} version={Number(order.version)} lines={directFulfillmentLines}/>
  </section>:null}

  {canManage&&['CONFIRMED','PROCESSING'].includes(String(order.status))&&!anyFulfilled?<section className="panel"><h2>Cancel Order</h2><form action={cancelOrderV1} className="settingsGrid">
   <input type="hidden" name="order_id" value={id}/><input type="hidden" name="expected_version" value={order.version}/>
   <input type="hidden" name="request_key" value={'order-cancel:'+id+':v'+order.version}/>
   <label>Reason<input name="reason" minLength={3} maxLength={1000} required/></label>
   <label>Evidence<input name="evidence_note" minLength={3} maxLength={1000} required/></label>
   <button>Cancel Order</button>
  </form></section>:null}

  {canManage&&['PROCESSING','COMPLETED','PARTIALLY_RETURNED'].includes(String(order.status))&&anyReturnable?<section className="panel"><h2>Request return</h2>
   <p className="muted">Return receipt is commercial evidence only. Refund and credit-note execution belong to later Payment/Invoice packages.</p>
   <OrderReturnForm orderId={id} version={Number(order.version)} lines={opsLines}/>
  </section>:null}

  <section className="panel"><h2>Returns</h2><div className="settingsList">
   {(returns??[]).map(r=><div className="settingsRow" key={r.id}><div>
    <strong>{r.return_number}</strong><span className="muted smallText">{r.status} · {r.reason}</span>
    <span className="muted smallText">{(returnLinesBy.get(String(r.id))??[]).map(x=>String(x.quantity)).join(' + ')} returned quantity requested</span>
   </div><div>
    {canManager&&r.status==='REQUESTED'?<div className="settingsGrid">
     <form action={decideOrderReturnV1}><input type="hidden" name="order_id" value={id}/><input type="hidden" name="return_id" value={r.id}/><input type="hidden" name="decision" value="APPROVE"/><input type="hidden" name="request_key" value={'order-return-approve:'+r.id+':v'+r.version}/><input name="evidence_note" minLength={3} required placeholder="Approval evidence"/><input name="note" maxLength={2000} placeholder="Note"/><button>Approve</button></form>
     <form action={decideOrderReturnV1}><input type="hidden" name="order_id" value={id}/><input type="hidden" name="return_id" value={r.id}/><input type="hidden" name="decision" value="REJECT"/><input type="hidden" name="request_key" value={'order-return-reject:'+r.id+':v'+r.version}/><input name="evidence_note" minLength={3} required placeholder="Rejection evidence"/><input name="note" maxLength={2000} required placeholder="Reason"/><button>Reject</button></form>
    </div>:null}
    {canManage&&r.status==='APPROVED'?<form action={receiveOrderReturnV1}><input type="hidden" name="order_id" value={id}/><input type="hidden" name="return_id" value={r.id}/><input type="hidden" name="request_key" value={'order-return-received:'+r.id+':v'+r.version}/><input name="evidence_note" minLength={3} required placeholder="Receipt / inspection evidence"/><button>Record received</button></form>:null}
   </div></div>)}
   {!(returns?.length)?<p className="muted">No return evidence.</p>:null}
  </div></section>

  <section className="panel"><h2>Evidence timeline</h2><div className="settingsList">
   {(events??[]).map(e=><div className="settingsRow" key={e.id}><div><strong>{e.transition}</strong><span className="muted smallText">{String(e.from_status??'∅')} → {e.to_status} · {e.actor_type} · {new Date(String(e.occurred_at)).toLocaleString()}</span></div></div>)}
  </div></section>
 </div>;
}
