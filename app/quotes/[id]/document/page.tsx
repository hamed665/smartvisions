import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PrintQuoteButton } from './print-button';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type Props={params:Promise<{id:string}>};

function text(v:unknown){return v==null||v===''?'—':String(v);}
function money(v:unknown,currency:unknown){
  const n=Number(v); return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})+' '+String(currency??''):'—';
}

export default async function QuoteDocumentPage({params}:Props){
  const {id}=await params;
  const {supabase,organizationId}=await getCurrentOrganization();
  const {data:q}=await supabase.from('quotes')
    .select('id,quote_number,status,current_version')
    .eq('organization_id',organizationId).eq('id',id).maybeSingle();
  if(!q) notFound();

  const {data:v}=await supabase.from('quote_versions').select('*')
    .eq('organization_id',organizationId).eq('quote_id',id).eq('version_no',q.current_version).maybeSingle();
  if(!v) notFound();
  const {data:lines}=await supabase.from('quote_line_items').select('*')
    .eq('organization_id',organizationId).eq('quote_version_id',v.id).order('line_no');

  const seller=v.seller_snapshot as Record<string,unknown>;
  const buyer=v.buyer_snapshot as Record<string,unknown>;

  return <main className="quoteDocument" style={{maxWidth:960,margin:'0 auto',padding:'32px'}}>
    <style>{`@media print {
      .sidebar,.mobileAppBar,.mobileBottomNav,.mobileNavOverlay,.quotePrintControls{display:none!important}
      .shell{display:block!important}
      .content{padding:0!important;max-width:none!important}
      .quoteDocument{max-width:none!important;margin:0!important;padding:0!important}
      .quoteDocument .panel{box-shadow:none!important;break-inside:avoid}
    }`}</style>
    <div className="headerRow">
      <div>
        <h1>Quote {q.quote_number}</h1>
        <p className="muted">Version {v.version_no} · {q.status}</p>
      </div>
      <div className="quotePrintControls">
        <PrintQuoteButton />{' '}
        <Link className="textLink" href={'/quotes/'+id}>Back to Quote</Link>
      </div>
    </div>

    <section className="panel">
      <div className="settingsGrid">
        <div><strong>From</strong><p>{text(seller.name)}</p><p className="muted smallText">{text(seller.legalName)} · {text(seller.countryCode)}</p></div>
        <div><strong>To</strong><p>{text(buyer.personName??buyer.businessName)}</p><p className="muted smallText">{buyer.personName&&buyer.businessName?text(buyer.businessName):''}</p></div>
        <div><strong>Valid until</strong><p>{new Date(String(v.valid_until)).toLocaleDateString()}</p></div>
        <div><strong>Currency</strong><p>{v.currency}</p></div>
      </div>
    </section>

    <section className="panel">
      <h2>Items</h2>
      <div className="settingsList">
        {(lines??[]).map(line=><div className="settingsRow" key={line.id}>
          <div>
            <strong>{line.line_no}. {line.name_snapshot}</strong>
            {line.description?<span className="muted smallText">{line.description}</span>:null}
            <span className="muted smallText">Qty {line.quantity} × {money(line.unit_price,v.currency)} · Discount {(Number(line.discount_bps)/100).toFixed(2)}% · Tax {(Number(line.tax_bps)/100).toFixed(2)}%</span>
          </div>
          <strong>{money(line.line_total,v.currency)}</strong>
        </div>)}
      </div>
    </section>

    <section className="panel">
      <div className="settingsList">
        <div className="settingsRow"><span>Subtotal</span><strong>{money(v.subtotal,v.currency)}</strong></div>
        <div className="settingsRow"><span>Discount</span><strong>{money(v.discount_total,v.currency)}</strong></div>
        <div className="settingsRow"><span>Tax</span><strong>{money(v.tax_total,v.currency)}</strong></div>
        <div className="settingsRow"><span>Total</span><strong>{money(v.total,v.currency)}</strong></div>
      </div>
    </section>

    {v.terms?<section className="panel"><h2>Terms</h2><p style={{whiteSpace:'pre-wrap'}}>{v.terms}</p></section>:null}
    <p className="muted smallText">This document is rendered from immutable QUOTE-ENGINE version evidence. Printing or Save as PDF does not create a second document authority.</p>
  </main>;
}
