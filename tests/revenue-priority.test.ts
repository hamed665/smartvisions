import { describe, expect, it } from 'vitest';
import {
  buildPriorityScore,
  classifyCompanySize,
  recommendAcquisitionRoute,
} from '../lib/hunters/business/revenue-priority';
import { buildGrowthOpportunity } from '../lib/hunters/business/growth-routing';

const business = {
  sourceType: 'google_places' as const,
  name: 'Example Salon',
  category: 'salon',
  countryCode: 'OM',
  city: 'Muscat',
  businessStatus: 'OPERATIONAL',
  phone: '91234567',
  instagram: 'https://instagram.com/example',
  rating: 4.6,
  userRatingCount: 80,
  retrievedAt: '2026-09-10T00:00:00.000Z',
};

const services = new Set([
  'business_website',
  'premium_bilingual_website',
  'custom_website',
  'custom_content_production',
  'ai_reels_4',
  'whatsapp_ai_setup',
  'seo_growth',
]);

describe('revenue acquisition priority', () => {
  it('uses the requested deterministic 35/25/25/15 weighting', () => {
    expect(buildPriorityScore({
      fitScore: 100,
      contactabilityScore: 80,
      revenuePotentialScore: 60,
      urgencyScore: 40,
    })).toBe(76);
  });

  it('classifies company size conservatively from available public scale signals', () => {
    expect(classifyCompanySize({ ...business, userRatingCount: 10 }).companySize).toBe('MICRO');
    expect(classifyCompanySize({ ...business, userRatingCount: 80 }).companySize).toBe('SMALL');
    expect(classifyCompanySize({ ...business, userRatingCount: 350 }).companySize).toBe('MEDIUM');
    expect(classifyCompanySize({ ...business, name: 'Example Hospital Group', category: 'hospital', userRatingCount: 700 }).companySize).toBe('ENTERPRISE');
  });

  it('routes GCC SMEs to human-assisted IG/WhatsApp acquisition rather than cold WhatsApp API', () => {
    expect(recommendAcquisitionRoute({ business, companySize: 'SMALL' })).toMatchObject({
      route: 'GCC_HUMAN_IG_WA',
    });
  });

  it('routes GCC enterprise accounts hybrid when email and human social paths both exist', () => {
    expect(recommendAcquisitionRoute({
      business: { ...business, email: 'info@example.om' },
      companySize: 'ENTERPRISE',
    })).toMatchObject({ route: 'HYBRID_EMAIL_HUMAN_GCC' });
  });

  it('keeps US acquisition email-first', () => {
    expect(recommendAcquisitionRoute({
      business: { ...business, countryCode: 'US', city: 'New York', email: 'info@example.com', phone: undefined, instagram: undefined },
      companySize: 'SMALL',
    })).toMatchObject({ route: 'EMAIL' });
  });

  it('marks physical content production as do-not-offer outside Muscat', () => {
    const result = buildGrowthOpportunity(
      {
        ...business,
        countryCode: 'AE',
        city: 'Dubai',
        officialWebsite: 'https://example.ae',
      },
      {
        enabledServiceIds: services,
        websiteAudit: { seoQuality: 'GOOD', mobileQuality: 'GOOD', ctaQuality: 'GOOD', hasArabic: true, hasBooking: true },
        socialAssessment: { status: 'VERIFIED', quality: 'WEAK', source: 'OWNER_REVIEW', reasons: ['inconsistent posting'] },
      },
    );
    expect(result.revenuePriority.doNotOfferServiceIds).toContain('custom_content_production');
    expect(result.qualification.primaryServiceId).toBe('ai_reels_4');
  });

  it('forces non-operational businesses to zero revenue priority and no acquisition route', () => {
    const result = buildGrowthOpportunity(
      { ...business, businessStatus: 'CLOSED_PERMANENTLY' },
      { enabledServiceIds: services },
    );
    expect(result.revenuePriority.priorityScore).toBe(0);
    expect(result.revenuePriority.recommendedAcquisitionRoute).toBe('NONE');
  });
});
