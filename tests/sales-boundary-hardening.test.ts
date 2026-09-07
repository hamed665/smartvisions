import { describe, expect, it } from 'vitest';
import type { AgentContext, CommercialDecision, ConversationMemoryItem, SalesStateSnapshot } from '@/lib/agents/contracts';
import { evaluateSalesReplyPolicy } from '@/lib/conversations/sales-behavior';
import { deriveSalesState } from '@/lib/conversations/sales-state';

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

function customer(id: string, body: string): ConversationMemoryItem {
  return {
    sourceId: id,
    providerMessageId: `provider-${id}`,
    source: 'OUTREACH',
    scope: 'CONVERSATION',
    senderType: 'CUSTOMER',
    direction: 'INBOUND',
    channel: 'WHATSAPP',
    status: 'RECEIVED',
    body,
    at: '2026-09-07T08:00:00Z',
  };
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

  it('keeps a rejected service rejected while selecting a different service in the same customer message', () => {
    const result = deriveSalesState({
      history: [customer('mixed-service', "I don't want a website, I want SEO")],
      stage: 'ACTIVE',
      language: 'en',
    });

    expect(result.rejectedServices).toContain('BUSINESS_WEBSITE');
    expect(result.rejectedServices).not.toContain('SEO');
    expect(result.selectedService).toBe('SEO');
  });

  it('retains model count and explicit gender from one compact production brief', () => {
    const result = deriveSalesState({
      history: [customer('production-brief', 'I need 12 reels, 20 stories, a videographer and 2 female models in Muscat on June 23 2027')],
      stage: 'ACTIVE',
      language: 'en',
    });

    expect(result.deliverables).toContainEqual({ kind: 'MODEL', quantity: 2, detail: 'gender:female' });
    expect(result.productionNeeds).toContain('VIDEOGRAPHER');
    expect(result.location).toBe('Muscat');
    expect(result.date).toEqual({ raw: 'June 23 2027', precision: 'EXPLICIT' });
  });
});
