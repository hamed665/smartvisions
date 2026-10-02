'use client';

export function PrintInvoiceButton(){
  return <button type="button" onClick={()=>window.print()}>Print / Save as PDF</button>;
}
