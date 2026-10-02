import {NextResponse} from 'next/server';

import {createSupabaseServiceClient} from '@/lib/supabase/service';
import {reconcileThawaniPayment} from '@/lib/payments/oman/runtime';

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

export async function GET(request:Request){
  const url=new URL(request.url);
  const paymentIntentId=url.searchParams.get('payment_intent_id')?.trim()||'';
  if(!paymentIntentId)return NextResponse.json({error:'payment_intent_id required'},{status:400});
  let target:{organizationId:string;paymentIntentId:string}|null=null;
  try{
    target=await byIntent(paymentIntentId);
    await reconcileThawaniPayment(target);
    return NextResponse.redirect(new URL('/payments/'+paymentIntentId+'?reconciled=1',url.origin));
  }catch{
    return NextResponse.redirect(new URL('/payments/'+paymentIntentId+'?reconciled=0',url.origin));
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
    const result=await reconcileThawaniPayment({...target,sessionId});
    return NextResponse.json({accepted:true,reconciled:true,settled:result.settled});
  }catch{
    return NextResponse.json({accepted:true,reconciled:false,reason:'SERVER_READBACK_REQUIRED_OR_FAILED'},{status:202});
  }
}
