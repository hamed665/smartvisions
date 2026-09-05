'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  buildGrowthOpportunity,
  buildGrowthOpportunityPersistenceRow,
} from '@/lib/hunters/business/growth-routing';
import { buildOwnerSocialAssessment, buildPrecisionLeadPersistenceRow, type SocialAssessment } from '@/lib/hunters/business/service-fit';
import { deriveWhatsappCandidate } from '@/lib/hunters/business/selective-enrichment';
import type { DiscoveredBusiness } from '@/lib/hunters/business/types';
import { buildOmanFirstTouchDraft } from '@/lib/outreach/message-plan';
import { queueShadowDraft, shadowProviderMessageId } from '@/lib/outreach/shadow-approval';

type CachedBusiness = {
  id:string; name:string; country_code:string; city:string|null; category:string|null; google_place_id:string|null;
  official_website:string|null; phone:string|null; international_phone:string|null; email:string|null; instagram:string|null; whatsapp:string|null;
  formatted_address:string|null; google_maps_uri:string|null; google_rating:number|null; google_user_rating_count:number|null;
  google_business_status:string|null; google_primary_type_display_name:string|null;
};
type FreshAudit = {
  id:string; business_id:string; audited_at:string|null; title:string|null; has_arabic:boolean|null; has_english:boolean|null;
  has_booking:boolean|null; has_whatsapp:boolean|null; mobile_quality:string|null; seo_quality:string|null; cta_quality:string|null;
  broken_links:number|null; social_links:unknown;
};
type StoredEvidence = { business_id:string; digital_presence_evidence:unknown };
type CountryCatalog = Map<string, Set<string>>;
type GrowthFirstTouchBusiness = {
  name:string|null; country_code:string|null; category:string|null; email:string|null; whatsapp:string|null; phone:string|null; international_phone:string|null;
};
type PromotionOpportunity = {
  id:string; business_id:string; qualification_score:number|null; qualification_reasons:unknown; prospect_tier:string; should_contact:boolean;
  primary_service_id:string|null; message_hooks:unknown; businesses:GrowthFirstTouchBusiness|GrowthFirstTouchBusiness[]|null;
};
type FirstTouchResult = {
  status:'QUEUED'|'DUPLICATE'|'SKIPPED'; reason?:string; channel?:'EMAIL'|'WHATSAPP'; messageId?:string;
};

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const toDiscovered=(row:CachedBusiness):DiscoveredBusiness=>({
  sourceType:'google_places',sourceId:row.google_place_id??row.id,googlePlaceId:row.google_place_id??undefined,name:row.name,
  countryCode:row.country_code,city:row.city??undefined,category:row.category??undefined,officialWebsite:row.official_website??undefined,
  phone:row.phone??undefined,internationalPhone:row.international_phone??undefined,email:row.email??undefined,instagram:row.instagram??undefined,
  whatsapp:row.whatsapp??deriveWhatsappCandidate(row.international_phone,row.phone,row.country_code),formattedAddress:row.formatted_address??undefined,
  googleMapsUri:row.google_maps_uri??undefined,rating:row.google_rating==null?undefined:Number(row.google_rating),
  userRatingCount:row.google_user_rating_count==null?undefined:Number(row.google_user_rating_count),businessStatus:row.google_business_status??undefined,
  primaryTypeDisplayName:row.google_primary_type_display_name??undefined,retrievedAt:new Date().toISOString(),
});
const auditEvidence=(audit:FreshAudit|null|undefined)=>audit?({
  seoQuality:audit.seo_quality,mobileQuality:audit.mobile_quality,ctaQuality:audit.cta_quality,hasArabic:audit.has_arabic,
  hasEnglish:audit.has_english,hasBooking:audit.has_booking,hasWhatsapp:audit.has_whatsapp,brokenLinks:audit.broken_links,
}):null;
const auditInstagram=(audit:FreshAudit|null|undefined)=>{
  const value=String(record(audit?.social_links).instagram??'').trim();
  return /^https?:\/\/(?:www\.)?instagram\.com\//i.test(value)?value:undefined;
};
const withAuditInstagram=(business:DiscoveredBusiness,audit:FreshAudit|null|undefined):DiscoveredBusiness=>({
  ...business,
  instagram:business.instagram??auditInstagram(audit),
});
const socialAssessmentFromEvidence=(value:unknown):SocialAssessment|null=>{
  const social=record(record(value).socialAssessment);
  const quality=String(social.quality??'').toUpperCase();
  if(social.status!=='VERIFIED'||!['WEAK','INACTIVE','GOOD'].includes(quality))return null;
  const source=(social.source as SocialAssessment['source'])??'OTHER';
  const reasons=Array.isArray(social.reasons)?social.reasons.map(String).map(reason=>reason.trim()).filter(Boolean).slice(0,5):[];
  if(source==='OWNER_REVIEW'&&!reasons.some(reason=>reason.length>=8))return null;
  return {status:'VERIFIED',quality:quality as SocialAssessment['quality'],source,assessedAt:String(social.assessedAt??''),reasons};
};
const countryCatalog=(catalog:CountryCatalog,countryCode:string|null|undefined)=>catalog.get(String(countryCode??'').toUpperCase())??new Set<string>();
const normalizeEmail=(value:string|null|undefined)=>String(value??'').trim().toLowerCase();
const normalizePhone=(value:string|null|undefined)=>String(value??'').replace(/\D/g,'');
const allowedFirstTouchLead=(status:string|null|undefined,agentMode:string|null|undefined)=>!['DO_NOT_CONTACT','WON','LOST'].includes(String(status??'').toUpperCase())&&!['HUMAN','PAUSED'].includes(String(agentMode??'').toUpperCase());

