import Link from 'next/link';
import {notFound} from 'next/navigation';

import {PrintInvoiceButton} from '../../../../print-button';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';
type Props={params:Promise<{id:string;creditNoteId:string}>};
type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord{return value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};}
function rows(value:unknown){return Array.isArray(value)?value.map(record):[];}
function text(value:unknown){return value==null||value===''?'—':String(value);}
function money(value:unknown,currency:unknown){const n=Number(value);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})+' '+String(currency??''):'—';}

export default async function CreditNoteDocumentPage({params}:Props){
  const {id,creditNoteId}=await params;
  const {supabase,organizationId}=await getCurrentOrganization();
  const {data:note}=await supabase.from('invoice_credit_notes').select('id,invoice_id,credit_note_number,document_snapshot')
    .eq('organization_id',organizationId).eq('invoice_id',id).eq('id',creditNoteId).maybeSingle();
  if(!note?.document_snapshot)notFound();
  const doc=record(note.document_snapshot);
  const seller=record(doc.seller),buyer=record(doc.buyer),lineRows=rows(doc.lines),currency=doc.currency;

  return <main className="quoteDocument" style={{maxWidth:960,margin:'0 auto',padding:'32px'}}>
    <style>{`@media print {
      .sidebar,.mobileAppBar,.mobileBottomNav,.mobileNavOverlay,.invoicePrintControls{display:none!important}
      .shell{display:block!important}.content{padding:0!important;max-width:none!important}
      .quoteDocument{max-width:none!important;margin:0!important;padding:0!important}
      .quoteDocument .panel{box-shadow:none!important;break-inside:avoid}
    }`}</style>
    <div className="headerRow"><div><h1>Credit Note {text(doc.creditNoteNumber)}</h1><p className="muted">Against Invoice {text(doc.invoiceNumber)}</p></div>
      <div className="invoicePrintControls"><PrintInvoiceButton />{' '}<Link className="textLink" href={'/invoices/'+id}>Back to Invoice</Link></div></div>
    <section className="panel"><div className="settingsGrid">
      <div><strong>From</strong><p>{text(seller.name)}</p><p className="muted smallText">{text(seller.legalName)}</p></div>
      <div><strong>To</strong><p>{text(buyer.personName??buyer.businessName)}</p></div>
      <div><strong>Issued</strong><p>{new Date(String(doc.issuedAt)).toLocaleDateString()}</p></div>
      <div><strong>Reason</strong><p>{text(doc.reason)}</p></div>
    </div></section>
    <section className="panel"><h2>Credited items</h2><div className="settingsList">
      {lineRows.map((line,index)=><div className="settingsRow" key={String(line.invoiceLineItemId??index)}><div>
        <strong>{text(line.lineNo)}. {text(line.name)}</strong>
        <span className="muted smallText">Qty {text(line.creditedQuantity)} × {money(line.unitPrice,currency)} · Tax {(Number(line.taxBps)/100).toFixed(2)}%</span>
      </div><strong>{money(line.lineTotal,currency)}</strong></div>)}
    </div></section>
    <section className="panel"><div className="settingsList">
      <div className="settingsRow"><span>Subtotal</span><strong>{money(doc.subtotal,currency)}</strong></div>
      <div className="settingsRow"><span>Discount</span><strong>{money(doc.discountTotal,currency)}</strong></div>
      <div className="settingsRow"><span>Tax</span><strong>{money(doc.taxTotal,currency)}</strong></div>
      <div className="settingsRow"><span>Total credit</span><strong>{money(doc.total,currency)}</strong></div>
    </div></section>
    <p className="muted smallText">This Credit Note is immutable commercial evidence. It does not represent or execute a payment-provider refund.</p>
  </main>;
}
