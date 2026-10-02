import Link from 'next/link';
import {notFound} from 'next/navigation';

import {PrintInvoiceButton} from '../../print-button';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};

type JsonRecord=Record<string,unknown>;
function record(value:unknown):JsonRecord{return value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};}
function rows(value:unknown){return Array.isArray(value)?value.map(record):[];}
function text(value:unknown){return value==null||value===''?'—':String(value);}
function money(value:unknown,currency:unknown){const n=Number(value);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4})+' '+String(currency??''):'—';}

export default async function InvoiceDocumentPage({params}:Props){
  const {id}=await params;
  const {supabase,organizationId}=await getCurrentOrganization();
  const {data:invoice}=await supabase.from('invoices').select('id,invoice_number,status,document_snapshot')
    .eq('organization_id',organizationId).eq('id',id).maybeSingle();
  if(!invoice?.document_snapshot)notFound();
  const doc=record(invoice.document_snapshot);
  const seller=record(doc.seller),buyer=record(doc.buyer);
  const lineRows=rows(doc.lines),taxRows=rows(doc.taxBreakdown);
  const currency=doc.currency;

  return <main className="quoteDocument" style={{maxWidth:960,margin:'0 auto',padding:'32px'}}>
    <style>{`@media print {
      .sidebar,.mobileAppBar,.mobileBottomNav,.mobileNavOverlay,.invoicePrintControls{display:none!important}
      .shell{display:block!important}.content{padding:0!important;max-width:none!important}
      .quoteDocument{max-width:none!important;margin:0!important;padding:0!important}
      .quoteDocument .panel{box-shadow:none!important;break-inside:avoid}
    }`}</style>
    <div className="headerRow"><div><h1>Invoice {text(doc.invoiceNumber)}</h1><p className="muted">{invoice.status} · Order {text(doc.orderNumber)}</p></div>
      <div className="invoicePrintControls"><PrintInvoiceButton />{' '}<Link className="textLink" href={'/invoices/'+id}>Back to Invoice</Link></div></div>
    <section className="panel"><div className="settingsGrid">
      <div><strong>From</strong><p>{text(seller.name)}</p><p className="muted smallText">{text(seller.legalName)} · {text(seller.countryCode)}</p></div>
      <div><strong>To</strong><p>{text(buyer.personName??buyer.businessName)}</p><p className="muted smallText">{buyer.personName&&buyer.businessName?text(buyer.businessName):''}</p></div>
      <div><strong>Issued</strong><p>{new Date(String(doc.issuedAt)).toLocaleDateString()}</p></div>
      <div><strong>Due</strong><p>{new Date(String(doc.dueDate)+'T00:00:00').toLocaleDateString()}</p></div>
    </div></section>
    <section className="panel"><h2>Items</h2><div className="settingsList">
      {lineRows.map((line,index)=><div className="settingsRow" key={String(line.invoiceLineItemId??index)}><div>
        <strong>{text(line.lineNo)}. {text(line.name)}</strong>
        {line.description?<span className="muted smallText">{text(line.description)}</span>:null}
        <span className="muted smallText">Qty {text(line.quantity)} × {money(line.unitPrice,currency)} · Discount {(Number(line.discountBps)/100).toFixed(2)}% · Tax {(Number(line.taxBps)/100).toFixed(2)}%</span>
      </div><strong>{money(line.lineTotal,currency)}</strong></div>)}
    </div></section>
    <section className="panel"><div className="settingsList">
      <div className="settingsRow"><span>Subtotal</span><strong>{money(doc.subtotal,currency)}</strong></div>
      <div className="settingsRow"><span>Discount</span><strong>{money(doc.discountTotal,currency)}</strong></div>
      <div className="settingsRow"><span>Tax</span><strong>{money(doc.taxTotal,currency)}</strong></div>
      <div className="settingsRow"><span>Total</span><strong>{money(doc.total,currency)}</strong></div>
    </div></section>
    <section className="panel"><h2>Tax / VAT evidence</h2><div className="settingsList">
      {taxRows.map((tax,index)=><div className="settingsRow" key={String(tax.taxBps??index)}>
        <span>Rate {(Number(tax.taxBps)/100).toFixed(2)}% · taxable {money(tax.taxableAmount,currency)}</span><strong>{money(tax.taxAmount,currency)}</strong>
      </div>)}
    </div></section>
    {doc.terms?<section className="panel"><h2>Terms</h2><p style={{whiteSpace:'pre-wrap'}}>{text(doc.terms)}</p></section>:null}
    <p className="muted smallText">Rendered from immutable INVOICE-ENGINE issue evidence. Payment/refund execution is deliberately outside this document authority.</p>
  </main>;
}
