import Link from 'next/link';

import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

function money(value:unknown,currency:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})+' '+String(currency??''):'—';
}

export default async function InvoicesPage(){
  const {supabase,organizationId}=await getCurrentOrganization();
  const {data:invoices,error}=await supabase.from('invoices')
    .select('id,invoice_number,order_id,status,settlement_status,total,paid_total,credited_total,balance_due,currency,due_date,issued_at,updated_at')
    .eq('organization_id',organizationId)
    .order('updated_at',{ascending:false})
    .limit(100);

  if(error){
    return <div><div className="headerRow"><div><h1>Invoices</h1><p className="muted">Canonical commercial Invoice and Credit Note evidence.</p></div></div>
      <section className="panel"><h2>Schema readiness</h2><p className="muted">Invoice schema is not available in this runtime yet. Mutations remain fail-closed.</p></section>
    </div>;
  }

  const rows=invoices??[];
  const open=rows.filter(i=>Number(i.balance_due)>0&&i.status!=='VOID');
  const overdue=rows.filter(i=>i.status==='OVERDUE');

  return <div>
    <div className="headerRow">
      <div><h1>Invoices</h1><p className="muted">Immutable Invoice documents, due-state evidence, balances and Credit Notes. Payment/refund transactions remain owned by Payment Core.</p></div>
      <span className="status">{rows.length} invoices</span>
    </div>
    <section className="statsGrid fourStats">
      <article><span>Open balance docs</span><strong>{open.length}</strong></article>
      <article><span>Overdue</span><strong>{overdue.length}</strong></article>
      <article><span>Settled by evidence</span><strong>{rows.filter(i=>i.settlement_status==='SETTLED').length}</strong></article>
      <article><span>Voided</span><strong>{rows.filter(i=>i.status==='VOID').length}</strong></article>
    </section>
    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">Invoices snapshot canonical Order commercial evidence. They do not re-price Catalog items and do not execute collections or refunds. Credit Notes change commercial balance only.</p>
    </section>
    <section className="panel"><h2>Recent Invoices</h2><div className="settingsList">
      {rows.map(invoice=><div className="settingsRow" key={invoice.id}>
        <div>
          <strong>{invoice.invoice_number}</strong>
          <span className="muted smallText">{invoice.status} · {invoice.settlement_status} · due {new Date(String(invoice.due_date)+'T00:00:00').toLocaleDateString()}</span>
          <span className="muted smallText">{money(invoice.total,invoice.currency)} · balance {money(invoice.balance_due,invoice.currency)} · credited {money(invoice.credited_total,invoice.currency)}</span>
        </div>
        <div><Link className="textLink" href={'/invoices/'+invoice.id}>Open Invoice →</Link></div>
      </div>)}
      {!rows.length?<p className="muted">No Invoices yet. Create one from a canonical Order.</p>:null}
    </div></section>
  </div>;
}
