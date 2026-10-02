import {createHmac,timingSafeEqual} from 'node:crypto';

import type {OmanProviderMode} from './config';

export class OmanProviderError extends Error{
  constructor(message:string,public readonly ambiguous:boolean,public readonly status?:number){
    super(message);
    this.name='OmanProviderError';
  }
}

type JsonRecord=Record<string,unknown>;

async function requestJson(url:string,init:RequestInit){
  let response:Response;
  try{
    response=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});
  }catch(error){
    throw new OmanProviderError(error instanceof Error?error.message:'Provider request failed',true);
  }
  let body:unknown=null;
  try{body=await response.json();}catch{body=null;}
  if(!response.ok){
    throw new OmanProviderError('Provider HTTP '+response.status,false,response.status);
  }
  if(!body||typeof body!=='object')throw new OmanProviderError('Provider returned invalid JSON',true,response.status);
  return body as JsonRecord;
}

function child(value:unknown):JsonRecord{
  return value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};
}

function text(value:unknown){return typeof value==='string'?value.trim():'';}
function number(value:unknown){const n=Number(value);return Number.isFinite(n)?n:NaN;}

export function omrToBaisa(amount:number){
  if(!Number.isFinite(amount)||amount<=0)throw new Error('Positive OMR amount required');
  const minor=Math.round(amount*1000);
  if(Math.abs(minor/1000-amount)>0.0000001)throw new Error('OMR supports at most three decimal places');
  return minor;
}

export function baisaToOmr(amount:number){
  if(!Number.isInteger(amount)||amount<0)throw new Error('Baisa amount must be a non-negative integer');
  return amount/1000;
}

export function tapHashInput(payload:JsonRecord){
  const reference=child(payload.reference);
  const transaction=child(payload.transaction);
  const currency=text(payload.currency).toUpperCase();
  const decimals=['BHD','KWD','OMR','JOD'].includes(currency)?3:2;
  const amountValue=number(payload.amount);
  if(!Number.isFinite(amountValue))throw new Error('Tap webhook amount is invalid');
  const amount=amountValue.toFixed(decimals);
  const created=text(transaction.created)||text(payload.created)||String(transaction.created??payload.created??'');
  return 'x_id'+text(payload.id)
    +'x_amount'+amount
    +'x_currency'+currency
    +'x_gateway_reference'+text(reference.gateway)
    +'x_payment_reference'+text(reference.payment)
    +'x_status'+text(payload.status)
    +'x_created'+created;
}

export function verifyTapHashstring(payload:JsonRecord,postedHash:string|null,secretKey:string){
  if(!postedHash||!secretKey)return false;
  let expected:string;
  try{expected=createHmac('sha256',secretKey).update(tapHashInput(payload),'utf8').digest('hex');}
  catch{return false;}
  const a=Buffer.from(expected,'hex');
  const b=Buffer.from(postedHash.trim().toLowerCase(),'hex');
  return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}

function tapBase(){return 'https://api.tap.company';}

