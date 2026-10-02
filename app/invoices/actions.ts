'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const INVOICE_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);
const INVOICE_MANAGER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER']);

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function integer(fd:FormData,key:string){const value=Number(field(fd,key));if(!Number.isInteger(value))throw new Error(key+' must be an integer');return value;}
function evidence(fd:FormData){
  const note=field(fd,'evidence_note');
  if(note.length<3||note.length>1000)throw new Error('Evidence must be 3–1000 characters');
  return {note,recordedAt:new Date().toISOString()};
}
function jsonArray(fd:FormData,key:string){
  const value=JSON.parse(field(fd,key)||'[]');
  if(!Array.isArray(value)||value.length<1||value.length>500)throw new Error(key+' requires 1–500 rows');
  return value;
}
async function context(managerOnly=false){
  const current=await getCurrentOrganization();
  const allowed=managerOnly?INVOICE_MANAGER_ROLES:INVOICE_ROLES;
  if(!current.userId||!allowed.has(String(current.role)))throw new Error('Invoice permission required');
  return {...current,service:createSupabaseServiceClient()};
}
function rpcError(label:string,error:{message?:string}|null){if(error)throw new Error(label+': '+(error.message??'unknown error'));}
function refresh(invoiceId?:string,orderId?:string){
  revalidatePath('/invoices');
  if(invoiceId)revalidatePath('/invoices/'+invoiceId);
  if(orderId)revalidatePath('/orders/'+orderId);
}

export async function createInvoiceFromOrderV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const invoiceId=field(fd,'invoice_id');
  const orderId=field(fd,'order_id');
  const dueDate=field(fd,'due_date');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw new Error('Due date is required');
  const {error}=await service.rpc('create_invoice_from_order_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_invoice_id:invoiceId,
    p_order_id:orderId,
    p_due_date:dueDate,
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Create Invoice failed',error);
  refresh(invoiceId,orderId);
}

export async function issueInvoiceV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const invoiceId=field(fd,'invoice_id');
  const {error}=await service.rpc('issue_invoice_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_invoice_id:invoiceId,
    p_expected_version:integer(fd,'expected_version'),
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Issue Invoice failed',error);
  refresh(invoiceId,field(fd,'order_id'));
}

export async function voidInvoiceV1(fd:FormData){
  const {organizationId,userId,service}=await context(true);
  const invoiceId=field(fd,'invoice_id');
  const reason=field(fd,'reason');
  if(reason.length<3||reason.length>1000)throw new Error('Void reason must be 3–1000 characters');
  const {error}=await service.rpc('void_invoice_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_invoice_id:invoiceId,
    p_expected_version:integer(fd,'expected_version'),
    p_reason:reason,
    p_evidence:evidence(fd),
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Void Invoice failed',error);
  refresh(invoiceId,field(fd,'order_id'));
}

export async function issueInvoiceCreditNoteV1(fd:FormData){
  const {organizationId,userId,service}=await context(true);
  const invoiceId=field(fd,'invoice_id');
  const creditNoteId=field(fd,'credit_note_id');
  const reason=field(fd,'reason');
  if(reason.length<3||reason.length>2000)throw new Error('Credit Note reason must be 3–2000 characters');
  const {error}=await service.rpc('issue_invoice_credit_note_v1',{
    p_organization_id:organizationId,
    p_actor_user_id:userId,
    p_credit_note_id:creditNoteId,
    p_invoice_id:invoiceId,
    p_reason:reason,
    p_lines:jsonArray(fd,'lines_json'),
    p_evidence:evidence(fd),
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Issue Credit Note failed',error);
  refresh(invoiceId,field(fd,'order_id'));
}
