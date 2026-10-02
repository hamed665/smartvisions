import 'server-only';

import {createSupabaseServiceClient} from '@/lib/supabase/service';
import {
  createOmanPaymentLink,
  executeOmanRefund,
  reconcileTapPayment,
  reconcileThawaniPayment,
} from '@/lib/payments/oman/runtime';
import {
  getPaymentProviderDefinition,
  normalizeRegisteredPaymentProvider,
  paymentProviderSupports,
  paymentProviderSupportsCurrency,
  type RegisteredPaymentProviderCode,
} from './catalog';

type CreatePaymentLinkInput={
  organizationId:string;
  paymentIntentId:string;
};

type ExecuteRefundInput={
  organizationId:string;
  refundId:string;
};

type ReconcilePaymentInput={
  organizationId:string;
  paymentIntentId:string;
  providerReference?:string;
};

export type PaymentReconciliationResult={
  settled:boolean;
  status:string;
  result?:unknown;
};

type PaymentProviderAdapter={
  createPaymentLink(input:CreatePaymentLinkInput):Promise<{linkId:string;url:string}>;
  executeRefund(input:ExecuteRefundInput):Promise<unknown>;
  reconcilePayment(input:ReconcilePaymentInput):Promise<PaymentReconciliationResult>;
};

const ADAPTERS:Record<RegisteredPaymentProviderCode,PaymentProviderAdapter>={
  TAP:{
    createPaymentLink:(input)=>createOmanPaymentLink({...input,provider:'TAP'}),
    executeRefund:(input)=>executeOmanRefund(input),
    reconcilePayment:(input)=>reconcileTapPayment({
      organizationId:input.organizationId,
      paymentIntentId:input.paymentIntentId,
    }),
  },
  THAWANI:{
    createPaymentLink:(input)=>createOmanPaymentLink({...input,provider:'THAWANI'}),
    executeRefund:(input)=>executeOmanRefund(input),
    reconcilePayment:(input)=>reconcileThawaniPayment({
      organizationId:input.organizationId,
      paymentIntentId:input.paymentIntentId,
      sessionId:input.providerReference,
    }),
  },
};

export function getPaymentProviderAdapter(providerInput:string):PaymentProviderAdapter{
  const provider=normalizeRegisteredPaymentProvider(providerInput);
  const adapter=ADAPTERS[provider];
  if(!adapter)throw new Error('Payment provider adapter is not registered');
  return adapter;
}

export async function configurePaymentProvider(input:{
  organizationId:string;
  actorUserId:string;
  provider:string;
  mode:string;
  secretKey:string;
  publishableKey:string;
  merchantId:string;
  requestKey:string;
}){
  const provider=normalizeRegisteredPaymentProvider(input.provider);
  const definition=getPaymentProviderDefinition(provider);
  if(definition.configuration.kind!=='OMAN_API_KEYS'){
    throw new Error('Payment provider configuration strategy is unavailable');
  }
  const service=createSupabaseServiceClient();
  const {data,error}=await service.rpc('configure_oman_payment_provider_v1',{
    p_organization_id:input.organizationId,
    p_actor_user_id:input.actorUserId,
    p_provider:provider,
    p_mode:input.mode.trim().toUpperCase(),
    p_secret_key:input.secretKey,
    p_publishable_key:input.publishableKey,
    p_merchant_id:input.merchantId,
    p_request_key:input.requestKey,
  });
  if(error)throw new Error('Payment provider configuration failed: '+error.message);
  return data;
}

export async function createPaymentLinkWithProvider(input:{
  organizationId:string;
  paymentIntentId:string;
  provider:string;
}){
  const provider=normalizeRegisteredPaymentProvider(input.provider);
  const definition=getPaymentProviderDefinition(provider);
  if(!definition.capabilities.includes('HOSTED_PAYMENT_LINK')){
    throw new Error(provider+' does not support hosted Payment Links');
  }

  const service=createSupabaseServiceClient();
  const {data:payment,error}=await service.from('payment_intents')
    .select('currency')
    .eq('organization_id',input.organizationId)
    .eq('id',input.paymentIntentId)
    .maybeSingle();
  if(error||!payment)throw new Error('Payment Intent not found');
  if(!paymentProviderSupportsCurrency(provider,String(payment.currency))){
    throw new Error(provider+' does not support '+String(payment.currency));
  }

  return getPaymentProviderAdapter(provider).createPaymentLink({
    organizationId:input.organizationId,
    paymentIntentId:input.paymentIntentId,
  });
}

export async function executePaymentRefundWithProvider(input:ExecuteRefundInput){
  const service=createSupabaseServiceClient();
  const {data:refund,error}=await service.from('payment_refunds')
    .select('payment_intent_id,amount,status')
    .eq('organization_id',input.organizationId)
    .eq('id',input.refundId)
    .maybeSingle();
  if(error||!refund)throw new Error('Refund request not found');

  const {data:payment,error:paymentError}=await service.from('payment_intents')
    .select('provider,currency,captured_total,refunded_total')
    .eq('organization_id',input.organizationId)
    .eq('id',refund.payment_intent_id)
    .maybeSingle();
  if(paymentError||!payment||!payment.provider)throw new Error('Payment provider is unavailable for Refund');

  const provider=normalizeRegisteredPaymentProvider(String(payment.provider));
  if(!paymentProviderSupports(provider,'REFUND'))throw new Error(provider+' does not support Refund execution');
  if(!paymentProviderSupportsCurrency(provider,String(payment.currency))){
    throw new Error(provider+' does not support '+String(payment.currency));
  }

  const remaining=Number(payment.captured_total)-Number(payment.refunded_total);
  const amount=Number(refund.amount);
  if(amount<remaining-0.0001&&!paymentProviderSupports(provider,'PARTIAL_REFUND')){
    throw new Error(provider+' does not support partial Refund execution');
  }

  return getPaymentProviderAdapter(provider).executeRefund(input);
}

export async function reconcilePaymentWithProvider(input:{
  organizationId:string;
  paymentIntentId:string;
  provider:string;
  providerReference?:string;
}):Promise<PaymentReconciliationResult>{
  const provider=normalizeRegisteredPaymentProvider(input.provider);
  if(!paymentProviderSupports(provider,'SERVER_READBACK')){
    throw new Error(provider+' does not support server readback reconciliation');
  }
  return getPaymentProviderAdapter(provider).reconcilePayment({
    organizationId:input.organizationId,
    paymentIntentId:input.paymentIntentId,
    providerReference:input.providerReference,
  });
}
