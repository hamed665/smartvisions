import { describe, expect, it } from 'vitest';
import { shadowProviderMessageId } from '@/lib/outreach/shadow-approval';

describe('shadow approval queue', () => {
  it('maps an idempotency key to a stable provider message id', () => {
    expect(shadowProviderMessageId('lead-1:first-touch')).toBe('shadow:lead-1:first-touch');
    expect(shadowProviderMessageId(' lead-1:first-touch ')).toBe('shadow:lead-1:first-touch');
  });

  it('rejects an empty idempotency key', () => {
    expect(() => shadowProviderMessageId('   ')).toThrow('idempotencyKey is required');
  });
});
