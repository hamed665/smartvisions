import 'server-only';

import {createSupabaseServiceClient} from '@/lib/supabase/service';
import {loadOmanProviderConfig,recordOmanProviderHealth,type OmanPaymentProvider} from './config';
import {
  OmanProviderError,
  createTapHostedCharge,
  createTapRefund,
  createThawaniCheckoutSession,
  createThawaniRefund,
  mapTapEvent,
  normalizeThawaniRefund,
  normalizeThawaniSession,
  retrieveThawaniSession,
} from './provider';

function origin(){
  const configured=(process.env.NEXT_PUBLIC_APP_URL||'https://app.smartvisionsai.com').trim().replace(/\/$/,'');
  if(!configured.startsWith('https://'))throw new Error('NEXT_PUBLIC_APP_URL must be HTTPS');
  return configured;
}

function rpcError(label:string,error:{message?:string}|null){if(error)throw new Error(label+': '+(error.message??'unknown error'));}

export async function createOmanPaymentLink(input:{
  organizationId:string;
  paymentIntentId:string;
  provider:OmanPaymentProvider;
}){
  const service=createSupabaseServiceClient();
  const {data:payment,error}=await service.from('payment_intents').select('*')
    .eq('organization_id',input.organizationId).eq('id',input.paymentIntentId).maybeSingle();
  if(error||!payment)throw new Error('Payment Intent not found');
  if(!['CREATED','AUTHORIZED','RECONCILIATION_REQUIRED'].includes(String(payment.status)))throw new Error('Payment Intent is not collectible');
  if(String(payment.currency)!=='OMR')throw new Error('PAYMENT-OMAN supports OMR Payment Intents only');

  const cfg=await loadOmanProviderConfig(input.organizationId,input.provider);
  const base=origin();
  const paymentNumber=String(payment.payment_number);
  const invoiceId=String(payment.invoice_id);
  let created:{providerLinkId:string;url:string;expiresAt:string|null;evidence:Record<string,unknown>};
  try{
    if(input.provider==='TAP'){
      created=await createTapHostedCharge({
        secretKey:cfg.secretKey,
        merchantId:cfg.merchantId!,
        amount:Number(payment.amount),
        paymentIntentId:input.paymentIntentId,
        paymentNumber,
        invoiceId,
        organizationId:input.organizationId,
        postUrl:base+'/api/payments/oman/tap/webhook',
        redirectUrl:base+'/payments/'+input.paymentIntentId,
      });
    }else{
      created=await createThawaniCheckoutSession({
        mode:cfg.mode,
        secretKey:cfg.secretKey,
        publishableKey:cfg.publishableKey!,
        amount:Number(payment.amount),
        organizationId:input.organizationId,
        paymentIntentId:input.paymentIntentId,
        paymentNumber,
        successUrl:base+'/api/payments/oman/thawani/reconcile?payment_intent_id='+encodeURIComponent(input.paymentIntentId),
        cancelUrl:base+'/payments/'+input.paymentIntentId+'?payment=cancelled',
      });
    }

    const linkId=crypto.randomUUID();
    const requestKey='payment-oman-link:'+input.provider+':'+input.paymentIntentId+':'+created.providerLinkId;
    const {error:recordError}=await service.rpc('record_payment_link_v1',{
      p_organization_id:input.organizationId,
      p_payment_link_id:linkId,
      p_payment_intent_id:input.paymentIntentId,
      p_provider:input.provider,
      p_provider_link_id:created.providerLinkId,
      p_url:created.url,
      p_expires_at:created.expiresAt,
      p_provider_evidence:created.evidence,
      p_request_key:requestKey.slice(0,240),
    });
    rpcError('Payment Link evidence failed',recordError);

    await recordOmanProviderHealth({
      organizationId:input.organizationId,provider:input.provider,healthy:true,
      detail:'Hosted payment link created by provider API',
      evidence:{operation:'CREATE_PAYMENT_LINK',providerLinkId:created.providerLinkId,mode:cfg.mode},
      requestKey:('payment-oman-health:'+input.provider+':'+created.providerLinkId).slice(0,240),
    });
    return {linkId,url:created.url};
  }catch(error){
    const ambiguous=error instanceof OmanProviderError&&error.ambiguous;
    try{
      await recordOmanProviderHealth({
        organizationId:input.organizationId,provider:input.provider,healthy:false,
        detail:error instanceof Error?error.message:'Provider request failed',
        evidence:{operation:'CREATE_PAYMENT_LINK',ambiguous,mode:cfg.mode},
        requestKey:('payment-oman-health-failed:'+input.provider+':'+input.paymentIntentId+':'+crypto.randomUUID()).slice(0,240),
      });
    }catch{}
    if(ambiguous){
      const {error:reconcileError}=await service.rpc('mark_payment_intent_reconciliation_required_v1',{
        p_organization_id:input.organizationId,
        p_payment_intent_id:input.paymentIntentId,
        p_provider:input.provider,
        p_reason:'Ambiguous provider response while creating hosted payment link',
        p_evidence:{operation:'CREATE_PAYMENT_LINK',provider:input.provider,networkOutcome:'AMBIGUOUS'},
        p_request_key:('payment-oman-ambiguous:'+input.provider+':'+input.paymentIntentId+':'+crypto.randomUUID()).slice(0,240),
      });
      rpcError('Payment reconciliation marker failed',reconcileError);
    }
    throw error;
  }
}

