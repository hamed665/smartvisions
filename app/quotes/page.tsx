import Link from 'next/link';

import { QuoteComposer } from './quote-composer';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

function datePlus(days:number) {
  const d=new Date(Date.now()+days*86400000);
  return d.toISOString().slice(0,10);
}
function money(value:unknown,currency:unknown) {
  const n=Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined,{maximumFractionDigits:4})+' '+String(currency??'') : '—';
}

export default async function QuotesPage() {
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const canManage=['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(String(role));

  const [
    {data:quotes},{data:versions},{data:sellers},{data:branches},
    {data:buyers},{data:people},{data:deals},
    {data:services},{data:servicePrices},{data:products},{data:variants},{data:productPrices}
  ]=await Promise.all([
    supabase.from('quotes').select('id,quote_number,status,current_version,version,owner_user_id,buyer_business_id,person_id,updated_at').eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(100),
    supabase.from('quote_versions').select('quote_id,version_no,total,currency,valid_until').eq('organization_id',organizationId).order('version_no',{ascending:false}),
    supabase.from('tenant_businesses').select('id,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('branches').select('id,tenant_business_id,name,code').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('businesses').select('id,name,country_code').eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(200),
    supabase.from('crm_people').select('id,display_name').eq('organization_id',organizationId).eq('status','ACTIVE').order('last_seen_at',{ascending:false}).limit(200),
    supabase.from('crm_deals').select('id,title,business_id').eq('organization_id',organizationId).eq('state','OPEN').order('updated_at',{ascending:false}).limit(200),
    supabase.from('services').select('id,name').eq('organization_id',organizationId).eq('enabled',true).order('name'),
    supabase.from('service_prices').select('service_id,country_code,currency,price').eq('organization_id',organizationId),
    supabase.from('catalog_products').select('id,tenant_business_id,sku,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_product_variants').select('id,product_id,sku,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_product_prices').select('product_id,variant_id,country_code,currency,price').eq('organization_id',organizationId),
  ]);

  const latestVersion=new Map<string,Record<string,unknown>>();
  for(const row of versions??[]) {
    const key=String(row.quote_id);
    if(!latestVersion.has(key)) latestVersion.set(key,row as Record<string,unknown>);
  }

  const servicePriceMap=new Map<string,string[]>();
  for(const p of servicePrices??[]) {
    const key=String(p.service_id);
    const list=servicePriceMap.get(key)??[];
    list.push(String(p.country_code)+' '+money(p.price,p.currency));
    servicePriceMap.set(key,list);
  }
  const productPriceMap=new Map<string,string[]>();
  const variantPriceMap=new Map<string,string[]>();
  for(const p of productPrices??[]) {
    const map=p.variant_id?variantPriceMap:productPriceMap;
    const key=String(p.variant_id??p.product_id);
    const list=map.get(key)??[];
    list.push(String(p.country_code)+' '+money(p.price,p.currency));
    map.set(key,list);
  }
  const productById=new Map((products??[]).map(p=>[String(p.id),p]));
  const catalog=[
    ...(services??[]).map(s=>({
      ref:'SERVICE:'+s.id,label:'Service · '+s.name,tenantBusinessId:null,
      prices:servicePriceMap.get(String(s.id))??[]
    })),
    ...(products??[]).map(p=>({
      ref:'PRODUCT:'+p.id,label:'Product · '+p.name+' · '+p.sku,tenantBusinessId:String(p.tenant_business_id),
      prices:productPriceMap.get(String(p.id))??[]
    })),
    ...(variants??[]).map(v=>({
      ref:'VARIANT:'+v.id,
      label:'Variant · '+String(productById.get(String(v.product_id))?.name??'Product')+' / '+v.name+' · '+v.sku,
      tenantBusinessId:String(productById.get(String(v.product_id))?.tenant_business_id??''),
      prices:variantPriceMap.get(String(v.id))??[]
    })),
  ].filter(item=>item.prices.length>0);

  return <div>
    <div className="headerRow">
      <div>
        <h1>Quotes</h1>
        <p className="muted">Canonical commercial Quotes with immutable price snapshots, governed review, customer decisions and conversion evidence.</p>
      </div>
      <div><span className="status">{quotes?.length??0} quotes</span></div>
    </div>

    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">Service prices come from <code>service_prices</code>. Product and Variant prices come from <code>catalog_product_prices</code>. Quote versions snapshot those prices and never become a second Catalog. Order, Invoice and Payment truth are intentionally not created here.</p>
    </section>

    <section className="panel settingsCreate">
      <h2>Create Quote</h2>
      {!canManage ? <p className="muted">Your role can read Quotes but cannot mutate them.</p>
      : !(sellers?.length) ? <p className="muted">No active tenant Business exists. Quote creation is intentionally unavailable rather than inventing seller scope.</p>
      : !catalog.length ? <p className="muted">No canonical priced Catalog items are available.</p>
      : <QuoteComposer
          mode="create"
          quoteId={crypto.randomUUID()}
          tenantBusinesses={(sellers??[]).map(x=>({id:String(x.id),label:String(x.name)}))}
          branches={(branches??[]).map(x=>({id:String(x.id),label:String(x.name)+' · '+String(x.code),tenantBusinessId:String(x.tenant_business_id)}))}
          buyers={(buyers??[]).map(x=>({id:String(x.id),label:String(x.name)+' · '+String(x.country_code)}))}
          people={(people??[]).map(x=>({id:String(x.id),label:String(x.display_name??'Unnamed Person')}))}
          deals={(deals??[]).map(x=>({id:String(x.id),label:String(x.title),buyerBusinessId:x.business_id?String(x.business_id):null}))}
          catalog={catalog}
          defaultCountry="OM"
          defaultCurrency="OMR"
          defaultValidUntil={datePlus(14)}
        />}
    </section>

    <section className="panel">
      <h2>Recent Quotes</h2>
      <div className="settingsList">
        {(quotes??[]).map(q=>{
          const v=latestVersion.get(String(q.id));
          return <div className="settingsRow" key={q.id}>
            <div>
              <strong>{q.quote_number}</strong>
              <span className="muted smallText">{q.status} · v{q.current_version}</span>
              <span className="muted smallText">{v?money(v.total,v.currency):'No commercial version'} · valid {v?.valid_until?new Date(String(v.valid_until)).toLocaleDateString():'—'}</span>
            </div>
            <Link className="textLink" href={'/quotes/'+q.id}>Open Quote →</Link>
          </div>;
        })}
        {!(quotes?.length) ? <p className="muted">No Quotes yet.</p> : null}
      </div>
    </section>
  </div>;
}
