'use server';

import { lookup } from 'node:dns/promises';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { analyzeWebsiteHtml, isPrivateIp, normalizeAuditUrl } from '@/lib/hunters/business/website-audit';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 2;

async function assertPublicHost(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('Website resolved to a blocked/private address');
  }
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
  text += decoder.decode();
  return text;
}

async function fetchWebsite(startUrl: string) {
  let url = normalizeAuditUrl(startUrl);
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    await assertPublicHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'user-agent': 'SmartVisionsWebsiteAudit/1.0' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Website redirect is missing a destination');
        url = normalizeAuditUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
      const contentType = response.headers.get('content-type')?.toLowerCase() || '';
      if (!contentType.includes('text/html')) throw new Error('Website did not return HTML');
      return { finalUrl: url.toString(), html: await readLimitedText(response) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Website exceeded the redirect limit');
}

export async function runDeterministicWebsiteAudit(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const leadId = String(form.get('leadId') ?? '').trim();
  if (!leadId) throw new Error('leadId is required');
  let destination = '/leads';

  const { data: lead, error: leadError } = await ctx.supabase
    .from('leads')
    .select('id,business_id,status,businesses(id,official_website,name)')
    .eq('organization_id', ctx.organizationId)
    .eq('id', leadId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead?.business_id) throw new Error('Lead has no business to audit');
  const business = Array.isArray(lead.businesses) ? lead.businesses[0] : lead.businesses;
  const website = String(business?.official_website ?? '').trim();
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
    .select('id,audited_at,status')
    .eq('organization_id', ctx.organizationId)
    .eq('business_id', lead.business_id)
    .eq('status', 'COMPLETED')
    .gte('audited_at', cacheCutoff)
    .order('audited_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheError) throw cacheError;
  if (cached) {
    destination = `/leads?audit=cached&leadId=${encodeURIComponent(leadId)}`;
    redirect(destination);
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: auditsToday, error: countError } = await ctx.supabase
    .from('website_audits')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .gte('created_at', dayStart.toISOString());
  if (countError) throw countError;
  if (Number(auditsToday ?? 0) >= Number(settings.daily_website_audits)) {
    throw new Error('Daily website-audit quota reached');
  }

  const { data: auditRow, error: insertError } = await ctx.supabase
    .from('website_audits')
    .insert({ organization_id: ctx.organizationId, business_id: lead.business_id, source_url: website, status: 'RUNNING' })
    .select('id')
    .single();
  if (insertError) throw insertError;

  try {
    const fetched = await fetchWebsite(website);
    const result = analyzeWebsiteHtml(fetched.html);
    const completedAt = new Date().toISOString();
    const { error: updateError } = await ctx.supabase
      .from('website_audits')
      .update({
        source_url: fetched.finalUrl,
        status: 'COMPLETED',
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
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', auditRow.id);
    if (updateError) throw updateError;

    await ctx.supabase
      .from('leads')
      .update({ status: lead.status === 'NEW' ? 'AUDITED' : lead.status, updated_at: completedAt })
      .eq('organization_id', ctx.organizationId)
      .eq('id', leadId);

    await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'DETERMINISTIC_WEBSITE_AUDIT',
      entity_type: 'website_audit',
      entity_id: auditRow.id,
      after_data: {
        leadId,
        businessId: lead.business_id,
        sourceUrl: fetched.finalUrl,
        bytesInspected: fetched.html.length,
        llmUsed: false,
        paidProviderUsed: false,
        outreachTriggered: false,
      },
    });
    destination = `/leads?audit=success&leadId=${encodeURIComponent(leadId)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : 'Website audit failed';
    await ctx.supabase
      .from('website_audits')
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
      after_data: { leadId, businessId: lead.business_id, error: message, outreachTriggered: false },
    });
    destination = `/leads?audit=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/leads');
  revalidatePath('/hunters/google-places');
  redirect(destination);
}
