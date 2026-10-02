'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const ORDER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);
const ORDER_MANAGER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER']);

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function optional(fd:FormData,key:string){const v=field(fd,key);return v||null;}
function integer(fd:FormData,key:string){const v=Number(field(fd,key));if(!Number.isInteger(v))throw new Error(key+' must be an integer');return v;}
function objectEvidence(note:string){const v=note.trim();if(v.length<3)throw new Error('Evidence must be at least 3 characters');return {note:v,recordedAt:new Date().toISOString()};}
function parseJsonArray(raw:string,label:string){
  const value=JSON.parse(raw||'[]');
  if(!Array.isArray(value)||value.length<1||value.length>500)throw new Error(label+' requires 1–500 lines');
  return value;
}
async function context(managerOnly=false){
  const current=await getCurrentOrganization();
  const allowed=managerOnly?ORDER_MANAGER_ROLES:ORDER_ROLES;
  if(!current.userId||!allowed.has(String(current.role)))throw new Error('Order permission required');
  return {...current,service:createSupabaseServiceClient()};
}
function refresh(orderId?:string,quoteId?:string){
  revalidatePath('/orders');
  if(orderId)revalidatePath('/orders/'+orderId);
  if(quoteId){revalidatePath('/quotes');revalidatePath('/quotes/'+quoteId);}
}
function rpcError(label:string,error:{message?:string}|null){if(error)throw new Error(label+': '+(error.message??'unknown error'));}

export async function createOrderFromQuoteV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const quoteId=field(fd,'quote_id');
  const {error}=await service.rpc('create_order_from_quote_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_order_id:orderId,p_quote_id:quoteId,
    p_booking_id:optional(fd,'booking_id'),p_owner_user_id:userId,p_request_key:field(fd,'request_key'),
  });
  rpcError('Create Order from Quote failed',error);refresh(orderId,quoteId);
}

export async function createDirectOrderV1(fd:FormData){
  const {organizationId,userId,service}=await context(true);
  const orderId=field(fd,'order_id');
  const evidence=objectEvidence(field(fd,'evidence_note'));
  const {error}=await service.rpc('create_direct_order_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_order_id:orderId,
    p_tenant_business_id:field(fd,'tenant_business_id'),p_branch_id:optional(fd,'branch_id'),
    p_person_id:optional(fd,'person_id'),p_buyer_business_id:optional(fd,'buyer_business_id'),
    p_deal_id:optional(fd,'deal_id'),p_booking_id:optional(fd,'booking_id'),p_owner_user_id:userId,
    p_country_code:field(fd,'country_code'),p_currency:field(fd,'currency'),p_terms:optional(fd,'terms'),
    p_direct_reason:field(fd,'direct_reason'),p_direct_evidence:evidence,
    p_lines:parseJsonArray(field(fd,'lines_json'),'Direct Order'),p_request_key:field(fd,'request_key'),
  });
  rpcError('Create direct Order failed',error);refresh(orderId);
}

export async function startOrderProcessingV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const {error}=await service.rpc('start_order_processing_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_order_id:orderId,
    p_expected_version:integer(fd,'expected_version'),p_request_key:field(fd,'request_key'),
  });
  rpcError('Start Order processing failed',error);refresh(orderId);
}

export async function recordOrderFulfillmentV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const lines=parseJsonArray(field(fd,'lines_json'),'Fulfillment');
  const {error}=await service.rpc('record_order_fulfillment_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_order_id:orderId,
    p_expected_version:integer(fd,'expected_version'),p_lines:lines,
    p_evidence:objectEvidence(field(fd,'evidence_note')),p_request_key:field(fd,'request_key'),
  });
  rpcError('Record fulfillment failed',error);refresh(orderId);
}

export async function cancelOrderV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const reason=field(fd,'reason');
  const {error}=await service.rpc('cancel_order_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_order_id:orderId,
    p_expected_version:integer(fd,'expected_version'),p_reason:reason,
    p_evidence:objectEvidence(field(fd,'evidence_note')),p_request_key:field(fd,'request_key'),
  });
  rpcError('Cancel Order failed',error);refresh(orderId);
}

export async function requestOrderReturnV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const returnId=field(fd,'return_id');
  const {error}=await service.rpc('request_order_return_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_return_id:returnId,p_order_id:orderId,
    p_reason:field(fd,'reason'),p_lines:parseJsonArray(field(fd,'lines_json'),'Return'),
    p_evidence:objectEvidence(field(fd,'evidence_note')),p_request_key:field(fd,'request_key'),
  });
  rpcError('Request return failed',error);refresh(orderId);
}

export async function decideOrderReturnV1(fd:FormData){
  const {organizationId,userId,service}=await context(true);
  const orderId=field(fd,'order_id');
  const {error}=await service.rpc('decide_order_return_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_return_id:field(fd,'return_id'),
    p_decision:field(fd,'decision'),p_note:optional(fd,'note'),
    p_evidence:objectEvidence(field(fd,'evidence_note')),p_request_key:field(fd,'request_key'),
  });
  rpcError('Return decision failed',error);refresh(orderId);
}

export async function receiveOrderReturnV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const {error}=await service.rpc('receive_order_return_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_return_id:field(fd,'return_id'),
    p_evidence:objectEvidence(field(fd,'evidence_note')),p_request_key:field(fd,'request_key'),
  });
  rpcError('Receive return failed',error);refresh(orderId);
}
