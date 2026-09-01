import { describe, expect, it } from 'vitest';
import { buildSelectiveRoutePlan } from '../lib/agents/selective-routing';

describe('cost-first selective sales routing', () => {
  it('uses zero-cost routing for a configured price-only question', () => {
    const plan = buildSelectiveRoutePlan({
      message: 'How much does it cost?',
      quotedPrice: 249,
      quotedCurrency: 'OMR',
      verifiedEvidence: ['No standalone website'],
    });

    expect(plan.tier).toBe('ZERO_COST');
    expect(plan.estimatedLlmCalls).toBe(0);
    expect(plan.paidAgents).toEqual([]);
    expect(plan.agents).toEqual(['intent_discovery', 'evidence_checker', 'secretary', 'relevance_checker']);
  });

  it('keeps a routine reply on the light path with only the secretary paid', () => {
    const plan = buildSelectiveRoutePlan({ message: 'Can you tell me a bit more?', countryCode: 'OM' });
    expect(plan.tier).toBe('LIGHT');
    expect(plan.agents).not.toContain('business_analyst');
    expect(plan.agents).not.toContain('conversation_psychology');
    expect(plan.paidAgents).toEqual(['secretary']);
    expect(plan.estimatedLlmCalls).toBe(1);
  });

  it('uses the full path for negotiation without paying every specialist', () => {
    const plan = buildSelectiveRoutePlan({ message: 'The price is too much. Can we have a call?', intentScore: 75 });
    expect(plan.tier).toBe('FULL');
    expect(plan.agents).toContain('conversation_psychology');
    expect(plan.agents).toContain('business_analyst');
    expect(plan.reasons).toContain('MEETING_INTENT');
    expect(plan.paidAgents).toContain('conversation_psychology');
    expect(plan.paidAgents).toContain('business_analyst');
    expect(plan.paidAgents).toContain('decision_orchestrator');
    expect(plan.paidAgents).toContain('secretary');
    expect(plan.paidAgents).toContain('relevance_checker');
    expect(plan.paidAgents).not.toContain('intent_discovery');
    expect(plan.paidAgents).not.toContain('sales_marketing');
    expect(plan.estimatedLlmCalls).toBe(plan.paidAgents.length);
    expect(plan.estimatedLlmCalls).toBeLessThan(plan.agents.length);
  });

  it('keeps a verified-price objection focused on psychology, decision, reply and relevance', () => {
    const plan = buildSelectiveRoutePlan({
      message: 'That is expensive. Can you do a better price?',
      quotedPrice: 249,
      quotedCurrency: 'OMR',
      intentScore: 60,
    });
    expect(plan.tier).toBe('FULL');
    expect(plan.paidAgents).toEqual([
      'decision_orchestrator',
      'secretary',
      'conversation_psychology',
      'relevance_checker',
    ]);
  });

  it('does not wake the agent committee for a thank-you', () => {
    const plan = buildSelectiveRoutePlan({ message: 'شكراً' });
    expect(plan.tier).toBe('ZERO_COST');
    expect(plan.agents).toEqual(['secretary']);
    expect(plan.paidAgents).toEqual([]);
  });
});
