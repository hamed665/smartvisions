'use client';

import {useId,useMemo,useState} from 'react';
import {recordOrderFulfillmentV1,requestOrderReturnV1} from './actions';

type Line={id:string;name:string;ordered:number;fulfilled:number;returned:number};
type Props={orderId:string;version:number;lines:Line[]};

export function OrderFulfillmentForm({orderId,version,lines}:Props){
 const [qty,setQty]=useState<Record<string,string>>({});
 const requestKey='order-fulfill:'+orderId+':v'+version+':'+useId().replace(/[^A-Za-z0-9_-]/g,'');
 const payload=useMemo(()=>lines.map(x=>({orderLineId:x.id,quantity:Number(qty[x.id]||0)})).filter(x=>x.quantity>0),[lines,qty]);
 return <form action={recordOrderFulfillmentV1} className="settingsGrid">
  <input type="hidden" name="order_id" value={orderId}/><input type="hidden" name="expected_version" value={version}/>
  <input type="hidden" name="request_key" value={requestKey}/><input type="hidden" name="lines_json" value={JSON.stringify(payload)}/>
  {lines.map(x=>{const remaining=Math.max(0,x.ordered-x.fulfilled);return <label key={x.id}>{x.name} · remaining {remaining}
   <input type="number" min="0" max={remaining} step="0.0001" value={qty[x.id]??''} onChange={e=>setQty(v=>({...v,[x.id]:e.target.value}))} disabled={remaining<=0}/>
  </label>;})}
  <label className="fullWidth">Fulfillment evidence<input name="evidence_note" minLength={3} maxLength={1000} required placeholder="Delivery / service completion evidence"/></label>
  <div className="fullWidth"><button disabled={!payload.length}>Record fulfillment</button></div>
 </form>;
}

export function OrderReturnForm({orderId,version,lines}:Props){
 const returnId=useMemo(()=>crypto.randomUUID(),[]);
 const [qty,setQty]=useState<Record<string,string>>({});
 const requestKey='order-return:'+orderId+':v'+version+':'+returnId;
 const available=lines.map(x=>({...x,available:Math.max(0,x.fulfilled-x.returned)}));
 const payload=available.map(x=>({orderLineId:x.id,quantity:Number(qty[x.id]||0)})).filter(x=>x.quantity>0);
 return <form action={requestOrderReturnV1} className="settingsGrid">
  <input type="hidden" name="order_id" value={orderId}/><input type="hidden" name="return_id" value={returnId}/>
  <input type="hidden" name="request_key" value={requestKey}/><input type="hidden" name="lines_json" value={JSON.stringify(payload)}/>
  {available.map(x=><label key={x.id}>{x.name} · returnable {x.available}
   <input type="number" min="0" max={x.available} step="0.0001" value={qty[x.id]??''} onChange={e=>setQty(v=>({...v,[x.id]:e.target.value}))} disabled={x.available<=0}/>
  </label>)}
  <label className="fullWidth">Reason<textarea name="reason" minLength={3} maxLength={1000} required/></label>
  <label className="fullWidth">Return request evidence<input name="evidence_note" minLength={3} maxLength={1000} required/></label>
  <div className="fullWidth"><button disabled={!payload.length}>Request return</button></div>
 </form>;
}
