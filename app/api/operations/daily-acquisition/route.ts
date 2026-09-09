import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { controlledGooglePlaceQualification, controlledGooglePlacesIdSearch } from '@/lib/hunters/business/google-places-controlled';
import { buildBusinessPersistenceRow } from '@/lib/hunters/business/selective-enrichment';
import { buildGrowthOpportunity, buildGrowthOpportunityPersistenceRow } from '@/lib/hunters/business/growth-routing';
import { buildPrecisionLeadPersistenceRow } from '@/lib/hunters/business/service-fit';
import { getCostGuardState } from '@/lib/reliability/cost-guard';
import { evaluateDailyAcquisitionPolicy } from '@/lib/operations/daily-acquisition-policy';
import { getMarketOperationalProfile, marketDateKey } from '@/lib/outreach/market-profile';

const SEARCH_LIMIT = 20;
const MAX_PAID_QUALIFICATIONS_PER_TICK = 1;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for daily acquisition');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function patchCampaign(supabase: ReturnType<typeof serviceClient>, campaign: { id: string; organization_id: string; config: unknown }, patch: Record<string, unknown>) {
  const config = { ...record(campaign.config), ...patch };
  const { error } = await supabase.from('campaigns').update({ config, updated_at: new Date().toISOString() })
    .eq('organization_id', campaign.organization_id).eq('id', campaign.id);
  if (error) throw new Error(`Daily acquisition campaign update failed: ${error.message}`);
  campaign.config = config;
}

