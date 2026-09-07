import { describe, expect, it } from 'vitest';
import { isInsideMuscatAgentWindow, shouldRunScheduledOperations } from '@/worker/schedule-policy';

function atMuscat(isoLocal: string) {
  return new Date(`${isoLocal}+04:00`).getTime();
}

describe('Cloudflare scheduled environment policy', () => {
  it('allows scheduled operations only in production and inside 09:00-19:00 Muscat', () => {
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'production' }, atMuscat('2026-09-08T09:00:00'))).toBe(true);
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: ' production ' }, atMuscat('2026-09-08T18:59:59'))).toBe(true);
  });

  it('uses an exact start-inclusive and end-exclusive Muscat window', () => {
    expect(isInsideMuscatAgentWindow(atMuscat('2026-09-08T08:59:59'))).toBe(false);
    expect(isInsideMuscatAgentWindow(atMuscat('2026-09-08T09:00:00'))).toBe(true);
    expect(isInsideMuscatAgentWindow(atMuscat('2026-09-08T18:59:59'))).toBe(true);
    expect(isInsideMuscatAgentWindow(atMuscat('2026-09-08T19:00:00'))).toBe(false);
  });

  it('blocks non-production environments even during business hours', () => {
    const inside = atMuscat('2026-09-08T12:00:00');
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'candidate' }, inside)).toBe(false);
    expect(shouldRunScheduledOperations({ DEPLOYMENT_ENV: 'preview' }, inside)).toBe(false);
    expect(shouldRunScheduledOperations({}, inside)).toBe(false);
  });
});
