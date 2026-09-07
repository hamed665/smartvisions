import { describe, expect, it } from 'vitest';
import type { AgentContext, CommercialDecision, SalesStateSnapshot } from '@/lib/agents/contracts';
import { secretaryCompose } from '@/lib/agents/executor';
import { evaluateHandoff } from '@/lib/handoff/policy';
import { evaluateSalesReplyPolicy, hasReadyToStartIntent, inferSalesHandoffSignals } from '@/lib/conversations/sales-behavior';
import { buildSalesEfficiencySummary } from '@/lib/reports/sales-efficiency';

function state(overrides: Partial<SalesStateSnapshot> = {}): SalesStateSnapshot {
  return {
    version: 1,
    deliverables: [],
    productionNeeds: [],
    rejectedServices: [],
    missingRequiredInfo: [],
    nextAction: 'ANSWER',
    customQuoteRequired: false,
    humanConfirmationRequired: false,
    pendingHandoffReasons: [],
    evidence: {},
    revisions: [],
    processedEvidenceIds: [],
    ...overrides,
  };
}

function decision(overrides: Partial<CommercialDecision> = {}): CommercialDecision {
  return {
    action: 'ANSWER',
    serviceId: 'seo_growth',
    useDiscount: false,
    explainValue: true,
    askLowPressureCta: true,
    requiresHuman: false,
    reasons: ['TEST'],
    ...overrides,
  };
}

function context(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    message: 'Tell me more',
    language: 'en',
    salesState: state(),
    serviceKnowledge: [{
      id: 'seo_growth',
      name: 'SEO Growth',
      marketPrice: {
        countryCode: 'OM',
        currency: 'OMR',
        price: 149,
        minimumPrice: 149,
        maxAutoDiscountPct: 0,
        maxDiscountWithApprovalPct: 0,
      },
    }],
    ...overrides,
  };
}

const draft = (text: string, language = 'en') => ({ text, language, generatedBy: 'secretary' as const });

describe('sales efficiency guardrails', () => {
  it('detects explicit ready-to-start intent in English, Omani Arabic and Persian', () => {
    expect(hasReadyToStartIntent("Let's start")).toBe(true);
    expect(hasReadyToStartIntent('يلا نبدأ')).toBe(true);
    expect(hasReadyToStartIntent('بریم جلو')).toBe(true);
    expect(hasReadyToStartIntent('Tell me more about the service')).toBe(false);
  });

  it('hands explicit ready-to-start intent to Human instead of continuing qualification', () => {
    const signals = inferSalesHandoffSignals("We're ready to start");
    const result = evaluateHandoff({ ...signals, confidence: 0.95, intentScore: 40 });
    expect(result.handoff).toBe(true);
    expect(result.mode).toBe('HUMAN');
    expect(result.reasons).toContain('READY_TO_START');
  });

  it('blocks location and date questions when the selected service does not require them', () => {
    const location = evaluateSalesReplyPolicy({
      context: context({ message: 'I want SEO', salesState: state({ selectedService: 'SEO' }) }),
      decision: decision(),
      draft: draft('Which location?'),
    });
    const date = evaluateSalesReplyPolicy({
      context: context({ message: 'I want SEO', salesState: state({ selectedService: 'SEO' }) }),
      decision: decision(),
      draft: draft('What date works for you?'),
    });
    expect(location.reasons).toContain('UNNECESSARY_LOCATION_QUESTION');
    expect(date.reasons).toContain('UNNECESSARY_DATE_QUESTION');
  });

  it('allows one genuinely missing operational question for custom production scope', () => {
    const result = evaluateSalesReplyPolicy({
      context: context({
        message: 'I need a custom content shoot',
        salesState: state({
          selectedService: 'CONTENT_REELS',
          customQuoteRequired: true,
          missingRequiredInfo: ['location', 'date'],
        }),
      }),
      decision: decision({ action: 'HUMAN', serviceId: 'custom_content_production', requiresHuman: true }),
      draft: draft('Which location?'),
    });
    expect(result.reasons).not.toContain('UNNECESSARY_LOCATION_QUESTION');
    expect(result.reasons).not.toContain('TOO_MANY_PRIMARY_QUESTIONS');
  });

  it('requires a direct price answer when canonical service pricing is available', () => {
    const result = evaluateSalesReplyPolicy({
      context: context({ message: 'How much is SEO?' }),
      decision: decision(),
      draft: draft('I can explain the SEO package.'),
    });
    expect(result.reasons).toContain('MISSES_CANONICAL_PRICE_ANSWER');
    expect(result.metrics.directPriceAnswerRequired).toBe(true);
    expect(result.metrics.directPriceAnswered).toBe(false);
  });

  it('accepts the exact canonical amount and currency on a direct price answer', () => {
    const result = evaluateSalesReplyPolicy({
      context: context({ message: 'How much is SEO?' }),
      decision: decision(),
      draft: draft('The configured price for this service is 149 OMR.'),
    });
    expect(result.reasons).not.toContain('MISSES_CANONICAL_PRICE_ANSWER');
    expect(result.metrics.directPriceAnswered).toBe(true);
  });

  it('does not invent a price obligation when no canonical quote exists', () => {
    const result = evaluateSalesReplyPolicy({
      context: context({ message: 'How much is the custom package?', serviceKnowledge: [] }),
      decision: decision({ action: 'HUMAN', serviceId: 'custom_content_production', requiresHuman: true }),
      draft: draft('This scope needs a custom quote from the team.'),
    });
    expect(result.metrics.directPriceAnswerRequired).toBe(false);
    expect(result.reasons).not.toContain('MISSES_CANONICAL_PRICE_ANSWER');
  });

  it('blocks more qualification after a customer explicitly says to start', () => {
    const result = evaluateSalesReplyPolicy({
      context: context({ message: "Let's start" }),
      decision: decision({ action: 'HUMAN', requiresHuman: true }),
      draft: draft('What is your budget?'),
    });
    expect(result.reasons).toContain('QUALIFICATION_AFTER_READY_TO_START');
    expect(result.metrics.readyToStart).toBe(true);
  });

  it('enforces the configured market reply-word limit exactly at the boundary', () => {
    const atLimit = evaluateSalesReplyPolicy({
      context: context({ marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'en', maxReplyWords: 5 } }),
      decision: decision(),
      draft: draft('One two three four five'),
    });
    const overLimit = evaluateSalesReplyPolicy({
      context: context({ marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'en', maxReplyWords: 5 } }),
      decision: decision(),
      draft: draft('One two three four five six'),
    });
    expect(atLimit.reasons).not.toContain('REPLY_EXCEEDS_MARKET_WORD_LIMIT');
    expect(overLimit.reasons).toContain('REPLY_EXCEEDS_MARKET_WORD_LIMIT');
    expect(overLimit.metrics.wordCount).toBe(6);
  });

  it('composes a canonical direct price from service knowledge when quotedPrice is absent', () => {
    const reply = secretaryCompose(context({ message: 'How much is SEO?', quotedPrice: undefined, quotedCurrency: undefined }), decision(), []);
    expect(reply.text).toContain('149 OMR');
  });

  it('keeps an Arabic direct price answer concise and grounded', () => {
    const reply = secretaryCompose(context({ message: 'كم سعر السيو؟', language: 'ar-OM' }), decision(), []);
    expect(reply.text).toContain('149 OMR');
    expect(reply.text).toMatch(/[\u0600-\u06FF]/);
  });
});

