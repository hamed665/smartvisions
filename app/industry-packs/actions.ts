'use server';

import {revalidatePath} from 'next/cache';

import {getCurrentOrganization} from '@/lib/supabase/org';
import {createSupabaseServiceClient} from '@/lib/supabase/service';

const MANAGER_ROLES=new Set(['OWNER','ADMIN']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}

async function managerContext(){
  const current=await getCurrentOrganization();
  if(!current.userId||!MANAGER_ROLES.has(String(current.role)))throw new Error('Owner/Admin permission required');
  return current;
}

function businessId(fd:FormData){
  const value=field(fd,'tenant_business_id');
  if(!UUID.test(value))throw new Error('Industry Pack Business is invalid');
  return value;
}

export async function activateIndustryPackV1(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const tenantBusinessId=businessId(fd);
  const packKey=field(fd,'pack_key').toLowerCase();
  const packVersion=Number(field(fd,'pack_version'));
  const expectedRaw=field(fd,'expected_version');
  const expectedVersion=expectedRaw?Number(expectedRaw):null;

  if(!/^[a-z][a-z0-9_]{1,63}$/.test(packKey))throw new Error('Industry Pack key is invalid');
  if(!Number.isInteger(packVersion)||packVersion<1)throw new Error('Industry Pack version is invalid');
  if(expectedVersion!==null&&(!Number.isInteger(expectedVersion)||expectedVersion<1)){
    throw new Error('Industry Pack expected version is invalid');
  }

  const {error}=await service.rpc('activate_industry_pack_v1',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_tenant_business_id:tenantBusinessId,
    p_pack_key:packKey,
    p_pack_version:packVersion,
    p_expected_version:expectedVersion,
    p_request_key:('industry-pack-activate:'+crypto.randomUUID()).slice(0,200),
  });
  if(error)throw new Error('Industry Pack activation failed: '+error.message);
  revalidatePath('/industry-packs');
  revalidatePath('/business-twin');
}

export async function deactivateIndustryPackV1(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const tenantBusinessId=businessId(fd);
  const expectedVersion=Number(field(fd,'expected_version'));
  if(!Number.isInteger(expectedVersion)||expectedVersion<1){
    throw new Error('Industry Pack expected version is invalid');
  }

  const {error}=await service.rpc('deactivate_industry_pack_v1',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_tenant_business_id:tenantBusinessId,
    p_expected_version:expectedVersion,
    p_request_key:('industry-pack-deactivate:'+crypto.randomUUID()).slice(0,200),
  });
  if(error)throw new Error('Industry Pack deactivation failed: '+error.message);
  revalidatePath('/industry-packs');
  revalidatePath('/business-twin');
}