async function configuredServiceIdsByCountry(ctx: Awaited<ReturnType<typeof getCurrentOrganization>>):Promise<CountryCatalog> {
  const [{data:services,error:serviceError},{data:prices,error:priceError}]=await Promise.all([
    ctx.supabase.from('services').select('id').eq('organization_id',ctx.organizationId).eq('enabled',true),
    ctx.supabase.from('service_prices').select('service_id,country_code,price').eq('organization_id',ctx.organizationId),
  ]);
  if(serviceError)throw serviceError;if(priceError)throw priceError;
  const enabled=new Set((services??[]).map(row=>String(row.id)));
  const result:CountryCatalog=new Map();
  for(const row of prices??[]){
    const serviceId=String(row.service_id??'');
    const country=String(row.country_code??'').toUpperCase();
    const price=Number(row.price);
    if(!enabled.has(serviceId)||!country||!Number.isFinite(price)||price<0)continue;
    const set=result.get(country)??new Set<string>();set.add(serviceId);result.set(country,set);
  }
  return result;
}

async function queuePromotedLeadFirstTouch(input:{
  ctx:Awaited<ReturnType<typeof getCurrentOrganization>>;
  leadId:string;
  leadStatus:string|null|undefined;
  leadAgentMode:string|null|undefined;
  business:GrowthFirstTouchBusiness;
  serviceId:string;
  messageHooks:unknown;
  mailboxId:string|null;
  shadowMode:boolean;
}):Promise<FirstTouchResult>{
  const {ctx,leadId,business,serviceId,mailboxId}=input;
  if(String(business.country_code??'').toUpperCase()!=='OM')return {status:'SKIPPED',reason:'OMAN_FIRST_TOUCH_ONLY'};
  if(!input.shadowMode)return {status:'SKIPPED',reason:'SHADOW_MODE_REQUIRED'};
  if(!allowedFirstTouchLead(input.leadStatus,input.leadAgentMode))return {status:'SKIPPED',reason:'LEAD_STATE_BLOCKED'};

  const idempotencyKey=`growth-first-touch:${leadId}`;
  const providerMessageId=shadowProviderMessageId(idempotencyKey);
  const{data:existingDraft,error:existingDraftError}=await ctx.supabase.from('conversation_messages').select('id,status').eq('organization_id',ctx.organizationId).eq('provider_message_id',providerMessageId).limit(1).maybeSingle();
  if(existingDraftError)throw existingDraftError;
  if(existingDraft)return {status:'DUPLICATE',messageId:String(existingDraft.id)};

  const[{count:conversationMessageCount,error:conversationMessageError},{count:outreachMessageCount,error:outreachMessageError}]=await Promise.all([
    ctx.supabase.from('conversation_messages').select('id',{count:'exact',head:true}).eq('organization_id',ctx.organizationId).eq('lead_id',leadId),
    ctx.supabase.from('outreach_messages').select('id',{count:'exact',head:true}).eq('organization_id',ctx.organizationId).eq('lead_id',leadId),
  ]);
  if(conversationMessageError)throw conversationMessageError;if(outreachMessageError)throw outreachMessageError;
  if((conversationMessageCount??0)>0||(outreachMessageCount??0)>0)return {status:'SKIPPED',reason:'EXISTING_MESSAGE_ACTIVITY'};

  const evidence=Array.isArray(input.messageHooks)?input.messageHooks.map(String).map(value=>value.trim()).filter(Boolean):[];
  let draft:ReturnType<typeof buildOmanFirstTouchDraft>;
  try{
    draft=buildOmanFirstTouchDraft({
      marketCode:'OM',
      businessName:String(business.name??'').trim(),
      industry:String(business.category??'').trim()||undefined,
      evidence,
      recommendedOffer:serviceId,
    });
  }catch{
    return {status:'SKIPPED',reason:'NO_CANONICAL_VERIFIED_FIRST_TOUCH_COPY'};
  }

  const email=normalizeEmail(business.email);
  const phone=normalizePhone(business.whatsapp)||normalizePhone(business.international_phone)||normalizePhone(business.phone);
  const channel:'EMAIL'|'WHATSAPP'|null=email.includes('@')&&mailboxId?'EMAIL':phone.length>=8?'WHATSAPP':null;
  const to=channel==='EMAIL'?email:channel==='WHATSAPP'?phone:'';
  if(!channel||!to)return {status:'SKIPPED',reason:'NO_SAFE_FIRST_TOUCH_CHANNEL'};

  const{data:conversation,error:conversationError}=await ctx.supabase.from('sales_conversations').select('id,stage,agent_mode,requires_human').eq('organization_id',ctx.organizationId).eq('lead_id',leadId).eq('channel',channel).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(conversationError)throw conversationError;
  if(conversation&&(conversation.stage!=='NEW'||conversation.agent_mode==='HUMAN'||conversation.agent_mode==='PAUSED'||conversation.requires_human))return {status:'SKIPPED',reason:'CONVERSATION_STATE_BLOCKED'};

  let conversationId=conversation?.id?String(conversation.id):'';
  if(!conversationId){
    const{data:createdConversation,error:createConversationError}=await ctx.supabase.from('sales_conversations').insert({organization_id:ctx.organizationId,lead_id:leadId,channel,stage:'NEW',agent_mode:'AUTO'}).select('id').single();
    if(createConversationError)throw createConversationError;
    conversationId=String(createdConversation.id);
  }

  const queued=await queueShadowDraft({
    organizationId:ctx.organizationId,
    conversationId,
    leadId,
    channel,
    draft:draft.text,
    idempotencyKey,
    to,
    subject:channel==='EMAIL'?draft.subject:undefined,
    mailboxId:channel==='EMAIL'?mailboxId??undefined:undefined,
    marketCode:'OM',
    leadTimezone:'Asia/Muscat',
    replyLanguage:draft.plan.language,
    replyDialect:'omani',
    rememberCustomerLanguage:false,
  });

  const{error:auditError}=await ctx.supabase.from('audit_logs').insert({
    organization_id:ctx.organizationId,
    actor_type:'USER',
    actor_id:ctx.userId,
    action:'QUEUE_GROWTH_FIRST_TOUCH_SHADOW_DRAFT',
    entity_type:'conversation_message',
    entity_id:queued.messageId,
    after_data:{
      leadId,
      channel,
      languageMode:draft.plan.languageMode,
      languages:draft.plan.languages,
      observationKey:draft.observation.key,
      sourceEvidence:draft.observation.sourceEvidence,
      recommendedOffer:serviceId,
      shadowMode:true,
      providerSendTriggered:false,
      providerCalls:0,
      llmCalls:0,
    },
  });
  if(auditError)throw auditError;
  return {status:queued.duplicate?'DUPLICATE':'QUEUED',channel,messageId:String(queued.messageId)};
}

