import { describe, expect, it } from 'vitest';
import { isShadowDuplicateError, shadowProviderMessageId } from '@/lib/outreach/shadow-approval';

describe('shadow approval queue', () => {
  it('maps an idempotency key to a stable provider message id', () => {
    expect(shadowProviderMessageId('lead-1:first-touch')).toBe('shadow:lead-1:first-touch');
    expect(shadowProviderMessageId(' lead-1:first-touch ')).toBe('shadow:lead-1:first-touch');
  });

  it('rejects an empty idempotency key', () => {
    expect(() => shadowProviderMessageId('   ')).toThrow('idempotencyKey is required');
  });

  it('treats only unique-violation errors as an idempotent duplicate', () => {
    expect(isShadowDuplicateError('23505')).toBe(true);
    expect(isShadowDuplicateError('42P10')).toBe(false);
    expect(isShadowDuplicateError(undefined)).toBe(false);
  });
});
