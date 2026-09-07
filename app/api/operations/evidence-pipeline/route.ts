import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { selectFirstPartyContactEmail } from '@/lib/hunters/business/contact-evidence';
import { fetchDeterministicWebsiteEvidence, safeWebsiteEvidenceError } from '@/lib/hunters/business/deterministic-website-evidence';
import { buildGrowthOpportunity, buildGrowthOpportunityPersistenceRow } from '@/lib/hunters/business/growth-routing';
import { buildPrecisionLeadPersistenceRow, type SocialAssessment, type WebsiteAuditEvidence } from '@/lib/hunters/business/service-fit';
import { classifyWebsiteUri } from '@/lib/hunters/business/selective-enrichment';
import type { DiscoveredBusiness } from '@/lib/hunters/business/types';
import { buildOmanFirstTouchDraft } from '@/lib/outreach/message-plan';
import { omanDayUtcRange } from '@/lib/outreach/daily-target';
import { countMailboxSendsLast24Hours } from '@/lib/outreach/mailbox-usage';
import { queueShadowDraft, shadowProviderMessageId } from '@/lib/outreach/shadow-approval';
import { evidencePipelineAuditDecision, evidencePipelineCandidatePriority } from '@/lib/operations/evidence-pipeline-policy';

const MAX_CANDIDATE_SCAN = 30;
const MAX_EVIDENCE_PER_TICK = 1;

type BusinessRow = {
  id: string;
  name: string;
  country_code: string | null;
  city: string | null;
  category: string | null;
  google_place_id: string | null;
  official_website: string | null;
  phone: string | null;
  international_phone: string | null;
  email: string | null;
  instagram: string | null;
  whatsapp: string | null;
  formatted_address: string | null;
  google_maps_uri: string | null;
  google_rating: number | null;
  google_user_rating_count: number | null;
  google_business_status: string | null;
  google_primary_type_display_name: string | null;
};

type GrowthRow = {
  id: string;
  business_id: string;
  prospect_tier: string | null;
  should_contact: boolean | null;
  cheapest_next_action: string | null;
  digital_presence_evidence: unknown;
  businesses: BusinessRow | BusinessRow[] | null;
};

type AuditRow = {
  id: string;
  business_id: string;
  source_url: string | null;
  status: string | null;
  title: string | null;
  detected_languages: string[] | null;
  services: string[] | null;
  contact_emails: string[] | null;
  contact_phones: string[] | null;
  social_links: unknown;
  has_arabic: boolean | null;
  has_english: boolean | null;
  has_booking: boolean | null;
  has_whatsapp: boolean | null;
  mobile_quality: string | null;
  seo_quality: string | null;
  cta_quality: string | null;
  broken_links: number | null;
  evidence: unknown;
  audited_at: string | null;
  created_at: string | null;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for evidence pipeline');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function toDiscovered(row: BusinessRow, verifiedEmail?: string | null): DiscoveredBusiness {
  return {
    sourceType: 'google_places',
    sourceId: row.google_place_id ?? row.id,
    googlePlaceId: row.google_place_id ?? undefined,
    name: row.name,
    countryCode: String(row.country_code ?? '').toUpperCase(),
    city: row.city ?? undefined,
    category: row.category ?? undefined,
    officialWebsite: row.official_website ?? undefined,
    phone: row.phone ?? undefined,
    internationalPhone: row.international_phone ?? undefined,
    email: verifiedEmail ?? row.email ?? undefined,
    instagram: row.instagram ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    formattedAddress: row.formatted_address ?? undefined,
    googleMapsUri: row.google_maps_uri ?? undefined,
    rating: row.google_rating == null ? undefined : Number(row.google_rating),
    userRatingCount: row.google_user_rating_count == null ? undefined : Number(row.google_user_rating_count),
    businessStatus: row.google_business_status ?? undefined,
    primaryTypeDisplayName: row.google_primary_type_display_name ?? undefined,
    retrievedAt: new Date().toISOString(),
  };
}

function socialAssessmentFromEvidence(value: unknown): SocialAssessment | null {
  const social = record(record(value).socialAssessment);
  const quality = String(social.quality ?? '').toUpperCase();
  if (social.status !== 'VERIFIED' || !['WEAK', 'INACTIVE', 'GOOD'].includes(quality)) return null;
  const source = (social.source as SocialAssessment['source']) ?? 'OTHER';
  const reasons = Array.isArray(social.reasons) ? social.reasons.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 5) : [];
  if (source === 'OWNER_REVIEW' && !reasons.some((reason) => reason.length >= 8)) return null;
  return {
    status: 'VERIFIED',
    quality: quality as SocialAssessment['quality'],
    source,
    assessedAt: String(social.assessedAt ?? ''),
    reasons,
  };
}

