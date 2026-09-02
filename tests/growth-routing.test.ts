import { describe, expect, it } from 'vitest';
import { buildGrowthOpportunity, classifyServiceRegion } from '../lib/hunters/business/growth-routing';

const base = {
  sourceType: 'google_places' as const,
  name: 'Example Dental Clinic',
  category: 'dental clinic',
  countryCode: 'OM',
  city: 'Muscat',
  businessStatus: 'OPERATIONAL',
  phone: '91234567',
  googleMapsUri: 'https://maps.google.com/example',
  formattedAddress: 'Bosher, Muscat',
  rating: 4.5,
  userRatingCount: 40,
  retrievedAt: new Date().toISOString(),
};

const catalog = new Set(['business_website','premium_bilingual_website','custom_website','ai_reels_4','whatsapp_ai_setup']);

describe('growth opportunity routing', () => {
  it('routes a Muscat no-website business to the website service without inventing a content weakness', () => {
    const result = buildGrowthOpportunity({ ...base }, { enabledServiceIds: catalog });
    expect(result.region).toBe('MUSCAT_LOCAL');
    expect(result.lane).toBe('MUSCAT_LOCAL_GROWTH');
    expect(result.websiteScore).toBeGreaterThanOrEqual(90);
    expect(result.localContentScore).toBe(0);
    expect(result.aiContentScore).toBe(0);
    expect(result.qualification.prospectTier).toBe('A');
    expect(result.qualification.primaryOfferFamily).toBe('WEBSITE_BUILD');
    expect(result.qualification.primaryServiceId).toBe('business_website');
    expect(result.qualification.shouldContact).toBe(true);
    expect(result.recommendedServices).toContain('business_website');
    expect(result.personalization.offerBundle).not.toContain('MUSCAT_CONTENT_GROWTH');
    expect(result.personalization.providerCalls).toBe(0);
    expect(result.personalization.llmCalls).toBe(0);
    expect(result.personalization.estimatedApiCostUsd).toBe(0);
  });

  it('holds an outside-Muscat standalone website for deterministic website evidence instead of auto-pitching AI content', () => {
    const result = buildGrowthOpportunity(
      { ...base, city: 'Sohar', officialWebsite: 'https://example.om' },
      { enabledServiceIds: catalog },
    );
    expect(result.region).toBe('OMAN_REMOTE');
    expect(result.lane).toBe('OMAN_REMOTE_GROWTH');
    expect(result.aiContentScore).toBe(0);
    expect(result.qualification.shouldContact).toBe(false);
    expect(result.qualification.evidenceGaps).toContain('WEBSITE_AUDIT_REQUIRED');
    expect(result.qualification.cheapestNextAction).toBe('WEBSITE_EVIDENCE');
  });

  it('routes verified weak international Instagram evidence to AI reels, never Muscat filming', () => {
    expect(classifyServiceRegion('AE', 'Dubai')).toBe('INTERNATIONAL_REMOTE');
    const result = buildGrowthOpportunity(
      { ...base, countryCode: 'AE', city: 'Dubai', officialWebsite: 'https://example.ae', instagram: 'https://instagram.com/example' },
      {
        enabledServiceIds: catalog,
        websiteAudit: { seoQuality: 'GOOD', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true },
        socialAssessment: { status: 'VERIFIED', quality: 'WEAK', source: 'OWNER_REVIEW' },
      },
    );
    expect(result.lane).toBe('INTERNATIONAL_AI_GROWTH');
    expect(result.qualification.primaryOfferFamily).toBe('AI_REELS');
    expect(result.qualification.primaryServiceId).toBe('ai_reels_4');
    expect(result.qualification.shouldContact).toBe(true);
    expect(result.personalization.offerBundle).toContain('AI_REELS');
    expect(result.personalization.offerBundle).not.toContain('MUSCAT_CONTENT_GROWTH');
    expect(result.personalization.estimatedApiCostUsd).toBe(0);
  });

  it('does not promote a strong no-website need without a direct contact path', () => {
    const result = buildGrowthOpportunity(
      { ...base, phone: undefined, googleMapsUri: undefined, formattedAddress: undefined },
      { enabledServiceIds: catalog },
    );
    expect(result.qualification.shouldContact).toBe(false);
    expect(result.qualification.cheapestNextAction).toBe('SKIP');
    expect(result.contentCheckStatus).toBe('READY_FOR_REVIEW');
  });

  it('does not promote non-operational businesses into evidence checks or outreach', () => {
    const result = buildGrowthOpportunity(
      { ...base, businessStatus: 'CLOSED_PERMANENTLY' },
      { enabledServiceIds: catalog },
    );
    expect(result.overallSalesScore).toBe(0);
    expect(result.contentCheckStatus).toBe('NOT_ELIGIBLE');
    expect(result.qualification.prospectTier).toBe('SKIP');
    expect(result.qualification.shouldContact).toBe(false);
  });
});
