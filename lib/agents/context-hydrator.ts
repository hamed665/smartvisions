import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentContext, MarketLocaleStyleSnapshot } from './contracts';
import { hydrateAgentContext as hydrateCore } from './context-hydrator-core';

export type { HydratedRuntimeEvidence } from './context-hydrator-core';

export async function hydrateAgentContext(input: {
  supabase: SupabaseClient;
  context: AgentContext;
  trustedConversationId?: string;
}) {
  const hydrated = await hydrateCore(input);
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
