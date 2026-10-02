import Link from 'next/link';
import {notFound} from 'next/navigation';

import {cancelPaymentIntentV1,requestPaymentRefundV1} from '../actions';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};

function money(value:unknown,currency:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})+' '+String(currency??''):'—';
}

export default async function PaymentDetailPage({params}:Props){
  const {id}=await params;
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const {data:payment}=await supabase.from('payment_intents').select('*')
    .eq('organization_id',organizationId).eq('id',id).maybeSingle();
  if(!payment)notFound();

  const [{data:links},{data:transactions},{data:refunds},{data:providerEvents},{data:invoice}]=await Promise.all([
    supabase.from('payment_links').select('*').eq('organization_id',organizationId).eq('payment_intent_id',id).order('created_at',{ascending:false}),
    supabase.from('payment_transactions').select('*').eq('organization_id',organizationId).eq('payment_intent_id',id).order('occurred_at',{ascending:false}),
    supabase.from('payment_refunds').select('*').eq('organization_id',organizationId).eq('payment_intent_id',id).order('created_at',{ascending:false}),
    supabase.from('payment_provider_events').select('id,provider,provider_event_id,event_kind,authenticity,provider_reference,amount,currency,received_at,refund_id')
      .eq('organization_id',organizationId).eq('payment_intent_id',id).order('received_at',{ascending:false}),
    supabase.from('invoices').select('id,invoice_number,status,paid_total,credited_total,balance_due,total,currency')
      .eq('organization_id',organizationId).eq('id',payment.invoice_id).maybeSingle(),
  ]);

  const isManager=['OWNER','ADMIN','SALES_MANAGER'].includes(String(role));
  const openRefunds=(refunds??[]).filter(r=>['REQUESTED','RECONCILIATION_REQUIRED'].includes(String(r.status)))
    .reduce((sum,r)=>sum+Number(r.amount??0),0);
  const refundable=Math.max(0,Number(payment.captured_total)-Number(payment.refunded_total)-openRefunds);
  const canCancel=['CREATED','AUTHORIZED','RECONCILIATION_REQUIRED'].includes(String(payment.status))&&Number(payment.captured_total)===0;

  return <div>
    <div className="headerRow">
      <div><h1>{payment.payment_number}</h1><p className="muted">Canonical Payment Intent · {payment.status} · v{payment.version}</p></div>
      <div><Link className="textLink" href="/payments">← Payments</Link>{invoice?<> · <Link className="textLink" href={'/invoices/'+invoice.id}>Invoice {invoice.invoice_number} →</Link></>:null}</div>
    </div>

    <section className="statsGrid fourStats">
      <article><span>Intent</span><strong>{money(payment.amount,payment.currency)}</strong></article>
      <article><span>Captured</span><strong>{money(payment.captured_total,payment.currency)}</strong></article>
      <article><span>Refunded</span><strong>{money(payment.refunded_total,payment.currency)}</strong></article>
      <article><span>Net paid</span><strong>{money(payment.net_paid_total,payment.currency)}</strong></article>
    </section>

    <section className="panel"><h2>Settlement boundary</h2>
      <p className="muted">Provider: {payment.provider??'not bound'}. Provider acceptance and links are not settlement. Only verified webhook or explicit reconciliation evidence can append immutable money transactions and project Invoice paid_total.</p>
      {invoice?<p className="muted smallText">Invoice: total {money(invoice.total,invoice.currency)} · paid projection {money(invoice.paid_total,invoice.currency)} · credited {money(invoice.credited_total,invoice.currency)} · balance {money(invoice.balance_due,invoice.currency)}</p>:null}
      {payment.reconciliation_reason?<p><strong>Reconciliation required:</strong> {payment.reconciliation_reason}</p>:null}
    </section>

    <section className="panel"><h2>Payment links</h2><div className="settingsList">
      {(links??[]).map(link=><div className="settingsRow" key={link.id}><div>
        <strong>{link.provider} · {link.status}</strong>
        <span className="muted smallText">{link.provider_link_id} · expires {link.expires_at?new Date(String(link.expires_at)).toLocaleString():'not supplied'}</span>
      </div><a className="textLink" href={link.url} target="_blank" rel="noreferrer">Open link →</a></div>)}
      {!(links?.length)?<p className="muted">No provider Payment Link recorded. Provider creation belongs to a configured gateway adapter.</p>:null}
    </div></section>

    <section className="panel"><h2>Immutable transaction ledger</h2><div className="settingsList">
      {(transactions??[]).map(tx=><div className="settingsRow" key={tx.id}><div>
        <strong>{tx.transaction_type}</strong>
        <span className="muted smallText">{money(tx.amount,tx.currency)} · {tx.provider} · {new Date(String(tx.occurred_at)).toLocaleString()}</span>
      </div><span className="muted smallText">{tx.provider_reference??'no provider reference'}</span></div>)}
      {!(transactions?.length)?<p className="muted">No verified money transaction evidence yet.</p>:null}
    </div></section>

    <section className="panel"><h2>Provider evidence</h2><div className="settingsList">
      {(providerEvents??[]).map(event=><div className="settingsRow" key={event.id}><div>
        <strong>{event.event_kind} · {event.authenticity}</strong>
        <span className="muted smallText">{event.provider} / {event.provider_event_id} · {new Date(String(event.received_at)).toLocaleString()}</span>
      </div></div>)}
      {!(providerEvents?.length)?<p className="muted">No verified provider callback or explicit reconciliation evidence.</p>:null}
    </div></section>

    <section className="panel"><h2>Refunds</h2><div className="settingsList">
      {(refunds??[]).map(refund=><div className="settingsRow" key={refund.id}><div>
        <strong>{refund.refund_number} · {refund.status}</strong>
        <span className="muted smallText">{money(refund.amount,refund.currency)} · {refund.reason}</span>
      </div><span className="muted smallText">{refund.provider_reference??'provider outcome pending'}</span></div>)}
      {!(refunds?.length)?<p className="muted">No Refund requests. Refund is money movement and does not create or replace a Credit Note.</p>:null}
    </div></section>

    {isManager&&refundable>0?<section className="panel"><h2>Request Refund</h2>
      <p className="muted">This creates a governed Refund request only. Money is not considered refunded until verified provider/reconciliation evidence arrives.</p>
      <form action={requestPaymentRefundV1} className="settingsGrid">
        <input type="hidden" name="payment_intent_id" value={id}/>
        <input type="hidden" name="invoice_id" value={payment.invoice_id}/>
        <input type="hidden" name="request_key" value={'payment-refund:'+id+':v'+payment.version+':'+refundable}/>
        <label>Amount<input name="amount" type="number" min="0.0001" step="0.0001" max={refundable} defaultValue={refundable} required/></label>
        <label>Reason<input name="reason" minLength={3} maxLength={2000} required/></label>
        <label>Evidence<input name="evidence_note" minLength={3} maxLength={1000} required/></label>
        <button>Request Refund</button>
      </form>
    </section>:null}

    {canCancel?<section className="panel"><h2>Cancel unresolved Intent</h2>
      <form action={cancelPaymentIntentV1} className="settingsGrid">
        <input type="hidden" name="payment_intent_id" value={id}/>
        <input type="hidden" name="invoice_id" value={payment.invoice_id}/>
        <input type="hidden" name="request_key" value={'payment-cancel:'+id+':v'+payment.version}/>
        <label>Reason<input name="reason" minLength={3} maxLength={1000} required/></label>
        <button>Cancel Intent</button>
      </form>
    </section>:null}
  </div>;
}
