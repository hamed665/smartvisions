'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { buildGrowthOpportunity } from '@/lib/hunters/business/growth-routing';
import { deriveWhatsappCandidate } from '@/lib/hunters/business/selective-enrichment';
import type { DiscoveredBusiness } from '@/lib/hunters/business/types';

type CachedBusiness = { id:string; name:string; country_code:string; city:string|null; category:string|null; google_place_id:string|null; official_website:string|null; phone:string|null; international_phone:string|null; instagram:string|null; whatsapp:string|null; formatted_address:string|null; google_maps_uri:string|null; google_rating:number|null; google_user_rating_count:number|null; google_business_status:string|null };
type FreshAudit = { id:string; business_id:string; audited_at:string|null; title:string|null; has_arabic:boolean|null; has_english:boolean|null; has_booking:boolean|null; has_whatsapp:boolean|null; mobile_quality:string|null; seo_quality:string|null; cta_quality:string|null; social_links:unknown };
const toDiscovered=(row:CachedBusiness):DiscoveredBusiness=>({sourceType:'google_places',sourceId:row.google_place_id??row.id,googlePlaceId:row.google_place_id??undefined,name:row.name,countryCode:row.country_code,city:row.city??undefined,category:row.category??undefined,officialWebsite:row.official_website??undefined,phone:row.phone??undefined,internationalPhone:row.international_phone??undefined,instagram:row.instagram??undefined,whatsapp:row.whatsapp??deriveWhatsappCandidate(row.international_phone,row.phone,row.country_code),formattedAddress:row.formatted_address??undefined,googleMapsUri:row.google_maps_uri??undefined,rating:row.google_rating==null?undefined:Number(row.google_rating),userRatingCount:row.google_user_rating_count==null?undefined:Number(row.google_user_rating_count),businessStatus:row.google_business_status??undefined,retrievedAt:new Date().toISOString()});

export async function routeCachedGrowthOpportunities(){
  const ctx=await getCurrentOrganization(true);let destination='/hunters/growth-opportunities';
  try{
    const[{data,error},{data:settings,error:settingsError}]=await Promise.all([
      ctx.supabase.from('businesses').select('id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status').eq('organization_id',ctx.organizationId).not('google_place_id','is',null).limit(500),
      ctx.supabase.from('cost_guard_settings').select('audit_cache_days').eq('organization_id',ctx.organizationId).maybeSingle(),
    ]);
    if(error)throw error;if(settingsError)throw settingsError;
    const auditCacheDays=Math.max(1,Number(settings?.audit_cache_days??30));
    const cutoff=new Date(Date.now()-auditCacheDays*86_400_000).toISOString();
    const{data:freshAudits,error:auditReadError}=await ctx.supabase.from('website_audits').select('id,business_id,audited_at,title,has_arabic,has_english,has_booking,has_whatsapp,mobile_quality,seo_quality,cta_quality,social_links').eq('organization_id',ctx.organizationId).eq('status','SUCCEEDED').gte('audited_at',cutoff).order('audited_at',{ascending:false}).limit(1000);
    if(auditReadError)throw auditReadError;
    const auditByBusiness=new Map<string,FreshAudit>();
    for(const audit of(freshAudits??[]) as FreshAudit[])if(!auditByBusiness.has(String(audit.business_id)))auditByBusiness.set(String(audit.business_id),audit);

    let routed=0,skipped=0,contactReady=0,paidNextActions=0,evidenceReused=0;
    for(const row of(data??[]) as CachedBusiness[]){
      const business=toDiscovered(row);if(String(business.businessStatus??'').toUpperCase()!=='OPERATIONAL'){skipped+=1;continue;}
      const opportunity=buildGrowthOpportunity(business);const p=opportunity.personalization;const freshAudit=auditByBusiness.get(row.id);
      let cheapestNextAction=p.cheapestNextAction;let nextActionReason=p.nextActionReason;let nextActionCanSpendMoney=p.nextActionCanSpendMoney;
      let digitalEvidence:Record<string,unknown>={...opportunity.digitalEvidence};
      if(freshAudit){
        evidenceReused+=1;
        digitalEvidence={...digitalEvidence,websiteEvidenceStatus:'AUDITED',websiteAuditId:freshAudit.id,websiteAuditedAt:freshAudit.audited_at,websiteAudit:{title:freshAudit.title,hasArabic:freshAudit.has_arabic,hasEnglish:freshAudit.has_english,hasBooking:freshAudit.has_booking,hasWhatsapp:freshAudit.has_whatsapp,mobileQuality:freshAudit.mobile_quality,seoQuality:freshAudit.seo_quality,ctaQuality:freshAudit.cta_quality,socialLinks:freshAudit.social_links??{}},providerCallsForWebsiteEvidence:0,llmCallsForWebsiteEvidence:0};
        if(cheapestNextAction==='WEBSITE_EVIDENCE'){
          cheapestNextAction='EVIDENCE_READY';nextActionReason='Fresh deterministic website evidence is already cached; no repeat audit is needed.';nextActionCanSpendMoney=false;
        }
      }
      if(cheapestNextAction==='CONTACT_READY')contactReady+=1;if(nextActionCanSpendMoney)paidNextActions+=1;
      const{error:upsertError}=await ctx.supabase.from('growth_opportunities').upsert({organization_id:ctx.organizationId,business_id:row.id,service_region:opportunity.region,sales_lane:opportunity.lane,website_class:opportunity.websiteClass,website_score:opportunity.websiteScore,local_content_score:opportunity.localContentScore,ai_content_score:opportunity.aiContentScore,overall_sales_score:opportunity.overallSalesScore,content_check_status:opportunity.contentCheckStatus,recommended_services:opportunity.recommendedServices,routing_reasons:opportunity.reasons,contactability_score:p.contactabilityScore,need_score:p.needScore,service_fit_score:p.serviceFitScore,revenue_potential_score:p.revenuePotentialScore,personalization_priority_score:p.personalizationPriorityScore,personalization_fingerprint:p.fingerprint,offer_bundle:p.offerBundle,recommended_angle:p.recommendedAngle,message_hooks:p.messageHooks,social_check_eligible:p.socialCheckEligible,cheapest_next_action:cheapestNextAction,next_action_reason:nextActionReason,next_action_can_spend_money:nextActionCanSpendMoney,digital_presence_evidence:digitalEvidence,routed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'organization_id,business_id'});if(upsertError)throw upsertError;routed+=1;
    }
    const{error:auditError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'ROUTE_CACHED_GROWTH_OPPORTUNITIES',entity_type:'growth_opportunity',entity_id:ctx.organizationId,after_data:{routed,skipped,contactReady,paidNextActions,evidenceReused,auditCacheDays,providerCalls:0,llmCalls:0,socialApiCalls:0,reviewsFetched:false,outreachTriggered:false,personalizationMode:'DETERMINISTIC_ZERO_COST',digitalEvidenceMode:'KNOWN_FACTS_AND_FRESH_AUDITS'}});if(auditError)throw auditError;
    destination=`/hunters/growth-opportunities?routed=${routed}&skipped=${skipped}&contactReady=${contactReady}&evidenceReused=${evidenceReused}`;
  }catch(error){const message=error instanceof Error?error.message.slice(0,200):'Cached growth routing failed';destination=`/hunters/growth-opportunities?error=${encodeURIComponent(message)}`;}
  revalidatePath('/hunters/growth-opportunities');revalidatePath('/hunters');redirect(destination);
}