export async function routeCachedGrowthOpportunities(){
  const ctx=await getCurrentOrganization(true);let destination='/hunters/growth-opportunities';
  try{
    const[{data:businessRows,error},{data:settings,error:settingsError},{data:storedRows,error:storedError},catalogByCountry]=await Promise.all([
      ctx.supabase.from('businesses').select('id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_primary_type_display_name').eq('organization_id',ctx.organizationId).not('google_place_id','is',null).limit(500),
      ctx.supabase.from('cost_guard_settings').select('audit_cache_days').eq('organization_id',ctx.organizationId).maybeSingle(),
      ctx.supabase.from('growth_opportunities').select('business_id,digital_presence_evidence').eq('organization_id',ctx.organizationId).limit(1000),
      configuredServiceIdsByCountry(ctx),
    ]);
    if(error)throw error;if(settingsError)throw settingsError;if(storedError)throw storedError;
    const auditCacheDays=Math.max(1,Number(settings?.audit_cache_days??30));
    const cutoff=new Date(Date.now()-auditCacheDays*86_400_000).toISOString();
    const{data:freshAudits,error:auditReadError}=await ctx.supabase.from('website_audits').select('id,business_id,audited_at,title,has_arabic,has_english,has_booking,has_whatsapp,mobile_quality,seo_quality,cta_quality,broken_links,social_links').eq('organization_id',ctx.organizationId).eq('status','SUCCEEDED').gte('audited_at',cutoff).order('audited_at',{ascending:false}).limit(1000);
    if(auditReadError)throw auditReadError;
    const auditByBusiness=new Map<string,FreshAudit>();
    for(const audit of(freshAudits??[]) as FreshAudit[])if(!auditByBusiness.has(String(audit.business_id)))auditByBusiness.set(String(audit.business_id),audit);
    const evidenceByBusiness=new Map((storedRows??[] as StoredEvidence[]).map(row=>[String(row.business_id),row.digital_presence_evidence]));

    let routed=0,skipped=0,contactReady=0,evidenceReused=0,socialLinksReused=0,tierA=0,tierB=0,catalogBlocked=0,socialChecks=0;
    for(const row of(businessRows??[] as CachedBusiness[])){
      const freshAudit=auditByBusiness.get(row.id);
      const auditedInstagram=auditInstagram(freshAudit);
      const business=withAuditInstagram(toDiscovered(row),freshAudit);
      if(String(business.businessStatus??'').toUpperCase()!=='OPERATIONAL'){skipped+=1;continue;}
      if(freshAudit)evidenceReused+=1;
      if(auditedInstagram){
        socialLinksReused+=1;
        if(!row.instagram){
          const{error:instagramUpdateError}=await ctx.supabase.from('businesses').update({instagram:auditedInstagram,updated_at:new Date().toISOString()}).eq('organization_id',ctx.organizationId).eq('id',row.id).is('instagram',null);
          if(instagramUpdateError)throw instagramUpdateError;
        }
      }
      const socialAssessment=socialAssessmentFromEvidence(evidenceByBusiness.get(row.id));
      const opportunity=buildGrowthOpportunity(business,{websiteAudit:auditEvidence(freshAudit),socialAssessment,enabledServiceIds:countryCatalog(catalogByCountry,business.countryCode)});
      if(opportunity.qualification.prospectTier==='A')tierA+=1;
      if(opportunity.qualification.prospectTier==='B')tierB+=1;
      if(opportunity.qualification.cheapestNextAction==='CONTACT_READY')contactReady+=1;
      if(opportunity.qualification.cheapestNextAction==='CATALOG_SETUP')catalogBlocked+=1;
      if(opportunity.qualification.cheapestNextAction==='SOCIAL_CHECK')socialChecks+=1;
      const rowToPersist=buildGrowthOpportunityPersistenceRow(ctx.organizationId,row.id,opportunity);
      const digitalPresence={...record(rowToPersist.digital_presence_evidence),...(freshAudit?{websiteAuditId:freshAudit.id,websiteAuditedAt:freshAudit.audited_at,websiteAudit:{title:freshAudit.title,...auditEvidence(freshAudit),socialLinks:freshAudit.social_links??{}},providerCallsForWebsiteEvidence:0,llmCallsForWebsiteEvidence:0}:{})};
      const{error:upsertError}=await ctx.supabase.from('growth_opportunities').upsert({...rowToPersist,digital_presence_evidence:digitalPresence},{onConflict:'organization_id,business_id'});
      if(upsertError)throw upsertError;routed+=1;
    }
    const{error:auditError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'ROUTE_CACHED_GROWTH_OPPORTUNITIES',entity_type:'growth_opportunity',entity_id:ctx.organizationId,after_data:{routed,skipped,tierA,tierB,contactReady,catalogBlocked,socialChecks,evidenceReused,socialLinksReused,auditCacheDays,providerCalls:0,llmCalls:0,socialApiCalls:0,reviewsFetched:false,outreachTriggered:false,qualificationMode:'HIGH_PRECISION_VERIFIED_EVIDENCE',automaticLeadPromotion:false,marketPriceRequired:true}});if(auditError)throw auditError;
    destination=`/hunters/growth-opportunities?routed=${routed}&a=${tierA}&b=${tierB}&contactReady=${contactReady}&socialChecks=${socialChecks}&catalogBlocked=${catalogBlocked}`;
  }catch(error){const message=error instanceof Error?error.message.slice(0,200):'Cached growth routing failed';destination=`/hunters/growth-opportunities?error=${encodeURIComponent(message)}`;}
  revalidatePath('/hunters/growth-opportunities');revalidatePath('/hunters');redirect(destination);
}

