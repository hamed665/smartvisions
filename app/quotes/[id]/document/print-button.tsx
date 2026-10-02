'use client';

export function PrintQuoteButton() {
  return <button type="button" onClick={()=>window.print()}>Print / Save as PDF</button>;
}
