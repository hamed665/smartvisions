'use server';

import {revalidatePath} from 'next/cache';

import {getCurrentOrganization} from '@/lib/supabase/org';
import {normalizeRegisteredPaymentProvider} from '@/lib/payments/providers/catalog';
import {
  configurePaymentProvider,
  createPaymentLinkWithProvider,
  executePaymentRefundWithProvider,
} from '@/lib/payments/providers/runtime';

const LINK_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);
const MANAGER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER']);

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function provider(fd:FormData){return normalizeRegisteredPaymentProvider(field(fd,'provider'));}

export async function configurePaymentProviderV1(fd:FormData){
  const current=await getCurrentOrganization();
  if(!current.userId||!['OWNER','ADMIN'].includes(String(current.role)))throw new Error('Owner/Admin permission required');
  const p=provider(fd);
  await configurePaymentProvider({
    organizationId:current.organizationId,
    actorUserId:current.userId,
    provider:p,
    mode:field(fd,'mode'),
    secretKey:field(fd,'secret_key'),
    publishableKey:field(fd,'publishable_key'),
    merchantId:field(fd,'merchant_id'),
    requestKey:('payment-provider-config:'+p+':'+crypto.randomUUID()).slice(0,240),
  });
  revalidatePath('/payments/providers');
  revalidatePath('/payments');
}

export async function createPaymentLinkV1(fd:FormData){
  const current=await getCurrentOrganization();
  if(!current.userId||!LINK_ROLES.has(String(current.role)))throw new Error('Payment permission required');
  const paymentIntentId=field(fd,'payment_intent_id');
  await createPaymentLinkWithProvider({
    organizationId:current.organizationId,
    paymentIntentId,
    provider:provider(fd),
  });
  revalidatePath('/payments');
  revalidatePath('/payments/'+paymentIntentId);
  revalidatePath('/payments/providers');
}

export async function executePaymentRefundV1(fd:FormData){
  const current=await getCurrentOrganization();
  if(!current.userId||!MANAGER_ROLES.has(String(current.role)))throw new Error('Payment manager permission required');
  const refundId=field(fd,'refund_id');
  const paymentIntentId=field(fd,'payment_intent_id');
  await executePaymentRefundWithProvider({organizationId:current.organizationId,refundId});
  revalidatePath('/payments');
  revalidatePath('/payments/'+paymentIntentId);
  revalidatePath('/payments/providers');
}
