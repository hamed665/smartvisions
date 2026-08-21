import { describe, expect, it } from 'vitest';
import {
  assertValidGooglePlaceId,
  buildBusinessPersistenceRow,
  buildLeadPersistenceRow,
} from '../lib/hunters/business/selective-enrichment';

describe('Google Places selective enrichment', () => {
  it('accepts a normal Google Place ID and rejects unsafe input', () => {
    const placeId = 'ChIJqyODAAz_kT4RJXFFgOt5rrw';
    expect(assertValidGooglePlaceId(placeId)).toBe(placeId);
    expect(() => assertValidGooglePlaceId('bad id / ?')).toThrow(/Invalid Google Place ID/);
  });

  it('maps Place Details into the existing businesses schema with normalized domain', () => {
    const row = buildBusinessPersistenceRow('org-1', {
      sourceType: 'google_places',
      sourceId: 'place-1',
      googlePlaceId: 'place-1',
      name: 'Example Dental',
      countryCode: 'OM',
      city: 'Muscat',
      category: 'dentist',
      officialWebsite: 'https://www.example.com/clinic',
      phone: '2455 0000',
      retrievedAt: new Date().toISOString(),
    });

    expect(row.organization_id).toBe('org-1');
    expect(row.google_place_id).toBe('place-1');
    expect(row.dedupe_domain).toBe('example.com');
    expect(row.official_website).toBe('https://www.example.com/clinic');
  });

  it('creates a conservative NEW/AUTO lead with qualification still pending', () => {
    const row = buildLeadPersistenceRow('org-1', 'business-1');
    expect(row.status).toBe('NEW');
    expect(row.agent_mode).toBe('AUTO');
    expect(row.opportunity_score).toBe(0);
    expect(row.score_reasons.join(' ')).toMatch(/qualification pending/i);
  });
});
