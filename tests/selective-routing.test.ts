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
    expect(plan.agents).toEqual(['intent_discovery', 'evidence_checker', 'secretary', 'relevance_checker']);
  });

  it('keeps a routine reply on the light path', () => {
    const plan = buildSelectiveRoutePlan({ message: 'Can you tell me a bit more?', countryCode: 'OM' });
    expect(plan.tier).toBe('LIGHT');
    expect(plan.agents).not.toContain('business_analyst');
    expect(plan.agents).not.toContain('conversation_psychology');
  });

  it('uses the full path for negotiation or objections', () => {
    const plan = buildSelectiveRoutePlan({ message: 'The price is too much. Can we have a call?', intentScore: 75 });
    expect(plan.tier).toBe('FULL');
    expect(plan.agents).toContain('conversation_psychology');
    expect(plan.agents).toContain('business_analyst');
    expect(plan.reasons).toContain('MEETING_INTENT');
  });

  it('does not wake the agent committee for a thank-you', () => {
    const plan = buildSelectiveRoutePlan({ message: 'شكراً' });
    expect(plan.tier).toBe('ZERO_COST');
    expect(plan.agents).toEqual(['secretary']);
  });
});
