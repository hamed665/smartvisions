import { describe, expect, it } from 'vitest';
import { shouldRunScheduledOperations } from '@/worker/schedule-policy';

describe('Cloudflare scheduled environment policy', () => {
  it('allows scheduled operations only in production', () => {
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'production' })).toBe(true);
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: ' production ' })).toBe(true);
  });

  it('blocks candidate, missing, and arbitrary environments', () => {
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'candidate' })).toBe(false);
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'preview' })).toBe(false);
    expect(shouldRunScheduledOperations({})).toBe(false);
  });
});
