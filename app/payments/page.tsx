import Link from 'next/link';

import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

function money(value:unknown,currency:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})+' '+String(currency??''):'—';
}

export default async function PaymentsPage(){
  const {supabase,organizationId}=await getCurrentOrganization();
  const {data:payments,error}=await supabase.from('payment_intents')
    .select('id,payment_number,invoice_id,status,provider,amount,captured_total,refunded_total,net_paid_total,currency,created_at,updated_at')
    .eq('organization_id',organizationId)
    .order('updated_at',{ascending:false})
    .limit(100);

  if(error){
    return <div>
      <div className="headerRow"><div><h1>Payments</h1><p className="muted">Canonical payment intents, settlement and refund evidence.</p></div></div>
      <section className="panel"><h2>Schema readiness</h2><p className="muted">Payment Core schema is not available in this runtime yet. Financial mutations remain fail-closed.</p></section>
    </div>;
  }

  const rows=payments??[];
  const unresolved=rows.filter(p=>['CREATED','AUTHORIZED','RECONCILIATION_REQUIRED'].includes(String(p.status)));
  const paid=rows.filter(p=>Number(p.net_paid_total)>0);
  return <div>
    <div className="headerRow">
      <div><h1>Payments</h1><p className="muted">Canonical payment intents, immutable provider transaction evidence and governed net settlement.</p></div>
      <span className="status">{rows.length} intents</span>
    </div>
    <section className="statsGrid fourStats">
      <article><span>Unresolved</span><strong>{unresolved.length}</strong></article>
      <article><span>Paid evidence</span><strong>{paid.length}</strong></article>
      <article><span>Failed / expired</span><strong>{rows.filter(p=>['FAILED','EXPIRED'].includes(String(p.status))).length}</strong></article>
      <article><span>Refunded</span><strong>{rows.filter(p=>['PARTIALLY_REFUNDED','REFUNDED'].includes(String(p.status))).length}</strong></article>
    </section>
    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">Payment Core owns intent, link, immutable transaction and refund truth. Invoice owns commercial truth. A provider request, HTTP success or payment link alone never marks money collected.</p>
    </section>
    <section className="panel"><h2>Recent Payment Intents</h2><div className="settingsList">
      {rows.map(payment=><div className="settingsRow" key={payment.id}><div>
        <strong>{payment.payment_number}</strong>
        <span className="muted smallText">{payment.status} · {payment.provider??'provider not bound'} · {money(payment.amount,payment.currency)}</span>
        <span className="muted smallText">captured {money(payment.captured_total,payment.currency)} · refunded {money(payment.refunded_total,payment.currency)} · net {money(payment.net_paid_total,payment.currency)}</span>
      </div><Link className="textLink" href={'/payments/'+payment.id}>Open →</Link></div>)}
      {!rows.length?<p className="muted">No Payment Intents yet. Create one from an issued Invoice.</p>:null}
    </div></section>
  </div>;
}
