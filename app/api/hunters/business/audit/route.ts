import { lookup } from 'node:dns/promises';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Crawl4AiAuditor } from '@/lib/audit/crawl4ai';
import { isPrivateIp, normalizeAuditUrl } from '@/lib/hunters/business/website-audit';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';
import { requireInternalApiKey } from '@/lib/security/internal-api';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for controlled website audits');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function assertPublicUrl(value: string) {
  const url = normalizeAuditUrl(value);
  if (isPrivateIp(url.hostname)) throw new Error('Private/local audit targets are blocked');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) throw new Error('Website resolved to a blocked/private address');
  return url.toString();
}

function auditRowToResult(row: Record<string, unknown>) {
  return {
    sourceUrl: row.source_url,
    title: row.title,
    detectedLanguages: row.detected_languages ?? [],
    services: row.services ?? [],
    contactEmails: row.contact_emails ?? [],
    contactPhones: row.contact_phones ?? [],
    socialLinks: row.social_links ?? {},
    hasArabic: Boolean(row.has_arabic),
    hasEnglish: Boolean(row.has_english),
    hasBooking: Boolean(row.has_booking),
    hasWhatsapp: Boolean(row.has_whatsapp),
    mobileQuality: row.mobile_quality ?? 'UNKNOWN',
    seoQuality: row.seo_quality ?? 'UNKNOWN',
    ctaQuality: row.cta_quality ?? 'UNKNOWN',
    brokenLinks: Number(row.broken_links ?? 0),
    evidence: row.evidence ?? [],
  };
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const crawl4aiUrl = String(process.env.CRAWL4AI_URL ?? '').trim();
  if (!crawl4aiUrl) return NextResponse.json({ error: 'CRAWL4AI_URL is not configured' }, { status: 503 });

  const body = (await request.json()) as { organizationId?: string; businessId?: string };
  if (!body.organizationId || !body.businessId) {
    return NextResponse.json({ error: 'organizationId and businessId are required' }, { status: 400 });
  }

  const supabase = serviceClient();
  const [{ data: business, error: businessError }, { data: integration, error: integrationError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from('businesses').select('id,official_website').eq('organization_id', body.organizationId).eq('id', body.businessId).maybeSingle(),
    supabase.from('integration_connections').select('enabled,status').eq('organization_id', body.organizationId).eq('provider', 'CRAWL4AI').eq('channel', 'AUDIT').maybeSingle(),
    supabase.from('cost_guard_settings').select('daily_website_audits,audit_cache_days').eq('organization_id', body.organizationId).maybeSingle(),
  ]);
  if (businessError || !business) return NextResponse.json({ error: businessError?.message ?? 'Business not found' }, { status: 404 });
  if (integrationError) return NextResponse.json({ error: `Integration lookup failed: ${integrationError.message}` }, { status: 500 });
  if (!integration?.enabled || integration.status !== 'CONNECTED') return NextResponse.json({ error: 'Crawl4AI is not production verified; audit blocked' }, { status: 503 });
  if (settingsError || !settings) return NextResponse.json({ error: settingsError?.message ?? 'Cost Guard settings unavailable' }, { status: 503 });
  if (!business.official_website) return NextResponse.json({ error: 'Business has no official website' }, { status: 400 });

  let sourceUrl: string;
  try {
    sourceUrl = await assertPublicUrl(String(business.official_website));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid website URL' }, { status: 400 });
  }

  try {
    const costState = await getCostGuardState(body.organizationId);
    if (!costState) throw new Error('Cost Guard state unavailable; audit blocked');
    assertPaidOperationAllowed(costState, 'LOW');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cost Guard blocked audit' }, { status: 429 });
  }

  const cacheCutoff = new Date(Date.now() - Number(settings.audit_cache_days ?? 30) * 86_400_000).toISOString();
  const { data: cached, error: cacheError } = await supabase.from('website_audits')
    .select('*')
    .eq('organization_id', body.organizationId)
    .eq('business_id', body.businessId)
    .eq('status', 'SUCCEEDED')
    .gte('audited_at', cacheCutoff)
    .order('audited_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheError) return NextResponse.json({ error: `Audit cache lookup failed: ${cacheError.message}` }, { status: 500 });
  if (cached) return NextResponse.json({ ...auditRowToResult(cached), cached: true, providerCalls: 0 });

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const { count: auditsToday, error: countError } = await supabase.from('website_audits').select('id', { count: 'exact', head: true })
    .eq('organization_id', body.organizationId)
    .gte('created_at', dayStart.toISOString());
  if (countError) return NextResponse.json({ error: `Audit quota lookup failed: ${countError.message}` }, { status: 500 });
  if (Number(auditsToday ?? 0) >= Number(settings.daily_website_audits ?? 0)) return NextResponse.json({ error: 'Daily website-audit quota reached' }, { status: 429 });

  const { data: claimed, error: claimError } = await supabase.from('website_audits').insert({
    organization_id: body.organizationId,
    business_id: body.businessId,
    source_url: sourceUrl,
    status: 'RUNNING',
  }).select('id').single();
  if (claimError) {
    if (claimError.code === '23505') return NextResponse.json({ error: 'An audit for this business is already running; automatic duplicate blocked' }, { status: 409 });
    return NextResponse.json({ error: `Audit claim failed: ${claimError.message}` }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    const result = await new Crawl4AiAuditor(crawl4aiUrl).audit(sourceUrl);
    const completedAt = new Date().toISOString();
    const latencyMs = Date.now() - startedAt;
    const { error: updateError } = await supabase.from('website_audits').update({
      source_url: result.sourceUrl,
      status: 'SUCCEEDED',
      title: result.title ?? null,
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
      broken_links: result.brokenLinks,
      evidence: result.evidence,
      error_message: null,
      audited_at: completedAt,
    }).eq('organization_id', body.organizationId).eq('id', claimed.id).eq('status', 'RUNNING');
    if (updateError) return NextResponse.json({ error: 'Crawl4AI completed but audit persistence requires reconciliation', auditId: claimed.id, reconciliationRequired: true }, { status: 202 });

    let reconciliationRequired = false;
    try {
      await recordUsage({
        organizationId: body.organizationId,
        provider: 'CRAWL4AI',
        operation: 'WEBSITE_AUDIT',
        costUsd: 0,
        units: 1,
        metadata: { audit_id: claimed.id, business_id: body.businessId, latencyMs, providerCalls: 1 },
      });
    } catch {
      reconciliationRequired = true;
    }

    return NextResponse.json({ ...result, cached: false, providerCalls: 1, latencyMs, auditId: claimed.id, reconciliationRequired });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : 'Crawl4AI audit failed';
    await supabase.from('website_audits').update({ status: 'FAILED', error_message: message, audited_at: new Date().toISOString() })
      .eq('organization_id', body.organizationId).eq('id', claimed.id).eq('status', 'RUNNING');
    return NextResponse.json({ error: message, auditId: claimed.id, automaticRetry: false }, { status: 502 });
  }
}
