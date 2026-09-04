import type { AgentContext, AgentName, AgentResult } from './contracts';
import * as core from './executor-core';
import { resolveReplyLanguage } from '@/lib/outreach/locale';

export async function executeAgent(agent: AgentName, context: AgentContext): Promise<AgentResult> {
  const style = context.marketLocaleStyle;
  if (agent === 'culture_locale' && style) {
    const locale = resolveReplyLanguage({
      message: context.message,
      primaryLocale: style.primaryLocale,
      fallbackLocale: style.fallbackLocale,
      preferredLanguage: context.language,
    });
    return {
      agent,
      confidence: 0.97,
      summary: 'Applied customer language evidence before canonical owner-configured market style.',
      data: {
        locale,
        dialect: locale.toLowerCase().startsWith('ar') ? context.dialect ?? style.dialect ?? null : null,
        tone: style.toneProfile ?? 'professional',
        dialectIntensity: style.dialectIntensity ?? null,
        maxFirstTouchWords: style.maxFirstTouchWords ?? null,
        maxReplyWords: style.maxReplyWords ?? null,
      },
      evidence: [],
      blockers: [],
    };
  }
  return core.executeAgent(agent, context);
}

export const decideCommercialAction = core.decideCommercialAction;
export const secretaryCompose = core.secretaryCompose;
export const checkRelevance = core.checkRelevance;
