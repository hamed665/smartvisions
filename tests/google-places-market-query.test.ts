import { describe, expect, it } from 'vitest';
import { buildGoogleTextSearchRequest } from '../lib/hunters/business/google-places';

describe('Google Places market query builder', () => {
  it('uses a readable country label and region code without another provider call', () => {
    expect(buildGoogleTextSearchRequest({ countryCode: 'AE', city: 'Dubai', industry: 'beauty salon', limit: 3 })).toEqual({
      textQuery: 'beauty salon in Dubai, United Arab Emirates',
      pageSize: 3,
      regionCode: 'AE',
    });
  });

  it('normalizes enabled market country codes', () => {
    const request = buildGoogleTextSearchRequest({ countryCode: 'gb', city: 'London', industry: 'dental clinic', limit: 50 });
    expect(request.textQuery).toContain('United Kingdom');
    expect(request.regionCode).toBe('GB');
    expect(request.pageSize).toBe(20);
  });
});
