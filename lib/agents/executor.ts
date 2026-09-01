import type { AgentContext, AgentName, AgentResult } from './contracts';
import * as core from './executor-core';

export async function executeAgent(agent: AgentName, context: AgentContext): Promise<AgentResult> {
  const style = context.marketLocaleStyle;
  if (agent === 'culture_locale' && style) {
    return {
      agent,
      confidence: 0.97,
      summary: 'Applied canonical owner-configured market language, dialect and tone.',
      data: {
        locale: context.language ?? style.primaryLocale,
        dialect: context.dialect ?? style.dialect ?? null,
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
