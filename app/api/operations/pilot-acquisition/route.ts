import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { controlledGooglePlaceQualification, controlledGooglePlacesIdSearch } from '@/lib/hunters/business/google-places-controlled';
import { buildGrowthOpportunity, buildGrowthOpportunityPersistenceRow } from '@/lib/hunters/business/growth-routing';
import { buildPrecisionLeadPersistenceRow } from '@/lib/hunters/business/service-fit';
import { buildBusinessPersistenceRow } from '@/lib/hunters/business/selective-enrichment';
import { getCostGuardState } from '@/lib/reliability/cost-guard';
import { evaluatePilotAcquisitionPolicy } from '@/lib/operations/pilot-acquisition-policy';

const MAX_DISCOVERY_IDS = 20;
const MAX_CAMPAIGNS_PER_TICK = 3;

type CampaignRow = {
  id: string;
  organization_id: string;
  name: string;
  country_code: string | null;
  city: string | null;
  industry: string | null;
  status: string;
  target_count: number | null;
  config: unknown;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for pilot acquisition');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeMessage(value: unknown) {
  const message = value instanceof Error ? value.message : 'Pilot acquisition failed';
  return message.replace(/AIza[0-9A-Za-z_-]+/g, '[redacted]').slice(0, 500);
}

async function updateCampaignConfig(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  patch: Record<string, unknown>,
) {
  const nextConfig = { ...record(campaign.config), ...patch };
  const { error } = await supabase.from('campaigns').update({ config: nextConfig, updated_at: new Date().toISOString() })
    .eq('organization_id', campaign.organization_id)
    .eq('id', campaign.id);
  if (error) throw new Error(`Pilot campaign state update failed: ${error.message}`);
  campaign.config = nextConfig;
}

async function audit(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  action: string,
  afterData: Record<string, unknown>,
) {
  const { error } = await supabase.from('audit_logs').insert({
    organization_id: campaign.organization_id,
    actor_type: 'SYSTEM',
    actor_id: 'cloudflare_cron',
    action,
    entity_type: 'campaign',
    entity_id: campaign.id,
    after_data: afterData,
  });
  if (error) throw new Error(`Pilot acquisition audit failed: ${error.message}`);
}