async function audit(supabase: ReturnType<typeof serviceClient>, campaign: { id: string; organization_id: string }, data: Record<string, unknown>) {
  const { error } = await supabase.from('audit_logs').insert({
    organization_id: campaign.organization_id,
    actor_type: 'SYSTEM',
    actor_id: 'cloudflare_cron',
    action: 'DAILY_MULTI_MARKET_ACQUISITION_CYCLE',
    entity_type: 'campaign',
    entity_id: campaign.id,
    after_data: data,
  });
  if (error) throw new Error(`Daily acquisition audit failed: ${error.message}`);
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;
  const supabase = serviceClient();
  const now = new Date();

  const { data: campaigns, error: campaignsError } = await supabase.from('campaigns')
    .select('id,organization_id,name,country_code,city,industry,target_count,status,config,updated_at')
    .eq('status', 'RUNNING')
    .order('updated_at', { ascending: true })
    .limit(50);
  if (campaignsError) return NextResponse.json({ error: `Daily acquisition campaign lookup failed: ${campaignsError.message}` }, { status: 503 });

  const active = (campaigns ?? []).find((row) => {
    const config = record(row.config);
    const code = String(row.country_code ?? '').toUpperCase();
    try {
      return config.dailyOutreachTarget === true
        && config.autoAcquisitionEnabled === true
        && String(config.marketCode ?? '').toUpperCase() === code
        && String(config.targetDate ?? '') === marketDateKey(code, now);
    } catch { return false; }
  });
  if (!active) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ACTIVE_DAILY_ACQUISITION_TARGET' });

  const campaign = active as typeof active & { id: string; organization_id: string };
  const organizationId = String(campaign.organization_id);
  const marketCode = String(campaign.country_code ?? '').toUpperCase();
  const profile = getMarketOperationalProfile(marketCode);

  const [controlsResult, marketResult, integrationResult, servicesResult, pricesResult, costState] = await Promise.all([
    supabase.from('system_controls').select('global_kill_switch,agents_paused,email_paused,shadow_mode').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('market_settings').select('enabled,config,timezone').eq('organization_id', organizationId).eq('country_code', marketCode).maybeSingle(),
    supabase.from('integration_connections').select('enabled,status').eq('organization_id', organizationId).eq('provider', 'GOOGLE_PLACES').eq('channel', 'DISCOVERY').maybeSingle(),
    supabase.from('services').select('id').eq('organization_id', organizationId).eq('enabled', true),
    supabase.from('service_prices').select('service_id,price').eq('organization_id', organizationId).eq('country_code', marketCode),
    getCostGuardState(organizationId),
  ]);
  const firstError = [controlsResult.error, marketResult.error, integrationResult.error, servicesResult.error, pricesResult.error].find(Boolean);
  if (firstError) return NextResponse.json({ error: `Daily acquisition preflight failed: ${firstError.message}` }, { status: 503 });
  if (!controlsResult.data) return NextResponse.json({ error: 'System controls unavailable' }, { status: 503 });

  const policy = evaluateDailyAcquisitionPolicy({
    status: campaign.status,
    countryCode: marketCode,
    config: record(campaign.config),
    shadowMode: Boolean(controlsResult.data.shadow_mode),
    globalKillSwitch: Boolean(controlsResult.data.global_kill_switch),
    agentsPaused: Boolean(controlsResult.data.agents_paused),
    emailPaused: Boolean(controlsResult.data.email_paused),
  });
  if (!policy.allowed) {
    await patchCampaign(supabase, campaign, { lastAcquisitionReason: policy.reason, lastAutoAcquisitionAt: now.toISOString() });
    return NextResponse.json({ ok: true, action: 'SKIPPED', reason: policy.reason, marketCode });
  }
  const marketConfig = record(marketResult.data?.config);
  if (!marketResult.data?.enabled || marketConfig.coldEmailEnabled !== true) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'MARKET_EMAIL_DISABLED', marketCode });
  if (!integrationResult.data?.enabled || integrationResult.data.status !== 'CONNECTED') return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'GOOGLE_PLACES_NOT_CONNECTED', marketCode });
  if (!costState) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'COST_GUARD_UNAVAILABLE', marketCode });

  const enabledServices = new Set((servicesResult.data ?? []).map((row) => String(row.id)));
  const marketCatalog = new Set((pricesResult.data ?? [])
    .filter((row) => enabledServices.has(String(row.service_id)) && Number.isFinite(Number(row.price)) && Number(row.price) >= 0)
    .map((row) => String(row.service_id)));
  if (!marketCatalog.size) {
    await patchCampaign(supabase, campaign, { lastAcquisitionReason: 'MARKET_CATALOG_NOT_PRICED', lastAutoAcquisitionAt: now.toISOString() });
    return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'MARKET_CATALOG_NOT_PRICED', marketCode });
  }

  const startUtc = new Date(now); startUtc.setUTCHours(0, 0, 0, 0);
  const { count: discoveredToday, error: discoveryCountError } = await supabase.from('discovery_records')
    .select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).gte('discovered_at', startUtc.toISOString());
  if (discoveryCountError) return NextResponse.json({ error: `Daily discovery count failed: ${discoveryCountError.message}` }, { status: 503 });
  const remainingDaily = Math.max(0, Number(costState.settings.daily_new_leads ?? 0) - Number(discoveredToday ?? 0));
  if (remainingDaily < 1) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'DAILY_DISCOVERY_CAP_REACHED', marketCode });

  const city = String(campaign.city ?? profile.defaultCity).trim() || profile.defaultCity;
  const industry = String(campaign.industry ?? '').trim();
  if (!industry) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'INDUSTRY_REQUIRED', marketCode });

  // Reconciliation-first: if a previous paid qualification settled but persistence did not finish,
  // never repeat the paid provider call automatically.
  const { data: pendingJournal, error: pendingJournalError } = await supabase.from('discovery_records')
    .select('id,source_id,raw_payload').eq('organization_id', organizationId).eq('campaign_id', campaign.id)
    .eq('source_type', 'google_places').order('discovered_at', { ascending: true }).limit(100);
  if (pendingJournalError) return NextResponse.json({ error: `Discovery journal lookup failed: ${pendingJournalError.message}` }, { status: 503 });
  for (const row of pendingJournal ?? []) {
    const raw = record(row.raw_payload);
    if (raw.dailyControlledAcquisition !== true || raw.reconciled === true) continue;
    const placeId = String(row.source_id ?? '');
    const [{ data: business }, { data: settled }] = await Promise.all([
      supabase.from('businesses').select('id').eq('organization_id', organizationId).eq('google_place_id', placeId).maybeSingle(),
      supabase.from('usage_events').select('id').eq('organization_id', organizationId).eq('provider', 'GOOGLE_PLACES').eq('operation', 'PLACE_DETAILS_PRIORITY_QUALIFICATION').contains('metadata', { placeId, accounting_state: 'SETTLED' }).limit(1).maybeSingle(),
    ]);
    if (business?.id) {
      await supabase.from('discovery_records').update({ raw_payload: { ...raw, reconciled: true, businessId: business.id, reconciledAt: now.toISOString() } }).eq('organization_id', organizationId).eq('id', row.id);
      continue;
    }
    if (settled?.id) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'PAID_QUALIFICATION_RECONCILIATION_REQUIRED', marketCode, placeId });
  }

  const search = await controlledGooglePlacesIdSearch({ organizationId, query: { countryCode: marketCode, city, industry, limit: SEARCH_LIMIT } });
  const placeIds = [...new Set(search.placeIds)].slice(0, SEARCH_LIMIT);
  if (!placeIds.length) {
    await patchCampaign(supabase, campaign, { lastAcquisitionReason: 'NO_PROVIDER_IDS', lastAutoAcquisitionAt: now.toISOString() });
    return NextResponse.json({ ok: true, action: 'NO_CANDIDATE', reason: 'NO_PROVIDER_IDS', marketCode, city, industry });
  }

  const [knownBusinesses, knownDiscoveries] = await Promise.all([
    supabase.from('businesses').select('google_place_id').eq('organization_id', organizationId).in('google_place_id', placeIds),
    supabase.from('discovery_records').select('source_id').eq('organization_id', organizationId).eq('source_type', 'google_places').in('source_id', placeIds),
  ]);
  if (knownBusinesses.error || knownDiscoveries.error) return NextResponse.json({ error: `Daily acquisition dedupe failed: ${knownBusinesses.error?.message ?? knownDiscoveries.error?.message}` }, { status: 503 });
  const known = new Set([...(knownBusinesses.data ?? []).map((x) => String(x.google_place_id ?? '')), ...(knownDiscoveries.data ?? []).map((x) => String(x.source_id ?? ''))]);
  const newIds = placeIds.filter((id) => !known.has(id)).slice(0, Math.min(remainingDaily, MAX_PAID_QUALIFICATIONS_PER_TICK));
  if (!newIds.length) return NextResponse.json({ ok: true, action: 'NO_CANDIDATE', reason: 'NO_NEW_IDS', marketCode });

  const placeId = newIds[0];
  const journalRaw = { provider: 'GOOGLE_PLACES', countryCode: marketCode, city, industry, placeId, dailyControlledAcquisition: true, reconciled: false, providerSendTriggered: false };
  const { data: journal, error: journalError } = await supabase.from('discovery_records').insert({
    organization_id: organizationId,
    campaign_id: campaign.id,
    source_type: 'google_places',
    source_id: placeId,
    source_url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    raw_payload: journalRaw,
  }).select('id').single();
  if (journalError) return NextResponse.json({ error: `Daily acquisition journal failed: ${journalError.message}` }, { status: 503 });

  const business = await controlledGooglePlaceQualification({ organizationId, placeId, countryCode: marketCode, city });
  const businessRow = buildBusinessPersistenceRow(organizationId, business);
  const inserted = await supabase.from('businesses').insert(businessRow).select('id').single();
  let businessId = inserted.data?.id ? String(inserted.data.id) : '';
  if (inserted.error) {
    if (inserted.error.code !== '23505') return NextResponse.json({ error: `Business persistence failed: ${inserted.error.message}` }, { status: 503 });
    const raced = await supabase.from('businesses').select('id').eq('organization_id', organizationId).eq('google_place_id', placeId).single();
    if (raced.error) return NextResponse.json({ error: `Business dedupe reconciliation failed: ${raced.error.message}` }, { status: 503 });
    businessId = String(raced.data.id);
  }

  const growth = buildGrowthOpportunity(business, { enabledServiceIds: marketCatalog });
  const growthWrite = await supabase.from('growth_opportunities').upsert(buildGrowthOpportunityPersistenceRow(organizationId, businessId, growth), { onConflict: 'organization_id,business_id' });
  if (growthWrite.error) return NextResponse.json({ error: `Growth routing persistence failed: ${growthWrite.error.message}` }, { status: 503 });

  let leadId: string | null = null;
  let leadCreated = false;
  if (growth.qualification.shouldContact && growth.qualification.prospectTier === 'A' && growth.qualification.primaryServiceId) {
    const existingLead = await supabase.from('leads').select('id').eq('organization_id', organizationId).eq('business_id', businessId).maybeSingle();
    if (existingLead.error) return NextResponse.json({ error: `Lead lookup failed: ${existingLead.error.message}` }, { status: 503 });
    leadId = existingLead.data?.id ? String(existingLead.data.id) : null;
    if (!leadId) {
      const created = await supabase.from('leads').insert(buildPrecisionLeadPersistenceRow({ organizationId, businessId, qualification: growth.qualification })).select('id').single();
      if (created.error && created.error.code !== '23505') return NextResponse.json({ error: `Lead persistence failed: ${created.error.message}` }, { status: 503 });
      if (created.data?.id) { leadId = String(created.data.id); leadCreated = true; }
      else {
        const raced = await supabase.from('leads').select('id').eq('organization_id', organizationId).eq('business_id', businessId).single();
        if (raced.error) return NextResponse.json({ error: `Lead dedupe reconciliation failed: ${raced.error.message}` }, { status: 503 });
        leadId = String(raced.data.id);
      }
    }
  }

  const reconciled = { ...journalRaw, reconciled: true, reconciledAt: now.toISOString(), businessId, leadId, leadCreated, prospectTier: growth.qualification.prospectTier, qualificationScore: growth.qualification.qualificationScore, primaryServiceId: growth.qualification.primaryServiceId, cheapestNextAction: growth.qualification.cheapestNextAction, providerSendTriggered: false };
  const journalUpdate = await supabase.from('discovery_records').update({ raw_payload: reconciled }).eq('organization_id', organizationId).eq('id', journal.id);
  if (journalUpdate.error) return NextResponse.json({ error: `Discovery reconciliation failed: ${journalUpdate.error.message}` }, { status: 503 });
  await patchCampaign(supabase, campaign, { lastAutoAcquisitionAt: now.toISOString(), lastAcquisitionReason: 'QUALIFIED', lastAcquiredBusinessId: businessId, lastAcquiredLeadId: leadId });
  await audit(supabase, campaign, { result: 'QUALIFIED', marketCode, city, industry, placeId, businessId, leadId, leadCreated, prospectTier: growth.qualification.prospectTier, qualificationScore: growth.qualification.qualificationScore, providerCalls: 1, providerCostReserveUsd: 0.02, providerSendTriggered: false });

  return NextResponse.json({ ok: true, action: 'QUALIFIED', marketCode, city, industry, businessId, leadId, leadCreated, prospectTier: growth.qualification.prospectTier, qualificationScore: growth.qualification.qualificationScore, providerCalls: 1 });
}
