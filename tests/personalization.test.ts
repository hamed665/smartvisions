import { describe, expect, it } from 'vitest';
import { buildZeroCostPersonalization } from '../lib/hunters/business/personalization';

const base = {
  sourceType: 'google_places' as const,
  name: 'Example Dental Clinic',
  countryCode: 'OM',
  city: 'Bosher',
  category: 'dental clinic',
  businessStatus: 'OPERATIONAL',
  phone: '91234567',
  internationalPhone: '+968 91234567',
  googleMapsUri: 'https://maps.google.com/example',
  formattedAddress: 'Bosher, Muscat, Oman',
  retrievedAt: new Date().toISOString(),
};

describe('zero-cost personalization', () => {
  it('makes an operational Muscat dental clinic contact-ready without paid evidence', () => {
    const result = buildZeroCostPersonalization(base, 'MUSCAT_LOCAL', 'NONE');
    expect(result.segment).toBe('DENTAL');
    expect(result.personalizationPriorityScore).toBeGreaterThanOrEqual(65);
    expect(result.cheapestNextAction).toBe('CONTACT_READY');
    expect(result.nextActionCanSpendMoney).toBe(false);
    expect(result.offerBundle).toContain('WEBSITE');
    expect(result.offerBundle).toContain('ON_SITE_CONTENT');
    expect(result.providerCalls).toBe(0);
    expect(result.llmCalls).toBe(0);
  });

  it('does not make an ordinary Oman restaurant contact-ready from website absence alone', () => {
    const result = buildZeroCostPersonalization({
      ...base,
      name: 'Neighbourhood Cafe',
      category: 'restaurant cafe',
      userRatingCount: 35,
      rating: 4.3,
    }, 'MUSCAT_LOCAL', 'NONE');
    expect(result.segment).toBe('RESTAURANT');
    expect(result.cheapestNextAction).toBe('SKIP');
    expect(result.offerBundle).not.toContain('WEBSITE');
  });

  it('allows premium restaurant scale to make website evidence commercially relevant', () => {
    const result = buildZeroCostPersonalization({
      ...base,
      name: 'Premium Dining',
      category: 'restaurant',
      priceLevel: 'PRICE_LEVEL_EXPENSIVE',
      userRatingCount: 140,
      rating: 4.6,
    }, 'MUSCAT_LOCAL', 'NONE');
    expect(result.cheapestNextAction).toBe('CONTACT_READY');
    expect(result.offerBundle).toContain('WEBSITE');
  });

  it('routes a strong standalone-site lead with known Instagram to controlled social evidence', () => {
    const result = buildZeroCostPersonalization({ ...base, countryCode: 'AE', city: 'Dubai', officialWebsite: 'https://example.ae', instagram: 'https://instagram.com/example' }, 'INTERNATIONAL_REMOTE', 'STANDALONE');
    expect(result.socialCheckEligible).toBe(true);
    expect(result.cheapestNextAction).toBe('SOCIAL_CHECK');
    expect(result.nextActionCanSpendMoney).toBe(true);
    expect(result.offerBundle).toContain('AI_CONTENT');
  });

  it('prefers free deterministic website evidence when a site exists but social is unknown', () => {
    const result = buildZeroCostPersonalization({ ...base, officialWebsite: 'https://example.om' }, 'MUSCAT_LOCAL', 'STANDALONE');
    expect(result.cheapestNextAction).toBe('WEBSITE_EVIDENCE');
    expect(result.nextActionCanSpendMoney).toBe(false);
  });

  it('does not spend on a non-operational business', () => {
    const result = buildZeroCostPersonalization({ ...base, businessStatus: 'CLOSED_PERMANENTLY' }, 'MUSCAT_LOCAL', 'NONE');
    expect(result.personalizationPriorityScore).toBe(0);
    expect(result.cheapestNextAction).toBe('SKIP');
    expect(result.nextActionCanSpendMoney).toBe(false);
  });
});
