import { describe, expect, it } from 'vitest';
import { dedupeBusinesses } from '../lib/hunters/business/dedupe';
import { classifyIntentText } from '../lib/hunters/intent/classify';
import { scoreIntent } from '../lib/scoring/intent';
import { scoreOpportunity } from '../lib/scoring/opportunity';

describe('business dedupe', () => {
  it('deduplicates matching place ids and domains', () => {
    const items = [
      { sourceType: 'google_places' as const, sourceId: '1', googlePlaceId: 'p1', name: 'Clinic A', countryCode: 'OM', officialWebsite: 'https://www.clinica.com', retrievedAt: new Date().toISOString() },
      { sourceType: 'google_places' as const, sourceId: '2', googlePlaceId: 'p1', name: 'Clinic A duplicate', countryCode: 'OM', officialWebsite: 'https://clinica.com/contact', retrievedAt: new Date().toISOString() },
    ];
    expect(dedupeBusinesses(items)).toHaveLength(1);
  });
});

describe('intent classifier', () => {
  it('detects an English website request', () => {
    const result = classifyIntentText('Looking for a web designer for our clinic website');
    expect(result.isRelevant).toBe(true);
    expect(result.primaryService).toBe('website');
  });

  it('detects an Arabic WhatsApp automation request', () => {
    const result = classifyIntentText('محتاج فريلانسر يسوي أتمتة واتساب للعيادة');
    expect(result.isRelevant).toBe(true);
    expect(result.matchedServices).toContain('whatsapp_ai');
  });
});

describe('intent scoring', () => {
  it('prioritizes a fresh explicit request with budget', () => {
    const detectedAt = '2026-08-20T01:00:00.000Z';
    const result = scoreIntent({
      sourceType: 'public_post',
      body: 'Need a web developer urgently',
      detectedAt,
      postedAt: '2026-08-20T00:30:00.000Z',
      budgetAmount: 800,
      budgetCurrency: 'USD',
      businessIdentifiable: true,
      contactMethodAvailable: true,
      serviceHint: 'website',
    });
    expect(result.score).toBe(100);
    expect(result.priority).toBe('URGENT');
  });
});

describe('business opportunity scoring', () => {
  it('scores a business with no website as an opportunity', () => {
    const result = scoreOpportunity({ hasWebsite: false, activeSocial: true });
    expect(result.score).toBe(35);
    expect(result.reasons).toContain('No website +30');
  });
});
