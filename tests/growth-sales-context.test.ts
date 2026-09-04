import { describe, expect, it } from 'vitest';
import { buildGrowthSalesContext } from '../lib/outreach/growth-context';
import { buildMessagePlan } from '../lib/outreach/message-plan';

describe('growth sales context', () => {
  it('reuses routed growth evidence without provider or llm calls', () => {
    const context = buildGrowthSalesContext({
      marketCode: 'OM',
      businessName: 'Example Dental Clinic',
      industry: 'dental clinic',
      preferredLanguage: 'ar',
      offerBundle: ['WEBSITE', 'ON_SITE_CONTENT', 'REELS'],
      recommendedAngle: 'trust, bookings and local patient acquisition',
      messageHooks: [
        'No standalone website is currently known for this business.',
        'The business is in Bosher, where on-site filming is serviceable.',
        'A direct phone contact path is available.',
        'Social-content quality is not claimed until evidence is checked.',
      ],
      personalizationFingerprint: ['DENTAL', 'Oman', 'Bosher', 'MUSCAT_LOCAL'],
      nextAction: 'CONTACT_READY',
    });

    expect(context.providerCalls).toBe(0);
    expect(context.llmCalls).toBe(0);
    expect(context.estimatedApiCostUsd).toBe(0);
    expect(context.messagePlanInput.evidence).toHaveLength(3);
    expect(context.messagePlanInput.recommendedOffer).toBe('WEBSITE + ON_SITE_CONTENT + REELS');

    const plan = buildMessagePlan(context.messagePlanInput);
    expect(plan.language).toBe('en+ar-OM');
    expect(plan.languages).toEqual(['en', 'ar-OM']);
    expect(plan.languageMode).toBe('BILINGUAL_FIRST_TOUCH');
    expect(plan.dialect).toBe('omani');
  });

  it('blocks skipped opportunities from entering outreach', () => {
    expect(() => buildGrowthSalesContext({
      marketCode: 'AE',
      businessName: 'Closed Business',
      offerBundle: ['AI_CONTENT'],
      messageHooks: ['A direct phone contact path is available.'],
      nextAction: 'SKIP',
    })).toThrow(/cannot enter sales messaging/);
  });

  it('refuses generic caution text as the only evidence', () => {
    expect(() => buildGrowthSalesContext({
      marketCode: 'SA',
      businessName: 'Example Salon',
      offerBundle: ['AI_CONTENT'],
      messageHooks: ['Social-content quality is not claimed until evidence is checked.'],
      nextAction: 'SOCIAL_CHECK',
    })).toThrow(/verified growth observation/);
  });
});
