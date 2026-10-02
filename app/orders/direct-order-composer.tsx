'use client';

import {useId,useMemo,useState} from 'react';
import {createDirectOrderV1} from './actions';

type Option={id:string;label:string};
type Branch=Option&{tenantBusinessId:string};
type Deal=Option&{buyerBusinessId:string|null};
type CatalogOption={ref:string;label:string;tenantBusinessId:string|null;prices:string[]};
type Line={ref:string;quantity:string;taxPct:string;description:string};
type Props={
 orderId:string;tenantBusinesses:Option[];branches:Branch[];buyers:Option[];people:Option[];
 deals:Deal[];bookings:Array<Option&{personId:string}>;catalog:CatalogOption[];
 defaultCountry?:string;defaultCurrency?:string;
};
function blank(catalog:CatalogOption[]):Line{return{ref:catalog[0]?.ref??'',quantity:'1',taxPct:'0',description:''};}
function payload(line:Line){
 const [kind,id]=line.ref.split(':',2);
 const base={subjectKind:kind,quantity:Number(line.quantity),discountBps:0,taxBps:Math.round(Number(line.taxPct||0)*100),description:line.description.trim()||undefined};
 if(kind==='SERVICE')return{...base,serviceId:id};
 if(kind==='PRODUCT')return{...base,productId:id};
 return{...base,variantId:id};
}
export function DirectOrderComposer(props:Props){
 const requestKey='order-ui:'+props.orderId+':direct:'+useId().replace(/[^A-Za-z0-9_-]/g,'');
 const [seller,setSeller]=useState(props.tenantBusinesses[0]?.id??'');
 const [person,setPerson]=useState('');
 const [lines,setLines]=useState<Line[]>([blank(props.catalog)]);
 const catalog=useMemo(()=>props.catalog.filter(x=>!x.tenantBusinessId||x.tenantBusinessId===seller),[props.catalog,seller]);
 function update(i:number,patch:Partial<Line>){setLines(v=>v.map((x,n)=>n===i?{...x,...patch}:x));}
 return <form action={createDirectOrderV1} className="settingsGrid">
  <input type="hidden" name="order_id" value={props.orderId}/>
  <input type="hidden" name="request_key" value={requestKey}/>
  <input type="hidden" name="lines_json" value={JSON.stringify(lines.map(payload))}/>
  <label>Seller Business<select name="tenant_business_id" value={seller} onChange={e=>{setSeller(e.target.value);setLines([blank(props.catalog.filter(x=>!x.tenantBusinessId||x.tenantBusinessId===e.target.value))]);}} required>
   {props.tenantBusinesses.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
  </select></label>
  <label>Branch<select name="branch_id" defaultValue=""><option value="">No branch</option>{props.branches.filter(x=>x.tenantBusinessId===seller).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
  <label>Person<select name="person_id" value={person} onChange={e=>setPerson(e.target.value)}><option value="">No person</option>{props.people.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
  <label>Buyer business<select name="buyer_business_id" defaultValue=""><option value="">No buyer business</option>{props.buyers.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
  <label>Deal<select name="deal_id" defaultValue=""><option value="">No deal</option>{props.deals.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
  <label>Booking<select name="booking_id" defaultValue=""><option value="">No booking</option>{props.bookings.filter(x=>!person||x.personId===person).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
  <label>Country<input name="country_code" defaultValue={props.defaultCountry??'OM'} maxLength={2} required/></label>
  <label>Currency<input name="currency" defaultValue={props.defaultCurrency??'OMR'} maxLength={3} required/></label>
  <label className="fullWidth">Terms<textarea name="terms" maxLength={12000}/></label>
  <label className="fullWidth">Direct-order reason<textarea name="direct_reason" minLength={3} maxLength={1000} required/></label>
  <label className="fullWidth">Evidence<textarea name="evidence_note" minLength={3} maxLength={1000} required placeholder="Customer instruction / verified sales evidence"/></label>
  <div className="fullWidth"><h3>Lines</h3>{lines.map((line,i)=><div className="settingsGrid" key={i}>
    <label>Item<select value={line.ref} onChange={e=>update(i,{ref:e.target.value})} required>{catalog.map(x=><option key={x.ref} value={x.ref}>{x.label} · {x.prices.join(' / ')}</option>)}</select></label>
    <label>Quantity<input type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={e=>update(i,{quantity:e.target.value})} required/></label>
    <label>Tax %<input type="number" min="0" max="100" step="0.01" value={line.taxPct} onChange={e=>update(i,{taxPct:e.target.value})}/></label>
    <label>Description<input value={line.description} onChange={e=>update(i,{description:e.target.value})} maxLength={2000}/></label>
    {lines.length>1?<button type="button" onClick={()=>setLines(v=>v.filter((_,n)=>n!==i))}>Remove line</button>:null}
  </div>)}
  <button type="button" onClick={()=>setLines(v=>[...v,blank(catalog)])}>Add line</button></div>
  <div className="fullWidth"><button>Create direct Order</button></div>
 </form>;
}
