import { describe, expect, it } from 'vitest';
import { buildMessagePlan } from '@/lib/outreach/message-plan';

describe('Oman first-touch language policy', () => {
  it('uses English plus Omani Arabic before the customer has chosen a language', () => {
    const plan = buildMessagePlan({
      marketCode: 'OM',
      businessName: 'Example Restaurant',
      industry: 'restaurant',
      evidence: ['The business has an active public Instagram profile.'],
      recommendedOffer: 'ai_reels_8',
    });

    expect(plan.language).toBe('en+ar-OM');
    expect(plan.languages).toEqual(['en', 'ar-OM']);
    expect(plan.languageMode).toBe('BILINGUAL_FIRST_TOUCH');
    expect(plan.dialect).toBe('omani');
    expect(plan.compositionRules).toContain('After the customer replies, stop bilingual outreach and mirror the customer language.');
  });

  it('does not force bilingual first touch onto non-Oman markets', () => {
    const plan = buildMessagePlan({
      marketCode: 'GB',
      businessName: 'Example Clinic',
      evidence: ['The clinic has a verified direct contact path.'],
      recommendedOffer: 'business_website',
    });

    expect(plan.language).toBe('en-GB');
    expect(plan.languages).toEqual(['en-GB']);
    expect(plan.languageMode).toBe('SINGLE_LANGUAGE');
  });
});
