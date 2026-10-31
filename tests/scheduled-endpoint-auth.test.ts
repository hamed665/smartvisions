import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as automation } from '@/app/api/operations/automation-runtime/route';
import { POST as notifications } from '@/app/api/operations/automation-notifications/route';
import { POST as reporting } from '@/app/api/operations/data-reporting-schedules/route';
import { POST as holds } from '@/app/api/operations/booking-holds/route';

describe('scheduled endpoint authorization after session bypass', () => {
  afterEach(() => vi.unstubAllEnvs());
  for (const handler of [automation, notifications, reporting, holds]) {
    it.each([undefined, 'wrong-key'])('rejects absent or incorrect internal credentials before any work', async key => {
      vi.stubEnv('INTERNAL_API_KEY', 'expected-key');
      const response = await handler(new Request('https://smartvisions.internal/api/operations/test', {
        method: 'POST', headers: key ? { 'x-internal-api-key': key } : {},
      }));
      expect(response.status).toBe(401);
      expect(response.headers.get('location')).toBeNull();
    });
  }
});
