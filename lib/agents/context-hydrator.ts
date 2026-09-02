import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentContext, MarketLocaleStyleSnapshot } from './contracts';
import { resolveCanonicalLeadQuote } from './canonical-quote';
import { hydrateAgentContext as hydrateCore, type HydratedRuntimeEvidence } from './context-hydrator-core';

export type { HydratedRuntimeEvidence } from './context-hydrator-core';

type HydratedAgentContext = {
  context: AgentContext;
  evidence: HydratedRuntimeEvidence;
};

async function hydrateCanonicalLeadQuote(input: {
  supabase: SupabaseClient;
  hydrated: HydratedAgentContext;
}) {
  const { context } = input.hydrated;
  const organizationId = String(context.organizationId ?? '').trim();
  const leadId = String(context.leadId ?? '').trim();
  const countryCode = String(context.countryCode ?? '').trim().toUpperCase();
  if (!organizationId || !leadId || !countryCode) return input.hydrated;

  const { data: lead, error: leadError } = await input.supabase
    .from('leads')
    .select('business_id,recommended_offer')
    .eq('organization_id', organizationId)
    .eq('id', leadId)
    .maybeSingle();
  if (leadError) throw new Error(`Canonical quote lead hydration failed: ${leadError.message}`);
  if (!lead) return input.hydrated;

  let quote = resolveCanonicalLeadQuote({
    countryCode,
    serviceKnowledge: context.serviceKnowledge,
    leadRecommendedOffer: lead.recommended_offer,
  });

  if (!quote && lead.business_id) {
    const { data: opportunity, error: opportunityError } = await input.supabase
      .from('growth_opportunities')
      .select('primary_service_id,catalog_ready')
      .eq('organization_id', organizationId)
      .eq('business_id', lead.business_id)
      .maybeSingle();
    if (opportunityError) throw new Error(`Canonical quote opportunity hydration failed: ${opportunityError.message}`);

    quote = resolveCanonicalLeadQuote({
      countryCode,
      serviceKnowledge: context.serviceKnowledge,
      growthOpportunityServiceId: opportunity?.primary_service_id,
      growthOpportunityCatalogReady: opportunity?.catalog_ready,
    });
  }

  if (!quote) return input.hydrated;

  return {
    ...input.hydrated,
    context: {
      ...context,
      quotedService: quote.serviceId,
      quotedPrice: quote.price,
      quotedCurrency: quote.currency,
      knowledgeContext: [
        ...(context.knowledgeContext ?? []),
        {
          key: '_canonical_quote',
          version: 1,
          payload: {
            serviceId: quote.serviceId,
            price: quote.price,
            currency: quote.currency,
            source: 'service_prices',
            resolvedFrom: quote.source,
          },
        },
      ],
    },
  };
}

export async function hydrateAgentContext(input: {
  supabase: SupabaseClient;
  context: AgentContext;
  trustedConversationId?: string;
}) {
  const coreHydrated = await hydrateCore(input);
  const hydrated = await hydrateCanonicalLeadQuote({ supabase: input.supabase, hydrated: coreHydrated });
  const countryCode = String(hydrated.context.countryCode ?? '').trim().toUpperCase();
  if (!countryCode) return hydrated;

  const { data, error } = await input.supabase
    .from('locale_profiles')
    .select('country_code,primary_locale,fallback_locale,dialect,tone_profile,dialect_intensity,max_first_touch_words,max_reply_words')
    .eq('organization_id', hydrated.context.organizationId)
    .eq('country_code', countryCode)
    .maybeSingle();
  if (error) throw new Error(`Market locale hydration failed: ${error.message}`);
  if (!data) return hydrated;

  const marketLocaleStyle: MarketLocaleStyleSnapshot = {
    countryCode: data.country_code,
    primaryLocale: data.primary_locale,
    fallbackLocale: data.fallback_locale ?? undefined,
    dialect: data.dialect ?? undefined,
    toneProfile: data.tone_profile ?? undefined,
    dialectIntensity: data.dialect_intensity == null ? undefined : Number(data.dialect_intensity),
    maxFirstTouchWords: data.max_first_touch_words == null ? undefined : Number(data.max_first_touch_words),
    maxReplyWords: data.max_reply_words == null ? undefined : Number(data.max_reply_words),
  };

  return {
    ...hydrated,
    context: {
      ...hydrated.context,
      language: hydrated.context.language || marketLocaleStyle.primaryLocale,
      dialect: hydrated.context.dialect || marketLocaleStyle.dialect,
      marketLocaleStyle,
      knowledgeContext: [
        ...(hydrated.context.knowledgeContext ?? []),
        { key: '_owner_market_style', version: 1, payload: marketLocaleStyle },
      ],
    },
  };
}
