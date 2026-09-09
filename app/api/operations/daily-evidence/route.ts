import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { fetchDeterministicWebsiteEvidence, safeWebsiteEvidenceError } from '@/lib/hunters/business/deterministic-website-evidence';
import { selectFirstPartyContactEmail } from '@/lib/hunters/business/contact-evidence';
import { buildGrowthOpportunity, buildGrowthOpportunityPersistenceRow } from '@/lib/hunters/business/growth-routing';
import { buildPrecisionLeadPersistenceRow, type WebsiteAuditEvidence } from '@/lib/hunters/business/service-fit';
import { classifyWebsiteUri } from '@/lib/hunters/business/selective-enrichment';
import type { DiscoveredBusiness } from '@/lib/hunters/business/types';
import { buildCanonicalFirstTouchDraft } from '@/lib/outreach/message-plan';
import { getLocaleProfile } from '@/lib/outreach/locale';
import { marketDayUtcRange, resolveMarketSendTimezone, getMarketOperationalProfile } from '@/lib/outreach/market-profile';
import { queueShadowDraft, shadowProviderMessageId } from '@/lib/outreach/shadow-approval';
import { countMailboxSendsLast24Hours } from '@/lib/outreach/mailbox-usage';
import { evidencePipelineTargetMatches } from '@/lib/operations/evidence-pipeline-policy';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for daily evidence');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

function auditEvidence(row: Record<string, unknown>): WebsiteAuditEvidence {
  return {
    seoQuality: row.seo_quality as string | null,
    mobileQuality: row.mobile_quality as string | null,
    ctaQuality: row.cta_quality as string | null,
    hasArabic: row.has_arabic as boolean | null,
    hasEnglish: row.has_english as boolean | null,
    hasBooking: row.has_booking as boolean | null,
    hasWhatsapp: row.has_whatsapp as boolean | null,
    brokenLinks: row.broken_links == null ? null : Number(row.broken_links),
  };
}