export async function reconcileThawaniPayment(input:{
  organizationId:string;
  paymentIntentId:string;
  sessionId?:string;
}){
  const service=createSupabaseServiceClient();
  const {data:payment,error}=await service.from('payment_intents').select('id,amount,currency,status,provider')
    .eq('organization_id',input.organizationId).eq('id',input.paymentIntentId).maybeSingle();
  if(error||!payment)throw new Error('Payment Intent not found');
  const {data:link,error:linkError}=await service.from('payment_links')
    .select('provider_link_id')
    .eq('organization_id',input.organizationId)
    .eq('payment_intent_id',input.paymentIntentId)
    .eq('provider','THAWANI')
    .order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(linkError||!link)throw new Error('Thawani Payment Link not found');
  const sessionId=input.sessionId||String(link.provider_link_id);
  if(sessionId!==String(link.provider_link_id))throw new Error('Thawani session does not match Payment Intent');

  const cfg=await loadOmanProviderConfig(input.organizationId,'THAWANI');
  const raw=await retrieveThawaniSession(cfg.mode,cfg.secretKey,sessionId);
  const session=normalizeThawaniSession(raw);
  if(session.sessionId!==sessionId||session.clientReferenceId!==input.paymentIntentId){
    throw new Error('Thawani provider readback identity mismatch');
  }
  if(session.currency&&session.currency!=='OMR')throw new Error('Thawani currency mismatch');
  const expectedMinor=Math.round(Number(payment.amount)*1000);
  if(!Number.isFinite(session.totalAmount)||session.totalAmount!==expectedMinor)throw new Error('Thawani amount mismatch');

  await recordOmanProviderHealth({
    organizationId:input.organizationId,provider:'THAWANI',healthy:true,
    detail:'Checkout session read back from Thawani API',
    evidence:{operation:'RETRIEVE_SESSION',sessionId,paymentStatus:session.paymentStatus,mode:cfg.mode},
    requestKey:('payment-oman-health:THAWANI:'+sessionId+':'+session.paymentStatus).slice(0,240),
  });

  if(session.paymentStatus!=='paid')return {settled:false,status:session.paymentStatus};

  const eventId=('thawani:'+sessionId+':paid').slice(0,240);
  const {data:result,error:recordError}=await service.rpc('record_payment_provider_event_v1',{
    p_organization_id:input.organizationId,
    p_payment_intent_id:input.paymentIntentId,
    p_refund_id:null,
    p_provider:'THAWANI',
    p_provider_event_id:eventId,
    p_event_kind:'CAPTURED',
    p_provider_reference:session.invoice||sessionId,
    p_amount:Number(payment.amount),
    p_currency:'OMR',
    p_authenticity:'EXPLICIT_RECONCILIATION',
    p_raw_evidence:raw,
    p_normalized_evidence:{sessionId,paymentStatus:session.paymentStatus,clientReferenceId:session.clientReferenceId,providerReadback:true},
    p_request_key:('payment-oman-thawani-captured:'+sessionId).slice(0,240),
  });
  rpcError('Thawani settlement reconciliation failed',recordError);
  return {settled:true,status:'paid',result};
}

