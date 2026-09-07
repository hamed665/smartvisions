import { describe, expect, it } from 'vitest';
import type { AgentContext, CommercialDecision, SalesStateSnapshot } from '@/lib/agents/contracts';
import { evaluateSalesReplyPolicy } from '@/lib/conversations/sales-behavior';

function salesState(overrides: Partial<SalesStateSnapshot> = {}): SalesStateSnapshot {
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

function context(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    message: 'Continue',
    language: 'en',
    salesState: salesState(),
    ...overrides,
  } as AgentContext;
}

describe('sales boundary hardening', () => {
  it('does not mistake a grounded brief summary for repeated qualification questions', () => {
    const ctx = context({
      salesState: salesState({
        location: 'Muscat',
        date: { raw: 'June 23 2027', precision: 'EXPLICIT' },
        budget: { raw: '500 OMR', amount: 500, currency: 'OMR' },
      }),
    });
    const result = evaluateSalesReplyPolicy({
      context: ctx,
      draft: {
        text: 'Location: Muscat. Date: June 23 2027. Budget: 500 OMR. I can take the next step from this brief.',
        language: 'en',
        generatedBy: 'secretary',
      },
    });

    expect(result.reasons).not.toContain('REPEATED_KNOWN_LOCATION_QUESTION');
    expect(result.reasons).not.toContain('REPEATED_KNOWN_DATE_QUESTION');
    expect(result.reasons).not.toContain('REPEATED_KNOWN_BUDGET_QUESTION');
    expect(result.metrics.qualificationQuestions).toEqual([]);
  });

  it('still detects an actual repeated location question', () => {
    const ctx = context({ salesState: salesState({ location: 'Muscat' }) });
    const result = evaluateSalesReplyPolicy({
      context: ctx,
      draft: { text: 'Could you confirm the location?', language: 'en', generatedBy: 'secretary' },
    });
    expect(result.reasons).toContain('REPEATED_KNOWN_LOCATION_QUESTION');
  });

  it('uses the service selected by the current commercial decision instead of a stale hydrated quote', () => {
    const ctx = context({
      message: 'How much is SEO?',
      quotedService: 'website-service',
      quotedPrice: 179,
      quotedCurrency: 'OMR',
      serviceKnowledge: [
        {
          id: 'website-service',
          name: 'Business Website',
          marketPrice: {
            countryCode: 'OM', currency: 'OMR', price: 179, minimumPrice: 179,
            maxAutoDiscountPct: 0, maxDiscountWithApprovalPct: 0,
          },
        },
        {
          id: 'seo-service',
          name: 'SEO Growth',
          marketPrice: {
            countryCode: 'OM', currency: 'OMR', price: 149, minimumPrice: 149,
            maxAutoDiscountPct: 0, maxDiscountWithApprovalPct: 0,
          },
        },
      ],
    });
    const decision: CommercialDecision = {
      action: 'ANSWER',
      serviceId: 'seo-service',
      useDiscount: false,
      explainValue: false,
      askLowPressureCta: false,
      requiresHuman: false,
      reasons: [],
    };

    const correct = evaluateSalesReplyPolicy({
      context: ctx,
      decision,
      draft: { text: 'SEO is 149 OMR.', language: 'en', generatedBy: 'secretary' },
    });
    const stale = evaluateSalesReplyPolicy({
      context: ctx,
      decision,
      draft: { text: 'SEO is 179 OMR.', language: 'en', generatedBy: 'secretary' },
    });

    expect(correct.reasons).not.toContain('MISSES_CANONICAL_PRICE_ANSWER');
    expect(stale.reasons).toContain('MISSES_CANONICAL_PRICE_ANSWER');
  });
});
