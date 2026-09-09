import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const heartbeatRoute = readFileSync(resolve(process.cwd(), 'app/api/operations/heartbeat/route.ts'), 'utf8');
const worker = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');

const metricKeys = [
  'evidenceMarket',
  'autoDispatchStatus',
  'autoDispatchFailedOutcomes',
  'autoDispatchAction',
  'autoDispatchReason',
  'dailyAcquisitionStatus',
  'dailyAcquisitionFailedOutcomes',
  'dailyAcquisitionAction',
  'dailyAcquisitionReason',
  'telegramDigestStatus',
  'telegramDigestFailedOutcomes',
] as const;

describe('operations heartbeat multi-market observability', () => {
  it('sanitizes every scheduled metric emitted by the worker', () => {
    for (const key of metricKeys) {
      expect(worker).toContain(key);
      expect(heartbeatRoute).toContain(`${key}?:`);
      expect(heartbeatRoute).toContain(`${key}:`);
    }
  });

  it('keeps numeric statuses bounded and text outcomes bounded', () => {
    expect(heartbeatRoute).toContain('autoDispatchStatus: boundedInteger(raw.autoDispatchStatus)');
    expect(heartbeatRoute).toContain('dailyAcquisitionStatus: boundedInteger(raw.dailyAcquisitionStatus)');
    expect(heartbeatRoute).toContain('telegramDigestStatus: boundedInteger(raw.telegramDigestStatus)');
    expect(heartbeatRoute).toContain('autoDispatchReason: boundedText(raw.autoDispatchReason)');
    expect(heartbeatRoute).toContain('dailyAcquisitionReason: boundedText(raw.dailyAcquisitionReason)');
    expect(heartbeatRoute).toContain('evidenceMarket: boundedText(raw.evidenceMarket, 8)');
  });
});