function websiteEvidence(row: AuditRow): WebsiteAuditEvidence {
  return {
    seoQuality: row.seo_quality,
    mobileQuality: row.mobile_quality,
    ctaQuality: row.cta_quality,
    hasArabic: row.has_arabic,
    hasEnglish: row.has_english,
    hasBooking: row.has_booking,
    hasWhatsapp: row.has_whatsapp,
    brokenLinks: row.broken_links,
  };
}

function allowedLeadState(status: string | null | undefined, agentMode: string | null | undefined) {
  return !['DO_NOT_CONTACT', 'WON', 'LOST'].includes(String(status ?? '').toUpperCase())
    && !['HUMAN', 'PAUSED'].includes(String(agentMode ?? '').toUpperCase());
}

async function logCycle(supabase: SupabaseClient, organizationId: string, entityId: string, afterData: Record<string, unknown>) {
  const { error } = await supabase.from('audit_logs').insert({
    organization_id: organizationId,
    actor_type: 'SYSTEM',
    actor_id: 'cloudflare_cron',
    action: 'CONTROLLED_EVIDENCE_PIPELINE_CYCLE',
    entity_type: 'growth_opportunity',
    entity_id: entityId,
    after_data: afterData,
  });
  if (error) throw new Error(`Evidence pipeline audit failed: ${error.message}`);
}

