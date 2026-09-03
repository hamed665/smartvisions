'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { analyzeWebsiteHtml, normalizeAuditUrl } from '@/lib/hunters/business/website-audit';
import { selectFirstPartyContactEmail } from '@/lib/hunters/business/contact-evidence';
import { assertPublicHostname } from '@/lib/hunters/business/public-dns';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;

async function assertPublicHost(url: URL) {
  await assertPublicHostname(url.hostname);
}

function safeErrorMessage(error: unknown, fallback = 'Website audit failed') {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 240);
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = String(record.message ?? record.cause ?? '').trim();
    if (message) return message.slice(0, 240);
    const name = String(record.name ?? '').trim();
    const code = String(record.code ?? '').trim();
    if (name || code) return [name, code].filter(Boolean).join(' ').slice(0, 240);
  }
  const text = String(error ?? '').trim();
  return text && text !== '[object Object]' ? text.slice(0, 240) : fallback;
}

async function readLimitedText(response: Response) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_BYTES) throw new Error('Website response is larger than the audit limit');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error('Website response exceeded the audit limit');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchWebsite(startUrl: string) {
  let url = normalizeAuditUrl(startUrl);
  const visited = new Set<string>();
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const normalized = url.toString();
    if (visited.has(normalized)) throw new Error(`Website redirect loop detected at ${url.origin}`);
    visited.add(normalized);
    await assertPublicHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'user-agent': 'SmartVisionsWebsiteAudit/1.0' },
        });
      } catch (error) {
        throw new Error(`Website fetch failed at ${url.origin}: ${safeErrorMessage(error, 'network error')}`);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Website redirect HTTP ${response.status} is missing a destination`);
        if (attempt >= MAX_REDIRECTS) throw new Error(`Website exceeded ${MAX_REDIRECTS} redirects`);
        url = normalizeAuditUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
      if (!(response.headers.get('content-type')?.toLowerCase() || '').includes('text/html')) {
        throw new Error('Website did not return HTML');
      }
      return { finalUrl: url.toString(), html: await readLimitedText(response) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Website exceeded ${MAX_REDIRECTS} redirects`);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function promoteFirstPartyAuditEmail(input: {
  ctx: Awaited<ReturnType<typeof getCurrentOrganization>>;
  businessId: string;
  currentBusinessEmail: string;
  sourceUrl: string;
  contactEmails: string[];
  websiteAuditId: string;
}) {
  if (input.currentBusinessEmail.trim()) return null;
  const email = selectFirstPartyContactEmail(input.sourceUrl, input.contactEmails);
  if (!email) return null;

  const promotedAt = new Date().toISOString();
  const { data, error } = await input.ctx.supabase
    .from('businesses')
    .update({ email, updated_at: promotedAt })
    .eq('organization_id', input.ctx.organizationId)
    .eq('id', input.businessId)
    .is('email', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Verified website contact promotion failed: ${error.message}`);
  if (!data) return null;

  const { error: auditError } = await input.ctx.supabase.from('audit_logs').insert({
    organization_id: input.ctx.organizationId,
    actor_type: 'USER',
    actor_id: input.ctx.userId,
    action: 'PROMOTE_VERIFIED_WEBSITE_CONTACT_EMAIL',
    entity_type: 'business',
    entity_id: input.businessId,
    after_data: {
      websiteAuditId: input.websiteAuditId,
      sourceUrl: input.sourceUrl,
      source: 'WEBSITE_AUDIT',
      firstPartyDomainMatch: true,
      llmUsed: false,
      paidProviderUsed: false,
      outreachTriggered: false,
    },
  });
  if (auditError) throw new Error(`Verified website contact audit log failed: ${auditError.message}`);
  return email;
}

export async function runDeterministicWebsiteAudit(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const leadId = String(form.get('leadId') ?? '').trim();
  const requestedBusinessId = String(form.get('businessId') ?? '').trim();
  if (!leadId && !requestedBusinessId) throw new Error('leadId or businessId is required');

  let businessId = requestedBusinessId;
  let businessEmail = '';
  let leadStatus: string | null = null;
  let destination = leadId ? `/leads/${encodeURIComponent(leadId)}` : '/hunters/growth-opportunities';
  let website = '';

  if (leadId) {
    const { data: lead, error: leadError } = await ctx.supabase
      .from('leads')
      .select('id,business_id,status,businesses(id,official_website,name,email)')
      .eq('organization_id', ctx.organizationId)
      .eq('id', leadId)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead?.business_id) throw new Error('Lead has no business to audit');
    businessId = String(lead.business_id);
    leadStatus = String(lead.status ?? '');
    const business = Array.isArray(lead.businesses) ? lead.businesses[0] : lead.businesses;
    website = String(business?.official_website ?? '').trim();
    businessEmail = String(business?.email ?? '').trim();
  } else {
    const { data: business, error: businessError } = await ctx.supabase
      .from('businesses')
      .select('id,official_website,name,email')
      .eq('organization_id', ctx.organizationId)
      .eq('id', businessId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) throw new Error('Business was not found');
    website = String(business.official_website ?? '').trim();
    businessEmail = String(business.email ?? '').trim();
  }

  if (!website) throw new Error('Business has no official website');
  const { data: settings, error: settingsError } = await ctx.supabase
    .from('cost_guard_settings')
    .select('daily_website_audits,audit_cache_days')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings) throw new Error('Cost Guard settings are unavailable; audit blocked');

  const cacheCutoff = new Date(Date.now() - Number(settings.audit_cache_days) * 86_400_000).toISOString();
  const { data: cached, error: cacheError } = await ctx.supabase
    .from('website_audits')
    .select('id,audited_at,status,source_url,contact_emails')
    .eq('organization_id', ctx.organizationId)
    .eq('business_id', businessId)
    .eq('status', 'SUCCEEDED')
    .gte('audited_at', cacheCutoff)
    .order('audited_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheError) throw cacheError;

  if (cached) {
    await promoteFirstPartyAuditEmail({
      ctx,
      businessId,
      currentBusinessEmail: businessEmail,
      sourceUrl: String(cached.source_url ?? website),
      contactEmails: Array.isArray(cached.contact_emails) ? cached.contact_emails.map(String) : [],
      websiteAuditId: String(cached.id),
    });

    const { data: growth } = await ctx.supabase
      .from('growth_opportunities')
      .select('digital_presence_evidence')
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', businessId)
      .maybeSingle();
    const currentEvidence = objectValue(growth?.digital_presence_evidence);
    await ctx.supabase.from('growth_opportunities').update({
      cheapest_next_action: 'EVIDENCE_READY',
      next_action_reason: 'Fresh deterministic website evidence is already cached; do not repeat the audit.',
      next_action_can_spend_money: false,
      digital_presence_evidence: {
        ...currentEvidence,
        websiteEvidenceStatus: 'AUDITED',
        websiteAuditId: cached.id,
        websiteAuditedAt: cached.audited_at,
        providerCallsForWebsiteEvidence: 0,
        llmCallsForWebsiteEvidence: 0,
      },
      updated_at: new Date().toISOString(),
    }).eq('organization_id', ctx.organizationId).eq('business_id', businessId);
    redirect(leadId ? `/leads/${encodeURIComponent(leadId)}?audit=cached` : '/hunters/growth-opportunities?audit=cached');
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: auditsToday, error: countError } = await ctx.supabase
    .from('website_audits')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .gte('created_at', dayStart.toISOString());
  if (countError) throw countError;
  if (Number(auditsToday ?? 0) >= Number(settings.daily_website_audits)) throw new Error('Daily website-audit quota reached');

  const normalizedWebsite = normalizeAuditUrl(website).toString();
  const { data: auditRow, error: insertError } = await ctx.supabase
    .from('website_audits')
    .insert({ organization_id: ctx.organizationId, business_id: businessId, source_url: normalizedWebsite, status: 'RUNNING' })
    .select('id')
    .single();
  if (insertError) throw insertError;

  try {
    const fetched = await fetchWebsite(normalizedWebsite);
    const result = analyzeWebsiteHtml(fetched.html);
    const completedAt = new Date().toISOString();
    const { error: updateError } = await ctx.supabase.from('website_audits').update({
      source_url: fetched.finalUrl,
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
    }).eq('organization_id', ctx.organizationId).eq('id', auditRow.id);
    if (updateError) throw updateError;

    let contactEmailPromoted = false;
    let contactPromotionError: string | null = null;
    try {
      contactEmailPromoted = Boolean(await promoteFirstPartyAuditEmail({
        ctx,
        businessId,
        currentBusinessEmail: businessEmail,
        sourceUrl: fetched.finalUrl,
        contactEmails: result.contactEmails,
        websiteAuditId: String(auditRow.id),
      }));
    } catch (error) {
      contactPromotionError = safeErrorMessage(error, 'Verified website contact promotion failed');
    }

    if (leadId) {
      const { error: leadUpdateError } = await ctx.supabase
        .from('leads')
        .update({ status: leadStatus === 'NEW' ? 'AUDITED' : leadStatus, updated_at: completedAt })
        .eq('organization_id', ctx.organizationId)
        .eq('id', leadId);
      if (leadUpdateError) throw leadUpdateError;
    }

    const { data: growth, error: growthReadError } = await ctx.supabase
      .from('growth_opportunities')
      .select('digital_presence_evidence')
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', businessId)
      .maybeSingle();
    if (growthReadError) throw growthReadError;
    const currentEvidence = objectValue(growth?.digital_presence_evidence);
    const { error: growthUpdateError } = await ctx.supabase.from('growth_opportunities').update({
      cheapest_next_action: 'EVIDENCE_READY',
      next_action_reason: 'Deterministic website evidence is fresh and ready for offer selection; no repeat audit is needed inside the cache window.',
      next_action_can_spend_money: false,
      digital_presence_evidence: {
        ...currentEvidence,
        websiteEvidenceStatus: 'AUDITED',
        websiteAuditId: auditRow.id,
        websiteAuditedAt: completedAt,
        websiteAudit: {
          title: result.title,
          hasArabic: result.hasArabic,
          hasEnglish: result.hasEnglish,
          hasBooking: result.hasBooking,
          hasWhatsapp: result.hasWhatsapp,
          mobileQuality: result.mobileQuality,
          seoQuality: result.seoQuality,
          ctaQuality: result.ctaQuality,
          socialLinks: result.socialLinks,
        },
        providerCallsForWebsiteEvidence: 0,
        llmCallsForWebsiteEvidence: 0,
      },
      updated_at: completedAt,
    }).eq('organization_id', ctx.organizationId).eq('business_id', businessId);
    if (growthUpdateError) throw growthUpdateError;

    const { error: logError } = await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'DETERMINISTIC_WEBSITE_AUDIT',
      entity_type: 'website_audit',
      entity_id: auditRow.id,
      after_data: {
        leadId: leadId || null,
        businessId,
        sourceUrl: fetched.finalUrl,
        bytesInspected: fetched.html.length,
        origin: leadId ? 'LEAD' : 'GROWTH_OPPORTUNITY',
        contactEmailPromoted,
        contactPromotionError,
        llmUsed: false,
        paidProviderUsed: false,
        outreachTriggered: false,
      },
    });
    if (logError) throw logError;
    destination = leadId ? `/leads/${encodeURIComponent(leadId)}?audit=success` : '/hunters/growth-opportunities?audit=success';
  } catch (error) {
    const message = safeErrorMessage(error);
    await ctx.supabase.from('website_audits')
      .update({ status: 'FAILED', error_message: message, audited_at: new Date().toISOString() })
      .eq('organization_id', ctx.organizationId)
      .eq('id', auditRow.id);
    await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'DETERMINISTIC_WEBSITE_AUDIT_FAILED',
      entity_type: 'website_audit',
      entity_id: auditRow.id,
      after_data: {
        leadId: leadId || null,
        businessId,
        error: message,
        origin: leadId ? 'LEAD' : 'GROWTH_OPPORTUNITY',
        outreachTriggered: false,
      },
    });
    destination = leadId
      ? `/leads/${encodeURIComponent(leadId)}?audit=error&message=${encodeURIComponent(message)}`
      : `/hunters/growth-opportunities?audit=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/leads');
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath('/hunters/google-places');
  revalidatePath('/hunters/growth-opportunities');
  redirect(destination);
}
