import {createPaymentIntentV1} from './actions';

export function PaymentIntentForm(props:{
  invoiceId:string;
  invoiceVersion:number;
  balanceDue:number;
  currency:string;
}){
  if(!(props.balanceDue>0))return null;
  return <form action={createPaymentIntentV1} className="settingsGrid">
    <input type="hidden" name="invoice_id" value={props.invoiceId}/>
    <input type="hidden" name="request_key" value={'payment-intent:'+props.invoiceId+':v'+props.invoiceVersion+':'+props.balanceDue}/>
    <label>Amount
      <input name="amount" type="number" min="0.0001" step="0.0001" max={props.balanceDue} defaultValue={props.balanceDue} required/>
    </label>
    <p className="muted smallText">Currency: {props.currency}. A Payment Intent reserves collection scope; it does not mark the Invoice paid.</p>
    <button>Create Payment Intent</button>
  </form>;
}