async function queueEmailFirstTouch(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  leadStatus: string | null;
  leadAgentMode: string | null;
  business: BusinessRow;
  verifiedEmail: string;
  serviceId: string;
  messageHooks: string[];
  mailboxId: string;
}) {
  if (!allowedLeadState(input.leadStatus, input.leadAgentMode)) return { status: 'SKIPPED', reason: 'LEAD_STATE_BLOCKED' } as const;
  const idempotencyKey = `growth-first-touch:${input.leadId}`;
  const providerMessageId = shadowProviderMessageId(idempotencyKey);
  const { data: existing, error: existingError } = await input.supabase.from('conversation_messages')
    .select('id,status')
    .eq('organization_id', input.organizationId)
    .eq('channel', 'EMAIL')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (existingError) throw new Error(`First-touch duplicate lookup failed: ${existingError.message}`);
  if (existing) return { status: 'DUPLICATE', messageId: String(existing.id) } as const;

  const [conversationMessageCount, outreachMessageCount] = await Promise.all([
    input.supabase.from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', input.organizationId)
      .eq('lead_id', input.leadId)
      .neq('status', 'BLOCKED'),
    input.supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('organization_id', input.organizationId).eq('lead_id', input.leadId),
  ]);
  if (conversationMessageCount.error || outreachMessageCount.error) {
    throw new Error(`First-touch activity lookup failed: ${conversationMessageCount.error?.message ?? outreachMessageCount.error?.message}`);
  }
  if ((conversationMessageCount.count ?? 0) > 0 || (outreachMessageCount.count ?? 0) > 0) {
    return { status: 'SKIPPED', reason: 'EXISTING_MESSAGE_ACTIVITY' } as const;
  }

  let draft: ReturnType<typeof buildOmanFirstTouchDraft>;
  try {
    draft = buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: input.business.name,
      industry: input.business.category ?? undefined,
      evidence: input.messageHooks,
      recommendedOffer: input.serviceId,
    });
  } catch {
    return { status: 'SKIPPED', reason: 'NO_CANONICAL_VERIFIED_FIRST_TOUCH_COPY' } as const;
  }

  const { data: existingConversation, error: conversationError } = await input.supabase.from('sales_conversations')
    .select('id,stage,agent_mode,requires_human')
    .eq('organization_id', input.organizationId)
    .eq('lead_id', input.leadId)
    .eq('channel', 'EMAIL')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) throw new Error(`First-touch conversation lookup failed: ${conversationError.message}`);
  if (existingConversation && (existingConversation.stage !== 'NEW' || existingConversation.agent_mode === 'HUMAN' || existingConversation.agent_mode === 'PAUSED' || existingConversation.requires_human)) {
    return { status: 'SKIPPED', reason: 'CONVERSATION_STATE_BLOCKED' } as const;
  }

  let conversationId = existingConversation?.id ? String(existingConversation.id) : '';
  if (!conversationId) {
    const { data: created, error: createError } = await input.supabase.from('sales_conversations').insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      channel: 'EMAIL',
      stage: 'NEW',
      agent_mode: 'AUTO',
    }).select('id').single();
    if (createError) throw new Error(`First-touch conversation create failed: ${createError.message}`);
    conversationId = String(created.id);
  }

  const queued = await queueShadowDraft({
    organizationId: input.organizationId,
    conversationId,
    leadId: input.leadId,
    channel: 'EMAIL',
    draft: draft.text,
    idempotencyKey,
    to: input.verifiedEmail,
    subject: draft.subject,
    mailboxId: input.mailboxId,
    marketCode: 'OM',
    leadTimezone: 'Asia/Muscat',
    replyLanguage: draft.plan.language,
    replyDialect: 'omani',
    rememberCustomerLanguage: false,
  });

  const { error: auditError } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'SYSTEM',
    actor_id: 'cloudflare_cron',
    action: 'QUEUE_GROWTH_FIRST_TOUCH_SHADOW_DRAFT',
    entity_type: 'conversation_message',
    entity_id: queued.messageId,
    after_data: {
      leadId: input.leadId,
      channel: 'EMAIL',
      languageMode: draft.plan.languageMode,
      languages: draft.plan.languages,
      observationKey: draft.observation.key,
      sourceEvidence: draft.observation.sourceEvidence,
      recommendedOffer: input.serviceId,
      verifiedFirstPartyEmail: true,
      shadowMode: true,
      providerSendTriggered: false,
      providerCalls: 0,
      llmCalls: 0,
      origin: 'CONTROLLED_EVIDENCE_PIPELINE',
    },
  });
  if (auditError) throw new Error(`First-touch audit failed: ${auditError.message}`);
  return { status: queued.duplicate ? 'DUPLICATE' : 'QUEUED', messageId: String(queued.messageId) } as const;
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;
  const supabase = serviceClient();
  const now = new Date();
  const omanDay = omanDayUtcRange(now);
  const utcDayStart = new Date(now); utcDayStart.setUTCHours(0, 0, 0, 0);

  const { data: target, error: targetError } = await supabase.from('campaigns')
    .select('id,organization_id,target_count,status,config')
    .eq('status', 'RUNNING')
    .eq('country_code', 'OM')
    .contains('config', { dailyOutreachTarget: true, targetDate: omanDay.dateKey, marketCode: 'OM' })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: `Daily target lookup failed: ${targetError.message}` }, { status: 503 });
  if (!target) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ACTIVE_DAILY_TARGET' });
  const organizationId = String(target.organization_id);

  const [controlsResult, marketResult, costResult, mailboxResult, servicesResult, pricesResult] = await Promise.all([
    supabase.from('system_controls').select('global_kill_switch,agents_paused,shadow_mode,email_paused').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('market_settings').select('enabled,config').eq('organization_id', organizationId).eq('country_code', 'OM').maybeSingle(),
    supabase.from('cost_guard_settings').select('daily_website_audits,audit_cache_days').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('mailboxes').select('id,enabled,daily_limit,warmup_status,health_status').eq('organization_id', organizationId).eq('enabled', true).order('created_at', { ascending: true }).limit(10),
    supabase.from('services').select('id').eq('organization_id', organizationId).eq('enabled', true),
    supabase.from('service_prices').select('service_id,country_code,price').eq('organization_id', organizationId).eq('country_code', 'OM'),
  ]);
  const firstError = [controlsResult.error, marketResult.error, costResult.error, mailboxResult.error, servicesResult.error, pricesResult.error].find(Boolean);
  if (firstError) return NextResponse.json({ error: `Evidence pipeline preflight failed: ${firstError.message}` }, { status: 503 });
  const controls = controlsResult.data;
  if (!controls || controls.global_kill_switch || controls.agents_paused || !controls.shadow_mode) {
    return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'SAFETY_CONTROLS_BLOCKED' });
  }
  if (!marketResult.data?.enabled) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'OMAN_MARKET_DISABLED' });
  if (!costResult.data) return NextResponse.json({ error: 'Cost Guard settings unavailable' }, { status: 503 });

  const { count: auditsToday, error: auditCountError } = await supabase.from('website_audits')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', utcDayStart.toISOString());
  if (auditCountError) return NextResponse.json({ error: `Website audit quota lookup failed: ${auditCountError.message}` }, { status: 503 });
  const auditLimit = Math.max(0, Number(costResult.data.daily_website_audits ?? 0));
  if (Number(auditsToday ?? 0) >= auditLimit) {
    return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'DAILY_WEBSITE_AUDIT_CAP_REACHED', auditsToday, auditLimit });
  }

  const { data: growthRows, error: growthError } = await supabase.from('growth_opportunities')
    .select('id,business_id,prospect_tier,should_contact,cheapest_next_action,digital_presence_evidence,businesses(id,name,country_code,city,category,google_place_id,official_website,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,google_rating,google_user_rating_count,google_business_status,google_price_level,google_primary_type_display_name)')
    .eq('organization_id', organizationId)
    .order('qualification_score', { ascending: false })
    .limit(MAX_CANDIDATE_SCAN);
  if (growthError) return NextResponse.json({ error: `Evidence candidate lookup failed: ${growthError.message}` }, { status: 503 });

  const candidates = ((growthRows ?? []) as GrowthRow[]).map((row) => {
    const business = relation(row.businesses);
    const priority = business && String(business.country_code ?? '').toUpperCase() === 'OM'
      ? evidencePipelineCandidatePriority({
        prospectTier: row.prospect_tier,
        shouldContact: row.should_contact,
        cheapestNextAction: row.cheapest_next_action,
        hasStandaloneWebsite: classifyWebsiteUri(business.official_website) === 'STANDALONE',
        hasEmail: Boolean(String(business.email ?? '').trim()),
      })
      : null;
    return { row, business, priority };
  }).filter((item) => item.business && item.priority !== null)
    .sort((a, b) => Number(a.priority) - Number(b.priority));

  if (!candidates.length) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_EVIDENCE_CANDIDATE' });
  const businessIds = candidates.map((item) => String(item.business!.id));
  const { data: audits, error: auditsError } = await supabase.from('website_audits')
    .select('id,business_id,source_url,status,title,detected_languages,services,contact_emails,contact_phones,social_links,has_arabic,has_english,has_booking,has_whatsapp,mobile_quality,seo_quality,cta_quality,broken_links,evidence,audited_at,created_at')
    .eq('organization_id', organizationId)
    .in('business_id', businessIds)
    .order('created_at', { ascending: false });
  if (auditsError) return NextResponse.json({ error: `Evidence cache lookup failed: ${auditsError.message}` }, { status: 503 });
  const latestAudit = new Map<string, AuditRow>();
  for (const audit of (audits ?? []) as AuditRow[]) if (!latestAudit.has(String(audit.business_id))) latestAudit.set(String(audit.business_id), audit);

  const cacheDays = Math.max(1, Number(costResult.data.audit_cache_days ?? 30));
  const selected = candidates.find((item) => evidencePipelineAuditDecision(latestAudit.get(String(item.business!.id)), now, cacheDays) !== 'WAIT_AFTER_FAILURE');
  if (!selected) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'RECENT_FAILED_AUDITS_COOLDOWN' });

  const row = selected.row;
  const business = selected.business!;
  const decision = evidencePipelineAuditDecision(latestAudit.get(String(business.id)), now, cacheDays);
  let auditRow = latestAudit.get(String(business.id)) ?? null;
  let networkFetch = false;

  if (decision === 'FETCH') {
    networkFetch = true;
    const { data: createdAudit, error: createAuditError } = await supabase.from('website_audits').insert({
      organization_id: organizationId,
      business_id: business.id,
      source_url: business.official_website,
      status: 'RUNNING',
    }).select('id,business_id,source_url,status,created_at').single();
    if (createAuditError) return NextResponse.json({ error: `Evidence audit create failed: ${createAuditError.message}` }, { status: 503 });
    try {
      const fetched = await fetchDeterministicWebsiteEvidence(String(business.official_website));
      const completedAt = new Date().toISOString();
      const { result } = fetched;
      const { data: completed, error: completeError } = await supabase.from('website_audits').update({
        source_url: fetched.sourceUrl,
        status: 'SUCCEEDED',
        title: result.title,
        detected_languages: result.detectedLanguages,
        services: result.services,
        contact_emails: result.contactEmails,
        contact_phones: result.contactPhones,
        social_links: result.socialLinks,
        has_arabic: result.hasArabic,
        has_english: result.hasEnglish,
        has_booking: result.hasBooking,
        has_whatsapp: result.hasWhatsapp,
        mobile_quality: result.mobileQuality,
        seo_quality: result.seoQuality,
        cta_quality: result.ctaQuality,
        broken_links: 0,
        evidence: result.evidence,
        error_message: null,
        audited_at: completedAt,
      }).eq('organization_id', organizationId).eq('id', createdAudit.id)
        .select('id,business_id,source_url,status,title,detected_languages,services,contact_emails,contact_phones,social_links,has_arabic,has_english,has_booking,has_whatsapp,mobile_quality,seo_quality,cta_quality,broken_links,evidence,audited_at,created_at')
        .single();
      if (completeError) throw new Error(`Evidence audit completion failed: ${completeError.message}`);
      auditRow = completed as AuditRow;
    } catch (error) {
      const message = safeWebsiteEvidenceError(error);
      await supabase.from('website_audits').update({ status: 'FAILED', error_message: message, audited_at: new Date().toISOString() })
        .eq('organization_id', organizationId).eq('id', createdAudit.id);
      await logCycle(supabase, organizationId, row.id, {
        action: 'FAILED',
        businessId: business.id,
        websiteAuditId: createdAudit.id,
        error: message,
        automaticRetryWithin24h: false,
        providerCalls: 0,
        llmCalls: 0,
        providerSendTriggered: false,
      });
      return NextResponse.json({ ok: true, action: 'FAILED', businessId: business.id, reason: message, automaticRetryWithin24h: false });
    }
  }

  if (!auditRow || String(auditRow.status).toUpperCase() !== 'SUCCEEDED') {
    return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_SUCCEEDED_AUDIT' });
  }

  const verifiedEmail = selectFirstPartyContactEmail(String(auditRow.source_url ?? business.official_website ?? ''), Array.isArray(auditRow.contact_emails) ? auditRow.contact_emails : []);
  let emailPromoted = false;
  if (verifiedEmail && !String(business.email ?? '').trim()) {
    const { data: updated, error: emailError } = await supabase.from('businesses')
      .update({ email: verifiedEmail, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', business.id)
      .is('email', null)
      .select('id')
      .maybeSingle();
    if (emailError) return NextResponse.json({ error: `Verified email promotion failed: ${emailError.message}` }, { status: 503 });
    emailPromoted = Boolean(updated);
  }

  const enabledServices = new Set((servicesResult.data ?? []).map((service) => String(service.id)));
  const marketCatalog = new Set<string>();
  for (const price of pricesResult.data ?? []) {
    const serviceId = String(price.service_id ?? '');
    const amount = Number(price.price);
    if (enabledServices.has(serviceId) && Number.isFinite(amount) && amount >= 0) marketCatalog.add(serviceId);
  }

  const discovered = toDiscovered(business, verifiedEmail);
  const growth = buildGrowthOpportunity(discovered, {
    websiteAudit: websiteEvidence(auditRow),
    socialAssessment: socialAssessmentFromEvidence(row.digital_presence_evidence),
    enabledServiceIds: marketCatalog,
  });
  const persistence = buildGrowthOpportunityPersistenceRow(organizationId, business.id, growth);
  const digitalEvidence = {
    ...record(persistence.digital_presence_evidence),
    websiteAuditId: auditRow.id,
    websiteAuditedAt: auditRow.audited_at,
    verifiedFirstPartyEmail: verifiedEmail ? true : false,
    providerCallsForWebsiteEvidence: 0,
    llmCallsForWebsiteEvidence: 0,
  };
  const { error: rerouteError } = await supabase.from('growth_opportunities')
    .upsert({ ...persistence, digital_presence_evidence: digitalEvidence }, { onConflict: 'organization_id,business_id' });
  if (rerouteError) return NextResponse.json({ error: `Evidence re-route failed: ${rerouteError.message}` }, { status: 503 });

  const qualification = growth.qualification;
  const priorityQualified = qualification.prospectTier === 'A'
    && qualification.shouldContact
    && Boolean(qualification.primaryServiceId)
    && marketCatalog.has(String(qualification.primaryServiceId));
  let leadId: string | null = null;
  let leadStatus: string | null = null;
  let leadAgentMode: string | null = null;
  let leadCreated = false;

  if (priorityQualified) {
    const { data: existingLead, error: existingLeadError } = await supabase.from('leads')
      .select('id,status,agent_mode')
      .eq('organization_id', organizationId)
      .eq('business_id', business.id)
      .maybeSingle();
    if (existingLeadError) return NextResponse.json({ error: `Evidence lead lookup failed: ${existingLeadError.message}` }, { status: 503 });
    if (existingLead) {
      leadId = String(existingLead.id);
      leadStatus = String(existingLead.status ?? 'NEW');
      leadAgentMode = String(existingLead.agent_mode ?? 'AUTO');
    } else {
      const leadRow = buildPrecisionLeadPersistenceRow({ organizationId, businessId: business.id, qualification });
      const { data: createdLead, error: createLeadError } = await supabase.from('leads').insert(leadRow).select('id,status,agent_mode').single();
      if (createLeadError) return NextResponse.json({ error: `Evidence lead create failed: ${createLeadError.message}` }, { status: 503 });
      leadId = String(createdLead.id);
      leadStatus = String(createdLead.status ?? 'NEW');
      leadAgentMode = String(createdLead.agent_mode ?? 'AUTO');
      leadCreated = true;
    }
  }

  const marketConfig = record(marketResult.data?.config);
  const mailbox = (mailboxResult.data ?? []).find((item) => item.health_status === 'HEALTHY') ?? null;
  const { count: pendingEmail, error: pendingEmailError } = await supabase.from('conversation_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('channel', 'EMAIL')
    .eq('direction', 'OUTBOUND')
    .in('status', ['APPROVAL_REQUIRED', 'APPROVED', 'PROCESSING'])
    .gte('created_at', omanDay.startIso)
    .lt('created_at', omanDay.endIso);
  if (pendingEmailError) return NextResponse.json({ error: `Email approval capacity lookup failed: ${pendingEmailError.message}` }, { status: 503 });

  let mailboxSentLast24Hours = 0;
  if (mailbox) {
    try {
      mailboxSentLast24Hours = await countMailboxSendsLast24Hours({
        supabase,
        organizationId,
        mailboxId: String(mailbox.id),
        now,
      });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Mailbox usage reconciliation failed',
      }, { status: 503 });
    }
  }
  const mailboxRemaining = mailbox
    ? Math.max(0, Number(mailbox.daily_limit ?? 0) - mailboxSentLast24Hours - Number(pendingEmail ?? 0))
    : 0;

  let firstTouch: Record<string, unknown> = { status: 'SKIPPED', reason: 'NOT_EMAIL_READY' };
  if (leadId && verifiedEmail && qualification.primaryServiceId && mailbox && controls.email_paused !== true && marketConfig.coldEmailEnabled === true && mailboxRemaining > 0) {
    firstTouch = await queueEmailFirstTouch({
      supabase,
      organizationId,
      leadId,
      leadStatus,
      leadAgentMode,
      business,
      verifiedEmail,
      serviceId: String(qualification.primaryServiceId),
      messageHooks: growth.personalization.messageHooks,
      mailboxId: String(mailbox.id),
    });
  } else if (mailboxRemaining <= 0) {
    firstTouch = { status: 'SKIPPED', reason: 'MAILBOX_DAILY_CAPACITY_RESERVED' };
  } else if (marketConfig.coldEmailEnabled !== true) {
    firstTouch = { status: 'SKIPPED', reason: 'COLD_EMAIL_DISABLED' };
  }

  await logCycle(supabase, organizationId, row.id, {
    action: 'EVIDENCE_READY',
    businessId: business.id,
    websiteAuditId: auditRow.id,
    networkFetch,
    emailPromoted,
    verifiedFirstPartyEmail: Boolean(verifiedEmail),
    prospectTier: qualification.prospectTier,
    qualificationScore: qualification.qualificationScore,
    priorityQualified,
    leadId,
    leadCreated,
    firstTouch,
    mailboxSentLast24Hours,
    pendingEmailReservations: Number(pendingEmail ?? 0),
    mailboxRemainingBeforeDraft: mailboxRemaining,
    providerCalls: 0,
    llmCalls: 0,
    providerSendTriggered: false,
  });

  return NextResponse.json({
    ok: true,
    action: 'EVIDENCE_READY',
    processed: MAX_EVIDENCE_PER_TICK,
    businessId: business.id,
    websiteAuditId: auditRow.id,
    networkFetch,
    verifiedFirstPartyEmail: Boolean(verifiedEmail),
    prospectTier: qualification.prospectTier,
    qualificationScore: qualification.qualificationScore,
    priorityQualified,
    leadCreated,
    firstTouch,
    providerCalls: 0,
    llmCalls: 0,
    providerSendTriggered: false,
  });
}
