import type { SupabaseClient } from '@supabase/supabase-js';
export type MetaMessengerRoute={organizationId:string;tenantBusinessId:string;branchId:string|null;bindingId:string;integrationConnectionId:string;destinationId:string;providerAccountId:string|null};
export async function resolveMetaMessengerDestination(input:{service:SupabaseClient;destinationId:string}):Promise<MetaMessengerRoute>{
 const {data,error}=await input.service.rpc('resolve_meta_facebook_messenger_destination',{p_destination_id:input.destinationId});
 if(error)throw new Error(`Messenger destination routing failed: ${error.message}`);
 if(!Array.isArray(data)||data.length!==1)throw new Error('Messenger destination routing did not resolve exactly one tenant binding');
 const r=data[0] as Record<string,unknown>;return{organizationId:String(r.organization_id),tenantBusinessId:String(r.tenant_business_id),branchId:r.branch_id?String(r.branch_id):null,bindingId:String(r.binding_id),integrationConnectionId:String(r.integration_connection_id),destinationId:String(r.destination_id),providerAccountId:r.provider_account_id?String(r.provider_account_id):null};
}
