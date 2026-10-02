import Link from 'next/link';
import {notFound} from 'next/navigation';

import {CreditNoteForm} from '../credit-note-form';
import {issueInvoiceV1,voidInvoiceV1} from '../actions';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};

function money(value:unknown,currency:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})+' '+String(currency??''):'—';
}

export default async function InvoiceDetailPage({params}:Props){
  const {id}=await params;
  const {supabase,organizationId,role,userId}=await getCurrentOrganization();
  const {data:invoice}=await supabase.from('invoices').select('*').eq('organization_id',organizationId).eq('id',id).maybeSingle();
  if(!invoice)notFound();

  const [{data:lines},{data:credits},{data:creditLines},{data:events},{data:order}]=await Promise.all([
    supabase.from('invoice_line_items').select('*').eq('organization_id',organizationId).eq('invoice_id',id).order('line_no'),
    supabase.from('invoice_credit_notes').select('*').eq('organization_id',organizationId).eq('invoice_id',id).order('issued_at',{ascending:false}),
    supabase.from('invoice_credit_note_line_items').select('*').eq('organization_id',organizationId).eq('invoice_id',id),
    supabase.from('invoice_lifecycle_events').select('id,event_type,from_status,to_status,actor_type,occurred_at,evidence,credit_note_id').eq('organization_id',organizationId).eq('invoice_id',id).order('occurred_at',{ascending:false}).limit(100),
    supabase.from('orders').select('id,order_number,status').eq('organization_id',organizationId).eq('id',invoice.order_id).maybeSingle(),
  ]);

  const roleText=String(role);
  const canManage=['OWNER','ADMIN','SALES_MANAGER'].includes(roleText)||(roleText==='SALES_AGENT'&&String(invoice.owner_user_id)===String(userId));
  const canManager=['OWNER','ADMIN','SALES_MANAGER'].includes(roleText);
  const creditedByLine=new Map<string,number>();
  for(const row of creditLines??[]){
    const key=String(row.invoice_line_item_id);
    creditedByLine.set(key,(creditedByLine.get(key)??0)+Number(row.credited_quantity??0));
  }
  const creditable=(lines??[]).map(line=>({
    id:String(line.id),
    name:String(line.name_snapshot),
    remaining:Math.max(0,Number(line.quantity)-Number(creditedByLine.get(String(line.id))??0)),
    unitLabel:money(line.unit_price,invoice.currency),
  })).filter(line=>line.remaining>0);

  return <div>
    <div className="headerRow">
      <div><h1>{invoice.invoice_number}</h1><p className="muted">Canonical Invoice · {invoice.status} · settlement {invoice.settlement_status} · row v{invoice.version}</p></div>
      <div><Link className="textLink" href="/invoices">← Invoices</Link>{invoice.document_snapshot?<> · <Link className="textLink" href={'/invoices/'+id+'/document'}>Document / PDF →</Link></>:null}</div>
    </div>

    <section className="statsGrid fourStats">
      <article><span>Total</span><strong>{money(invoice.total,invoice.currency)}</strong></article>
      <article><span>Tax</span><strong>{money(invoice.tax_total,invoice.currency)}</strong></article>
      <article><span>Credited</span><strong>{money(invoice.credited_total,invoice.currency)}</strong></article>
      <article><span>Balance</span><strong>{money(invoice.balance_due,invoice.currency)}</strong></article>
    </section>

    <section className="panel"><h2>Commercial source</h2>
      <p className="muted">This Invoice is frozen from Order evidence. Catalog changes cannot rewrite it.</p>
      {order?<p><Link className="textLink" href={'/orders/'+order.id}>Open Order {order.order_number} →</Link></p>:null}
      <p className="muted smallText">Due {new Date(String(invoice.due_date)+'T00:00:00').toLocaleDateString()} · {invoice.country_code} · {invoice.currency}. Payment/refund execution is not owned by INVOICE-ENGINE.</p>
    </section>

    {canManage&&invoice.status==='DRAFT'?<section className="panel"><h2>Issue Invoice</h2>
      <p className="muted">Issuing freezes the customer-facing Invoice document snapshot and creates INVOICE_ISSUED lifecycle evidence.</p>
      <form action={issueInvoiceV1}>
        <input type="hidden" name="invoice_id" value={id}/>
        <input type="hidden" name="order_id" value={invoice.order_id}/>
        <input type="hidden" name="expected_version" value={invoice.version}/>
        <input type="hidden" name="request_key" value={'invoice-issue:'+id+':v'+invoice.version}/>
        <button>Issue Invoice</button>
      </form>
    </section>:null}

    <section className="panel"><h2>Immutable lines</h2><div className="settingsList">
      {(lines??[]).map(line=><div className="settingsRow" key={line.id}><div>
        <strong>{line.line_no}. {line.name_snapshot}</strong>
        <span className="muted smallText">{line.subject_kind} · qty {line.quantity} × {money(line.unit_price,invoice.currency)} · tax {(Number(line.tax_bps)/100).toFixed(2)}%</span>
      </div><strong>{money(line.line_total,invoice.currency)}</strong></div>)}
    </div></section>

    {canManager&&['ISSUED','OVERDUE'].includes(String(invoice.status))&&Number(invoice.balance_due)>0&&creditable.length?<section className="panel">
      <h2>Issue Credit Note</h2>
      <p className="muted">Credit Notes are immutable commercial corrections. They reduce Invoice balance but never execute a money refund.</p>
      <CreditNoteForm
        invoiceId={id}
        orderId={String(invoice.order_id)}
        creditNoteId={crypto.randomUUID()}
        requestKey={'invoice-credit:'+id+':'+crypto.randomUUID()}
        lines={creditable}
      />
    </section>:null}

    <section className="panel"><h2>Credit Notes</h2><div className="settingsList">
      {(credits??[]).map(note=><div className="settingsRow" key={note.id}><div>
        <strong>{note.credit_note_number}</strong>
        <span className="muted smallText">{money(note.total,invoice.currency)} · {new Date(String(note.issued_at)).toLocaleString()} · {note.reason}</span>
      </div><Link className="textLink" href={'/invoices/'+id+'/credit-notes/'+note.id+'/document'}>Document / PDF →</Link></div>)}
      {!(credits?.length)?<p className="muted">No Credit Notes.</p>:null}
    </div></section>

    {canManager&&['DRAFT','ISSUED','OVERDUE'].includes(String(invoice.status))&&Number(invoice.paid_total)===0&&Number(invoice.credited_total)===0?<section className="panel">
      <h2>Void Invoice</h2>
      <form action={voidInvoiceV1} className="settingsGrid">
        <input type="hidden" name="invoice_id" value={id}/>
        <input type="hidden" name="order_id" value={invoice.order_id}/>
        <input type="hidden" name="expected_version" value={invoice.version}/>
        <input type="hidden" name="request_key" value={'invoice-void:'+id+':v'+invoice.version}/>
        <label>Reason<input name="reason" minLength={3} maxLength={1000} required/></label>
        <label>Evidence<input name="evidence_note" minLength={3} maxLength={1000} required/></label>
        <button>Void Invoice</button>
      </form>
    </section>:null}

    <section className="panel"><h2>Evidence timeline</h2><div className="settingsList">
      {(events??[]).map(event=><div className="settingsRow" key={event.id}><div>
        <strong>{event.event_type}</strong>
        <span className="muted smallText">{String(event.from_status??'∅')} → {String(event.to_status??'∅')} · {event.actor_type} · {new Date(String(event.occurred_at)).toLocaleString()}</span>
      </div></div>)}
    </div></section>
  </div>;
}
