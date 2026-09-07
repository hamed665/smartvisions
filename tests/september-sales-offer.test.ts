import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentContext, AgentResult } from '@/lib/agents/contracts';
import { decideCommercialAction, secretaryCompose } from '@/lib/agents/executor';

const baseResults: AgentResult[] = [];

function context(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    countryCode: 'OM',
    message: 'How much is SEO?',
    quotedService: 'seo_growth',
    quotedPrice: 149,
    quotedCurrency: 'OMR',
    salesState: {
      version: 1,
      selectedService: 'SEO',
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
    },
    ...overrides,
  };
}

describe('September chat-only sales offer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00+04:00'));
  });

  afterEach(() => vi.useRealTimers());

  it('injects the configured SEO offer only after price intent', () => {
    const ctx = context();
    const decision = decideCommercialAction(ctx, baseResults);
    expect(decision).toMatchObject({ useDiscount: true, discountPct: 25 });
    const draft = secretaryCompose(ctx, decision, baseResults);
    expect(draft.text).toContain('149 OMR');
    expect(draft.text).toContain('25% off');
    expect(draft.text).toContain('111.75 OMR');
  });

  it('uses the current selected service instead of a stale earlier quote', () => {
    const ctx = context({
      message: 'What is the price for WhatsApp automation?',
      salesState: { ...context().salesState!, selectedService: 'WHATSAPP_AUTOMATION' },
      serviceKnowledge: [{
        id: 'whatsapp_ai_setup',
        name: 'WhatsApp AI Setup',
        marketPrice: {
          countryCode: 'OM',
          currency: 'OMR',
          price: 199,
          minimumPrice: 199,
          maxAutoDiscountPct: 0,
          maxDiscountWithApprovalPct: 0,
        },
      }],
    });
    const decision = decideCommercialAction(ctx, baseResults);
    const draft = secretaryCompose(ctx, decision, baseResults);
    expect(decision).toMatchObject({ useDiscount: true, discountPct: 15 });
    expect(draft.text).toContain('169.15 OMR');
    expect(draft.text).not.toContain('111.75 OMR');
  });

  it('does not reveal the offer in a generic first-touch conversation', () => {
    const ctx = context({ message: 'Tell me about SEO' });
    const decision = decideCommercialAction(ctx, baseResults);
    expect(decision.useDiscount).toBe(false);
    expect(secretaryCompose(ctx, decision, baseResults).text).not.toMatch(/September|25%/i);
  });

  it('can reveal a percentage for a catalog service without inventing a price', () => {
    const ctx = context({
      message: 'Do you have an offer for business automation?',
      quotedService: undefined,
      quotedPrice: undefined,
      quotedCurrency: undefined,
      salesState: { ...context().salesState!, selectedService: 'BUSINESS_AUTOMATION' },
    });
    const decision = decideCommercialAction(ctx, baseResults);
    const draft = secretaryCompose(ctx, decision, baseResults);
    expect(decision).toMatchObject({ useDiscount: true, discountPct: 15 });
    expect(draft.text).toContain('15% off');
    expect(draft.text).not.toMatch(/\b\d+(?:\.\d+)?\s+OMR\b/);
  });

  it('keeps AI Agent as the single no-discount package', () => {
    const ctx = context({
      message: 'Any discount on the AI Agent?',
      quotedService: undefined,
      quotedPrice: undefined,
      quotedCurrency: undefined,
      salesState: { ...context().salesState!, selectedService: 'AI_AGENT' },
    });
    const decision = decideCommercialAction(ctx, baseResults);
    expect(decision.useDiscount).toBe(false);
    expect(secretaryCompose(ctx, decision, baseResults).text).toContain('not discounted');
  });
});
