import { describe, expect, it } from 'vitest';
import { buildOwnerSocialAssessment, buildServiceFitQualification } from '../lib/hunters/business/service-fit';

const base = {
  sourceType: 'google_places' as const,
  name: 'Example Dental Clinic',
  category: 'dental clinic',
  countryCode: 'OM',
  city: 'Muscat',
  businessStatus: 'OPERATIONAL',
  phone: '91234567',
  rating: 4.5,
  userRatingCount: 40,
  retrievedAt: new Date().toISOString(),
};

const catalog = new Set(['business_website','premium_bilingual_website','custom_website','ai_reels_4','whatsapp_ai_setup']);

describe('high-precision service-fit qualification', () => {
  it('requires a specific note before owner social evidence can become VERIFIED', () => {
    expect(() => buildOwnerSocialAssessment({ quality: 'WEAK', note: '' })).toThrow(/evidence note/i);
    expect(() => buildOwnerSocialAssessment({ quality: 'INACTIVE', note: 'short' })).toThrow(/evidence note/i);
    expect(() => buildOwnerSocialAssessment({ quality: 'UNKNOWN', note: 'No posts for 90 days' })).toThrow(/quality/i);
    expect(buildOwnerSocialAssessment({ quality: 'weak', note: '  No posts for 90 days  ', assessedAt: '2026-09-02T00:00:00.000Z' })).toEqual({
      status: 'VERIFIED',
      quality: 'WEAK',
      source: 'OWNER_REVIEW',
      assessedAt: '2026-09-02T00:00:00.000Z',
      reasons: ['No posts for 90 days'],
    });
  });

  it('can promote an appointment-heavy no-website dental clinic as Tier A website fit', () => {
    const result = buildServiceFitQualification({ business: base, region: 'MUSCAT_LOCAL', websiteClass: 'NONE', enabledServiceIds: catalog });
    expect(result.prospectTier).toBe('A');
    expect(result.primaryOfferFamily).toBe('WEBSITE_BUILD');
    expect(result.primaryServiceId).toBe('business_website');
    expect(result.shouldContact).toBe(true);
    expect(result.cheapestNextAction).toBe('CONTACT_READY');
  });

  it('does not equate an ordinary Oman restaurant with no website to a website lead', () => {
    const result = buildServiceFitQualification({
      business: { ...base, name: 'Neighbourhood Cafe', category: 'restaurant cafe', rating: 4.3, userRatingCount: 40 },
      region: 'MUSCAT_LOCAL',
      websiteClass: 'NONE',
      enabledServiceIds: catalog,
    });
    expect(result.primaryOfferFamily).toBe('NONE');
    expect(result.primaryServiceId).toBeNull();
    expect(result.shouldContact).toBe(false);
    expect(result.prospectTier).toBe('SKIP');
    expect(result.evidenceGaps).toContain('NO_WEBSITE_IS_NOT_SERVICE_EVIDENCE');
    expect(result.reasons.join(' ')).toContain('NO_RECOMMENDATION');
  });

  it('allows premium-scale restaurant evidence to justify website fit', () => {
    const result = buildServiceFitQualification({
      business: { ...base, name: 'Premium Muscat Dining', category: 'restaurant', priceLevel: 'PRICE_LEVEL_EXPENSIVE', rating: 4.6, userRatingCount: 160 },
      region: 'MUSCAT_LOCAL',
      websiteClass: 'NONE',
      enabledServiceIds: catalog,
    });
    expect(result.primaryOfferFamily).toBe('WEBSITE_BUILD');
    expect(result.primaryServiceId).toBe('business_website');
    expect(result.prospectTier).toBe('A');
  });

  it('lets verified weak social content beat a generic website pitch for a visual restaurant', () => {
    const result = buildServiceFitQualification({
      business: { ...base, name: 'Visual Cafe', category: 'restaurant cafe', instagram: 'https://instagram.com/visualcafe' },
      region: 'MUSCAT_LOCAL',
      websiteClass: 'NONE',
      socialAssessment: { status: 'VERIFIED', quality: 'WEAK', source: 'OWNER_REVIEW', reasons: ['posting is inconsistent and offers are unclear'] },
      enabledServiceIds: new Set([...catalog, 'muscat_content_production']),
    });
    expect(result.primaryOfferFamily).toBe('MUSCAT_CONTENT_GROWTH');
    expect(result.primaryServiceId).toBe('muscat_content_production');
    expect(result.shouldContact).toBe(true);
  });

  it('recognizes audited poor SEO but blocks outreach until SEO exists in the canonical service catalog', () => {
    const result = buildServiceFitQualification({
      business: { ...base, officialWebsite: 'https://example.om' }, region: 'MUSCAT_LOCAL', websiteClass: 'STANDALONE',
      websiteAudit: { seoQuality: 'POOR', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true, hasWhatsapp: false },
      enabledServiceIds: catalog,
    });
    expect(result.prospectTier).toBe('A');
    expect(result.primaryOfferFamily).toBe('SEO_GROWTH');
    expect(result.primarySuggestedServiceId).toBe('seo_growth');
    expect(result.primaryServiceId).toBeNull();
    expect(result.shouldContact).toBe(false);
    expect(result.cheapestNextAction).toBe('CATALOG_SETUP');
  });

  it('makes audited SEO fit contact-ready once the canonical SEO service is enabled', () => {
    const result = buildServiceFitQualification({
      business: { ...base, officialWebsite: 'https://example.om' }, region: 'MUSCAT_LOCAL', websiteClass: 'STANDALONE',
      websiteAudit: { seoQuality: 'POOR', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true, hasWhatsapp: false },
      enabledServiceIds: new Set([...catalog, 'seo_growth']),
    });
    expect(result.primaryServiceId).toBe('seo_growth');
    expect(result.shouldContact).toBe(true);
    expect(result.cheapestNextAction).toBe('CONTACT_READY');
  });

  it('never claims weak Instagram content from a known profile alone', () => {
    const result = buildServiceFitQualification({
      business: { ...base, officialWebsite: 'https://example.om', instagram: 'https://instagram.com/example' },
      region: 'MUSCAT_LOCAL', websiteClass: 'STANDALONE',
      websiteAudit: { seoQuality: 'GOOD', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true },
      enabledServiceIds: catalog,
    });
    expect(result.serviceFits.some(item => item.family === 'MUSCAT_CONTENT_GROWTH')).toBe(false);
    expect(result.evidenceGaps).toContain('SOCIAL_QUALITY_CHECK_REQUIRED');
    expect(result.cheapestNextAction).toBe('SOCIAL_CHECK');
  });

  it('promotes verified weak Muscat Instagram content only when the matching catalog service exists', () => {
    const result = buildServiceFitQualification({
      business: { ...base, officialWebsite: 'https://example.om', instagram: 'https://instagram.com/example' },
      region: 'MUSCAT_LOCAL', websiteClass: 'STANDALONE',
      websiteAudit: { seoQuality: 'GOOD', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true },
      socialAssessment: { status: 'VERIFIED', quality: 'WEAK', source: 'OWNER_REVIEW', reasons: ['posting is inconsistent'] },
      enabledServiceIds: new Set([...catalog, 'muscat_content_production']),
    });
    expect(result.primaryOfferFamily).toBe('MUSCAT_CONTENT_GROWTH');
    expect(result.primaryServiceId).toBe('muscat_content_production');
    expect(result.prospectTier).toBe('A');
    expect(result.shouldContact).toBe(true);
  });

  it('suppresses a content pitch when Instagram is verified good', () => {
    const result = buildServiceFitQualification({
      business: { ...base, officialWebsite: 'https://example.om', instagram: 'https://instagram.com/example' },
      region: 'MUSCAT_LOCAL', websiteClass: 'STANDALONE',
      websiteAudit: { seoQuality: 'GOOD', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true },
      socialAssessment: { status: 'VERIFIED', quality: 'GOOD', source: 'OWNER_REVIEW', reasons: ['posting quality is consistently strong'] },
      enabledServiceIds: new Set([...catalog, 'muscat_content_production']),
    });
    expect(result.serviceFits.some(item => item.family === 'MUSCAT_CONTENT_GROWTH')).toBe(false);
    expect(result.shouldContact).toBe(false);
  });

  it('routes verified remote social weakness to AI reels instead of Muscat filming', () => {
    const result = buildServiceFitQualification({
      business: { ...base, countryCode: 'AE', city: 'Dubai', officialWebsite: 'https://example.ae', instagram: 'https://instagram.com/example' },
      region: 'INTERNATIONAL_REMOTE', websiteClass: 'STANDALONE',
      websiteAudit: { seoQuality: 'GOOD', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true },
      socialAssessment: { status: 'VERIFIED', quality: 'INACTIVE', source: 'OWNER_REVIEW', reasons: ['no posts in the last three months'] },
      enabledServiceIds: catalog,
    });
    expect(result.primaryOfferFamily).toBe('AI_REELS');
    expect(result.primaryServiceId).toBe('ai_reels_4');
    expect(result.serviceFits.some(item => item.family === 'MUSCAT_CONTENT_GROWTH')).toBe(false);
  });

  it('does not promote even a strong need without a direct contact path', () => {
    const result = buildServiceFitQualification({
      business: { ...base, phone: undefined }, region: 'MUSCAT_LOCAL', websiteClass: 'NONE', enabledServiceIds: catalog,
    });
    expect(result.shouldContact).toBe(false);
    expect(result.cheapestNextAction).toBe('SKIP');
  });
});
