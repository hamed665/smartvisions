'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  buildGrowthOpportunity,
  buildGrowthOpportunityPersistenceRow,
} from '@/lib/hunters/business/growth-routing';
import { buildPrecisionLeadPersistenceRow, type SocialAssessment } from '@/lib/hunters/business/service-fit';
import { deriveWhatsappCandidate } from '@/lib/hunters/business/selective-enrichment';
import type { DiscoveredBusiness } from '@/lib/hunters/business/types';

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
  return {status:'VERIFIED',quality:quality as SocialAssessment['quality'],source:(social.source as SocialAssessment['source'])??'OTHER',assessedAt:String(social.assessedAt??''),reasons:Array.isArray(social.reasons)?social.reasons.map(String).slice(0,5):[]};
};

async function enabledServiceIds(ctx: Awaited<ReturnType<typeof getCurrentOrganization>>) {
  const {data,error}=await ctx.supabase.from('services').select('id').eq('organization_id',ctx.organizationId).eq('enabled',true);
  if(error)throw error;
  return new Set((data??[]).map(row=>String(row.id)));
}

export async function routeCachedGrowthOpportunities(){
  const ctx=await getCurrentOrganization(true);let destination='/hunters/growth-opportunities';
  try{
    const[{data:businessRows,error},{data:settings,error:settingsError},{data:storedRows,error:storedError},catalog]=await Promise.all([
      ctx.supabase.from('businesses').select('id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_primary_type_display_name').eq('organization_id',ctx.organizationId).not('google_place_id','is',null).limit(500),
      ctx.supabase.from('cost_guard_settings').select('audit_cache_days').eq('organization_id',ctx.organizationId).maybeSingle(),
      ctx.supabase.from('growth_opportunities').select('business_id,digital_presence_evidence').eq('organization_id',ctx.organizationId).limit(1000),
      enabledServiceIds(ctx),
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
      const opportunity=buildGrowthOpportunity(business,{websiteAudit:auditEvidence(freshAudit),socialAssessment,enabledServiceIds:catalog});
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
    const{error:auditError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'ROUTE_CACHED_GROWTH_OPPORTUNITIES',entity_type:'growth_opportunity',entity_id:ctx.organizationId,after_data:{routed,skipped,tierA,tierB,contactReady,catalogBlocked,socialChecks,evidenceReused,socialLinksReused,auditCacheDays,providerCalls:0,llmCalls:0,socialApiCalls:0,reviewsFetched:false,outreachTriggered:false,qualificationMode:'HIGH_PRECISION_VERIFIED_EVIDENCE',automaticLeadPromotion:false}});if(auditError)throw auditError;
    destination=`/hunters/growth-opportunities?routed=${routed}&a=${tierA}&b=${tierB}&contactReady=${contactReady}&socialChecks=${socialChecks}&catalogBlocked=${catalogBlocked}`;
  }catch(error){const message=error instanceof Error?error.message.slice(0,200):'Cached growth routing failed';destination=`/hunters/growth-opportunities?error=${encodeURIComponent(message)}`;}
  revalidatePath('/hunters/growth-opportunities');revalidatePath('/hunters');redirect(destination);
}

export async function recordGrowthSocialAssessment(form:FormData){
  const ctx=await getCurrentOrganization(true);
  const opportunityId=String(form.get('opportunityId')??'').trim();
  const quality=String(form.get('quality')??'').trim().toUpperCase();
  const note=String(form.get('note')??'').trim().slice(0,300);
  if(!opportunityId||!['WEAK','INACTIVE','GOOD'].includes(quality))throw new Error('Invalid social assessment');
  const{data:opportunity,error:opportunityError}=await ctx.supabase.from('growth_opportunities').select('id,business_id,digital_presence_evidence').eq('organization_id',ctx.organizationId).eq('id',opportunityId).maybeSingle();
  if(opportunityError)throw opportunityError;if(!opportunity)throw new Error('Growth opportunity not found');
  const[{data:businessRow,error:businessError},{data:audit,error:auditError},catalog]=await Promise.all([
    ctx.supabase.from('businesses').select('id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_primary_type_display_name').eq('organization_id',ctx.organizationId).eq('id',opportunity.business_id).single(),
    ctx.supabase.from('website_audits').select('id,business_id,audited_at,title,has_arabic,has_english,has_booking,has_whatsapp,mobile_quality,seo_quality,cta_quality,broken_links,social_links').eq('organization_id',ctx.organizationId).eq('business_id',opportunity.business_id).eq('status','SUCCEEDED').order('audited_at',{ascending:false}).limit(1).maybeSingle(),
    enabledServiceIds(ctx),
  ]);
  if(businessError)throw businessError;if(auditError)throw auditError;
  const assessedAt=new Date().toISOString();
  const socialAssessment:SocialAssessment={status:'VERIFIED',quality:quality as SocialAssessment['quality'],source:'OWNER_REVIEW',assessedAt,reasons:note?[note]:[]};
  const growth=buildGrowthOpportunity(withAuditInstagram(toDiscovered(businessRow as CachedBusiness),audit as FreshAudit|null),{websiteAudit:auditEvidence(audit as FreshAudit|null),socialAssessment,enabledServiceIds:catalog});
  const persistence=buildGrowthOpportunityPersistenceRow(ctx.organizationId,String(opportunity.business_id),growth);
  const previous=record(opportunity.digital_presence_evidence);
  const {error:updateError}=await ctx.supabase.from('growth_opportunities').update({...persistence,digital_presence_evidence:{...previous,...record(persistence.digital_presence_evidence),socialAssessment}}).eq('organization_id',ctx.organizationId).eq('id',opportunityId);
  if(updateError)throw updateError;
  const{error:logError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'RECORD_SOCIAL_PRESENCE_ASSESSMENT',entity_type:'growth_opportunity',entity_id:opportunityId,before_data:{socialAssessment:record(previous.socialAssessment)},after_data:{socialAssessment,prospectTier:growth.qualification.prospectTier,primaryOfferFamily:growth.qualification.primaryOfferFamily,shouldContact:growth.qualification.shouldContact,outreachTriggered:false}});if(logError)throw logError;
  revalidatePath('/hunters/growth-opportunities');
}

