import { describe, expect, it } from 'vitest';
import { buildGrowthOpportunity, classifyServiceRegion } from '../lib/hunters/business/growth-routing';

const base = {
  sourceType: 'google_places' as const,
  name: 'Example Business',
  countryCode: 'OM',
  city: 'Muscat',
  businessStatus: 'OPERATIONAL',
  phone: '91234567',
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
  });

  it('routes outside Muscat Oman businesses to remote AI content', () => {
    const result = buildGrowthOpportunity({ ...base, city: 'Sohar', officialWebsite: 'https://example.om' });
    expect(result.region).toBe('OMAN_REMOTE');
    expect(result.lane).toBe('OMAN_REMOTE_GROWTH');
    expect(result.aiContentScore).toBeGreaterThanOrEqual(50);
    expect(result.recommendedServices).toContain('AI_CONTENT');
  });

  it('routes international businesses to international AI growth', () => {
    expect(classifyServiceRegion('AE', 'Dubai')).toBe('INTERNATIONAL_REMOTE');
    const result = buildGrowthOpportunity({ ...base, countryCode: 'AE', city: 'Dubai', officialWebsite: 'https://example.ae' });
    expect(result.lane).toBe('INTERNATIONAL_AI_GROWTH');
    expect(result.recommendedServices).toContain('AI_REELS');
  });

  it('does not promote non-operational businesses into content checks', () => {
    const result = buildGrowthOpportunity({ ...base, businessStatus: 'CLOSED_PERMANENTLY' });
    expect(result.overallSalesScore).toBe(0);
    expect(result.contentCheckStatus).toBe('NOT_ELIGIBLE');
  });
});
