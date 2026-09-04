import { describe, expect, it } from 'vitest';
import type { AgentContext, AgentResult } from '@/lib/agents/contracts';
import { stageValue } from '@/lib/agents/context-hydrator-core';
import { buildAgentInputForRuntime } from '@/lib/agents/openai-runtime-core';
import { decidePreviewStrategy, draftOffersUnrequestedCustomPreview } from '@/lib/agents/preview-policy';
import { decideCommercialAction, secretaryCompose } from '@/lib/agents/executor-core';

function result(agent: AgentResult['agent'], data: Record<string, unknown> = {}): AgentResult {
  return { agent, confidence: 0.9, summary: 'ok', data, evidence: [], blockers: [] };
}

describe('Agent quality and Growth Brain', () => {
  it('hydrates the canonical Production conversation taxonomy instead of old lead stages', () => {
    for (const stage of ['ACTIVE','CLOSING','WAITING_CUSTOMER','UNANSWERED','NEEDS_HUMAN','FOLLOW_UP_DUE','DO_NOT_CONTACT','SPAM','PAUSED'] as const) {
      expect(stageValue(stage)).toBe(stage);
    }
    expect(stageValue('CONTACTED')).toBeUndefined();
    expect(stageValue('REPLIED')).toBeUndefined();
  });

  it('passes a fact that exists only in active Knowledge directly to Secretary', () => {
    const context: AgentContext = {
      organizationId: 'org',
      message: 'Do you include a 30 day launch support period?',
      knowledgeContext: [
        { key: 'refund_policy', version: 1, payload: { refund: 'case by case' } },
        { key: 'launch_support_policy', version: 3, payload: { support: '30 day launch support is included after handover' } },
        { key: 'unrelated_internal_note', version: 2, payload: { note: 'warehouse paint is blue' } },
      ],
      serviceKnowledge: [],
    };
    const input = buildAgentInputForRuntime('secretary', context, 6) as { knowledgeContext?: Array<{ key: string }> };
    expect(input.knowledgeContext?.map((item) => item.key)).toContain('launch_support_policy');
    expect(input.knowledgeContext?.map((item) => item.key)).not.toContain('unrelated_internal_note');
  });

  it('caps Secretary knowledge to a small relevant subset to protect token cost', () => {
    const knowledgeContext = Array.from({ length: 20 }, (_, index) => ({
      key: `pricing_rule_${index}`,
      version: 1,
      payload: { note: `pricing information ${index}` },
    }));
    const context: AgentContext = { organizationId: 'org', message: 'What pricing information applies?', knowledgeContext };
    const input = buildAgentInputForRuntime('secretary', context, 8) as { knowledgeContext?: unknown[] };
    expect(input.knowledgeContext?.length).toBeLessThanOrEqual(4);
  });

  it('shows approved portfolio for generic examples instead of creating custom work', () => {
    expect(decidePreviewStrategy({
      message: 'Can I see some examples of your work?',
      approvedPortfolio: ['Dental Oman — https://example.com/dental'],
    })).toEqual({
      strategy: 'SHOW_PORTFOLIO',
      approvedExamples: ['Dental Oman — https://example.com/dental'],
    });
  });

  it('allows custom preview only when the customer explicitly asks for one', () => {
    expect(decidePreviewStrategy({ message: 'I am interested, show me what you can do', approvedPortfolio: [] }).strategy).toBe('NONE');
    expect(decidePreviewStrategy({ message: 'Can you make a custom preview for my clinic?', approvedPortfolio: [] }).strategy).toBe('CUSTOM_PREVIEW');
  });

  it('blocks a composed custom-preview promise when the customer did not request custom work', () => {
    expect(draftOffersUnrequestedCustomPreview({
      customerMessage: 'I am interested in the website service',
      draft: 'We can prepare a custom preview for your clinic before you decide.',
    })).toBe(true);
    expect(draftOffersUnrequestedCustomPreview({
      customerMessage: 'Can you make a custom preview for my clinic?',
      draft: 'We can prepare a custom preview for your clinic.',
    })).toBe(false);
  });

  it('overrides an LLM SHOW_PREVIEW suggestion when there is no explicit custom-preview request', () => {
    const context: AgentContext = { message: 'I am interested in your service', intentScore: 20 };
    const decision = decideCommercialAction(context, [
      result('intent_discovery'),
      result('sales_marketing', { nextAction: 'SHOW_PREVIEW' }),
      result('decision_orchestrator', { recommended_action: 'SHOW_PREVIEW' }),
    ]);
    expect(decision.action).toBe('ANSWER');
    expect(decision.reasons).toContain('PORTFOLIO_BEFORE_FREE_CUSTOM_WORK');
  });

  it('uses approved portfolio in the deterministic Secretary fallback', () => {
    const context: AgentContext = {
      message: 'Show me an example of your work',
      approvedPortfolio: ['Clinic Case — https://example.com/clinic'],
    };
    const draft = secretaryCompose(context, {
      action: 'ANSWER', useDiscount: false, explainValue: true, askLowPressureCta: true, requiresHuman: false, reasons: [],
    }, [result('culture_locale', { locale: 'en-US' }), result('secretary')]);
    expect(draft.text).toContain('Clinic Case');
    expect(draft.text).toContain('approved examples');
  });
});
