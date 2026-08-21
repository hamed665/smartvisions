import { describe, expect, it } from 'vitest';
import {
  assertValidGooglePlaceId,
  buildBusinessPersistenceRow,
  buildLeadPersistenceRow,
  calculateNoWebsiteOpportunityScore,
  isPriorityNoWebsiteBusiness,
} from '../lib/hunters/business/selective-enrichment';

const priorityBusiness = {
  sourceType: 'google_places' as const,
  sourceId: 'place-1',
  googlePlaceId: 'place-1',
  name: 'Example Dental',
  countryCode: 'OM',
  city: 'Muscat',
  category: 'dentist',
  businessStatus: 'OPERATIONAL',
  phone: '2455 0000',
  rating: 4.6,
  userRatingCount: 120,
  retrievedAt: new Date().toISOString(),
};

describe('Google Places selective enrichment', () => {
  it('accepts a normal Google Place ID and rejects unsafe input', () => {
    const placeId = 'ChIJqyODAAz_kT4RJXFFgOt5rrw';
    expect(assertValidGooglePlaceId(placeId)).toBe(placeId);
    expect(() => assertValidGooglePlaceId('bad id / ?')).toThrow(/Invalid Google Place ID/);
  });

  it('maps Place Details into the businesses schema with normalized domain', () => {
    const row = buildBusinessPersistenceRow('org-1', {
      ...priorityBusiness,
      officialWebsite: 'https://www.example.com/clinic',
    });
    expect(row.organization_id).toBe('org-1');
    expect(row.google_place_id).toBe('place-1');
    expect(row.dedupe_domain).toBe('example.com');
    expect(row.official_website).toBe('https://www.example.com/clinic');
  });

  it('qualifies only operational businesses without an official website', () => {
    expect(isPriorityNoWebsiteBusiness(priorityBusiness)).toBe(true);
    expect(isPriorityNoWebsiteBusiness({ ...priorityBusiness, officialWebsite: 'https://example.com' })).toBe(false);
    expect(isPriorityNoWebsiteBusiness({ ...priorityBusiness, businessStatus: 'CLOSED_TEMPORARILY' })).toBe(false);
  });

  it('creates a high-priority NEW/AUTO lead for an operational no-website business', () => {
    const scored = calculateNoWebsiteOpportunityScore(priorityBusiness);
    const row = buildLeadPersistenceRow('org-1', 'business-1', priorityBusiness);
    expect(scored.score).toBe(100);
    expect(row.status).toBe('NEW');
    expect(row.agent_mode).toBe('AUTO');
    expect(row.opportunity_score).toBe(100);
    expect(row.score_reasons.join(' ')).toMatch(/no official website/i);
    expect(row.score_reasons.join(' ')).toMatch(/operational/i);
  });
});
