import {NextResponse} from 'next/server';

import {createSupabaseServiceClient} from '@/lib/supabase/service';
import {loadOmanProviderConfig} from '@/lib/payments/oman/config';
import {mapTapEvent,verifyTapHashstring} from '@/lib/payments/oman/provider';

type JsonRecord=Record<string,unknown>;
function child(value:unknown):JsonRecord{return value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};}
function text(value:unknown){return typeof value==='string'?value.trim():String(value??'').trim();}

export async function POST(request:Request){
  const raw=await request.text();
  let payload:JsonRecord;
  try{payload=JSON.parse(raw) as JsonRecord;}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}

  const metadata=child(payload.metadata);
  const organizationId=text(metadata.sv_org_id);
  const paymentIntentId=text(metadata.sv_payment_intent_id);
  const refundId=text(metadata.sv_refund_id)||null;
  if(!organizationId||!paymentIntentId)return NextResponse.json({error:'Missing Smart Visions payment metadata'},{status:400});

  let cfg;
  try{cfg=await loadOmanProviderConfig(organizationId,'TAP');}
  catch{return NextResponse.json({error:'Tap provider is not configured'},{status:401});}

  const posted=request.headers.get('hashstring');
  if(!verifyTapHashstring(payload,posted,cfg.secretKey)){
    return NextResponse.json({error:'Invalid Tap webhook hashstring'},{status:401});
  }

  const mapped=mapTapEvent(payload);
  if(!mapped)return NextResponse.json({accepted:true,settlementMutation:false});

  const id=text(payload.id);
  const status=text(payload.status).toUpperCase();
  const transaction=child(payload.transaction);
  const created=text(transaction.created)||text(payload.created);
  if(!id)return NextResponse.json({error:'Tap event ID missing'},{status:400});
  const providerEventId=('tap:'+id+':'+status+':'+created).slice(0,240);
  const reference=child(payload.reference);
  const providerReference=text(reference.gateway)||text(reference.payment)||id;
  const currency=text(payload.currency).toUpperCase();

  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('record_payment_provider_event_v1',{
    p_organization_id:organizationId,
    p_payment_intent_id:paymentIntentId,
    p_refund_id:refundId,
    p_provider:'TAP',
    p_provider_event_id:providerEventId,
    p_event_kind:mapped.kind,
    p_provider_reference:providerReference,
    p_amount:mapped.amount,
    p_currency:currency,
    p_authenticity:'VERIFIED_WEBHOOK',
    p_raw_evidence:payload,
    p_normalized_evidence:{
      tapId:id,status,object:text(payload.object),hashstringVerified:true,providerReference,
    },
    p_request_key:('payment-oman-tap-webhook:'+providerEventId).slice(0,240),
  });
  if(error)return NextResponse.json({error:'Tap settlement ingestion failed'},{status:503});
  return NextResponse.json({accepted:true,settlementMutation:true});
}
