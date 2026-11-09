import { describe, expect, it } from 'vitest';
import { buildSelectiveRoutePlan } from '@/lib/agents/selective-routing';

describe('WhatsApp conversation intent across languages', () => {
  it.each(['What does it cost?', 'بكم يطلع؟', 'قیمتش چنده؟', 'WhatsApp automation قیمتش چنده؟'])(
    'routes a follow-up price question through evidence when there is no verified price (%s)', message => {
      const plan = buildSelectiveRoutePlan({ message });
      expect(plan.reasons).toContain('PRICE_REQUIRES_CONFIGURED_QUOTE');
      expect(plan.paidAgents).toContain('evidence_checker');
    },
  );

  it.each(['What does that service include?', 'شنو يشمل هالخدمة؟', 'این سرویس شامل چه چیزهایی می‌شه؟'])(
    'keeps a service explanation separate from a quote (%s)', message => {
      expect(buildSelectiveRoutePlan({ message, quotedPrice: 80, quotedCurrency: 'OMR' }).reasons)
        .not.toContain('CONFIGURED_PRICE_ALREADY_AVAILABLE');
    },
  );

  it('does not treat a Persian discount request as permission to quote automatically', () => {
    const plan = buildSelectiveRoutePlan({ message: 'تخفیف هم می‌دین؟', quotedPrice: 80, quotedCurrency: 'OMR' });
    expect(plan.reasons).toContain('OBJECTION_OR_HESITATION');
    expect(plan.paidAgents).toContain('conversation_psychology');
  });
});