export async function promoteHighPrecisionGrowthCandidates(form:FormData){
  const ctx=await getCurrentOrganization(true);let destination='/hunters/growth-opportunities';
  const requested=Math.max(1,Math.min(20,Number(form.get('limit')??10)||10));
  try{
    const catalog=await enabledServiceIds(ctx);
    const{data:rows,error}=await ctx.supabase.from('growth_opportunities').select('id,business_id,qualification_score,qualification_reasons,prospect_tier,should_contact,primary_service_id').eq('organization_id',ctx.organizationId).eq('prospect_tier','A').eq('should_contact',true).order('qualification_score',{ascending:false}).limit(requested*2);
    if(error)throw error;
    let created=0,reused=0,skipped=0;
    for(const row of rows??[]){
      if(created>=requested)break;
      const serviceId=String(row.primary_service_id??'');
      if(!serviceId||!catalog.has(serviceId)){skipped+=1;continue;}
      const{data:existing,error:existingError}=await ctx.supabase.from('leads').select('id').eq('organization_id',ctx.organizationId).eq('business_id',row.business_id).maybeSingle();
      if(existingError)throw existingError;if(existing){reused+=1;continue;}
      const qualification={shouldContact:true,primaryServiceId:serviceId,qualificationScore:Number(row.qualification_score??0),reasons:Array.isArray(row.qualification_reasons)?row.qualification_reasons.map(String):[]} as Parameters<typeof buildPrecisionLeadPersistenceRow>[0]['qualification'];
      const leadRow=buildPrecisionLeadPersistenceRow({organizationId:ctx.organizationId,businessId:String(row.business_id),qualification});
      const{error:insertError}=await ctx.supabase.from('leads').insert(leadRow);
      if(insertError){if(insertError.code==='23505'){reused+=1;continue;}throw insertError;}
      created+=1;
    }
    const{error:logError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'PROMOTE_HIGH_PRECISION_GROWTH_CANDIDATES',entity_type:'lead',entity_id:ctx.organizationId,after_data:{requested,created,reused,skipped,tier:'A',outreachTriggered:false,providerCalls:0,llmCalls:0}});if(logError)throw logError;
    destination=`/hunters/growth-opportunities?promoted=${created}&reused=${reused}&skipped=${skipped}`;
  }catch(error){destination=`/hunters/growth-opportunities?promotionError=${encodeURIComponent(error instanceof Error?error.message.slice(0,180):'Promotion failed')}`;}
  revalidatePath('/hunters/growth-opportunities');revalidatePath('/leads');redirect(destination);
}
