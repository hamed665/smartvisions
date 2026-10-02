import 'server-only';

import {createSupabaseServiceClient} from '@/lib/supabase/service';

export type OmanPaymentProvider='TAP'|'THAWANI';
export type OmanProviderMode='TEST'|'LIVE';

export type OmanProviderRuntimeConfig={
  provider:OmanPaymentProvider;
  mode:OmanProviderMode;
  status:string;
  secretKey:string;
  publishableKey?:string;
  merchantId?:string;
};

function asProvider(value:string):OmanPaymentProvider{
  const provider=value.toUpperCase();
  if(provider!=='TAP'&&provider!=='THAWANI')throw new Error('Unsupported Oman payment provider');
  return provider;
}

async function readSecret(ref:string){
  const service=createSupabaseServiceClient();
  const {data,error}=await service.rpc('integration_vault_read_secret',{p_secret_ref:ref});
  if(error||typeof data!=='string'||!data)throw new Error('Payment provider Vault secret is unavailable');
  return data;
}

export async function loadOmanProviderConfig(organizationId:string,providerInput:string):Promise<OmanProviderRuntimeConfig>{
  const provider=asProvider(providerInput);
  const service=createSupabaseServiceClient();
  const {data,error}=await service.from('integration_connections')
    .select('provider,enabled,status,config')
    .eq('organization_id',organizationId)
    .eq('provider',provider)
    .eq('channel','PAYMENT')
    .maybeSingle();
  if(error)throw new Error('Payment provider configuration lookup failed: '+error.message);
  if(!data||!data.enabled)throw new Error(provider+' payment provider is not configured');
  if(!['READY','CONNECTED','DEGRADED'].includes(String(data.status)))throw new Error(provider+' payment provider is not ready');

  const cfg=(data.config??{}) as Record<string,unknown>;
  const mode=String(cfg.mode??'').toUpperCase();
  if(mode!=='TEST'&&mode!=='LIVE')throw new Error(provider+' payment provider mode is invalid');
  if(String(cfg.currency??'')!=='OMR')throw new Error(provider+' payment provider must use OMR');
  const secretRef=String(cfg.secret_key_ref??'');
  if(!secretRef)throw new Error(provider+' secret key reference is missing');

  const secretKey=await readSecret(secretRef);
  let publishableKey:string|undefined;
  if(provider==='THAWANI'){
    const publishableRef=String(cfg.publishable_key_ref??'');
    if(!publishableRef)throw new Error('Thawani publishable key reference is missing');
    publishableKey=await readSecret(publishableRef);
  }
  const merchantId=provider==='TAP'?String(cfg.merchant_id??''):undefined;
  if(provider==='TAP'&&!merchantId)throw new Error('Tap merchant ID is missing');

  return {provider,mode,status:String(data.status),secretKey,publishableKey,merchantId};
}

export async function recordOmanProviderHealth(input:{
  organizationId:string;
  provider:OmanPaymentProvider;
  healthy:boolean;
  detail:string;
  evidence:Record<string,unknown>;
  requestKey:string;
}){
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('record_oman_payment_provider_health_v1',{
    p_organization_id:input.organizationId,
    p_provider:input.provider,
    p_healthy:input.healthy,
    p_detail:input.detail,
    p_evidence:input.evidence,
    p_request_key:input.requestKey,
  });
  if(error)throw new Error('Provider health evidence failed: '+error.message);
}
