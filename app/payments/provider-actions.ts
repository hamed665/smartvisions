'use server';

import {revalidatePath} from 'next/cache';

import {getCurrentOrganization} from '@/lib/supabase/org';
import {createSupabaseServiceClient} from '@/lib/supabase/service';
import {createOmanPaymentLink,executeOmanRefund} from '@/lib/payments/oman/runtime';
import type {OmanPaymentProvider} from '@/lib/payments/oman/config';

const LINK_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);
const MANAGER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER']);

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function provider(fd:FormData):OmanPaymentProvider{
  const value=field(fd,'provider').toUpperCase();
  if(value!=='TAP'&&value!=='THAWANI')throw new Error('Unsupported Oman payment provider');
  return value;
}

export async function configureOmanPaymentProviderV1(fd:FormData){
  const current=await getCurrentOrganization();
  if(!current.userId||!['OWNER','ADMIN'].includes(String(current.role)))throw new Error('Owner/Admin permission required');
  const service=createSupabaseServiceClient();
  const p=provider(fd);
  const {error}=await service.rpc('configure_oman_payment_provider_v1',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_provider:p,
    p_mode:field(fd,'mode').toUpperCase(),
    p_secret_key:field(fd,'secret_key'),
    p_publishable_key:field(fd,'publishable_key'),
    p_merchant_id:field(fd,'merchant_id'),
    p_request_key:('payment-oman-config:'+p+':'+crypto.randomUUID()).slice(0,240),
  });
  if(error)throw new Error('Provider configuration failed: '+error.message);
  revalidatePath('/payments/providers');
  revalidatePath('/payments');
}

export async function createOmanPaymentLinkV1(fd:FormData){
  const current=await getCurrentOrganization();
  if(!current.userId||!LINK_ROLES.has(String(current.role)))throw new Error('Payment permission required');
  const paymentIntentId=field(fd,'payment_intent_id');
  await createOmanPaymentLink({
    organizationId:current.organizationId,
    paymentIntentId,
    provider:provider(fd),
  });
  revalidatePath('/payments');
  revalidatePath('/payments/'+paymentIntentId);
  revalidatePath('/payments/providers');
}

export async function executeOmanRefundV1(fd:FormData){
  const current=await getCurrentOrganization();
  if(!current.userId||!MANAGER_ROLES.has(String(current.role)))throw new Error('Payment manager permission required');
  const refundId=field(fd,'refund_id');
  const paymentIntentId=field(fd,'payment_intent_id');
  await executeOmanRefund({organizationId:current.organizationId,refundId});
  revalidatePath('/payments');
  revalidatePath('/payments/'+paymentIntentId);
  revalidatePath('/payments/providers');
}
