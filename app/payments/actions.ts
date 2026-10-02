'use server';

import {revalidatePath} from 'next/cache';

import {getCurrentOrganization} from '@/lib/supabase/org';
import {createSupabaseServiceClient} from '@/lib/supabase/service';

const PAYMENT_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);
const PAYMENT_MANAGER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER']);

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function amount(fd:FormData,key:string){
  const value=Number(field(fd,key));
  if(!Number.isFinite(value)||value<=0)throw new Error(key+' must be a positive amount');
  return value;
}
async function context(managerOnly=false){
  const current=await getCurrentOrganization();
  const allowed=managerOnly?PAYMENT_MANAGER_ROLES:PAYMENT_ROLES;
  if(!current.userId||!allowed.has(String(current.role)))throw new Error('Payment permission required');
  return {...current,service:createSupabaseServiceClient()};
}
function rpcError(label:string,error:{message?:string}|null){if(error)throw new Error(label+': '+(error.message??'unknown error'));}
function refresh(paymentId?:string,invoiceId?:string){
  revalidatePath('/payments');
  if(paymentId)revalidatePath('/payments/'+paymentId);
  if(invoiceId)revalidatePath('/invoices/'+invoiceId);
}

export async function createPaymentIntentV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const paymentIntentId=crypto.randomUUID();
  const invoiceId=field(fd,'invoice_id');
  const paymentAmount=amount(fd,'amount');
  const {data,error}=await service.rpc('create_payment_intent_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_payment_intent_id:paymentIntentId,
    p_invoice_id:invoiceId,
    p_amount:paymentAmount,
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Create Payment Intent failed',error);
  refresh(typeof data==='string'?data:paymentIntentId,invoiceId);
}

export async function cancelPaymentIntentV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const paymentIntentId=field(fd,'payment_intent_id');
  const invoiceId=field(fd,'invoice_id');
  const reason=field(fd,'reason');
  if(reason.length<3||reason.length>1000)throw new Error('Cancellation reason must be 3–1000 characters');
  const {error}=await service.rpc('cancel_payment_intent_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_payment_intent_id:paymentIntentId,
    p_reason:reason,
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Cancel Payment Intent failed',error);
  refresh(paymentIntentId,invoiceId);
}

export async function requestPaymentRefundV1(fd:FormData){
  const {organizationId,userId,service}=await context(true);
  const paymentIntentId=field(fd,'payment_intent_id');
  const invoiceId=field(fd,'invoice_id');
  const refundId=crypto.randomUUID();
  const refundAmount=amount(fd,'amount');
  const reason=field(fd,'reason');
  const evidenceNote=field(fd,'evidence_note');
  if(reason.length<3||reason.length>2000)throw new Error('Refund reason must be 3–2000 characters');
  if(evidenceNote.length<3||evidenceNote.length>1000)throw new Error('Refund evidence must be 3–1000 characters');
  const {error}=await service.rpc('request_payment_refund_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_refund_id:refundId,
    p_payment_intent_id:paymentIntentId,
    p_amount:refundAmount,
    p_reason:reason,
    p_evidence:{note:evidenceNote,recordedAt:new Date().toISOString()},
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Request Refund failed',error);
  refresh(paymentIntentId,invoiceId);
}