export async function recordGrowthSocialAssessment(form:FormData){
  const ctx=await getCurrentOrganization(true);
  const opportunityId=String(form.get('opportunityId')??'').trim();
  if(!opportunityId)throw new Error('Invalid social assessment');
  const socialAssessment=buildOwnerSocialAssessment({quality:form.get('quality'),note:form.get('note')});
  const{data:opportunity,error:opportunityError}=await ctx.supabase.from('growth_opportunities').select('id,business_id,digital_presence_evidence').eq('organization_id',ctx.organizationId).eq('id',opportunityId).maybeSingle();
  if(opportunityError)throw opportunityError;if(!opportunity)throw new Error('Growth opportunity not found');
  const[{data:businessRow,error:businessError},{data:audit,error:auditError},catalogByCountry]=await Promise.all([
    ctx.supabase.from('businesses').select('id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_primary_type_display_name').eq('organization_id',ctx.organizationId).eq('id',opportunity.business_id).single(),
    ctx.supabase.from('website_audits').select('id,business_id,audited_at,title,has_arabic,has_english,has_booking,has_whatsapp,mobile_quality,seo_quality,cta_quality,broken_links,social_links').eq('organization_id',ctx.organizationId).eq('business_id',opportunity.business_id).eq('status','SUCCEEDED').order('audited_at',{ascending:false}).limit(1).maybeSingle(),
    configuredServiceIdsByCountry(ctx),
  ]);
  if(businessError)throw businessError;if(auditError)throw auditError;
  const business=withAuditInstagram(toDiscovered(businessRow as CachedBusiness),audit as FreshAudit|null);
  const growth=buildGrowthOpportunity(business,{websiteAudit:auditEvidence(audit as FreshAudit|null),socialAssessment,enabledServiceIds:countryCatalog(catalogByCountry,business.countryCode)});
  const persistence=buildGrowthOpportunityPersistenceRow(ctx.organizationId,String(opportunity.business_id),growth);
  const previous=record(opportunity.digital_presence_evidence);
  const {error:updateError}=await ctx.supabase.from('growth_opportunities').update({...persistence,digital_presence_evidence:{...previous,...record(persistence.digital_presence_evidence),socialAssessment}}).eq('organization_id',ctx.organizationId).eq('id',opportunityId);
  if(updateError)throw updateError;
  const{error:logError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'RECORD_SOCIAL_PRESENCE_ASSESSMENT',entity_type:'growth_opportunity',entity_id:opportunityId,before_data:{socialAssessment:record(previous.socialAssessment)},after_data:{socialAssessment,prospectTier:growth.qualification.prospectTier,primaryOfferFamily:growth.qualification.primaryOfferFamily,shouldContact:growth.qualification.shouldContact,outreachTriggered:false,marketPriceRequired:true}});if(logError)throw logError;
  revalidatePath('/hunters/growth-opportunities');
}

