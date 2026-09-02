'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { controlledGooglePlaceQualification } from '@/lib/hunters/business/google-places-controlled';
import { buildGrowthOpportunity, buildGrowthOpportunityPersistenceRow } from '@/lib/hunters/business/growth-routing';
import { buildPrecisionLeadPersistenceRow } from '@/lib/hunters/business/service-fit';
import { assertValidGooglePlaceId, buildBusinessPersistenceRow } from '@/lib/hunters/business/selective-enrichment';
import type { DiscoveredBusiness } from '@/lib/hunters/business/types';

const int = (form: FormData, key: string, fallback: number, min: number, max: number) => {
  const parsed = Number(String(form.get(key) ?? '').trim() || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const safeMessage = (value: unknown) => {
  const message = value instanceof Error ? value.message : 'Batch qualification failed';
  return message.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]').slice(0, 240);
};

type ExistingBusiness = {
  id:string; name:string; country_code:string|null; city:string|null; category:string|null; google_place_id:string|null;
  official_website:string|null; phone:string|null; international_phone:string|null; email:string|null; instagram:string|null; whatsapp:string|null;
  formatted_address:string|null; google_maps_uri:string|null; google_rating:number|null; google_user_rating_count:number|null;
  google_business_status:string|null; google_primary_type_display_name:string|null; google_opening_hours:unknown; google_reviews:unknown;
  google_review_summary:string|null; google_price_level:string|null; google_intelligence_retrieved_at:string|null;
};

function existingToDiscovered(row: ExistingBusiness, fallbackCountry: string, fallbackCity: string): DiscoveredBusiness {
  return {
    sourceType:'google_places',sourceId:String(row.google_place_id??''),googlePlaceId:String(row.google_place_id??''),name:row.name,
    countryCode:String(row.country_code??fallbackCountry),city:String(row.city??fallbackCity),category:row.category??undefined,
    officialWebsite:row.official_website??undefined,phone:row.phone??undefined,internationalPhone:row.international_phone??undefined,
    email:row.email??undefined,instagram:row.instagram??undefined,whatsapp:row.whatsapp??undefined,formattedAddress:row.formatted_address??undefined,
    googleMapsUri:row.google_maps_uri??undefined,rating:row.google_rating==null?undefined:Number(row.google_rating),
    userRatingCount:row.google_user_rating_count==null?undefined:Number(row.google_user_rating_count),businessStatus:row.google_business_status??undefined,
    primaryTypeDisplayName:row.google_primary_type_display_name??undefined,
    openingHours:row.google_opening_hours&&typeof row.google_opening_hours==='object'?row.google_opening_hours as DiscoveredBusiness['openingHours']:undefined,
    reviews:Array.isArray(row.google_reviews)?row.google_reviews as DiscoveredBusiness['reviews']:[],reviewSummary:row.google_review_summary??undefined,
    priceLevel:row.google_price_level??undefined,retrievedAt:row.google_intelligence_retrieved_at??new Date().toISOString(),
  };
}

export async function qualifyGooglePlacesPriorityBatch(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const maxChecks = int(form, 'maxChecks', 3, 1, 5);
  const targetLeads = int(form, 'targetLeads', 1, 1, 3);
  let destination = '/hunters/google-places';

  try {
    if (!process.env.GOOGLE_PLACES_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    const {data:integration,error:integrationError}=await ctx.supabase.from('integration_connections').select('status,enabled').eq('organization_id',ctx.organizationId).eq('provider','GOOGLE_PLACES').eq('channel','DISCOVERY').maybeSingle();
    if(integrationError)throw integrationError;
    if(integration?.status!=='CONNECTED'||integration.enabled!==true)throw new Error('Google Places must be CONNECTED before batch qualification');

    const [{data:discoveries,error:discoveryError},{data:markets,error:marketError},{data:services,error:serviceError}] = await Promise.all([
      ctx.supabase.from('discovery_records').select('id,source_id,raw_payload,discovered_at').eq('organization_id',ctx.organizationId).eq('source_type','google_places').order('discovered_at',{ascending:false}).limit(100),
      ctx.supabase.from('market_settings').select('country_code').eq('organization_id',ctx.organizationId).eq('enabled',true),
      ctx.supabase.from('services').select('id').eq('organization_id',ctx.organizationId).eq('enabled',true),
    ]);
    if(discoveryError)throw discoveryError;if(marketError)throw marketError;if(serviceError)throw serviceError;
    const enabledMarkets=new Set((markets??[]).map(row=>String(row.country_code).toUpperCase()));
    const enabledServiceIds=new Set((services??[]).map(row=>String(row.id)));
    const candidates=(discoveries??[]).filter(row=>{const raw=row.raw_payload&&typeof row.raw_payload==='object'?row.raw_payload as Record<string,unknown>:{};const countryCode=String(raw.countryCode??'OM').toUpperCase();return Boolean(row.source_id)&&!raw.enrichedAt&&enabledMarkets.has(countryCode);}).slice(0,maxChecks);

    if(!candidates.length){destination='/hunters/google-places?batch=empty';}
    else{
      let checked=0,providerCalls=0,prioritiesFound=0,leadsCreated=0,rejected=0,reusedBusinesses=0,growthRouted=0,evidenceOnly=0;
      for(const row of candidates){
        if(prioritiesFound>=targetLeads)break;
        const placeId=assertValidGooglePlaceId(String(row.source_id??''));
        const raw=row.raw_payload&&typeof row.raw_payload==='object'?row.raw_payload as Record<string,unknown>:{};
        const countryCode=String(raw.countryCode??'OM').toUpperCase();const city=String(raw.city??'Muscat').trim()||'Muscat';
        if(!enabledMarkets.has(countryCode))continue;checked+=1;

        const{data:existingBusiness,error:existingBusinessError}=await ctx.supabase.from('businesses')
          .select('id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_primary_type_display_name,google_opening_hours,google_reviews,google_review_summary,google_price_level,google_intelligence_retrieved_at')
          .eq('organization_id',ctx.organizationId).eq('google_place_id',placeId).maybeSingle();
        if(existingBusinessError)throw existingBusinessError;

        let businessId=existingBusiness?.id?String(existingBusiness.id):'';let business:DiscoveredBusiness;let providerCallAttempted=false;
        if(existingBusiness){reusedBusinesses+=1;business=existingToDiscovered(existingBusiness as ExistingBusiness,countryCode,city);}
        else{
          providerCallAttempted=true;providerCalls+=1;
          business=await controlledGooglePlaceQualification({organizationId:ctx.organizationId,placeId,countryCode,city});
          const rowToPersist=buildBusinessPersistenceRow(ctx.organizationId,business);
          const{data:inserted,error:insertError}=await ctx.supabase.from('businesses').insert(rowToPersist).select('id').single();
          if(insertError){if(insertError.code!=='23505')throw insertError;const{data:raced,error:racedError}=await ctx.supabase.from('businesses').select('id').eq('organization_id',ctx.organizationId).eq('google_place_id',placeId).single();if(racedError)throw racedError;businessId=String(raced.id);}else businessId=String(inserted.id);
          business={...business,whatsapp:rowToPersist.whatsapp??undefined};
        }

        const growth=buildGrowthOpportunity(business,{enabledServiceIds});
        const p=growth.personalization;const q=growth.qualification;
        const{error:growthError}=await ctx.supabase.from('growth_opportunities').upsert(buildGrowthOpportunityPersistenceRow(ctx.organizationId,businessId,growth),{onConflict:'organization_id,business_id'});
        if(growthError)throw growthError;growthRouted+=1;

        const priorityQualified=q.shouldContact&&q.prospectTier==='A'&&Boolean(q.primaryServiceId);
        const qualificationReason=priorityQualified
          ? `TIER_A_${q.primaryOfferFamily}`
          : q.cheapestNextAction==='WEBSITE_EVIDENCE'||q.cheapestNextAction==='SOCIAL_CHECK'
            ? `EVIDENCE_REQUIRED_${q.cheapestNextAction}`
            : q.cheapestNextAction==='CATALOG_SETUP'
              ? `CATALOG_REQUIRED_${q.primaryOfferFamily}`
              : `TIER_${q.prospectTier}_${q.primaryOfferFamily}`;

        let leadId:string|null=null;
        if(priorityQualified){
          prioritiesFound+=1;
          const{data:existingLead,error:existingLeadError}=await ctx.supabase.from('leads').select('id').eq('organization_id',ctx.organizationId).eq('business_id',businessId).maybeSingle();
          if(existingLeadError)throw existingLeadError;leadId=existingLead?.id?String(existingLead.id):null;
          if(!leadId){
            const leadRow=buildPrecisionLeadPersistenceRow({organizationId:ctx.organizationId,businessId,qualification:q});
            const{data:insertedLead,error:insertLeadError}=await ctx.supabase.from('leads').insert(leadRow).select('id').single();
            if(insertLeadError){if(insertLeadError.code!=='23505')throw insertLeadError;const{data:racedLead,error:racedLeadError}=await ctx.supabase.from('leads').select('id').eq('organization_id',ctx.organizationId).eq('business_id',businessId).single();if(racedLeadError)throw racedLeadError;leadId=String(racedLead.id);}else{leadId=String(insertedLead.id);leadsCreated+=1;}
          }
        }else{rejected+=1;if(q.evidenceGaps.length)evidenceOnly+=1;}

        const{error:updateError}=await ctx.supabase.from('discovery_records').update({raw_payload:{
          ...raw,enrichedAt:new Date().toISOString(),businessId,leadId,detailsLookupCharged:Boolean(raw.detailsLookupCharged)||providerCallAttempted,
          priorityQualified,qualificationReason,prospectTier:q.prospectTier,qualificationScore:q.qualificationScore,qualificationConfidence:q.qualificationConfidence,
          primaryOfferFamily:q.primaryOfferFamily,primaryServiceId:q.primaryServiceId,catalogReady:q.catalogReady,shouldContact:q.shouldContact,evidenceGaps:q.evidenceGaps,
          growthLane:growth.lane,serviceRegion:growth.region,websiteScore:growth.websiteScore,localContentScore:growth.localContentScore,aiContentScore:growth.aiContentScore,
          overallSalesScore:growth.overallSalesScore,contentCheckStatus:growth.contentCheckStatus,personalizationPriorityScore:p.personalizationPriorityScore,
          personalizationFingerprint:p.fingerprint,offerBundle:p.offerBundle,cheapestNextAction:p.cheapestNextAction,nextActionCanSpendMoney:p.nextActionCanSpendMoney,
          digitalPresenceEvidence:growth.digitalEvidence,qualificationTier:providerCallAttempted?'ENTERPRISE_NO_REVIEWS':'CACHE_REUSE',fullIntelligenceFetched:false,
          batchQualification:true,
        }}).eq('organization_id',ctx.organizationId).eq('id',row.id);
        if(updateError)throw updateError;
      }

      const{error:auditError}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'GOOGLE_PLACES_PRIORITY_BATCH_QUALIFICATION',entity_type:'integration',entity_id:ctx.organizationId,after_data:{maxChecks,targetLeads,checked,providerCalls,reusedBusinesses,prioritiesFound,leadsCreated,rejected,evidenceOnly,growthRouted,enabledMarkets:[...enabledMarkets],qualificationMode:'HIGH_PRECISION_TIER_A_ONLY',personalizationMode:'DETERMINISTIC_ZERO_COST',digitalEvidenceMode:'KNOWN_FACTS_ONLY',whatsappLinksDerivedLocally:true,socialAnalysisTriggered:false,reviewsFetched:false,outreachTriggered:false}});
      if(auditError)throw auditError;
      destination=`/hunters/google-places?batch=success&checked=${checked}&calls=${providerCalls}&priority=${prioritiesFound}&created=${leadsCreated}&rejected=${rejected}&evidence=${evidenceOnly}&routed=${growthRouted}`;
    }
  }catch(error){
    const message=safeMessage(error);
    await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action:'GOOGLE_PLACES_PRIORITY_BATCH_QUALIFICATION_FAILED',entity_type:'integration',entity_id:ctx.organizationId,after_data:{error:message,outreachTriggered:false}});
    destination=`/hunters/google-places?batch=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/hunters/google-places');revalidatePath('/hunters/growth-opportunities');revalidatePath('/hunters');revalidatePath('/leads');revalidatePath('/cost-usage');redirect(destination);
}
