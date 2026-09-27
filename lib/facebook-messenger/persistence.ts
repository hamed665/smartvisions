import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { NormalizedMessengerEvent } from './webhook';
import { resolveMetaMessengerDestination } from './tenant-routing';
import { projectMatchedMessengerInbound, resolveMessengerInboundBusiness } from './lifecycle';
import { reconcileMessengerReceipt } from './reconciliation';
function service(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL;const k=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!u||!k)throw new Error('Supabase service configuration is missing');return createClient(u,k,{auth:{persistSession:false,autoRefreshToken:false}})}
export async function persistMessengerWebhookEvents(events:NormalizedMessengerEvent[]){
 if(events.length===0)return{inserted:0,routed:0};
 const db=service();let inserted=0;
 for(const event of events){
  const route=await resolveMetaMessengerDestination({service:db,destinationId:event.destinationId});
  const identity=await resolveMessengerInboundBusiness({service:db,route,event});
  const {error}=await db.from('facebook_messenger_events').upsert({organization_id:route.organizationId,provider_event_id:event.providerEventId,provider_destination_id:event.destinationId,event_type:event.eventType,payload:{...event.payload,senderId:event.senderId??null,occurredAt:event.occurredAt??null,routing:{tenantBusinessId:route.tenantBusinessId,branchId:route.branchId,bindingId:route.bindingId,integrationConnectionId:route.integrationConnectionId},canonicalIdentity:identity}},{onConflict:'organization_id,provider_event_id,event_type',ignoreDuplicates:true});
  if(error)throw new Error(`Messenger event persistence failed: ${error.message}`);inserted+=1;
  await reconcileMessengerReceipt({service:db,route,event});
  if(identity.status==='MATCH')await projectMatchedMessengerInbound({service:db,route,event,identity});
 }
 return{inserted,routed:events.length};
}