async function processCampaign(supabase: SupabaseClient, campaign: CampaignRow, now: Date) {
  const config = record(campaign.config);
  if (config.autoAcquisitionEnabled !== true) {
    return { campaignId: campaign.id, action: 'SKIPPED', reason: 'AUTO_ACQUISITION_DISABLED' };
  }

  const [controlsResult, discoveryResult] = await Promise.all([
    supabase.from('system_controls')
      .select('global_kill_switch,agents_paused,shadow_mode')
      .eq('organization_id', campaign.organization_id)
      .maybeSingle(),
    supabase.from('discovery_records')
      .select('id,source_id,raw_payload,discovered_at')
      .eq('organization_id', campaign.organization_id)
      .eq('campaign_id', campaign.id)
      .eq('source_type', 'google_places')
      .order('discovered_at', { ascending: false })
      .limit(100),
  ]);
  if (controlsResult.error || !controlsResult.data) throw new Error(`Pilot controls unavailable: ${controlsResult.error?.message ?? 'not found'}`);
  if (discoveryResult.error) throw new Error(`Pilot discovery journal unavailable: ${discoveryResult.error.message}`);

  const qualificationCount = (discoveryResult.data ?? []).filter((row) => {
    const raw = record(row.raw_payload);
    return raw.autoAcquisitionPilot === true && raw.detailsLookupCharged === true;
  }).length;

  const policy = evaluatePilotAcquisitionPolicy({
    status: campaign.status,
    countryCode: campaign.country_code,
    config,
    shadowMode: Boolean(controlsResult.data.shadow_mode),
    globalKillSwitch: Boolean(controlsResult.data.global_kill_switch),
    agentsPaused: Boolean(controlsResult.data.agents_paused),
    qualificationCount,
    now,
  });

  if (!policy.allowed) {
    if (policy.terminal && config.autoAcquisitionEnabled === true) {
      await updateCampaignConfig(supabase, campaign, {
        autoAcquisitionEnabled: false,
        pilotPhase: 'AUTO_ACQUISITION_COMPLETE',
        pausedReason: policy.reason,
        autoAcquisitionStoppedAt: now.toISOString(),
        providerCallsThisPilot: qualificationCount,
      });
      await audit(supabase, campaign, 'OMAN_PILOT_AUTO_ACQUISITION_STOPPED', {
        reason: policy.reason,
        qualificationCount,
        maxPaidQualifications: policy.maxPaidQualifications,
        shadowModeRemainsOn: true,
        providerSendTriggered: false,
      });
    }
    return { campaignId: campaign.id, action: 'SKIPPED', reason: policy.reason, qualificationCount };
  }

  const [integrationResult, marketResult, servicesResult, pricesResult, costState] = await Promise.all([
    supabase.from('integration_connections')
      .select('enabled,status')
      .eq('organization_id', campaign.organization_id)
      .eq('provider', 'GOOGLE_PLACES')
      .eq('channel', 'DISCOVERY')
      .maybeSingle(),
    supabase.from('market_settings')
      .select('enabled')
      .eq('organization_id', campaign.organization_id)
      .eq('country_code', 'OM')
      .maybeSingle(),
    supabase.from('services').select('id').eq('organization_id', campaign.organization_id).eq('enabled', true),
    supabase.from('service_prices').select('service_id,country_code,price').eq('organization_id', campaign.organization_id).eq('country_code', 'OM'),
    getCostGuardState(campaign.organization_id),
  ]);
  if (integrationResult.error || !integrationResult.data?.enabled || integrationResult.data.status !== 'CONNECTED') {
    throw new Error(`Google Places is not production-verified CONNECTED: ${integrationResult.error?.message ?? integrationResult.data?.status ?? 'missing'}`);
  }
  if (marketResult.error || !marketResult.data?.enabled) throw new Error(`Oman market is unavailable: ${marketResult.error?.message ?? 'disabled'}`);
  if (servicesResult.error || pricesResult.error) throw new Error(`Service catalog unavailable: ${servicesResult.error?.message ?? pricesResult.error?.message}`);
  if (!costState) throw new Error('Cost Guard state is unavailable; pilot acquisition blocked');

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: discoveredToday, error: countError } = await supabase.from('discovery_records')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', campaign.organization_id)
    .gte('discovered_at', startOfDay.toISOString());
  if (countError) throw new Error(`Daily discovery usage unavailable: ${countError.message}`);
  const remainingDaily = Math.max(0, Number(costState.settings.daily_new_leads ?? 0) - Number(discoveredToday ?? 0));
  if (remainingDaily < 1) {
    await updateCampaignConfig(supabase, campaign, { lastAutoAcquisitionAt: now.toISOString() });
    return { campaignId: campaign.id, action: 'SKIPPED', reason: 'DAILY_DISCOVERY_CAP_REACHED' };
  }

  const city = String(campaign.city ?? 'Muscat').trim() || 'Muscat';
  const industry = String(campaign.industry ?? 'dental clinic').trim() || 'dental clinic';
  const search = await controlledGooglePlacesIdSearch({
    organizationId: campaign.organization_id,
    query: { countryCode: 'OM', city, industry, limit: MAX_DISCOVERY_IDS },
  });
  const placeIds = [...new Set(search.placeIds)].slice(0, MAX_DISCOVERY_IDS);
  if (!placeIds.length) {
    await updateCampaignConfig(supabase, campaign, { lastAutoAcquisitionAt: now.toISOString() });
    await audit(supabase, campaign, 'OMAN_PILOT_AUTO_ACQUISITION_CYCLE', {
      result: 'NO_PROVIDER_IDS', city, industry, providerCalls: 0, providerSendTriggered: false,
    });
    return { campaignId: campaign.id, action: 'NO_CANDIDATE', reason: 'NO_PROVIDER_IDS' };
  }

  const [knownBusinessesResult, knownDiscoveriesResult] = await Promise.all([
    supabase.from('businesses').select('google_place_id').eq('organization_id', campaign.organization_id).in('google_place_id', placeIds),
    supabase.from('discovery_records').select('source_id').eq('organization_id', campaign.organization_id).eq('source_type', 'google_places').in('source_id', placeIds),
  ]);
  if (knownBusinessesResult.error || knownDiscoveriesResult.error) {
    throw new Error(`Pilot dedupe lookup failed: ${knownBusinessesResult.error?.message ?? knownDiscoveriesResult.error?.message}`);
  }
  const known = new Set([
    ...(knownBusinessesResult.data ?? []).map((row) => String(row.google_place_id ?? '')).filter(Boolean),
    ...(knownDiscoveriesResult.data ?? []).map((row) => String(row.source_id ?? '')).filter(Boolean),
  ]);
  const remainingQualifications = Math.max(0, policy.maxPaidQualifications - qualificationCount);
  // Keep the journal exactly aligned with paid work: one new Place ID and at most
  // one paid qualification per cycle. We intentionally do not create a backlog.
  const newIds = placeIds.filter((id) => !known.has(id)).slice(0, Math.min(remainingDaily, remainingQualifications, 1));

  if (!newIds.length) {
    await updateCampaignConfig(supabase, campaign, { lastAutoAcquisitionAt: now.toISOString() });
    await audit(supabase, campaign, 'OMAN_PILOT_AUTO_ACQUISITION_CYCLE', {
      result: 'NO_NEW_IDS', returnedIds: placeIds.length, providerCalls: 0, providerSendTriggered: false,
    });
    return { campaignId: campaign.id, action: 'NO_CANDIDATE', reason: 'NO_NEW_IDS' };
  }

  const placeId = newIds[0];
  const discoveryRaw = {
    provider: 'GOOGLE_PLACES',
    operation: 'TEXT_SEARCH_IDS_ONLY',
    countryCode: 'OM',
    city,
    industry,
    placeId,
    autoAcquisitionPilot: true,
    pilotWindowEndsAt: policy.windowEndsAt,
    qualificationTarget: 'GROWTH_OPPORTUNITY',
    providerSendTriggered: false,
  };
  const { error: insertDiscoveryError } = await supabase.from('discovery_records').insert({
    organization_id: campaign.organization_id,
    campaign_id: campaign.id,
    source_type: 'google_places',
    source_id: placeId,
    source_url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    raw_payload: discoveryRaw,
  });
  if (insertDiscoveryError) throw new Error(`Pilot discovery persistence failed: ${insertDiscoveryError.message}`);

  const business = await controlledGooglePlaceQualification({
    organizationId: campaign.organization_id,
    placeId,
    countryCode: 'OM',
    city,
  });
  const businessRow = buildBusinessPersistenceRow(campaign.organization_id, business);
  const { data: insertedBusiness, error: insertBusinessError } = await supabase.from('businesses')
    .insert(businessRow)
    .select('id')
    .single();
  let businessId = insertedBusiness?.id ? String(insertedBusiness.id) : '';
  if (insertBusinessError) {
    if (insertBusinessError.code !== '23505') throw new Error(`Pilot business persistence failed: ${insertBusinessError.message}`);
    const { data: racedBusiness, error: racedBusinessError } = await supabase.from('businesses')
      .select('id')
      .eq('organization_id', campaign.organization_id)
      .eq('google_place_id', placeId)
      .single();
    if (racedBusinessError) throw new Error(`Pilot business dedupe reconciliation failed: ${racedBusinessError.message}`);
    businessId = String(racedBusiness.id);
  }

  const enabledServices = new Set((servicesResult.data ?? []).map((row) => String(row.id)));
  const marketCatalog = new Set<string>();
  for (const price of pricesResult.data ?? []) {
    const serviceId = String(price.service_id ?? '');
    const amount = Number(price.price);
    if (enabledServices.has(serviceId) && Number.isFinite(amount) && amount >= 0) marketCatalog.add(serviceId);
  }
  const growth = buildGrowthOpportunity(business, { enabledServiceIds: marketCatalog });
  const qualification = growth.qualification;
  const { error: growthError } = await supabase.from('growth_opportunities')
    .upsert(buildGrowthOpportunityPersistenceRow(campaign.organization_id, businessId, growth), { onConflict: 'organization_id,business_id' });
  if (growthError) throw new Error(`Pilot growth routing persistence failed: ${growthError.message}`);

  const priorityQualified = qualification.shouldContact
    && qualification.prospectTier === 'A'
    && Boolean(qualification.primaryServiceId)
    && marketCatalog.has(String(qualification.primaryServiceId));
  let leadId: string | null = null;
  let leadCreated = false;
  if (priorityQualified) {
    const { data: existingLead, error: existingLeadError } = await supabase.from('leads')
      .select('id')
      .eq('organization_id', campaign.organization_id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (existingLeadError) throw new Error(`Pilot lead lookup failed: ${existingLeadError.message}`);
    leadId = existingLead?.id ? String(existingLead.id) : null;
    if (!leadId) {
      const leadRow = buildPrecisionLeadPersistenceRow({ organizationId: campaign.organization_id, businessId, qualification });
      const { data: insertedLead, error: insertLeadError } = await supabase.from('leads').insert(leadRow).select('id').single();
      if (insertLeadError) {
        if (insertLeadError.code !== '23505') throw new Error(`Pilot lead persistence failed: ${insertLeadError.message}`);
        const { data: racedLead, error: racedLeadError } = await supabase.from('leads')
          .select('id').eq('organization_id', campaign.organization_id).eq('business_id', businessId).single();
        if (racedLeadError) throw new Error(`Pilot lead dedupe reconciliation failed: ${racedLeadError.message}`);
        leadId = String(racedLead.id);
      } else {
        leadId = String(insertedLead.id);
        leadCreated = true;
      }
    }
  }

  const qualificationReason = priorityQualified
    ? `TIER_A_${qualification.primaryOfferFamily}`
    : qualification.cheapestNextAction === 'WEBSITE_EVIDENCE' || qualification.cheapestNextAction === 'SOCIAL_CHECK'
      ? `EVIDENCE_REQUIRED_${qualification.cheapestNextAction}`
      : qualification.cheapestNextAction === 'CATALOG_SETUP'
        ? `CATALOG_REQUIRED_${qualification.primaryOfferFamily}`
        : `TIER_${qualification.prospectTier}_${qualification.primaryOfferFamily}`;
  const { error: discoveryUpdateError } = await supabase.from('discovery_records').update({
    raw_payload: {
      ...discoveryRaw,
      enrichedAt: now.toISOString(),
      businessId,
      leadId,
      detailsLookupCharged: true,
      priorityQualified,
      qualificationReason,
      prospectTier: qualification.prospectTier,
      qualificationScore: qualification.qualificationScore,
      qualificationConfidence: qualification.qualificationConfidence,
      primaryOfferFamily: qualification.primaryOfferFamily,
      primaryServiceId: qualification.primaryServiceId,
      shouldContact: qualification.shouldContact,
      evidenceGaps: qualification.evidenceGaps,
      growthLane: growth.lane,
      serviceRegion: growth.region,
      overallSalesScore: growth.overallSalesScore,
      personalizationFingerprint: growth.personalization.fingerprint,
      cheapestNextAction: growth.personalization.cheapestNextAction,
      qualificationTier: 'ENTERPRISE_NO_REVIEWS',
      outboundDraftQueued: false,
      providerSendTriggered: false,
    },
  }).eq('organization_id', campaign.organization_id).eq('campaign_id', campaign.id).eq('source_id', placeId);
  if (discoveryUpdateError) throw new Error(`Pilot discovery reconciliation failed: ${discoveryUpdateError.message}`);

  const nextQualificationCount = qualificationCount + 1;
  await updateCampaignConfig(supabase, campaign, {
    lastAutoAcquisitionAt: now.toISOString(),
    providerCallsThisPilot: nextQualificationCount,
    autoQualifiedCount: nextQualificationCount,
    pilotPhase: nextQualificationCount >= policy.maxPaidQualifications ? 'AUTO_ACQUISITION_CAP_REACHED' : 'AUTO_ACQUISITION_ACTIVE',
  });
  await audit(supabase, campaign, 'OMAN_PILOT_AUTO_ACQUISITION_CYCLE', {
    result: 'QUALIFIED',
    placeId,
    businessId,
    leadId,
    leadCreated,
    priorityQualified,
    qualificationReason,
    prospectTier: qualification.prospectTier,
    qualificationScore: qualification.qualificationScore,
    providerCalls: 1,
    providerCostReserveUsd: 0.02,
    insertedDiscoveryIds: 1,
    shadowModeRemainsOn: true,
    manualReviewRemainsOn: true,
    outreachEnabled: false,
    providerSendTriggered: false,
  });

  return {
    campaignId: campaign.id,
    action: 'QUALIFIED',
    placeId,
    businessId,
    leadId,
    priorityQualified,
    qualificationCount: nextQualificationCount,
    maxPaidQualifications: policy.maxPaidQualifications,
  };
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;
  const supabase = serviceClient();
  const now = new Date();

  const { data: campaigns, error: campaignError } = await supabase.from('campaigns')
    .select('id,organization_id,name,country_code,city,industry,status,target_count,config')
    .eq('status', 'RUNNING')
    .eq('country_code', 'OM')
    .order('updated_at', { ascending: false })
    .limit(MAX_CAMPAIGNS_PER_TICK);
  if (campaignError) return NextResponse.json({ error: `Pilot campaign lookup failed: ${campaignError.message}` }, { status: 503 });

  const active = (campaigns ?? []).filter((row) => record(row.config).autoAcquisitionEnabled === true) as CampaignRow[];
  if (!active.length) return NextResponse.json({ ok: true, activeCampaigns: 0, outcomes: [] });

  const outcomes: Array<Record<string, unknown>> = [];
  for (const campaign of active) {
    try {
      outcomes.push(await processCampaign(supabase, campaign, now));
    } catch (error) {
      const message = safeMessage(error);
      // Any failure pauses this paid acquisition window. There is deliberately no
      // automatic retry on the next cron because provider acceptance/reconciliation
      // may be ambiguous after a network or persistence failure.
      try {
        await updateCampaignConfig(supabase, campaign, {
          autoAcquisitionEnabled: false,
          pilotPhase: 'AUTO_ACQUISITION_FAILED',
          pausedReason: 'AUTO_ACQUISITION_FAILURE',
          autoAcquisitionStoppedAt: now.toISOString(),
          lastAutoAcquisitionError: message,
        });
      } catch { /* preserve original failure */ }
      try {
        await audit(supabase, campaign, 'OMAN_PILOT_AUTO_ACQUISITION_FAILED', {
          error: message,
          automaticRetry: false,
          autoAcquisitionPaused: true,
          shadowModeRemainsOn: true,
          providerSendTriggered: false,
        });
      } catch { /* preserve original failure */ }
      outcomes.push({ campaignId: campaign.id, action: 'FAILED', error: message, automaticRetry: false, autoAcquisitionPaused: true });
    }
  }

  return NextResponse.json({ ok: true, activeCampaigns: active.length, outcomes });
}
