'use server';

import {revalidatePath} from 'next/cache';

import {getCurrentOrganization} from '@/lib/supabase/org';
import {createSupabaseServiceClient} from '@/lib/supabase/service';

const MANAGER_ROLES=new Set(['OWNER','ADMIN']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}

function parseTarget(value:string){
  if(value==='ORGANIZATION')return {scopeType:'ORGANIZATION',brandId:null,businessId:null,branchId:null};
  const [scope,id]=value.split(':',2);
  if(!UUID.test(id??''))throw new Error('Business Twin target is invalid');
  if(scope==='BRAND')return {scopeType:'BRAND',brandId:id,businessId:null,branchId:null};
  if(scope==='BUSINESS')return {scopeType:'BUSINESS',brandId:null,businessId:id,branchId:null};
  if(scope==='BRANCH')return {scopeType:'BRANCH',brandId:null,businessId:null,branchId:id};
  throw new Error('Business Twin target is invalid');
}

function parseObjectJson(value:string){
  let parsed:unknown;
  try{parsed=JSON.parse(value);}catch{throw new Error('Configuration value must be valid JSON');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed as Record<string,unknown>).length===0){
    throw new Error('Configuration value must be a non-empty JSON object');
  }
  return parsed as Record<string,unknown>;
}

async function managerContext(){
  const current=await getCurrentOrganization();
  if(!current.userId||!MANAGER_ROLES.has(String(current.role)))throw new Error('Owner/Admin permission required');
  return current;
}

export async function publishBusinessTwinV1(){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const {error}=await service.rpc('publish_business_twin_v2',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_request_key:('business-twin-publish:'+crypto.randomUUID()).slice(0,200),
  });
  if(error)throw new Error('Business Twin publish failed: '+error.message);
  revalidatePath('/business-twin');
}

export async function setBusinessTwinConfigurationV1(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const target=parseTarget(field(fd,'target'));
  const expectedRaw=field(fd,'expected_version');
  const expectedVersion=expectedRaw?Number(expectedRaw):null;
  if(expectedVersion!==null&&(!Number.isInteger(expectedVersion)||expectedVersion<1)){
    throw new Error('Expected version is invalid');
  }
  const {error}=await service.rpc('set_business_twin_configuration_v1',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_scope_type:target.scopeType,
    p_brand_id:target.brandId,
    p_tenant_business_id:target.businessId,
    p_branch_id:target.branchId,
    p_config_key:field(fd,'config_key'),
    p_config_value:parseObjectJson(field(fd,'config_value')),
    p_expected_version:expectedVersion,
    p_request_key:('business-twin-config:'+crypto.randomUUID()).slice(0,200),
  });
  if(error)throw new Error('Business Twin configuration failed: '+error.message);
  revalidatePath('/business-twin');
}

export async function deleteBusinessTwinConfigurationV1(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const configurationId=field(fd,'configuration_id');
  const expectedVersion=Number(field(fd,'expected_version'));
  if(!UUID.test(configurationId)||!Number.isInteger(expectedVersion)||expectedVersion<1){
    throw new Error('Business Twin configuration delete payload is invalid');
  }
  const {error}=await service.rpc('delete_business_twin_configuration_v1',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_configuration_id:configurationId,
    p_expected_version:expectedVersion,
    p_request_key:('business-twin-config-delete:'+crypto.randomUUID()).slice(0,200),
  });
  if(error)throw new Error('Business Twin configuration delete failed: '+error.message);
  revalidatePath('/business-twin');
}
