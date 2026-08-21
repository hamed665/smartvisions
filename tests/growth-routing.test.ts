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
  retrievedAt: new Date().toISOString(),
};

describe('growth opportunity routing', () => {
  it('routes Muscat no-website businesses to local growth with website + on-site content', () => {
    const result = buildGrowthOpportunity({ ...base });
    expect(result.region).toBe('MUSCAT_LOCAL');
    expect(result.lane).toBe('MUSCAT_LOCAL_GROWTH');
    expect(result.websiteScore).toBeGreaterThanOrEqual(95);
    expect(result.localContentScore).toBeGreaterThanOrEqual(50);
    expect(result.recommendedServices).toContain('WEBSITE');
    expect(result.recommendedServices).toContain('ON_SITE_CONTENT');
    expect(result.contentCheckStatus).toBe('PENDING_SOCIAL_CHECK');
    expect(result.personalization.segment).toBe('DENTAL');
    expect(result.personalization.offerBundle).toEqual(expect.arrayContaining(['WEBSITE','ON_SITE_CONTENT','REELS']));
    expect(result.personalization.contactabilityScore).toBeGreaterThanOrEqual(70);
    expect(result.personalization.providerCalls).toBe(0);
    expect(result.personalization.llmCalls).toBe(0);
    expect(result.personalization.estimatedApiCostUsd).toBe(0);
  });

  it('routes outside Muscat Oman businesses to remote AI content', () => {
    const result = buildGrowthOpportunity({ ...base, city: 'Sohar', officialWebsite: 'https://example.om' });
    expect(result.region).toBe('OMAN_REMOTE');
    expect(result.lane).toBe('OMAN_REMOTE_GROWTH');
    expect(result.aiContentScore).toBeGreaterThanOrEqual(50);
    expect(result.recommendedServices).toContain('AI_CONTENT');
    expect(result.personalization.offerBundle).toContain('AI_CONTENT');
    expect(result.personalization.offerBundle).not.toContain('ON_SITE_CONTENT');
  });

  it('routes international businesses to international AI growth without extra personalization calls', () => {
    expect(classifyServiceRegion('AE', 'Dubai')).toBe('INTERNATIONAL_REMOTE');
    const result = buildGrowthOpportunity({ ...base, countryCode: 'AE', city: 'Dubai', officialWebsite: 'https://example.ae' });
    expect(result.lane).toBe('INTERNATIONAL_AI_GROWTH');
    expect(result.recommendedServices).toContain('AI_REELS');
    expect(result.personalization.market).toBe('UAE');
    expect(result.personalization.fingerprint).toContain('INTERNATIONAL_REMOTE');
    expect(result.personalization.estimatedApiCostUsd).toBe(0);
  });

  it('does not spend a social check on an operational business with no contact path', () => {
    const result = buildGrowthOpportunity({ ...base, phone: undefined, googleMapsUri: undefined, formattedAddress: undefined });
    expect(result.personalization.contactabilityScore).toBe(0);
    expect(result.personalization.socialCheckEligible).toBe(false);
    expect(result.contentCheckStatus).toBe('READY_FOR_REVIEW');
  });

  it('does not promote non-operational businesses into content checks', () => {
    const result = buildGrowthOpportunity({ ...base, businessStatus: 'CLOSED_PERMANENTLY' });
    expect(result.overallSalesScore).toBe(0);
    expect(result.contentCheckStatus).toBe('NOT_ELIGIBLE');
    expect(result.personalization.needScore).toBe(0);
  });
});