function toDiscovered(row: Record<string, unknown>, verifiedEmail?: string | null): DiscoveredBusiness {
  return {
    sourceType: 'google_places',
    sourceId: String(row.google_place_id ?? row.id),
    googlePlaceId: row.google_place_id ? String(row.google_place_id) : undefined,
    name: String(row.name ?? ''),
    countryCode: String(row.country_code ?? '').toUpperCase(),
    city: row.city ? String(row.city) : undefined,
    category: row.category ? String(row.category) : undefined,
    officialWebsite: row.official_website ? String(row.official_website) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    internationalPhone: row.international_phone ? String(row.international_phone) : undefined,
    email: verifiedEmail ?? (row.email ? String(row.email) : undefined),
    instagram: row.instagram ? String(row.instagram) : undefined,
    whatsapp: row.whatsapp ? String(row.whatsapp) : undefined,
    formattedAddress: row.formatted_address ? String(row.formatted_address) : undefined,
    googleMapsUri: row.google_maps_uri ? String(row.google_maps_uri) : undefined,
    rating: row.google_rating == null ? undefined : Number(row.google_rating),
    userRatingCount: row.google_user_rating_count == null ? undefined : Number(row.google_user_rating_count),
    businessStatus: row.google_business_status ? String(row.google_business_status) : undefined,
    primaryTypeDisplayName: row.google_primary_type_display_name ? String(row.google_primary_type_display_name) : undefined,
    retrievedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;
  const supabase = serviceClient();
  const now = new Date();
  const { data: campaigns, error: campaignsError } = await supabase.from('campaigns')
    .select('id,organization_id,country_code,city,industry,target_count,status,config,updated_at')
    .eq('status', 'RUNNING').order('updated_at', { ascending: true }).limit(50);
  if (campaignsError) return NextResponse.json({ error: campaignsError.message }, { status: 503 });
  const target = (campaigns ?? []).find((row) => {
    const config = record(row.config); const code = String(row.country_code ?? '').toUpperCase();
    try { return config.dailyOutreachTarget === true && String(config.marketCode ?? '').toUpperCase() === code && String(config.targetDate ?? '') === marketDayUtcRange(code, now).dateKey; } catch { return false; }
  });
  if (!target) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ACTIVE_DAILY_TARGET' });
  const organizationId = String(target.organization_id); const marketCode = String(target.country_code).toUpperCase();
  const day = marketDayUtcRange(marketCode, now); const profile = getMarketOperationalProfile(marketCode);
  const config = record(target.config);
  const draftLimit = Math.max(1, Math.min(Number(target.target_count ?? 1), Number(config.maxShadowDrafts ?? target.target_count ?? 1)));

  const [controls, market, services, prices, mailboxes, existingDrafts] = await Promise.all([
    supabase.from('system_controls').select('global_kill_switch,agents_paused,email_paused,shadow_mode').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('market_settings').select('enabled,config,timezone').eq('organization_id', organizationId).eq('country_code', marketCode).maybeSingle(),
    supabase.from('services').select('id').eq('organization_id', organizationId).eq('enabled', true),
    supabase.from('service_prices').select('service_id,price').eq('organization_id', organizationId).eq('country_code', marketCode),
    supabase.from('mailboxes').select('id,daily_limit,warmup_status,health_status,enabled').eq('organization_id', organizationId).eq('enabled', true),
    supabase.from('conversation_messages').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('channel', 'EMAIL').eq('direction', 'OUTBOUND').like('provider_message_id', 'shadow:growth-first-touch:%').gte('created_at', day.startIso).lt('created_at', day.endIso),
  ]);
  const firstError = [controls.error, market.error, services.error, prices.error, mailboxes.error, existingDrafts.error].find(Boolean);
  if (firstError) return NextResponse.json({ error: `Daily evidence preflight failed: ${firstError.message}` }, { status: 503 });
  if (!controls.data || controls.data.global_kill_switch || controls.data.agents_paused || controls.data.email_paused || !controls.data.shadow_mode) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'SAFETY_CONTROLS_BLOCKED', marketCode });
  if (!market.data?.enabled || record(market.data.config).coldEmailEnabled !== true) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'MARKET_EMAIL_DISABLED', marketCode });
  if (Number(existingDrafts.count ?? 0) >= draftLimit) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'DAILY_SHADOW_DRAFT_CAP_REACHED', marketCode, draftLimit });

  const enabled = new Set((services.data ?? []).map((x) => String(x.id)));
  const catalog = new Set((prices.data ?? []).filter((x) => enabled.has(String(x.service_id)) && Number(x.price) >= 0).map((x) => String(x.service_id)));
  if (!catalog.size) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'MARKET_CATALOG_NOT_PRICED', marketCode });

  const { data: growthRows, error: growthError } = await supabase.from('growth_opportunities')
    .select('id,business_id,qualification_score,message_hooks,businesses(id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_primary_type_display_name)')
    .eq('organization_id', organizationId).order('qualification_score', { ascending: false }).limit(80);
  if (growthError) return NextResponse.json({ error: growthError.message }, { status: 503 });

  const candidates = (growthRows ?? []).map((g) => {
    const b = Array.isArray(g.businesses) ? g.businesses[0] : g.businesses;
    return { growth: g, business: b as Record<string, unknown> | null };
  }).filter(({ business }) => business && String(business.country_code ?? '').toUpperCase() === marketCode && evidencePipelineTargetMatches({
    targetCity: target.city, targetIndustry: target.industry, businessCity: business.city as string | null,
    formattedAddress: business.formatted_address as string | null, category: business.category as string | null,
    primaryType: business.google_primary_type_display_name as string | null,
  }));
  if (!candidates.length) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_EVIDENCE_CANDIDATE', marketCode });

  for (const candidate of candidates) {
    const business = candidate.business!; const businessId = String(business.id);
    const { data: existingLead } = await supabase.from('leads').select('id,status,agent_mode').eq('organization_id', organizationId).eq('business_id', businessId).maybeSingle();
    if (existingLead?.id) {
      const providerId = shadowProviderMessageId(`growth-first-touch:${existingLead.id}`);
      const { data: existingMessage } = await supabase.from('conversation_messages').select('id').eq('organization_id', organizationId).eq('provider_message_id', providerId).maybeSingle();
      if (existingMessage) continue;
    }

    const website = String(business.official_website ?? '').trim();
    if (classifyWebsiteUri(website) !== 'STANDALONE') continue;
    const { data: cached } = await supabase.from('website_audits').select('*').eq('organization_id', organizationId).eq('business_id', businessId).eq('status', 'SUCCEEDED').order('created_at', { ascending: false }).limit(1).maybeSingle();
    let audit = cached as Record<string, unknown> | null;
    if (!audit) {
      const started = await supabase.from('website_audits').insert({ organization_id: organizationId, business_id: businessId, source_url: website, status: 'RUNNING' }).select('id').single();
      if (started.error) return NextResponse.json({ error: started.error.message }, { status: 503 });
      try {
        const fetched = await fetchDeterministicWebsiteEvidence(website); const r = fetched.result; const completedAt = new Date().toISOString();
        const completed = await supabase.from('website_audits').update({ source_url: fetched.sourceUrl, status: 'SUCCEEDED', title: r.title, detected_languages: r.detectedLanguages, services: r.services, contact_emails: r.contactEmails, contact_phones: r.contactPhones, social_links: r.socialLinks, has_arabic: r.hasArabic, has_english: r.hasEnglish, has_booking: r.hasBooking, has_whatsapp: r.hasWhatsapp, mobile_quality: r.mobileQuality, seo_quality: r.seoQuality, cta_quality: r.ctaQuality, broken_links: 0, evidence: r.evidence, error_message: null, audited_at: completedAt }).eq('organization_id', organizationId).eq('id', started.data.id).select('*').single();
        if (completed.error) throw completed.error; audit = completed.data as Record<string, unknown>;
      } catch (error) {
        const message = safeWebsiteEvidenceError(error); await supabase.from('website_audits').update({ status: 'FAILED', error_message: message, audited_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', started.data.id);
        return NextResponse.json({ ok: true, action: 'FAILED', reason: message, marketCode, businessId, automaticRetry: false });
      }
    }

    const verifiedEmail = selectFirstPartyContactEmail(String(audit.source_url ?? website), Array.isArray(audit.contact_emails) ? audit.contact_emails.map(String) : []);
    if (!verifiedEmail) continue;
    if (!String(business.email ?? '').trim()) await supabase.from('businesses').update({ email: verifiedEmail, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', businessId).is('email', null);

    const discovered = toDiscovered(business, verifiedEmail);
    const rerouted = buildGrowthOpportunity(discovered, { websiteAudit: auditEvidence(audit), enabledServiceIds: catalog });
    const writeGrowth = await supabase.from('growth_opportunities').upsert(buildGrowthOpportunityPersistenceRow(organizationId, businessId, rerouted), { onConflict: 'organization_id,business_id' });
    if (writeGrowth.error) return NextResponse.json({ error: writeGrowth.error.message }, { status: 503 });
    const q = rerouted.qualification;
    if (!q.shouldContact || q.prospectTier !== 'A' || !q.primaryServiceId || !catalog.has(q.primaryServiceId)) continue;

    let lead = existingLead;
    if (!lead?.id) {
      const created = await supabase.from('leads').insert(buildPrecisionLeadPersistenceRow({ organizationId, businessId, qualification: q })).select('id,status,agent_mode').single();
      if (created.error && created.error.code !== '23505') return NextResponse.json({ error: created.error.message }, { status: 503 });
      lead = created.data;
      if (!lead?.id) lead = (await supabase.from('leads').select('id,status,agent_mode').eq('organization_id', organizationId).eq('business_id', businessId).single()).data;
    }
    if (!lead?.id || ['DO_NOT_CONTACT','WON','LOST'].includes(String(lead.status).toUpperCase()) || ['HUMAN','PAUSED'].includes(String(lead.agent_mode).toUpperCase())) continue;

    const mailbox = (mailboxes.data ?? []).find((m) => String(m.health_status).toUpperCase() === 'HEALTHY');
    if (!mailbox) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_HEALTHY_MAILBOX', marketCode });
    const sent24 = await countMailboxSendsLast24Hours({ supabase, organizationId, mailboxId: String(mailbox.id), now });
    if (sent24 >= Number(mailbox.daily_limit ?? 0)) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'MAILBOX_DAILY_CAPACITY_RESERVED', marketCode });

    let draft;
    try { draft = buildCanonicalFirstTouchDraft({ marketCode: marketCode as never, businessName: String(business.name), industry: business.category ? String(business.category) : undefined, evidence: rerouted.personalization.messageHooks, recommendedOffer: q.primaryServiceId }); }
    catch { continue; }
    const { data: existingConversation } = await supabase.from('sales_conversations').select('id').eq('organization_id', organizationId).eq('lead_id', lead.id).eq('channel', 'EMAIL').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    let conversationId = existingConversation?.id ? String(existingConversation.id) : '';
    if (!conversationId) {
      const createdConversation = await supabase.from('sales_conversations').insert({ organization_id: organizationId, lead_id: lead.id, channel: 'EMAIL', stage: 'NEW', agent_mode: 'AUTO' }).select('id').single();
      if (createdConversation.error) return NextResponse.json({ error: createdConversation.error.message }, { status: 503 });
      conversationId = String(createdConversation.data.id);
    }
    const locale = getLocaleProfile(marketCode as never);
    const sendTimezone = resolveMarketSendTimezone({ marketCode, configuredTimezone: String(market.data.timezone ?? ''), leadTimezone: business.timezone ? String(business.timezone) : null });
    const queued = await queueShadowDraft({ organizationId, conversationId, leadId: String(lead.id), channel: 'EMAIL', draft: draft.text, idempotencyKey: `growth-first-touch:${lead.id}`, to: verifiedEmail, subject: draft.subject, mailboxId: String(mailbox.id), marketCode, leadTimezone: sendTimezone, replyLanguage: draft.plan.language, replyDialect: locale.dialect, rememberCustomerLanguage: false });
    await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_type: 'SYSTEM', actor_id: 'cloudflare_cron', action: 'QUEUE_MULTI_MARKET_FIRST_TOUCH_SHADOW_DRAFT', entity_type: 'conversation_message', entity_id: queued.messageId, after_data: { marketCode, businessId, leadId: lead.id, verifiedFirstPartyEmail: true, serviceId: q.primaryServiceId, languageMode: draft.plan.languageMode, languages: draft.plan.languages, observationKey: draft.observation.key, sourceEvidence: draft.observation.sourceEvidence, shadowMode: true, providerSendTriggered: false, llmCalls: 0 } });
    await supabase.from('campaigns').update({ config: { ...config, lastEvidenceCycleAt: now.toISOString(), lastEvidenceReason: 'FIRST_TOUCH_QUEUED', lastEvidenceBusinessId: businessId }, updated_at: now.toISOString() }).eq('organization_id', organizationId).eq('id', target.id);
    return NextResponse.json({ ok: true, action: 'EVIDENCE_READY', marketCode, businessId, leadId: lead.id, firstTouch: { status: queued.duplicate ? 'DUPLICATE' : 'QUEUED', messageId: queued.messageId }, providerSendTriggered: false });
  }
  return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ADVANCEABLE_EVIDENCE_CANDIDATE', marketCode, defaultCity: profile.defaultCity });
}
