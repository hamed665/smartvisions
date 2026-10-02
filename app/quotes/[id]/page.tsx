import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  decideQuoteReviewV1,
  markQuoteSentV1,
  recordManualQuoteDecisionV1,
  submitQuoteReviewV1,
} from '../actions';
import { createOrderFromQuoteV1 } from '../../orders/actions';
import { QuoteComposer } from '../quote-composer';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type Props={params:Promise<{id:string}>};

function money(value:unknown,currency:unknown) {
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:4})+' '+String(currency??''):'—';
}
function pct(bps:unknown) {
  const n=Number(bps);
  return Number.isFinite(n)?(n/100).toLocaleString(undefined,{maximumFractionDigits:2})+'%':'—';
}

export default async function QuoteDetailPage({params}:Props) {
  const {id}=await params;
  const {supabase,organizationId,role,userId}=await getCurrentOrganization();

  const {data:quote}=await supabase.from('quotes')
    .select('id,quote_number,status,current_version,version,tenant_business_id,branch_id,person_id,buyer_business_id,deal_id,owner_user_id,sent_at,viewed_at,accepted_at,rejected_at,expired_at,converted_at,conversion_kind,conversion_reference,updated_at')
    .eq('organization_id',organizationId).eq('id',id).maybeSingle();
  if(!quote) notFound();

  const [
    {data:versions},{data:lines},{data:reviews},{data:events},
    {data:seller},{data:branches},{data:services},{data:servicePrices},
    {data:products},{data:variants},{data:productPrices}
  ]=await Promise.all([
    supabase.from('quote_versions').select('*').eq('organization_id',organizationId).eq('quote_id',id).order('version_no',{ascending:false}),
    supabase.from('quote_line_items').select('*').eq('organization_id',organizationId).eq('quote_id',id).order('version_no',{ascending:false}).order('line_no'),
    supabase.from('quote_version_reviews').select('*').eq('organization_id',organizationId).eq('quote_id',id).order('version_no',{ascending:false}),
    supabase.from('quote_lifecycle_events').select('id,transition,from_status,to_status,actor_type,occurred_at,evidence').eq('organization_id',organizationId).eq('quote_id',id).order('occurred_at',{ascending:false}).limit(100),
    supabase.from('tenant_businesses').select('id,name').eq('organization_id',organizationId).eq('id',quote.tenant_business_id).maybeSingle(),
    supabase.from('branches').select('id,tenant_business_id,name,code').eq('organization_id',organizationId).eq('tenant_business_id',quote.tenant_business_id).eq('status','ACTIVE').order('name'),
    supabase.from('services').select('id,name').eq('organization_id',organizationId).eq('enabled',true).order('name'),
    supabase.from('service_prices').select('service_id,country_code,currency,price').eq('organization_id',organizationId),
    supabase.from('catalog_products').select('id,tenant_business_id,sku,name').eq('organization_id',organizationId).eq('tenant_business_id',quote.tenant_business_id).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_product_variants').select('id,product_id,sku,name').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_product_prices').select('product_id,variant_id,country_code,currency,price').eq('organization_id',organizationId),
  ]);

  const current=(versions??[]).find(v=>Number(v.version_no)===Number(quote.current_version));
  const currentReview=(reviews??[]).find(r=>Number(r.version_no)===Number(quote.current_version));
  const currentLines=(lines??[]).filter(l=>Number(l.version_no)===Number(quote.current_version));
  const roleText=String(role);
  const canManage=['OWNER','ADMIN','SALES_MANAGER'].includes(roleText)
    || (roleText==='SALES_AGENT' && String(quote.owner_user_id)===String(userId));
  const canReview=Boolean(currentReview?.reviewer_roles?.includes?.(roleText));

  const servicePriceMap=new Map<string,string[]>();
  for(const p of servicePrices??[]) {
    const list=servicePriceMap.get(String(p.service_id))??[];
    list.push(String(p.country_code)+' '+money(p.price,p.currency));
    servicePriceMap.set(String(p.service_id),list);
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
    ...(services??[]).map(s=>({ref:'SERVICE:'+s.id,label:'Service · '+s.name,tenantBusinessId:null,prices:servicePriceMap.get(String(s.id))??[]})),
    ...(products??[]).map(p=>({ref:'PRODUCT:'+p.id,label:'Product · '+p.name+' · '+p.sku,tenantBusinessId:String(p.tenant_business_id),prices:productPriceMap.get(String(p.id))??[]})),
    ...(variants??[])
      .filter(v=>productById.has(String(v.product_id)))
      .map(v=>({
        ref:'VARIANT:'+v.id,
        label:'Variant · '+String(productById.get(String(v.product_id))?.name??'Product')+' / '+v.name+' · '+v.sku,
        tenantBusinessId:String(quote.tenant_business_id),
        prices:variantPriceMap.get(String(v.id))??[]
      })),
  ].filter(x=>x.prices.length>0);

  const initialLines=currentLines.map(line=>({
    ref:line.subject_kind==='SERVICE'?'SERVICE:'+line.service_id:line.subject_kind==='PRODUCT'?'PRODUCT:'+line.product_id:'VARIANT:'+line.variant_id,
    quantity:String(line.quantity),
    discountPct:String(Number(line.discount_bps)/100),
    taxPct:String(Number(line.tax_bps)/100),
    description:String(line.description??''),
  }));

  return <div>
    <div className="headerRow">
      <div>
        <h1>{quote.quote_number}</h1>
        <p className="muted">Canonical Quote · {quote.status} · commercial v{quote.current_version} · row v{quote.version}</p>
      </div>
      <div>
        <Link className="textLink" href="/quotes">← Quotes</Link>{' · '}
        <Link className="textLink" href={'/quotes/'+id+'/document'}>Document / PDF →</Link>
      </div>
    </div>

    {current ? <section className="statsGrid fourStats">
      <article><span>Total</span><strong>{money(current.total,current.currency)}</strong></article>
      <article><span>Subtotal</span><strong>{money(current.subtotal,current.currency)}</strong></article>
      <article><span>Tax</span><strong>{money(current.tax_total,current.currency)}</strong></article>
      <article><span>Valid until</span><strong>{new Date(String(current.valid_until)).toLocaleDateString()}</strong></article>
    </section> : null}

    <section className="panel">
      <h2>Governed lifecycle</h2>
      <p className="muted">Mark Sent records Quote lifecycle evidence only. It does not secretly send WhatsApp/email behind your back, a surprisingly useful property in business software.</p>
      {canManage && quote.status==='DRAFT' ? <form action={submitQuoteReviewV1}>
        <input type="hidden" name="quote_id" value={id}/>
        <input type="hidden" name="expected_quote_version" value={quote.version}/>
        <input type="hidden" name="request_key" value={'quote-review-submit:'+id+':v'+quote.version}/>
        <button>Submit for review</button>
      </form> : null}

      {canReview && quote.status==='REVIEW' && currentReview?.status==='PENDING' ? <div className="settingsGrid">
        <form action={decideQuoteReviewV1}>
          <input type="hidden" name="quote_id" value={id}/>
          <input type="hidden" name="decision" value="APPROVE"/>
          <input type="hidden" name="request_key" value={'quote-review-approve:'+id+':v'+quote.current_version}/>
          <label>Review note<input name="note" maxLength={2000}/></label>
          <button>Approve</button>
        </form>
        <form action={decideQuoteReviewV1}>
          <input type="hidden" name="quote_id" value={id}/>
          <input type="hidden" name="decision" value="REJECT"/>
          <input type="hidden" name="request_key" value={'quote-review-reject:'+id+':v'+quote.current_version}/>
          <label>Reason<input name="note" maxLength={2000} required/></label>
          <button>Reject to Draft</button>
        </form>
      </div> : null}

      {canManage && quote.status==='REVIEW' && ['APPROVED','NOT_REQUIRED'].includes(String(currentReview?.status)) ? <form action={markQuoteSentV1}>
        <input type="hidden" name="quote_id" value={id}/>
        <input type="hidden" name="expected_quote_version" value={quote.version}/>
        <input type="hidden" name="request_key" value={'quote-sent:'+id+':v'+quote.version}/>
        <button>Mark sent</button>
      </form> : null}

      {canManage && ['SENT','VIEWED'].includes(String(quote.status)) ? <div className="settingsGrid">
        <form action={recordManualQuoteDecisionV1}>
          <input type="hidden" name="quote_id" value={id}/>
          <input type="hidden" name="decision" value="ACCEPT"/>
          <input type="hidden" name="request_key" value={'quote-manual-accept:'+id+':v'+quote.version}/>
          <label>Acceptance evidence<input name="evidence_note" minLength={3} maxLength={1000} required placeholder="Signed / email / customer confirmation reference"/></label>
          <button>Record accepted</button>
        </form>
        <form action={recordManualQuoteDecisionV1}>
          <input type="hidden" name="quote_id" value={id}/>
          <input type="hidden" name="decision" value="REJECT"/>
          <input type="hidden" name="request_key" value={'quote-manual-reject:'+id+':v'+quote.version}/>
          <label>Rejection evidence<input name="evidence_note" minLength={3} maxLength={1000} required/></label>
          <button>Record rejected</button>
        </form>
      </div> : null}
      <p className="muted smallText">Review: {currentReview?.status??'—'} · policies {(currentReview?.approval_action_keys??[]).join(', ')||'none'} · flags {(currentReview?.review_flags??[]).join(', ')||'none'}</p>
    </section>

    {canManage && quote.status==='ACCEPTED' ? <section className="panel">
      <h2>Create canonical Order</h2>
      <p className="muted">Creates exactly one Order from this accepted Quote and records the Quote conversion atomically. It does not create an Invoice, Payment or stock movement.</p>
      <form action={createOrderFromQuoteV1}>
        <input type="hidden" name="order_id" value={crypto.randomUUID()}/>
        <input type="hidden" name="quote_id" value={id}/>
        <input type="hidden" name="request_key" value={'order-from-quote:'+id+':v'+quote.version}/>
        <button>Create Order from accepted Quote</button>
      </form>
    </section> : null}

    <section className="panel">
      <h2>Current line items</h2>
      <div className="settingsList">
        {currentLines.map(line=><div className="settingsRow" key={line.id}>
          <div>
            <strong>{line.name_snapshot}</strong>
            <span className="muted smallText">{line.subject_kind} · qty {line.quantity} · canonical unit {money(line.unit_price,current?.currency)}</span>
            <span className="muted smallText">discount {pct(line.discount_bps)} · tax {pct(line.tax_bps)} · total {money(line.line_total,current?.currency)}</span>
          </div>
        </div>)}
      </div>
    </section>

    {canManage && ['DRAFT','REVIEW','SENT','VIEWED'].includes(String(quote.status)) && current && seller && catalog.length ? <section className="panel settingsCreate">
      <h2>Create revised version</h2>
      <p className="muted">A revision creates a new immutable commercial snapshot and returns the Quote to Draft. Accepted/rejected/expired/downstream Quotes cannot be revised.</p>
      <QuoteComposer
        mode="revise"
        quoteId={id}
        expectedQuoteVersion={Number(quote.version)}
        tenantBusinesses={[{id:String(seller.id),label:String(seller.name)}]}
        branches={(branches??[]).map(x=>({id:String(x.id),label:String(x.name)+' · '+String(x.code),tenantBusinessId:String(x.tenant_business_id)}))}
        buyers={[]}
        people={[]}
        deals={[]}
        catalog={catalog}
        defaultCountry={String(current.country_code)}
        defaultCurrency={String(current.currency)}
        defaultValidUntil={String(current.valid_until).slice(0,10)}
        defaultTerms={String(current.terms??'')}
        defaultNotes={String(current.notes??'')}
        initialLines={initialLines}
      />
    </section> : null}

    <section className="panel">
      <h2>Versions</h2>
      <div className="settingsList">
        {(versions??[]).map(v=><div className="settingsRow" key={v.id}>
          <div><strong>Version {v.version_no}</strong><span className="muted smallText">{money(v.total,v.currency)} · valid {new Date(String(v.valid_until)).toLocaleDateString()}</span></div>
        </div>)}
      </div>
    </section>

    <section className="panel">
      <h2>Evidence timeline</h2>
      <div className="settingsList">
        {(events??[]).map(e=><div className="settingsRow" key={e.id}>
          <div><strong>{e.transition}</strong><span className="muted smallText">{String(e.from_status??'∅')} → {e.to_status} · {e.actor_type} · {new Date(String(e.occurred_at)).toLocaleString()}</span></div>
        </div>)}
      </div>
    </section>

    {quote.status==='CONVERTED' ? <section className="panel">
      <h2>Conversion evidence</h2>
      <p className="muted">{quote.conversion_kind} · {quote.conversion_reference}. QUOTE-ENGINE records evidence only; canonical Order truth belongs to ORDER-ENGINE.</p>
    </section> : null}
  </div>;
}
