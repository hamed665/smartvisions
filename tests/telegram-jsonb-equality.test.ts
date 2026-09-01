import { describe, expect, it } from 'vitest';
import { jsonValueEqual } from '@/lib/telegram/json-value-equality';
import { normalizePersistedPreview } from '@/lib/telegram/persisted-preview';

describe('Telegram persisted preview equality', () => {
  it('treats JSON objects as equal regardless of key order, including nested values', () => {
    expect(jsonValueEqual(
      { countryCode: 'OM', field: 'tone', value: { preset: 'formal', strength: 1 } },
      { field: 'tone', value: { strength: 1, preset: 'formal' }, countryCode: 'OM' },
    )).toBe(true);
    expect(jsonValueEqual({ countryCode: 'OM', value: 'formal' }, { countryCode: 'OM', value: 'friendly' })).toBe(false);
  });

  it('restores runtime field order after Postgres JSONB reorders a market-style preview', () => {
    const preview = normalizePersistedPreview(
      { type: 'SET_MARKET_STYLE', countryCode: 'OM', field: 'tone', value: 'formal_professional' },
      {
        title: 'Market style',
        text: 'preview',
        before: { field: 'tone', value: 'friendly_professional', countryCode: 'OM' },
        after: { field: 'tone', value: 'formal_professional', countryCode: 'OM' },
        requiresConfirmation: true,
      },
    );

    expect(JSON.stringify(preview.before)).toBe(JSON.stringify({
      countryCode: 'OM',
      field: 'tone',
      value: 'friendly_professional',
    }));
  });

  it('normalizes legacy command preview shapes used by the stale-write guards', () => {
    const preview = normalizePersistedPreview(
      { type: 'SET_PRICE', countryCode: 'OM', serviceQuery: 'business_website', price: 179 },
      {
        title: 'Price',
        text: 'preview',
        before: { price: 179, currency: 'OMR', serviceId: 'business_website', minimumPrice: null, countryCode: 'OM' },
        after: null,
        requiresConfirmation: true,
      },
    );

    expect(JSON.stringify(preview.before)).toBe(JSON.stringify({
      serviceId: 'business_website',
      countryCode: 'OM',
      currency: 'OMR',
      price: 179,
      minimumPrice: null,
    }));
  });
});