export async function promoteHighPrecisionGrowthCandidates(form:FormData){
  const ctx=await getCurrentOrganization(true);let destination='/hunters/growth-opportunities';
  const requested=Math.max(1,Math.min(20,Number(form.get('limit')??10)||10));
  try{
    const[catalogByCountry,controlsResult,mailboxResult]=await Promise.all([
      configuredServiceIdsByCountry(ctx),
      ctx.supabase.from('system_controls').select('shadow_mode').eq('organization_id',ctx.organizationId).maybeSingle(),
      ctx.supabase.from('mailboxes').select('id,enabled,health_status').eq('organization_id',ctx.organizationId).eq('enabled',true).order('created_at',{ascending:true}).limit(10),
    ]);
    if(controlsResult.error)throw controlsResult.error;if(mailboxResult.error)throw mailboxResult.error;
    const shadowMode=Boolean(controlsResult.data?.shadow_mode);
    const mailboxId=String((mailboxResult.data??[]).find(row=>row.health_status==='HEALTHY')?.id??'')||null;
    const{data:rows,error}=await ctx.supabase.from('growth_opportunities').select('id,business_id,qualification_score,qualification_reasons,prospect_tier,should_contact,primary_service_id,message_hooks,businesses(name,country_code,category,email,whatsapp,phone,international_phone)').eq('organization_id',ctx.organizationId).eq('prospect_tier','A').eq('should_contact',true).order('qualification_score',{ascending:false}).limit(requested*2);
    if(error)throw error;
    let created=0,reused=0,skipped=0,shadowDraftQueued=0,shadowDraftReused=0,shadowDraftSkipped=0;
    const shadowDraftSkipReasons:Record<string,number>={};
    for(const row of(rows??[]) as PromotionOpportunity[]){
      if(created>=requested)break;
      const serviceId=String(row.primary_service_id??'');
      const businessRelation=(Array.isArray(row.businesses)?row.businesses[0]:row.businesses)??null;
      const countryCode=String(businessRelation?.country_code??'').toUpperCase();
      if(!serviceId||!countryCatalog(catalogByCountry,countryCode).has(serviceId)){skipped+=1;continue;}

      const{data:existing,error:existingError}=await ctx.supabase.from('leads').select('id,status,agent_mode').eq('organization_id',ctx.organizationId).eq('business_id',row.business_id).maybeSingle();
      if(existingError)throw existingError;
      let leadId=existing?.id?String(existing.id):'';
      let leadStatus=existing?.status??'NEW';
      let leadAgentMode=existing?.agent_mode??'AUTO';
      if(existing){
        reused+=1;
      }else{
        const qualification={shouldContact:true,primaryServiceId:serviceId,qualificationScore:Number(row.qualification_score??0),reasons:Array.isArray(row.qualification_reasons)?row.qualification_reasons.map(String):[]} as Parameters<typeof buildPrecisionLeadPersistenceRow>[0]['qualification'];
        const leadRow=buildPrecisionLeadPersistenceRow({organizationId:ctx.organizationId,businessId:String(row.business_id),qualification});
        const{data:insertedLead,error:insertError}=await ctx.supabase.from('leads').insert(leadRow).select('id,status,agent_mode').single();
        if(insertError){
          if(insertError.code==='23505'){
            const{data:racedLead,error:racedLeadError}=await ctx.supabase.from('leads').select('id,status,agent_mode').eq('organization_id',ctx.organizationId).eq('business_id',row.business_id).single();
            if(racedLeadError)throw racedLeadError;
            leadId=String(racedLead.id);leadStatus=racedLead.status;leadAgentMode=racedLead.agent_mode;reused+=1;
          }else throw insertError;
        }else{
          leadId=String(insertedLead.id);leadStatus=insertedLead.status;leadAgentMode=insertedLead.agent_mode;created+=1;
        }
      }

      if(!leadId||!businessRelation){shadowDraftSkipped+=1;shadowDraftSkipReasons.MISSING_LINKAGE=(shadowDraftSkipReasons.MISSING_LINKAGE??0)+1;continue;}
      const firstTouch=await queuePromotedLeadFirstTouch({ctx,leadId,leadStatus,leadAgentMode,business:businessRelation,serviceId,messageHooks:row.message_hooks,mailboxId,shadowMode});
      if(firstTouch.status==='QUEUED')shadowDraftQueued+=1;
      else if(firstTouch.status==='DUPLICATE')shadowDraftReused+=1;
      else{
        shadowDraftSkipped+=1;
        const reason=firstTouch.reason??'UNKNOWN';
        shadowDraftSkipReasons[reason]=(shadowDraftSkipReasons[reason]??0)+1;
      }
    }
    const{error:logError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'PROMOTE_HIGH_PRECISION_GROWTH_CANDIDATES',entity_type:'lead',entity_id:ctx.organizationId,after_data:{requested,created,reused,skipped,tier:'A',outreachTriggered:false,shadowDraftQueued,shadowDraftReused,shadowDraftSkipped,shadowDraftSkipReasons,firstTouchMode:'BILINGUAL_FIRST_TOUCH',providerSendTriggered:false,providerCalls:0,llmCalls:0,marketPriceRequired:true}});if(logError)throw logError;
    destination=`/hunters/growth-opportunities?promoted=${created}&reused=${reused}&skipped=${skipped}&shadowDrafts=${shadowDraftQueued}`;
  }catch(error){destination=`/hunters/growth-opportunities?promotionError=${encodeURIComponent(error instanceof Error?error.message.slice(0,180):'Promotion failed')}`;}
  revalidatePath('/hunters/growth-opportunities');revalidatePath('/leads');revalidatePath('/approvals');revalidatePath('/conversations');redirect(destination);
}