export async function createTapHostedCharge(input:{
  secretKey:string;
  merchantId:string;
  amount:number;
  paymentIntentId:string;
  paymentNumber:string;
  invoiceId:string;
  organizationId:string;
  customerName?:string;
  postUrl:string;
  redirectUrl:string;
}){
  const name=(input.customerName||'Customer').trim().slice(0,80)||'Customer';
  const body=await requestJson(tapBase()+'/v2/charges/',{
    method:'POST',
    headers:{Authorization:'Bearer '+input.secretKey,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify({
      amount:Number(input.amount.toFixed(3)),
      currency:'OMR',
      customer_initiated:true,
      threeDSecure:true,
      save_card:false,
      description:'Smart Visions '+input.paymentNumber,
      metadata:{sv_org_id:input.organizationId,sv_payment_intent_id:input.paymentIntentId,sv_invoice_id:input.invoiceId},
      reference:{transaction:input.paymentNumber,order:input.invoiceId},
      customer:{first_name:name},
      merchant:{id:input.merchantId},
      source:{id:'src_all'},
      post:{url:input.postUrl},
      redirect:{url:input.redirectUrl},
    }),
  });
  const tx=child(body.transaction);
  const id=text(body.id);
  const url=text(tx.url);
  if(!id||!url||!url.startsWith('https://'))throw new OmanProviderError('Tap did not return a hosted payment URL',true);
  return {
    providerLinkId:id,
    url,
    expiresAt:null as string|null,
    evidence:{provider:'TAP',object:text(body.object),status:text(body.status),chargeId:id,reference:child(body.reference)},
  };
}

export async function retrieveTapCharge(secretKey:string,chargeId:string){
  return requestJson(tapBase()+'/v2/charges/'+encodeURIComponent(chargeId),{
    method:'GET',
    headers:{Authorization:'Bearer '+secretKey,accept:'application/json'},
  });
}

export async function createTapRefund(input:{
  secretKey:string;
  chargeId:string;
  amount:number;
  reason:string;
  organizationId:string;
  paymentIntentId:string;
  refundId:string;
  postUrl:string;
}){
  return requestJson(tapBase()+'/v2/refunds/',{
    method:'POST',
    headers:{Authorization:'Bearer '+input.secretKey,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify({
      charge_id:input.chargeId,
      amount:Number(input.amount.toFixed(3)),
      currency:'OMR',
      reason:input.reason,
      post:{url:input.postUrl},
      metadata:{sv_org_id:input.organizationId,sv_payment_intent_id:input.paymentIntentId,sv_refund_id:input.refundId},
      reference:{merchant:input.refundId},
    }),
  });
}

export function mapTapEvent(payload:JsonRecord){
  const object=text(payload.object).toLowerCase();
  const status=text(payload.status).toUpperCase();
  const amount=number(payload.amount);
  if(!Number.isFinite(amount))return null;
  if(object==='refund'){
    if(status==='REFUNDED')return {kind:'REFUNDED' as const,amount};
    if(['FAILED','DECLINED','REJECTED','RESTRICTED'].includes(status))return {kind:'REFUND_FAILED' as const,amount:0};
    return null;
  }
  if(status==='CAPTURED')return {kind:'CAPTURED' as const,amount};
  if(status==='AUTHORIZED')return {kind:'AUTHORIZED' as const,amount};
  if(status==='TIMEDOUT')return {kind:'EXPIRED' as const,amount:0};
  if(['FAILED','DECLINED','RESTRICTED','CANCELLED','ABANDONED'].includes(status))return {kind:'FAILED' as const,amount:0};
  return null;
}

export function thawaniBase(mode:OmanProviderMode){
  return mode==='LIVE'?'https://checkout.thawani.om':'https://uatcheckout.thawani.om';
}

export async function createThawaniCheckoutSession(input:{
  mode:OmanProviderMode;
  secretKey:string;
  publishableKey:string;
  amount:number;
  organizationId:string;
  paymentIntentId:string;
  paymentNumber:string;
  successUrl:string;
  cancelUrl:string;
}){
  const base=thawaniBase(input.mode);
  const body=await requestJson(base+'/api/v1/checkout/session',{
    method:'POST',
    headers:{'thawani-api-key':input.secretKey,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify({
      client_reference_id:input.paymentIntentId,
      mode:'payment',
      products:[{name:input.paymentNumber,quantity:1,unit_amount:omrToBaisa(input.amount)}],
      success_url:input.successUrl,
      cancel_url:input.cancelUrl,
      metadata:{sv_org_id:input.organizationId,sv_payment_intent_id:input.paymentIntentId},
    }),
  });
  const data=child(body.data);
  const id=text(data.session_id);
  if(!id)throw new OmanProviderError('Thawani did not return a checkout session ID',true);
  return {
    providerLinkId:id,
    url:base+'/pay/'+encodeURIComponent(id)+'?key='+encodeURIComponent(input.publishableKey),
    expiresAt:text(data.expire_at)||null,
    evidence:{provider:'THAWANI',success:Boolean(body.success),code:body.code,sessionId:id,paymentStatus:text(data.payment_status),invoice:text(data.invoice)},
  };
}

export async function retrieveThawaniSession(mode:OmanProviderMode,secretKey:string,sessionId:string){
  return requestJson(thawaniBase(mode)+'/api/v1/checkout/session/'+encodeURIComponent(sessionId),{
    method:'GET',headers:{'thawani-api-key':secretKey,accept:'application/json'},
  });
}

export function normalizeThawaniSession(payload:JsonRecord){
  const data=child(payload.data);
  return {
    sessionId:text(data.session_id),
    clientReferenceId:text(data.client_reference_id),
    paymentStatus:text(data.payment_status).toLowerCase(),
    currency:text(data.currency).toUpperCase(),
    totalAmount:number(data.total_amount),
    invoice:text(data.invoice),
    expireAt:text(data.expire_at),
  };
}

export async function createThawaniRefund(input:{
  mode:OmanProviderMode;
  secretKey:string;
  sessionId:string;
  reason:string;
}){
  const base=thawaniBase(input.mode);
  const session=normalizeThawaniSession(await retrieveThawaniSession(input.mode,input.secretKey,input.sessionId));
  if(!session.invoice)throw new OmanProviderError('Thawani session has no invoice reference',true);
  const payments=await requestJson(base+'/api/v1/payments?checkout_invoice='+encodeURIComponent(session.invoice),{
    method:'GET',headers:{'thawani-api-key':input.secretKey,accept:'application/json'},
  });
  const list=Array.isArray(payments.data)?payments.data:[];
  const payment=child(list[0]);
  const paymentId=text(payment.payment_id)||text(payment.id);
  if(!paymentId)throw new OmanProviderError('Thawani payment ID could not be reconciled',true);
  const refund=await requestJson(base+'/api/v1/refunds',{
    method:'POST',
    headers:{'thawani-api-key':input.secretKey,'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify({payment_id:paymentId,reason:input.reason}),
  });
  return {refund,paymentId,session};
}

export function normalizeThawaniRefund(payload:JsonRecord){
  const data=child(payload.data);
  return {refundId:text(data.refund_id)||text(data.id),status:text(data.status).toLowerCase()};
}
