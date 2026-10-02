'use client';

import {useMemo,useState} from 'react';

import {issueInvoiceCreditNoteV1} from './actions';

type Line={id:string;name:string;remaining:number;unitLabel:string};

export function CreditNoteForm(props:{
  invoiceId:string;
  orderId:string;
  lines:Line[];
}){
  const [operationId,setOperationId]=useState('');
  const [quantities,setQuantities]=useState<Record<string,string>>({});
  const payload=useMemo(()=>props.lines.flatMap(line=>{
    const quantity=Number(quantities[line.id]??0);
    return Number.isFinite(quantity)&&quantity>0
      ?[{invoiceLineItemId:line.id,quantity}]
      :[];
  }),[props.lines,quantities]);
  return <form action={issueInvoiceCreditNoteV1} className="settingsGrid">
    <input type="hidden" name="invoice_id" value={props.invoiceId}/>
    <input type="hidden" name="order_id" value={props.orderId}/>
    <input type="hidden" name="credit_note_id" value={operationId}/>
    <input type="hidden" name="request_key" value={operationId?'invoice-credit:'+props.invoiceId+':'+operationId:''}/>
    <input type="hidden" name="lines_json" value={JSON.stringify(payload)}/>
    <div className="fullWidth settingsList">
      {props.lines.map(line=><label className="settingsRow" key={line.id}>
        <span><strong>{line.name}</strong><span className="muted smallText">Remaining creditable qty {line.remaining} · {line.unitLabel}</span></span>
        <input
          aria-label={'Credit quantity for '+line.name}
          type="number"
          min="0"
          max={line.remaining}
          step="0.0001"
          value={quantities[line.id]??''}
          onChange={event=>{
            if(!operationId)setOperationId(crypto.randomUUID());
            setQuantities(current=>({...current,[line.id]:event.target.value}));
          }}
          placeholder="0"
        />
      </label>)}
    </div>
    <label className="fullWidth">Reason<input name="reason" minLength={3} maxLength={2000} required placeholder="Return, pricing correction, service adjustment…"/></label>
    <label className="fullWidth">Evidence<input name="evidence_note" minLength={3} maxLength={1000} required placeholder="Reference the approved commercial evidence"/></label>
    <div className="fullWidth"><button disabled={!operationId||!payload.length}>Issue Credit Note</button></div>
  </form>;
}
