import { describe, expect, it } from 'vitest';
import { buildMessagePlan, buildOmanFirstTouchDraft } from '@/lib/outreach/message-plan';

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
    expect(plan.compositionRules).toContain('English section first, Omani Arabic section second.');
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

  it('renders English first and the Omani Arabic equivalent from the same verified observation and offer', () => {
    const sourceEvidence = 'A cached deterministic website audit marks SEO quality as weak/poor.';
    const draft = buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: 'Example Dental',
      evidence: [
        'The business is in Muscat, where on-site filming is serviceable.',
        'A direct phone contact path is available.',
        'Existing Google activity is visible (506 ratings).',
        sourceEvidence,
      ],
      recommendedOffer: 'seo_growth',
    });

    expect(draft.plan.languageMode).toBe('BILINGUAL_FIRST_TOUCH');
    expect(draft.plan.languages).toEqual(['en', 'ar-OM']);
    expect(draft.plan.evidence[0]).toBe(sourceEvidence);
    expect(draft.observation).toMatchObject({
      key: 'SEO_AUDIT_WEAK',
      sourceEvidence,
    });
    expect(draft.sections.english).toContain('your website audit shows that the SEO performance could be improved');
    expect(draft.sections.english).toContain('Based on that, targeted SEO improvements could be useful.');
    expect(draft.sections.omaniArabic).toContain('السيو في موقعكم يحتاج تحسين');
    expect(draft.sections.omaniArabic).toContain('ممكن نساعدكم من خلال تحسينات مركزة للظهور في محركات البحث');
    expect(draft.text.indexOf(draft.sections.english)).toBe(0);
    expect(draft.text.indexOf(draft.sections.omaniArabic)).toBeGreaterThan(draft.sections.english.length);
  });

  it('keeps the Arabic opener light, professional and grammatically stable across offer types', () => {
    const seo = buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: 'Example Dental',
      evidence: ['A cached deterministic website audit marks SEO quality as weak/poor.'],
      recommendedOffer: 'seo_growth',
    });
    const bilingual = buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: 'Example Clinic',
      evidence: ['Arabic support is missing.'],
      recommendedOffer: 'premium_bilingual_website',
    });

    expect(seo.sections.omaniArabic).toContain('هلا Example Dental');
    expect(seo.sections.omaniArabic).toContain('إذا حابين، نرسل لكم ملخص قصير؟');
    expect(seo.sections.omaniArabic).not.toContain('ممكن يكون مناسب');
    expect(bilingual.sections.omaniArabic).toContain('موقعكم حالياً ما يدعم اللغة العربية');
    expect(bilingual.sections.omaniArabic).toContain('تطوير الموقع بشكل ثنائي اللغة');
  });

  it.each([
    {
      serviceId: 'business_website',
      evidence: 'Only a social/contact/directory presence is known; no standalone website is present.',
      observationKey: 'NO_STANDALONE_WEBSITE',
    },
    {
      serviceId: 'seo_growth',
      evidence: 'A cached deterministic website audit marks SEO quality as weak/poor.',
      observationKey: 'SEO_AUDIT_WEAK',
    },
    {
      serviceId: 'premium_bilingual_website',
      evidence: 'Arabic support is missing.',
      observationKey: 'ARABIC_SUPPORT_MISSING',
    },
  ])('renders current Tier-A evidence family $observationKey without an LLM', ({ serviceId, evidence, observationKey }) => {
    const draft = buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: 'Verified Business',
      evidence: ['A direct phone contact path is available.', evidence],
      recommendedOffer: serviceId,
    });

    expect(draft.observation.key).toBe(observationKey);
    expect(draft.plan.evidence[0]).toBe(evidence);
    expect(draft.text).toContain('Verified Business');
  });

  it('fails closed when no verified evidence exists', () => {
    expect(() => buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: 'Example Clinic',
      evidence: [],
      recommendedOffer: 'business_website',
    })).toThrow(/No supported verified Oman first-touch observation/);
  });

  it('fails closed when evidence cannot be rendered canonically instead of inventing a claim', () => {
    expect(() => buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: 'Example Clinic',
      evidence: ['Someone said the business might need marketing.'],
      recommendedOffer: 'business_website',
    })).toThrow(/No supported verified Oman first-touch observation/);
  });

  it('does not insert guarantees, free custom work, or random upsells into first touch', () => {
    const draft = buildOmanFirstTouchDraft({
      marketCode: 'OM',
      businessName: 'Example Clinic',
      evidence: ['Arabic support is missing.'],
      recommendedOffer: 'premium_bilingual_website',
    });

    expect(draft.text).not.toMatch(/guarantee|guaranteed|free preview|free mockup|custom preview/i);
    expect(draft.text).not.toMatch(/مجاني|نضمن|معاينة مخصصة/i);
  });
});
