'use server';

import {revalidatePath} from 'next/cache';

import {getCurrentOrganization} from '@/lib/supabase/org';
import {createSupabaseServiceClient} from '@/lib/supabase/service';

const MANAGER_ROLES=new Set(['OWNER','ADMIN']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=new Set(['WORKING','EPISODIC','OPERATIONAL','AGENT_LEARNING']);
const SENSITIVITY=new Set(['PUBLIC','INTERNAL','CONFIDENTIAL']);

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function maybeUuid(value:string){return value&&UUID.test(value)?value:null;}
function requestKey(prefix:string){return (prefix+':'+crypto.randomUUID()).slice(0,200);}
function boundedHours(raw:string,max:number){
  if(!raw)return null;
  const value=Number(raw);
  if(!Number.isFinite(value)||value<=0||value>max)throw new Error('Memory duration is invalid');
  return value;
}
function plusHours(now:Date,hours:number|null){
  return hours===null?null:new Date(now.getTime()+hours*60*60*1000).toISOString();
}

async function managerContext(){
  const current=await getCurrentOrganization();
  if(!current.userId||!MANAGER_ROLES.has(String(current.role)))throw new Error('Owner/Admin permission required');
  return current;
}

async function stageManagerMemory(input:{
  memoryKey:string;
  memoryType:string;
  payload:Record<string,unknown>;
  confidence:number;
  freshHours:number|null;
  expiresHours:number|null;
  sensitivity:string;
  personId:string|null;
  businessId:string|null;
  conversationId:string|null;
  supersedesMemoryId:string|null;
  correctionReason:string|null;
}){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const now=new Date();
  const {error}=await service.rpc('stage_memory_item_v2',{
    p_organization_id:current.organizationId,
    p_actor_type:'USER',
    p_actor_user_id:current.userId,
    p_memory_key:input.memoryKey.toLowerCase(),
    p_memory_type:input.memoryType,
    p_payload:input.payload,
    p_source_type:'OPERATOR',
    p_source_ref:current.userId,
    p_source_evidence:{entryPoint:'BUSINESS_WEB',explicitReviewRequired:true},
    p_confidence:input.confidence,
    p_observed_at:now.toISOString(),
    p_fresh_until:plusHours(now,input.freshHours),
    p_sensitivity:input.sensitivity,
    p_valid_from:now.toISOString(),
    p_valid_until:null,
    p_expires_at:plusHours(now,input.expiresHours),
    p_person_id:input.personId,
    p_business_id:input.businessId,
    p_conversation_id:input.conversationId,
    p_supersedes_memory_id:input.supersedesMemoryId,
    p_correction_reason:input.correctionReason,
    p_request_key:requestKey('memory-stage'),
  });
  if(error)throw new Error('Memory staging failed: '+error.message);
  revalidatePath('/memory');
}

export async function stageMemoryItemV2(fd:FormData){
  const memoryType=field(fd,'memory_type').toUpperCase();
  const sensitivity=field(fd,'sensitivity').toUpperCase()||'INTERNAL';
  const content=field(fd,'content');
  const confidence=Number(field(fd,'confidence')||'0.8');
  const freshHours=boundedHours(field(fd,'fresh_hours'),24*365);
  const expiresHours=boundedHours(field(fd,'expires_hours'),24*365*5);
  if(!TYPES.has(memoryType))throw new Error('Memory type is invalid');
  if(!SENSITIVITY.has(sensitivity))throw new Error('Memory sensitivity is invalid');
  if(content.length<2||content.length>30000)throw new Error('Memory content length is invalid');
  if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new Error('Memory confidence is invalid');
  if(memoryType==='WORKING'&&(expiresHours===null||expiresHours>24*30)){
    throw new Error('Working Memory requires expiry within 30 days');
  }
  await stageManagerMemory({
    memoryKey:field(fd,'memory_key'),
    memoryType,
    payload:{text:content},
    confidence,
    freshHours,
    expiresHours,
    sensitivity,
    personId:maybeUuid(field(fd,'person_id')),
    businessId:maybeUuid(field(fd,'business_id')),
    conversationId:maybeUuid(field(fd,'conversation_id')),
    supersedesMemoryId:null,
    correctionReason:null,
  });
}

export async function correctMemoryItemV2(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const memoryId=field(fd,'memory_id');
  if(!UUID.test(memoryId))throw new Error('Memory item is invalid');
  const {data,error}=await service.from('memory_items')
    .select('id,memory_key,memory_type,confidence,sensitivity,person_id,business_id,conversation_id,expires_at')
    .eq('organization_id',current.organizationId).eq('id',memoryId).eq('state','ACTIVE').maybeSingle();
  if(error||!data)throw new Error('Active Memory item was not found');

  const content=field(fd,'content');
  const reason=field(fd,'reason');
  if(content.length<2||content.length>30000)throw new Error('Memory correction content is invalid');
  if(reason.length<2||reason.length>500)throw new Error('Memory correction reason is invalid');
  const now=Date.now();
  let expiresHours:null|number=null;
  if(data.memory_type==='WORKING'){
    const existing=Date.parse(String(data.expires_at??''));
    expiresHours=Number.isFinite(existing)&&existing>now
      ? Math.min(24*30,Math.max(1,(existing-now)/(60*60*1000)))
      : 24;
  }
  await stageManagerMemory({
    memoryKey:String(data.memory_key),
    memoryType:String(data.memory_type),
    payload:{text:content},
    confidence:Number(data.confidence),
    freshHours:null,
    expiresHours,
    sensitivity:String(data.sensitivity),
    personId:data.person_id?String(data.person_id):null,
    businessId:data.business_id?String(data.business_id):null,
    conversationId:data.conversation_id?String(data.conversation_id):null,
    supersedesMemoryId:String(data.id),
    correctionReason:reason,
  });
}

async function memoryLifecycle(fd:FormData,kind:'approve'|'reject'|'invalidate'){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const memoryId=field(fd,'memory_id');
  if(!UUID.test(memoryId))throw new Error('Memory item is invalid');
  const reason=field(fd,'reason');
  const rpc=kind==='approve'?'approve_memory_item_v2'
    :kind==='reject'?'reject_memory_item_v2':'invalidate_memory_item_v2';
  const args=kind==='approve'
    ? {
      p_organization_id:current.organizationId,
      p_actor_user_id:current.userId,
      p_memory_id:memoryId,
      p_request_key:requestKey('memory-approve'),
    }
    : {
      p_organization_id:current.organizationId,
      p_actor_user_id:current.userId,
      p_memory_id:memoryId,
      p_reason:reason,
      p_request_key:requestKey('memory-'+kind),
    };
  const {error}=await service.rpc(rpc,args);
  if(error)throw new Error('Memory '+kind+' failed: '+error.message);
  revalidatePath('/memory');
}

export async function approveMemoryItemV2(fd:FormData){await memoryLifecycle(fd,'approve');}
export async function rejectMemoryItemV2(fd:FormData){await memoryLifecycle(fd,'reject');}
export async function invalidateMemoryItemV2(fd:FormData){await memoryLifecycle(fd,'invalidate');}
