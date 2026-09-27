import type { SupabaseClient } from '@supabase/supabase-js';

type ClaimRow={
  event_id:string;
  claimed:boolean;
  sync_status:'PENDING'|'PROCESSING'|'ACCEPTED'|'RECONCILIATION_REQUIRED';
  chatwoot_message_id:number|null;
};

export async function claimWebChatChatwootSync(input:{
  service:SupabaseClient;
  organizationId:string;
  sessionId:string;
  providerMessageId:string;
}){
  const {data,error}=await input.service.rpc('claim_web_chat_chatwoot_sync',{
    p_organization_id:input.organizationId,
    p_session_id:input.sessionId,
    p_provider_message_id:input.providerMessageId,
  });
  if(error) throw new Error(`Web Chat Chatwoot sync claim failed: ${error.message}`);
  const row=(Array.isArray(data)?data[0]:data) as ClaimRow|undefined;
  if(!row?.event_id||typeof row.claimed!=='boolean'||!row.sync_status){
    throw new Error('Web Chat Chatwoot sync claim returned an invalid result');
  }
  return{
    eventId:String(row.event_id),
    claimed:row.claimed,
    syncStatus:row.sync_status,
    chatwootMessageId:row.chatwoot_message_id===null?null:Number(row.chatwoot_message_id),
  };
}

export async function finalizeWebChatChatwootSync(input:{
  service:SupabaseClient;
  eventId:string;
  status:'ACCEPTED'|'RECONCILIATION_REQUIRED';
  chatwootMessageId?:number|null;
}){
  const {data,error}=await input.service.rpc('finalize_web_chat_chatwoot_sync',{
    p_event_id:input.eventId,
    p_status:input.status,
    p_chatwoot_message_id:input.chatwootMessageId??null,
  });
  if(error) throw new Error(`Web Chat Chatwoot sync finalization failed: ${error.message}`);
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.sync_status) throw new Error('Web Chat Chatwoot sync finalization returned an invalid result');
  return{
    syncStatus:String(row.sync_status),
    chatwootMessageId:row.chatwoot_message_id===null?null:Number(row.chatwoot_message_id),
  };
}
