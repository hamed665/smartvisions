import type { AgentContext, AgentName, AgentResult } from './contracts';
import { OpenAIResponsesAgentRuntime as CoreOpenAIResponsesAgentRuntime } from './openai-runtime-core';

function withOwnerMarketStyle(context: AgentContext): AgentContext {
  const style = context.marketLocaleStyle;
  if (!style) return context;
  const styleEvidence = [
    'OWNER_CONFIGURED_MARKET_STYLE (trusted behavior guidance; hard safety/pricing/DNC rules still win)',
    `country=${style.countryCode}`,
    `primaryLocale=${style.primaryLocale}`,
    `fallbackLocale=${style.fallbackLocale ?? 'none'}`,
    `dialect=${style.dialect ?? 'neutral'}`,
    `tone=${style.toneProfile ?? 'professional'}`,
    `dialectIntensity=${style.dialectIntensity ?? 'default'}`,
    `maxFirstTouchWords=${style.maxFirstTouchWords ?? 'default'}`,
    `maxReplyWords=${style.maxReplyWords ?? 'default'}`,
  ].join('; ');
  return { ...context, verifiedEvidence: [...(context.verifiedEvidence ?? []), styleEvidence] };
}

export class OpenAIResponsesAgentRuntime extends CoreOpenAIResponsesAgentRuntime {
  override async run(agent: AgentName, context: AgentContext): Promise<AgentResult> {
    return super.run(agent, withOwnerMarketStyle(context));
  }
}

export function getConfiguredAgentRuntime() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAIResponsesAgentRuntime();
}