export async function executeOmanRefund(input:{
  organizationId:string;
  refundId:string;
}){
  const service=createSupabaseServiceClient();
  const {data:refund,error}=await service.from('payment_refunds').select('*')
    .eq('organization_id',input.organizationId).eq('id',input.refundId).maybeSingle();
  if(error||!refund)throw new Error('Refund request not found');
  if(String(refund.status)!=='REQUESTED')throw new Error('Refund request is not pending execution');

  const {data:payment,error:paymentError}=await service.from('payment_intents').select('*')
    .eq('organization_id',input.organizationId).eq('id',refund.payment_intent_id).maybeSingle();
  if(paymentError||!payment)throw new Error('Payment Intent not found');
  const provider=String(payment.provider||'') as OmanPaymentProvider;
  if(provider!=='TAP'&&provider!=='THAWANI')throw new Error('Refund is not bound to an Oman payment provider');

  const {data:link,error:linkError}=await service.from('payment_links').select('provider_link_id')
    .eq('organization_id',input.organizationId).eq('payment_intent_id',payment.id).eq('provider',provider)
    .order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(linkError||!link)throw new Error('Provider transaction reference is unavailable');
  const cfg=await loadOmanProviderConfig(input.organizationId,provider);
  const amount=Number(refund.amount);
  const requestKeyBase='payment-oman-refund:'+provider+':'+input.refundId;

  try{
    if(provider==='TAP'){
      const raw=await createTapRefund({
        secretKey:cfg.secretKey,chargeId:String(link.provider_link_id),amount,reason:String(refund.reason),
        organizationId:input.organizationId,paymentIntentId:String(payment.id),refundId:input.refundId,
        postUrl:origin()+'/api/payments/oman/tap/webhook',
      });
      const mapped=mapTapEvent(raw);
      const providerId=String(raw.id??'');
      if(mapped&&providerId){
        const {error:recordError}=await service.rpc('record_payment_provider_event_v1',{
          p_organization_id:input.organizationId,p_payment_intent_id:payment.id,p_refund_id:input.refundId,
          p_provider:'TAP',p_provider_event_id:('tap:'+providerId+':'+String(raw.status??'')).slice(0,240),
          p_event_kind:mapped.kind,p_provider_reference:providerId,p_amount:mapped.kind==='REFUNDED'?amount:0,
          p_currency:'OMR',p_authenticity:'EXPLICIT_RECONCILIATION',
          p_raw_evidence:raw,p_normalized_evidence:{providerReadback:true,status:raw.status,refundId:providerId},
          p_request_key:(requestKeyBase+':'+String(raw.status??'')).slice(0,240),
        });
        rpcError('Tap Refund reconciliation failed',recordError);
      }
      return {provider,status:String(raw.status??'PENDING'),providerReference:providerId||null};
    }

    const remaining=Number(payment.captured_total)-Number(payment.refunded_total);
    if(Math.abs(amount-remaining)>0.0001)throw new Error('Thawani adapter currently requires a full remaining refund');
    const outcome=await createThawaniRefund({
      mode:cfg.mode,secretKey:cfg.secretKey,sessionId:String(link.provider_link_id),reason:String(refund.reason),
    });
    const normalized=normalizeThawaniRefund(outcome.refund);
    const status=normalized.status;
    const finalSuccess=['refunded','succeeded','success'].includes(status);
    const finalFailure=['failed','rejected','declined'].includes(status);
    if((finalSuccess||finalFailure)&&normalized.refundId){
      const {error:recordError}=await service.rpc('record_payment_provider_event_v1',{
        p_organization_id:input.organizationId,p_payment_intent_id:payment.id,p_refund_id:input.refundId,
        p_provider:'THAWANI',p_provider_event_id:('thawani:refund:'+normalized.refundId+':'+status).slice(0,240),
        p_event_kind:finalSuccess?'REFUNDED':'REFUND_FAILED',p_provider_reference:normalized.refundId,
        p_amount:finalSuccess?amount:0,p_currency:'OMR',p_authenticity:'EXPLICIT_RECONCILIATION',
        p_raw_evidence:outcome.refund,
        p_normalized_evidence:{providerReadback:true,status,refundId:normalized.refundId,paymentId:outcome.paymentId},
        p_request_key:(requestKeyBase+':'+status).slice(0,240),
      });
      rpcError('Thawani Refund reconciliation failed',recordError);
    }
    return {provider,status:status||'pending',providerReference:normalized.refundId||null};
  }catch(error){
    if(error instanceof OmanProviderError&&error.ambiguous){
      const {error:markError}=await service.rpc('mark_payment_intent_reconciliation_required_v1',{
        p_organization_id:input.organizationId,p_payment_intent_id:payment.id,p_provider:provider,
        p_reason:'Ambiguous provider response while executing Refund',
        p_evidence:{operation:'REFUND',refundId:input.refundId,provider,networkOutcome:'AMBIGUOUS'},
        p_request_key:(requestKeyBase+':ambiguous:'+crypto.randomUUID()).slice(0,240),
      });
      rpcError('Refund reconciliation marker failed',markError);
    }
    throw error;
  }
}
