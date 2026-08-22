import { describe, expect, it } from 'vitest';
import { buildSelectiveRoutePlan } from '../lib/agents/selective-routing';
import { evaluateCommercialPolicy } from '../lib/conversations/commercial-policy';
import { classifyConversationStage } from '../lib/conversations/intelligence';
import { buildFollowupSchedule } from '../lib/outreach/followups';

describe('cost-first commercial policy', () => {
  it('keeps a price question on the evidence-backed path when no configured quote is supplied', () => {
    const plan = buildSelectiveRoutePlan({ message: 'How much does the website cost?' });
    expect(plan.tier).toBe('FULL');
    expect(plan.agents).toContain('business_analyst');
    expect(plan.agents).toContain('evidence_checker');
    expect(plan.reasons).toContain('PRICE_REQUIRES_CONFIGURED_QUOTE');
  });

  it('answers a price-only question at zero LLM cost when a verified quote is already available', () => {
    const plan = buildSelectiveRoutePlan({
      message: 'How much does it cost?',
      quotedPrice: 249,
      quotedCurrency: 'OMR',
    });
    expect(plan.tier).toBe('ZERO_COST');
    expect(plan.estimatedLlmCalls).toBe(0);
  });

  it('uses configured pricing and flags discounts above autonomous authority without provider calls', () => {
    const result = evaluateCommercialPolicy({
      serviceId: 'premium_bilingual_website',
      marketCode: 'OM',
      requestedDiscountPct: 8,
    });
    expect(result.quote.allowed).toBe(true);
    expect(result.requiresHuman).toBe(true);
    expect(result.safeForAutonomousQuote).toBe(false);
    expect(result.providerCalls).toBe(0);
    expect(result.llmCalls).toBe(0);
  });

  it('hard-blocks discounts above the configured approval ceiling', () => {
    const result = evaluateCommercialPolicy({
      serviceId: 'premium_bilingual_website',
      marketCode: 'OM',
      requestedDiscountPct: 15,
    });
    expect(result.quote.allowed).toBe(false);
    expect(result.requiresHuman).toBe(true);
    expect(result.conversationSignals.discountBeyondAutoLimit).toBe(true);
  });
});

describe('conversation lifecycle and follow-up stops', () => {
  it('classifies closing intent before generic hot intent', () => {
    const stage = classifyConversationStage({ paymentIntent: true, intentScore: 95 });
    expect(stage.stage).toBe('CLOSING');
  });

  it('stops follow-ups during human takeover and terminal states', () => {
    const sentAt = new Date('2026-08-20T10:00:00Z');
    expect(buildFollowupSchedule({ sentAt, humanTakeover: true })).toEqual([]);
    expect(buildFollowupSchedule({ sentAt, won: true })).toEqual([]);
    expect(buildFollowupSchedule({ sentAt, lost: true })).toEqual([]);
    expect(buildFollowupSchedule({ sentAt, paused: true })).toEqual([]);
  });
});