describe('sales efficiency measured-learning summary', () => {
  it('ignores historical runs without salesEfficiency instead of retroactively inventing metrics', () => {
    const result = buildSalesEfficiencySummary([
      { status: 'COMPLETED', result_payload: { trace: { guardrails: [] } } },
      { status: 'FAILED', result_payload: { trace: { salesEfficiency: { policyPassed: true } } } },
    ]);
    expect(result.evaluatedDrafts).toBe(0);
    expect(result.policyPassRate).toBeNull();
    expect(result.averageWords).toBeNull();
  });

  it('aggregates only explicit new trace evidence', () => {
    const result = buildSalesEfficiencySummary([
      {
        status: 'COMPLETED',
        result_payload: {
          trace: {
            guardrails: [],
            salesEfficiency: {
              policyPassed: true,
              wordCount: 20,
              questionCount: 0,
              directPriceAnswerRequired: true,
              directPriceAnswered: true,
              readyToStart: false,
              qualificationQuestions: [],
            },
          },
        },
      },
      {
        status: 'COMPLETED',
        result_payload: {
          trace: {
            guardrails: ['UNNECESSARY_BUDGET_QUESTION', 'REPLY_EXCEEDS_MARKET_WORD_LIMIT', 'MISSES_CANONICAL_PRICE_ANSWER'],
            salesEfficiency: {
              policyPassed: false,
              wordCount: 40,
              questionCount: 1,
              directPriceAnswerRequired: true,
              directPriceAnswered: false,
              readyToStart: true,
              qualificationQuestions: ['budget'],
            },
          },
        },
      },
      { status: 'COMPLETED', result_payload: { trace: {} } },
    ]);

    expect(result).toMatchObject({
      evaluatedDrafts: 2,
      policyPassedDrafts: 1,
      policyPassRate: 50,
      averageWords: 30,
      averageQuestions: 0.5,
      directPriceRequired: 2,
      directPriceAnswered: 1,
      readyToStartSignals: 1,
      avoidableQualificationBlocks: 1,
      marketWordLimitBlocks: 1,
      canonicalPriceMissBlocks: 1,
    });
  });

  it('drops malformed telemetry rather than converting missing fields to zero', () => {
    const result = buildSalesEfficiencySummary([{
      status: 'COMPLETED',
      result_payload: {
        trace: {
          salesEfficiency: {
            policyPassed: true,
            wordCount: 12,
          },
        },
      },
    }]);
    expect(result.evaluatedDrafts).toBe(0);
  });
});
