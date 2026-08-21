'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { getCostGuardState } from '@/lib/reliability/cost-guard';
import {
  controlledGooglePlaceDetails,
  controlledGooglePlacesIdSearch,
} from '@/lib/hunters/business/google-places-controlled';
import {
  assertValidGooglePlaceId,
  buildBusinessPersistenceRow,
  buildLeadPersistenceRow,
  isPriorityNoWebsiteBusiness,
} from '@/lib/hunters/business/selective-enrichment';
import type { DiscoveredBusiness } from '@/lib/hunters/business/types';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const boundedInteger = (form: FormData, key: string, fallback: number, min: number, max: number) => {
  const value = Number(text(form, key) || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
};
const safeMessage = (value: unknown) => {
  const message = value instanceof Error ? value.message : 'Google Places operation failed';
  return message.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]').slice(0, 240);
};

async function assertEnabledMarket(ctx: Awaited<ReturnType<typeof getCurrentOrganization>>, countryCode: string) {
  const { data, error } = await ctx.supabase.from('market_settings').select('country_code,enabled').eq('organization_id', ctx.organizationId).eq('country_code', countryCode).maybeSingle();
  if (error) throw error;
  if (!data?.enabled) throw new Error(`Market ${countryCode} is not enabled`);
}

async function updateGooglePlacesHealth(
  ctx: Awaited<ReturnType<typeof getCurrentOrganization>>,
  input: { status: 'NOT_CONFIGURED'|'READY'|'CONNECTED'|'ERROR'; error?: string | null; enabled?: boolean },
) {
  const { error } = await ctx.supabase
    .from('integration_connections')
    .update({
      status: input.status,
      enabled: input.enabled ?? false,
      last_checked_at: new Date().toISOString(),
      last_error: input.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'GOOGLE_PLACES')
    .eq('channel', 'DISCOVERY');
  if (error) throw error;
}

export async function runGooglePlacesControlledSample(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const countryCode = (text(form, 'countryCode') || 'OM').toUpperCase();
  const city = text(form, 'city') || 'Muscat';
  const industry = text(form, 'industry') || 'dental clinic';
  const requestedLimit = boundedInteger(form, 'limit', 3, 1, 3);
  let destination = '/hunters/google-places';

  try {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      await updateGooglePlacesHealth(ctx, { status: 'NOT_CONFIGURED', error: 'GOOGLE_PLACES_API_KEY is not configured', enabled: false });
      throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    }

    await assertEnabledMarket(ctx, countryCode);
    const state = await getCostGuardState(ctx.organizationId);
    if (!state) throw new Error('Cost Guard state is unavailable; discovery blocked');

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { count: discoveredToday, error: countError } = await ctx.supabase
      .from('discovery_records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('source_type', 'google_places')
      .gte('discovered_at', start.toISOString());
    if (countError) throw countError;

    const remainingDaily = Math.max(0, Number(state.settings.daily_new_leads) - Number(discoveredToday ?? 0));
    const limit = Math.min(requestedLimit, remainingDaily);
    if (limit < 1) throw new Error('Daily new-lead quota reached; Google Places sample blocked');

    const query = { countryCode, city, industry, limit };
    const result = await controlledGooglePlacesIdSearch({ organizationId: ctx.organizationId, query });
    const uniqueIds = [...new Set(result.placeIds)].slice(0, limit);

    const { data: existingRows, error: existingError } = uniqueIds.length
      ? await ctx.supabase
          .from('discovery_records')
          .select('source_id')
          .eq('organization_id', ctx.organizationId)
          .eq('source_type', 'google_places')
          .in('source_id', uniqueIds)
      : { data: [], error: null };
    if (existingError) throw existingError;

    const existingIds = new Set((existingRows ?? []).map((row) => String(row.source_id)));
    const newIds = uniqueIds.filter((id) => !existingIds.has(id));

    if (newIds.length) {
      const { error: insertError } = await ctx.supabase.from('discovery_records').insert(
        newIds.map((placeId) => ({
          organization_id: ctx.organizationId,
          campaign_id: null,
          source_type: 'google_places',
          source_id: placeId,
          source_url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
          raw_payload: {
            provider: 'GOOGLE_PLACES',
            operation: 'TEXT_SEARCH_IDS_ONLY',
            countryCode,
            city,
            industry,
            placeId,
            controlledSample: true,
            qualificationTarget: 'GROWTH_OPPORTUNITY',
          },
        })),
      );
      if (insertError) throw insertError;
    }

    await updateGooglePlacesHealth(ctx, { status: 'CONNECTED', error: null, enabled: true });
    const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'GOOGLE_PLACES_CONTROLLED_SAMPLE',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: {
        countryCode, city, industry, requestedLimit: limit,
        returnedCount: result.placeIds.length, uniqueCount: uniqueIds.length,
        insertedCount: newIds.length, duplicateCount: uniqueIds.length - newIds.length,
        latencyMs: result.latencyMs, qualificationTarget: 'GROWTH_OPPORTUNITY', outreachTriggered: false,
      },
    });
    if (auditError) throw auditError;

    destination = `/hunters/google-places?result=success&market=${encodeURIComponent(countryCode)}&returned=${result.placeIds.length}&inserted=${newIds.length}&duplicates=${uniqueIds.length - newIds.length}`;
  } catch (error) {
    const message = safeMessage(error);
    if (process.env.GOOGLE_PLACES_API_KEY) {
      try { await updateGooglePlacesHealth(ctx, { status: 'ERROR', error: message, enabled: false }); } catch { /* preserve original error */ }
    }
    await ctx.supabase.from('audit_logs').insert({ organization_id: ctx.organizationId, actor_type: 'USER', actor_id: ctx.userId, action: 'GOOGLE_PLACES_CONTROLLED_SAMPLE_FAILED', entity_type: 'integration', entity_id: ctx.organizationId, after_data: { countryCode, error: message, outreachTriggered: false } });
    destination = `/hunters/google-places?result=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/hunters'); revalidatePath('/hunters/google-places'); revalidatePath('/integrations'); revalidatePath('/cost-usage'); redirect(destination);
}

export async function enrichGooglePlaceCandidate(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const placeId = assertValidGooglePlaceId(text(form, 'placeId'));
  let destination = '/hunters/google-places';
  let providerCallSucceeded = false;
  let providerCallAttempted = false;

  try {
    if (!process.env.GOOGLE_PLACES_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY is not configured');

    const { data: integration, error: integrationError } = await ctx.supabase.from('integration_connections').select('status,enabled').eq('organization_id', ctx.organizationId).eq('provider', 'GOOGLE_PLACES').eq('channel', 'DISCOVERY').maybeSingle();
    if (integrationError) throw integrationError;
    if (integration?.status !== 'CONNECTED' || integration.enabled !== true) throw new Error('Google Places must be CONNECTED before selective enrichment');

    const { data: discovery, error: discoveryError } = await ctx.supabase.from('discovery_records').select('id,raw_payload').eq('organization_id', ctx.organizationId).eq('source_type', 'google_places').eq('source_id', placeId).maybeSingle();
    if (discoveryError) throw discoveryError;
    if (!discovery) throw new Error('Place ID is not an approved discovery candidate');

    const rawPayload = (discovery.raw_payload && typeof discovery.raw_payload === 'object') ? discovery.raw_payload as Record<string, unknown> : {};
    const countryCode = String(rawPayload.countryCode ?? 'OM').toUpperCase();
    const city = String(rawPayload.city ?? 'Muscat').trim() || 'Muscat';
    await assertEnabledMarket(ctx, countryCode);

    const { data: existingBusiness, error: existingBusinessError } = await ctx.supabase
      .from('businesses')
      .select('id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_primary_type_display_name,google_opening_hours,google_reviews,google_review_summary,google_price_level,google_intelligence_retrieved_at')
      .eq('organization_id', ctx.organizationId).eq('google_place_id', placeId).maybeSingle();
    if (existingBusinessError) throw existingBusinessError;

    let businessId = existingBusiness?.id ? String(existingBusiness.id) : '';
    let businessName = existingBusiness?.name ? String(existingBusiness.name) : placeId;
    let reusedBusiness = Boolean(businessId);
    let qualifiedBusiness: DiscoveredBusiness | null = existingBusiness ? {
      sourceType: 'google_places', sourceId: placeId, googlePlaceId: placeId, name: String(existingBusiness.name),
      countryCode: String(existingBusiness.country_code ?? countryCode), city: String(existingBusiness.city ?? city), category: existingBusiness.category ?? undefined,
      officialWebsite: existingBusiness.official_website ?? undefined, phone: existingBusiness.phone ?? undefined, internationalPhone: existingBusiness.international_phone ?? undefined,
      formattedAddress: existingBusiness.formatted_address ?? undefined, googleMapsUri: existingBusiness.google_maps_uri ?? undefined,
      rating: existingBusiness.google_rating == null ? undefined : Number(existingBusiness.google_rating), userRatingCount: existingBusiness.google_user_rating_count == null ? undefined : Number(existingBusiness.google_user_rating_count),
      businessStatus: existingBusiness.google_business_status ?? undefined, primaryTypeDisplayName: existingBusiness.google_primary_type_display_name ?? undefined,
      openingHours: existingBusiness.google_opening_hours ?? undefined, reviews: Array.isArray(existingBusiness.google_reviews) ? existingBusiness.google_reviews : [], reviewSummary: existingBusiness.google_review_summary ?? undefined,
      priceLevel: existingBusiness.google_price_level ?? undefined, retrievedAt: existingBusiness.google_intelligence_retrieved_at ?? new Date().toISOString(),
    } : null;

    if (!businessId) {
      providerCallAttempted = true;
      const business = await controlledGooglePlaceDetails({ organizationId: ctx.organizationId, placeId, countryCode, city });
      providerCallSucceeded = true;
      qualifiedBusiness = business;
      businessName = business.name;
      const { data: insertedBusiness, error: insertBusinessError } = await ctx.supabase.from('businesses').insert(buildBusinessPersistenceRow(ctx.organizationId, business)).select('id,name').single();
      if (insertBusinessError) {
        if (insertBusinessError.code !== '23505') throw insertBusinessError;
        const { data: racedBusiness, error: racedBusinessError } = await ctx.supabase.from('businesses').select('id,name').eq('organization_id', ctx.organizationId).eq('google_place_id', placeId).single();
        if (racedBusinessError) throw racedBusinessError;
        businessId = String(racedBusiness.id); businessName = String(racedBusiness.name); reusedBusiness = true;
      } else { businessId = String(insertedBusiness.id); businessName = String(insertedBusiness.name); }
    }

    if (!qualifiedBusiness) throw new Error('Business qualification data is unavailable');
    const priorityQualified = isPriorityNoWebsiteBusiness(qualifiedBusiness);

    const { data: existingLead, error: existingLeadError } = await ctx.supabase.from('leads').select('id').eq('organization_id', ctx.organizationId).eq('business_id', businessId).maybeSingle();
    if (existingLeadError) throw existingLeadError;

    let leadId = existingLead?.id ? String(existingLead.id) : '';
    let createdLead = false;
    if (!leadId && priorityQualified) {
      const { data: insertedLead, error: insertLeadError } = await ctx.supabase.from('leads').insert(buildLeadPersistenceRow(ctx.organizationId, businessId, qualifiedBusiness)).select('id').single();
      if (insertLeadError) {
        if (insertLeadError.code !== '23505') throw insertLeadError;
        const { data: racedLead, error: racedLeadError } = await ctx.supabase.from('leads').select('id').eq('organization_id', ctx.organizationId).eq('business_id', businessId).single();
        if (racedLeadError) throw racedLeadError;
        leadId = String(racedLead.id);
      } else { leadId = String(insertedLead.id); createdLead = true; }
    }

    const qualificationReason = priorityQualified ? 'OPERATIONAL_NO_WEBSITE' : qualifiedBusiness.officialWebsite ? 'HAS_WEBSITE' : `STATUS_${String(qualifiedBusiness.businessStatus ?? 'UNKNOWN')}`;
    const { error: discoveryUpdateError } = await ctx.supabase.from('discovery_records').update({ raw_payload: {
      ...rawPayload, enrichedAt: new Date().toISOString(), businessId, leadId: leadId || null,
      detailsLookupCharged: Boolean(rawPayload.detailsLookupCharged) || providerCallAttempted,
      priorityQualified, qualificationReason,
    } }).eq('id', discovery.id).eq('organization_id', ctx.organizationId);
    if (discoveryUpdateError) throw discoveryUpdateError;

    const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId, actor_type: 'USER', actor_id: ctx.userId,
      action: 'GOOGLE_PLACE_SELECTIVE_ENRICHMENT', entity_type: leadId ? 'lead' : 'business', entity_id: leadId || businessId,
      after_data: { placeId, countryCode, businessId, leadId: leadId || null, businessName, providerCallAttempted, providerCallSucceeded, reusedBusiness, createdLead, priorityQualified, qualificationReason, outreachTriggered: false },
    });
    if (auditError) throw auditError;

    destination = leadId
      ? `/hunters/google-places?enrichment=priority&placeId=${encodeURIComponent(placeId)}&leadId=${encodeURIComponent(leadId)}`
      : `/hunters/google-places?enrichment=rejected&placeId=${encodeURIComponent(placeId)}&reason=${encodeURIComponent(qualificationReason)}`;
  } catch (error) {
    const message = safeMessage(error);
    if (providerCallAttempted && !providerCallSucceeded) {
      try { await updateGooglePlacesHealth(ctx, { status: 'ERROR', error: message, enabled: false }); } catch { /* preserve provider error */ }
    }
    await ctx.supabase.from('audit_logs').insert({ organization_id: ctx.organizationId, actor_type: 'USER', actor_id: ctx.userId, action: 'GOOGLE_PLACE_SELECTIVE_ENRICHMENT_FAILED', entity_type: 'integration', entity_id: ctx.organizationId, after_data: { placeId, error: message, providerCallAttempted, providerCallSucceeded, outreachTriggered: false } });
    destination = `/hunters/google-places?enrichment=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/hunters/google-places'); revalidatePath('/hunters'); revalidatePath('/leads'); revalidatePath('/cost-usage'); revalidatePath('/integrations'); redirect(destination);
}
