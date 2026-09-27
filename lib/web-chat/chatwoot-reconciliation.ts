import type { SupabaseClient } from '@supabase/supabase-js';

type RpcRow={
  handled:boolean;
  outcome:string;
  message_id:string|null;
  event_status:string;
};

export async function reconcileWebChatChatwootOutboundEvent(
  service:SupabaseClient,
  eventId:string,
){
  const {data,error}=await service.rpc('reconcile_web_chat_chatwoot_outbound_event',{p_event_id:eventId});
  if(error) throw new Error(`Web Chat Chatwoot outbound reconciliation failed: ${error.message}`);
  const row=(Array.isArray(data)?data[0]:data) as RpcRow|undefined;
  if(!row||typeof row.handled!=='boolean'||typeof row.outcome!=='string'){
    throw new Error('Web Chat Chatwoot outbound reconciliation returned an invalid result');
  }
  return {
    handled:row.handled,
    outcome:row.outcome,
    messageId:row.message_id?String(row.message_id):null,
    eventStatus:String(row.event_status??''),
  };
}
