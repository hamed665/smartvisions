'use server';

import {revalidatePath} from 'next/cache';

import {getCurrentOrganization} from '@/lib/supabase/org';
import {createSupabaseServiceClient} from '@/lib/supabase/service';
import {extractKnowledgeFile,fetchWebsiteKnowledge} from '@/lib/knowledge/ingestion';

const MANAGER_ROLES=new Set(['OWNER','ADMIN']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function maybeUuid(value:string){return value&&UUID.test(value)?value:null;}
function requestKey(prefix:string){return (prefix+':'+crypto.randomUUID()).slice(0,200);}

async function managerContext(){
  const current=await getCurrentOrganization();
  if(!current.userId||!MANAGER_ROLES.has(String(current.role)))throw new Error('Owner/Admin permission required');
  return current;
}

async function sourceRow(service:ReturnType<typeof createSupabaseServiceClient>,organizationId:string,sourceId:string){
  if(!UUID.test(sourceId))throw new Error('Knowledge Source is invalid');
  const {data,error}=await service.from('knowledge_sources')
    .select('id,organization_id,source_key,source_type,title,source_locator,status,version')
    .eq('organization_id',organizationId).eq('id',sourceId).maybeSingle();
  if(error||!data)throw new Error('Knowledge Source was not found');
  if(data.status!=='ACTIVE')throw new Error('Knowledge Source is not active');
  return data;
}

export async function configureKnowledgeSourceV2(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const expectedRaw=field(fd,'expected_version');
  const refreshPolicy=field(fd,'refresh_policy').toUpperCase()||'MANUAL';
  const intervalRaw=field(fd,'refresh_interval_minutes');
  const scopeType=field(fd,'scope_type').toUpperCase()||'ORGANIZATION';
  const {error}=await service.rpc('configure_knowledge_source_v2',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_source_key:field(fd,'source_key').toLowerCase(),
    p_source_type:field(fd,'source_type').toUpperCase(),
    p_title:field(fd,'title'),
    p_source_locator:field(fd,'source_locator')||null,
    p_scope_type:scopeType,
    p_tenant_business_id:scopeType==='BUSINESS'?maybeUuid(field(fd,'tenant_business_id')):null,
    p_branch_id:scopeType==='BRANCH'?maybeUuid(field(fd,'branch_id')):null,
    p_sensitivity:field(fd,'sensitivity').toUpperCase()||'INTERNAL',
    p_status:field(fd,'status').toUpperCase()||'ACTIVE',
    p_refresh_policy:refreshPolicy,
    p_refresh_interval_minutes:refreshPolicy==='INTERVAL'?Number(intervalRaw):null,
    p_metadata:{configuredFrom:'BUSINESS_WEB'},
    p_expected_version:expectedRaw?Number(expectedRaw):null,
    p_request_key:requestKey('knowledge-source-config'),
  });
  if(error)throw new Error('Knowledge Source configuration failed: '+error.message);
  revalidatePath('/knowledge');
}

async function stageSourcePayload(input:{
  sourceId:string;
  knowledgeKey:string;
  payload:Record<string,unknown>;
  provenance:Record<string,unknown>;
  etag?:string;
  lastModified?:string;
}){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const source=await sourceRow(service,current.organizationId,input.sourceId);
  const {error}=await service.rpc('stage_knowledge_version_v2',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_source_id:source.id,
    p_knowledge_key:input.knowledgeKey.toLowerCase(),
    p_payload:input.payload,
    p_provenance:input.provenance,
    p_expected_source_version:Number(source.version),
    p_etag:input.etag??null,
    p_last_modified:input.lastModified??null,
    p_request_key:requestKey('knowledge-stage'),
  });
  if(error)throw new Error('Knowledge ingestion failed: '+error.message);
  revalidatePath('/knowledge');
}

export async function stageKnowledgeTextV2(fd:FormData){
  const content=field(fd,'content');
  if(content.length<10)throw new Error('Knowledge content is too short');
  await stageSourcePayload({
    sourceId:field(fd,'source_id'),
    knowledgeKey:field(fd,'knowledge_key'),
    payload:{text:content},
    provenance:{ingestion:'OPERATOR_TEXT',observedAt:new Date().toISOString()},
  });
}

export async function stageKnowledgeWebsiteV2(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const source=await sourceRow(service,current.organizationId,field(fd,'source_id'));
  if(source.source_type!=='WEBSITE')throw new Error('Selected Knowledge Source is not a website');
  if(!source.source_locator)throw new Error('Website Knowledge Source has no URL');
  const extracted=await fetchWebsiteKnowledge(source.source_locator);
  const {error}=await service.rpc('stage_knowledge_version_v2',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_source_id:source.id,
    p_knowledge_key:field(fd,'knowledge_key').toLowerCase(),
    p_payload:{
      text:extracted.text,
      title:extracted.title??source.title,
    },
    p_provenance:{
      ingestion:extracted.extraction,
      contentType:extracted.contentType,
      finalUrl:extracted.sourceLocator,
      observedAt:new Date().toISOString(),
      trust:'UNTRUSTED_EXTERNAL_REQUIRES_APPROVAL',
    },
    p_expected_source_version:Number(source.version),
    p_etag:extracted.etag??null,
    p_last_modified:extracted.lastModified??null,
    p_request_key:requestKey('knowledge-website-stage'),
  });
  if(error)throw new Error('Website Knowledge ingestion failed: '+error.message);
  revalidatePath('/knowledge');
}

