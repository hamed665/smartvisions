import type { SupabaseClient } from '@supabase/supabase-js';
export type MetaMessengerRoute={organizationId:string;tenantBusinessId:string;branchId:string|null;bindingId:string;integrationConnectionId:string;destinationId:string;providerAccountId:string|null};
export async function resolveMetaMessengerDestination(input:{service:SupabaseClient;destinationId:string}):Promise<MetaMessengerRoute>{
 const {data,error}=await input.service.rpc('resolve_meta_facebook_messenger_destination',{p_destination_id:input.destinationId});
 if(error)throw new Error(`Messenger destination routing failed: ${error.message}`);
 if(!Array.isArray(data)||data.length!==1)throw new Error('Messenger destination routing did not resolve exactly one tenant binding');
 const r=data[0] as Record<string,unknown>;return{organizationId:String(r.organization_id),tenantBusinessId:String(r.tenant_business_id),branchId:r.branch_id?String(r.branch_id):null,bindingId:String(r.binding_id),integrationConnectionId:String(r.integration_connection_id),destinationId:String(r.destination_id),providerAccountId:r.provider_account_id?String(r.provider_account_id):null};
}

import { MetaMessengerProvider } from './provider';
type CredentialRow={binding_id:string;integration_connection_id:string;destination_id:string;provider_account_id:string|null;access_token:string};
export async function resolveMetaMessengerProvider(input:{service:SupabaseClient;organizationId:string;tenantBusinessId:string;branchId?:string|null}){const {data,error}=await input.service.rpc('resolve_meta_facebook_messenger_credential',{p_organization_id:input.organizationId,p_tenant_business_id:input.tenantBusinessId,p_branch_id:input.branchId??null});if(error)throw new Error(`Meta Messenger credential resolution failed: ${error.message}`);if(!Array.isArray(data)||data.length!==1)throw new Error('Meta Messenger tenant credential is unavailable');const r=data[0] as CredentialRow;if(!r.access_token||!r.destination_id)throw new Error('Meta Messenger tenant credential is unavailable');return{bindingId:r.binding_id,integrationConnectionId:r.integration_connection_id,destinationId:r.destination_id,providerAccountId:r.provider_account_id,provider:new MetaMessengerProvider({token:r.access_token,pageId:r.destination_id})}}
