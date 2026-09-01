import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { buildMessagePlan } from '@/lib/outreach/message-plan';
import type { MarketCode } from '@/lib/outreach/scheduler';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for canonical market messaging');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    organizationId?: string;
    marketCode?: MarketCode;
    businessName?: string;
    industry?: string;
    detectedLanguage?: string;
    preferredLanguage?: string;
    evidence?: string[];
    recommendedOffer?: string;
    recipientRole?: string;
  };

  if (!body.marketCode || !body.businessName || !body.recommendedOffer) {
    return NextResponse.json({ error: 'marketCode, businessName and recommendedOffer are required' }, { status: 400 });
  }

  try {
    const marketCode = body.marketCode.toUpperCase() as MarketCode;
    const basePlan = buildMessagePlan({
      marketCode,
      businessName: body.businessName,
      industry: body.industry,
      detectedLanguage: body.detectedLanguage,
      preferredLanguage: body.preferredLanguage,
      evidence: body.evidence ?? [],
      recommendedOffer: body.recommendedOffer,
      recipientRole: body.recipientRole,
    });

    // Preserve the existing internal API contract. Callers that provide the trusted
    // organization id receive the live Owner-configured locale/tone overlay; older
    // callers stay on the existing safe static profile until they are upgraded.
    if (!body.organizationId) return NextResponse.json({ ...basePlan, ownerMarketStyleApplied: false });

    const supabase = serviceClient();
    const [{ data: market, error: marketError }, { data: locale, error: localeError }] = await Promise.all([
      supabase.from('market_settings')
        .select('enabled')
        .eq('organization_id', body.organizationId)
        .eq('country_code', marketCode)
        .maybeSingle(),
      supabase.from('locale_profiles')
        .select('primary_locale,fallback_locale,dialect,tone_profile,dialect_intensity,max_first_touch_words')
        .eq('organization_id', body.organizationId)
        .eq('country_code', marketCode)
        .maybeSingle(),
    ]);
    if (marketError || localeError) throw new Error(`Canonical market messaging lookup failed: ${marketError?.message ?? localeError?.message}`);
    if (!market?.enabled) return NextResponse.json({ error: `Market ${marketCode} is disabled` }, { status: 409 });
    if (!locale) return NextResponse.json({ error: `Locale profile for ${marketCode} is missing` }, { status: 409 });

    const canonicalPlan = buildMessagePlan({
      marketCode,
      businessName: body.businessName,
      industry: body.industry,
      detectedLanguage: body.detectedLanguage,
      preferredLanguage: body.preferredLanguage ?? (!body.detectedLanguage ? locale.primary_locale : undefined),
      evidence: body.evidence ?? [],
      recommendedOffer: body.recommendedOffer,
      recipientRole: body.recipientRole,
    });

    return NextResponse.json({
      ...canonicalPlan,
      dialect: locale.dialect ?? canonicalPlan.dialect,
      tone: locale.tone_profile ?? canonicalPlan.tone,
      dialectIntensity: locale.dialect_intensity == null ? canonicalPlan.dialectIntensity : Number(locale.dialect_intensity),
      maxWords: locale.max_first_touch_words == null ? canonicalPlan.maxWords : Number(locale.max_first_touch_words),
      ownerMarketStyleApplied: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to build message plan' }, { status: 400 });
  }
}
