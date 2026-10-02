import {NextResponse} from 'next/server';

import {createSupabaseServiceClient} from '@/lib/supabase/service';
import {reconcilePaymentWithProvider} from '@/lib/payments/providers/runtime';

type JsonRecord=Record<string,unknown>;
function child(value:unknown):JsonRecord{return value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};}
function text(value:unknown){return typeof value==='string'?value.trim():'';}

async function byIntent(paymentIntentId:string){
  const service=createSupabaseServiceClient();
  const {data,error}=await service.from('payment_intents').select('id,organization_id')
    .eq('id',paymentIntentId).limit(2);
  if(error||!data||data.length!==1)throw new Error('Payment Intent reconciliation target is not unique');
  return {organizationId:String(data[0].organization_id),paymentIntentId:String(data[0].id)};
}

async function bySession(sessionId:string){
  const service=createSupabaseServiceClient();
  const {data,error}=await service.from('payment_links').select('organization_id,payment_intent_id')
    .eq('provider','THAWANI').eq('provider_link_id',sessionId).limit(2);
  if(error||!data||data.length!==1)throw new Error('Thawani session reconciliation target is not unique');
  return {organizationId:String(data[0].organization_id),paymentIntentId:String(data[0].payment_intent_id)};
}

function customerResponse(settled:boolean){
  const title=settled?'Payment confirmed':'Payment status pending';
  const detail=settled
    ?'Your payment has been confirmed. You may close this page.'
    :'We could not confirm the payment yet. If money was deducted, the merchant can reconcile it safely from the provider.';
  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title></head><body><main style="max-width:560px;margin:12vh auto;padding:24px;font-family:system-ui,sans-serif"><h1>'+title+'</h1><p>'+detail+'</p><p>Smart Visions</p></main></body></html>',
    {status:settled?200:202,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}
  );
}

export async function GET(request:Request){
  const url=new URL(request.url);
  const paymentIntentId=url.searchParams.get('payment_intent_id')?.trim()||'';
  if(!paymentIntentId)return NextResponse.json({error:'payment_intent_id required'},{status:400});
  try{
    const target=await byIntent(paymentIntentId);
    const result=await reconcilePaymentWithProvider({...target,provider:'THAWANI'});
    return customerResponse(result.settled);
  }catch{
    return customerResponse(false);
  }
}

export async function POST(request:Request){
  let payload:JsonRecord;
  try{payload=await request.json() as JsonRecord;}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const data=child(payload.data);
  const sessionId=text(data.session_id)||text(payload.session_id);
  if(!sessionId)return NextResponse.json({accepted:true,reconciled:false,reason:'NO_SESSION_ID'},{status:202});

  try{
    const target=await bySession(sessionId);
    const result=await reconcilePaymentWithProvider({...target,provider:'THAWANI',providerReference:sessionId});
    return NextResponse.json({accepted:true,reconciled:true,settled:result.settled});
  }catch{
    return NextResponse.json({accepted:true,reconciled:false,reason:'SERVER_READBACK_REQUIRED_OR_FAILED'},{status:202});
  }
}
