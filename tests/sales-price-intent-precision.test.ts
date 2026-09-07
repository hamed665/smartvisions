import { describe, expect, it } from 'vitest';
import type { AgentContext, CommercialDecision, SalesStateSnapshot } from '@/lib/agents/contracts';
import { secretaryCompose } from '@/lib/agents/executor';
import { evaluateSalesReplyPolicy } from '@/lib/conversations/sales-behavior';

const salesState: SalesStateSnapshot = {
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
};

const context: AgentContext = {
  message: 'چقدر زمان میبره؟',
  language: 'fa',
  salesState,
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
};

const decision: CommercialDecision = {
  action: 'ANSWER',
  serviceId: 'seo_growth',
  useDiscount: false,
  explainValue: true,
  askLowPressureCta: true,
  requiresHuman: false,
  reasons: ['TEST'],
};

describe('price intent precision', () => {
  it('does not treat a Persian duration question as a direct price request', () => {
    const result = evaluateSalesReplyPolicy({
      context,
      decision,
      draft: { text: 'زمان اجرا به محدوده کار بستگی دارد.', language: 'fa', generatedBy: 'secretary' },
    });
    expect(result.metrics.directPriceAnswerRequired).toBe(false);
    expect(result.reasons).not.toContain('MISSES_CANONICAL_PRICE_ANSWER');
  });

  it('does not make the deterministic secretary answer a duration question with a price', () => {
    const reply = secretaryCompose(context, decision, []);
    expect(reply.text).not.toContain('149 OMR');
  });
});