export async function stageKnowledgeFileV2(fd:FormData){
  const file=fd.get('file');
  if(!(file instanceof File))throw new Error('Knowledge file is required');
  const extracted=await extractKnowledgeFile(file);
  await stageSourcePayload({
    sourceId:field(fd,'source_id'),
    knowledgeKey:field(fd,'knowledge_key'),
    payload:{text:extracted.text,title:file.name},
    provenance:{
      ingestion:extracted.extraction,
      contentType:extracted.contentType,
      fileName:file.name,
      fileSize:file.size,
      observedAt:new Date().toISOString(),
      trust:'UNTRUSTED_FILE_REQUIRES_APPROVAL',
    },
  });
}

export async function stageCanonicalCatalogKnowledgeV2(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const source=await sourceRow(service,current.organizationId,field(fd,'source_id'));
  if(source.source_type!=='CATALOG')throw new Error('Selected Knowledge Source is not a Catalog source');

  const [servicesResult,profilesResult,productsResult,variantsResult]=await Promise.all([
    service.from('services').select('id,name,enabled,config').eq('organization_id',current.organizationId).eq('enabled',true),
    service.from('catalog_service_profiles').select('service_id,description,warranty_text,availability_mode,version').eq('organization_id',current.organizationId),
    service.from('catalog_products').select('id,tenant_business_id,sku,name,description,status,warranty_text,availability_mode,version').eq('organization_id',current.organizationId).eq('status','ACTIVE'),
    service.from('catalog_product_variants').select('id,product_id,sku,name,attributes,status,version').eq('organization_id',current.organizationId).eq('status','ACTIVE'),
  ]);
  const firstError=[servicesResult,profilesResult,productsResult,variantsResult].map(r=>r.error).find(Boolean);
  if(firstError)throw new Error('Canonical Catalog read failed: '+firstError.message);

  const serviceProfiles=new Map((profilesResult.data??[]).map(r=>[String(r.service_id),r]));
  const services=(servicesResult.data??[]).map(row=>({
    id:row.id,name:row.name,
    description:serviceProfiles.get(String(row.id))?.description??null,
    warranty:serviceProfiles.get(String(row.id))?.warranty_text??null,
    availabilityMode:serviceProfiles.get(String(row.id))?.availability_mode??null,
    version:serviceProfiles.get(String(row.id))?.version??null,
  }));
  const variantsByProduct=new Map<string,unknown[]>();
  for(const row of variantsResult.data??[]){
    const key=String(row.product_id);
    variantsByProduct.set(key,[...(variantsByProduct.get(key)??[]),{
      id:row.id,sku:row.sku,name:row.name,attributes:row.attributes,version:row.version,
    }]);
  }
  const products=(productsResult.data??[]).map(row=>({
    id:row.id,businessId:row.tenant_business_id,sku:row.sku,name:row.name,
    description:row.description,warranty:row.warranty_text,
    availabilityMode:row.availability_mode,version:row.version,
    variants:variantsByProduct.get(String(row.id))??[],
  }));
  const text=[
    ...services.map(item=>`Service: ${item.name}. ${item.description??''} ${item.warranty??''}`.trim()),
    ...products.map(item=>`Product: ${item.name}. ${item.description??''} ${item.warranty??''}`.trim()),
  ].join('\n');

  const {error}=await service.rpc('stage_knowledge_version_v2',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_source_id:source.id,
    p_knowledge_key:field(fd,'knowledge_key').toLowerCase(),
    p_payload:{
      text,
      catalogSnapshot:{services,products},
      authority:'CATALOG-V2',
      excludedAuthorities:['PRICE','INVENTORY','PAYMENT'],
    },
    p_provenance:{
      ingestion:'CANONICAL_CATALOG_DERIVATION',
      sourceTables:['services','catalog_service_profiles','catalog_products','catalog_product_variants'],
      observedAt:new Date().toISOString(),
      note:'Descriptive retrieval snapshot only. Price/inventory/payment truth must be re-read from canonical authorities at execution.',
    },
    p_expected_source_version:Number(source.version),
    p_etag:null,p_last_modified:null,
    p_request_key:requestKey('knowledge-catalog-stage'),
  });
  if(error)throw new Error('Catalog Knowledge ingestion failed: '+error.message);
  revalidatePath('/knowledge');
}

export async function approveKnowledgeVersionV2(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const versionId=field(fd,'version_id');
  if(!UUID.test(versionId))throw new Error('Knowledge version is invalid');
  const {error}=await service.rpc('approve_knowledge_version_v2',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_version_id:versionId,
    p_request_key:requestKey('knowledge-approve'),
  });
  if(error)throw new Error('Knowledge approval failed: '+error.message);
  revalidatePath('/knowledge');
}

export async function rejectKnowledgeVersionV2(fd:FormData){
  const current=await managerContext();
  const service=createSupabaseServiceClient();
  const versionId=field(fd,'version_id');
  if(!UUID.test(versionId))throw new Error('Knowledge version is invalid');
  const {error}=await service.rpc('reject_knowledge_version_v2',{
    p_organization_id:current.organizationId,
    p_actor_user_id:current.userId,
    p_version_id:versionId,
    p_reason:field(fd,'reason'),
    p_request_key:requestKey('knowledge-reject'),
  });
  if(error)throw new Error('Knowledge rejection failed: '+error.message);
  revalidatePath('/knowledge');
}
