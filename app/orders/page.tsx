import Link from 'next/link';

import {DirectOrderComposer} from './direct-order-composer';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

function money(value:unknown,currency:unknown){const n=Number(value);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:4})+' '+String(currency??''):'—';}

export default async function OrdersPage(){
 const {supabase,organizationId,role}=await getCurrentOrganization();
 const canDirect=['OWNER','ADMIN','SALES_MANAGER'].includes(String(role));
 const [
  {data:orders},{data:sellers},{data:branches},{data:buyers},{data:people},{data:deals},{data:bookings},
  {data:services},{data:servicePrices},{data:products},{data:variants},{data:productPrices}
 ]=await Promise.all([
  supabase.from('orders').select('id,order_number,source_kind,status,fulfillment_status,total,currency,quote_id,updated_at').eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(100),
  supabase.from('tenant_businesses').select('id,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
  supabase.from('branches').select('id,tenant_business_id,name,code').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
  supabase.from('businesses').select('id,name,country_code').eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(200),
  supabase.from('crm_people').select('id,display_name').eq('organization_id',organizationId).eq('status','ACTIVE').order('last_seen_at',{ascending:false}).limit(200),
  supabase.from('crm_deals').select('id,title,business_id').eq('organization_id',organizationId).eq('state','OPEN').order('updated_at',{ascending:false}).limit(200),
  supabase.from('bookings').select('id,booking_reference,person_id,status').eq('organization_id',organizationId).neq('status','CANCELED').order('updated_at',{ascending:false}).limit(200),
  supabase.from('services').select('id,name').eq('organization_id',organizationId).eq('enabled',true).order('name'),
  supabase.from('service_prices').select('service_id,country_code,currency,price').eq('organization_id',organizationId),
  supabase.from('catalog_products').select('id,tenant_business_id,sku,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
  supabase.from('catalog_product_variants').select('id,product_id,sku,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
  supabase.from('catalog_product_prices').select('product_id,variant_id,country_code,currency,price').eq('organization_id',organizationId),
 ]);
 const fmt=(p:{country_code?:unknown;price?:unknown;currency?:unknown})=>String(p.country_code)+' '+money(p.price,p.currency);
 const servicePricesBy=new Map<string,string[]>();for(const p of servicePrices??[]){const k=String(p.service_id);servicePricesBy.set(k,[...(servicePricesBy.get(k)??[]),fmt(p)]);}
 const productPricesBy=new Map<string,string[]>();const variantPricesBy=new Map<string,string[]>();for(const p of productPrices??[]){const m=p.variant_id?variantPricesBy:productPricesBy;const k=String(p.variant_id??p.product_id);m.set(k,[...(m.get(k)??[]),fmt(p)]);}
 const productById=new Map((products??[]).map(x=>[String(x.id),x]));
 const catalog=[
  ...(services??[]).map(x=>({ref:'SERVICE:'+x.id,label:'Service · '+x.name,tenantBusinessId:null,prices:servicePricesBy.get(String(x.id))??[]})),
  ...(products??[]).map(x=>({ref:'PRODUCT:'+x.id,label:'Product · '+x.name+' · '+x.sku,tenantBusinessId:String(x.tenant_business_id),prices:productPricesBy.get(String(x.id))??[]})),
  ...(variants??[]).filter(x=>productById.has(String(x.product_id))).map(x=>({ref:'VARIANT:'+x.id,label:'Variant · '+String(productById.get(String(x.product_id))?.name??'Product')+' / '+x.name+' · '+x.sku,tenantBusinessId:String(productById.get(String(x.product_id))?.tenant_business_id??''),prices:variantPricesBy.get(String(x.id))??[]})),
 ].filter(x=>x.prices.length>0);

 return <div>
  <div className="headerRow"><div><h1>Orders</h1><p className="muted">Canonical commercial Orders, fulfillment evidence, cancellation and returns. Invoice, Payment and inventory stock remain separate authorities.</p></div><span className="status">{orders?.length??0} orders</span></div>
  <section className="panel"><h2>Authority boundary</h2><p className="muted">Accepted Quotes can become one canonical Order. Direct Orders use canonical Catalog prices and cannot bypass Quote discount governance. Fulfillment here records customer-facing quantities only, not warehouse stock or reservation movements.</p></section>
  <section className="panel settingsCreate"><h2>Create direct Order</h2>
   {!canDirect?<p className="muted">Direct Orders require Owner, Admin or Sales Manager permission.</p>
   :!(sellers?.length)?<p className="muted">No active tenant Business exists. Order creation stays unavailable instead of inventing seller scope.</p>
   :!(buyers?.length||people?.length)?<p className="muted">A canonical buyer Person or Business is required before creating an Order.</p>
   :!catalog.length?<p className="muted">No canonical priced Catalog items are available.</p>
   :<DirectOrderComposer
      orderId={crypto.randomUUID()}
      tenantBusinesses={(sellers??[]).map(x=>({id:String(x.id),label:String(x.name)}))}
      branches={(branches??[]).map(x=>({id:String(x.id),label:String(x.name)+' · '+String(x.code),tenantBusinessId:String(x.tenant_business_id)}))}
      buyers={(buyers??[]).map(x=>({id:String(x.id),label:String(x.name)+' · '+String(x.country_code)}))}
      people={(people??[]).map(x=>({id:String(x.id),label:String(x.display_name??'Unnamed Person')}))}
      deals={(deals??[]).map(x=>({id:String(x.id),label:String(x.title),buyerBusinessId:x.business_id?String(x.business_id):null}))}
      bookings={(bookings??[]).map(x=>({id:String(x.id),label:String(x.booking_reference)+' · '+String(x.status),personId:String(x.person_id)}))}
      catalog={catalog} defaultCountry="OM" defaultCurrency="OMR"/>}
  </section>
  <section className="panel"><h2>Recent Orders</h2><div className="settingsList">
   {(orders??[]).map(o=><div className="settingsRow" key={o.id}><div><strong>{o.order_number}</strong><span className="muted smallText">{o.source_kind} · {o.status} · fulfillment {o.fulfillment_status}</span><span className="muted smallText">{money(o.total,o.currency)}{o.quote_id?' · from Quote':''}</span></div><Link className="textLink" href={'/orders/'+o.id}>Open Order →</Link></div>)}
   {!(orders?.length)?<p className="muted">No Orders yet.</p>:null}
  </div></section>
 </div>;
}
