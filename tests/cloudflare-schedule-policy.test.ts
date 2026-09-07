import { describe, expect, it } from 'vitest';
import { shouldRunScheduledOperations } from '@/worker/schedule-policy';

describe('Cloudflare scheduled environment policy', () => {
  it('allows scheduled preparation whenever the worker is production', () => {
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'production' })).toBe(true);
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: ' production ' })).toBe(true);
  });

  it('blocks candidate, preview, missing and arbitrary environments', () => {
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'candidate' })).toBe(false);
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'preview' })).toBe(false);
    expect(shouldRunScheduledOperations({})).toBe(false);
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'anything-else' })).toBe(false);
  });
});
