'use client';

import { useId, useMemo, useState } from 'react';

import { createQuoteV1, createQuoteVersionV1 } from './actions';

type Option = { id:string; label:string };
type CatalogOption = {
  ref:string;
  label:string;
  tenantBusinessId:string|null;
  prices:string[];
};
type Line = { ref:string; quantity:string; discountPct:string; taxPct:string; description:string };

type Props = {
  mode:'create'|'revise';
  quoteId:string;
  expectedQuoteVersion?:number;
  tenantBusinesses:Option[];
  branches:Array<Option & {tenantBusinessId:string}>;
  buyers:Option[];
  people:Option[];
  deals:Array<Option & {buyerBusinessId:string|null}>;
  catalog:CatalogOption[];
  defaultCountry?:string;
  defaultCurrency?:string;
  defaultValidUntil?:string;
  defaultTerms?:string;
  defaultNotes?:string;
  initialLines?:Line[];
};

function blankLine(catalog:CatalogOption[]):Line {
  return {ref:catalog[0]?.ref ?? '',quantity:'1',discountPct:'0',taxPct:'0',description:''};
}
function subjectPayload(line:Line) {
  const [kind,id]=line.ref.split(':',2);
  const base = {
    subjectKind:kind,
    quantity:Number(line.quantity),
    discountBps:Math.round(Number(line.discountPct||0)*100),
    taxBps:Math.round(Number(line.taxPct||0)*100),
    description:line.description.trim() || undefined,
  };
  if (kind==='SERVICE') return {...base,serviceId:id};
  if (kind==='PRODUCT') return {...base,productId:id};
  return {...base,variantId:id};
}

export function QuoteComposer(props:Props) {
  const requestKey='quote-ui:' + props.quoteId + ':' + props.mode + ':' + (props.expectedQuoteVersion ?? 'create') + ':' + useId().replace(/[^A-Za-z0-9_-]/g,'');
  const [seller,setSeller]=useState(props.tenantBusinesses[0]?.id ?? '');
  const [lines,setLines]=useState<Line[]>(props.initialLines?.length ? props.initialLines : [blankLine(props.catalog)]);
  const catalog=useMemo(
    ()=>props.catalog.filter(item=>!item.tenantBusinessId || !seller || item.tenantBusinessId===seller),
    [props.catalog,seller]
  );
  const payload=JSON.stringify(lines.filter(line=>line.ref).map(subjectPayload));
  const action=props.mode==='create' ? createQuoteV1 : createQuoteVersionV1;

  function patch(index:number, key:keyof Line, value:string) {
    setLines(current=>current.map((line,i)=>i===index?{...line,[key]:value}:line));
  }

  return <form action={action} className="settingsGrid">
    <input type="hidden" name="quote_id" value={props.quoteId} />
    <input type="hidden" name="request_key" value={requestKey} />
    <input type="hidden" name="lines_json" value={payload} />
    {props.expectedQuoteVersion!=null
      ? <input type="hidden" name="expected_quote_version" value={props.expectedQuoteVersion} />
      : null}

    {props.mode==='create' ? <>
      <label>Seller Business
        <select name="tenant_business_id" value={seller} onChange={e=>{
            const next=e.target.value;
            setSeller(next);
            const nextCatalog=props.catalog.filter(item=>!item.tenantBusinessId || item.tenantBusinessId===next);
            setLines([blankLine(nextCatalog)]);
          }} required>
          {props.tenantBusinesses.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label>Seller Branch
        <select name="branch_id" defaultValue="">
          <option value="">No specific branch</option>
          {props.branches.filter(x=>!seller || x.tenantBusinessId===seller).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label>Buyer Account
        <select name="buyer_business_id" defaultValue="">
          <option value="">No Account</option>
          {props.buyers.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label>Buyer Person
        <select name="person_id" defaultValue="">
          <option value="">No Person</option>
          {props.people.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label>Deal
        <select name="deal_id" defaultValue="">
          <option value="">No Deal</option>
          {props.deals.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
    </> : null}

    <label>Country<input name="country_code" defaultValue={props.defaultCountry ?? 'OM'} maxLength={2} required /></label>
    <label>Currency<input name="currency" defaultValue={props.defaultCurrency ?? 'OMR'} maxLength={3} required /></label>
    <label>Valid until<input name="valid_until" type="date" defaultValue={props.defaultValidUntil} required /></label>
    <label>Terms<textarea name="terms" rows={3} defaultValue={props.defaultTerms ?? ''} /></label>
    <label>Internal notes<textarea name="notes" rows={3} defaultValue={props.defaultNotes ?? ''} /></label>

    <div style={{gridColumn:'1 / -1'}}>
      <h3>Line items</h3>
      <p className="muted smallText">Unit price is never typed here. QUOTE-ENGINE resolves it from canonical Service/Product pricing and snapshots it.</p>
      <div className="settingsList">
        {lines.map((line,index)=><div className="settingsRow" key={index}>
          <label>Item
            <select value={line.ref} onChange={e=>patch(index,'ref',e.target.value)} required>
              {catalog.map(item=><option key={item.ref} value={item.ref}>{item.label} · {item.prices.join(' / ') || 'no price'}</option>)}
            </select>
          </label>
          <label>Qty<input type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={e=>patch(index,'quantity',e.target.value)} required /></label>
          <label>Discount %<input type="number" min="0" max="100" step="0.01" value={line.discountPct} onChange={e=>patch(index,'discountPct',e.target.value)} /></label>
          <label>Tax %<input type="number" min="0" max="100" step="0.01" value={line.taxPct} onChange={e=>patch(index,'taxPct',e.target.value)} /></label>
          <label>Description<input value={line.description} onChange={e=>patch(index,'description',e.target.value)} maxLength={2000} /></label>
          <button type="button" disabled={lines.length===1} onClick={()=>setLines(current=>current.filter((_,i)=>i!==index))}>Remove</button>
        </div>)}
      </div>
      <button type="button" onClick={()=>setLines(current=>[...current,blankLine(catalog)])}>Add line</button>
    </div>

    {props.mode==='create'
      ? <p className="muted smallText" style={{gridColumn:'1 / -1'}}>Choose at least a Buyer Account or Buyer Person. If both are selected, their confirmed CRM relationship is enforced. Deal context must match the Buyer Account.</p>
      : null}
    <button disabled={!seller && props.mode==='create' || !catalog.length}>{props.mode==='create'?'Create Quote':'Create revised version'}</button>
  </form>;
}
