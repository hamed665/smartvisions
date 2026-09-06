import { describe, expect, it } from 'vitest';
import {
  effectiveCampaignStatus,
  integrationFreshness,
  runtimeEvidenceSummary,
  runtimeFreshness,
} from '@/lib/reliability/operational-truth';

describe('operational truth', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');

  it('marks a fresh checked connected integration healthy', () => {
    expect(integrationFreshness({
      status: 'CONNECTED', enabled: true, credentialPresent: true,
      lastCheckedAt: '2026-09-06T23:30:00.000Z', now,
    })).toBe('HEALTHY');
  });

  it('does not equate CONNECTED with a fresh health check', () => {
    expect(integrationFreshness({
      status: 'CONNECTED', enabled: true, credentialPresent: true,
      lastCheckedAt: '2026-08-30T00:00:00.000Z', now,
    })).toBe('STALE');
  });

  it('marks never-checked integration separately', () => {
    expect(integrationFreshness({ status: 'CONNECTED', enabled: true, credentialPresent: true, now })).toBe('NOT_CHECKED');
  });

  it('surfaces a recorded integration error', () => {
    expect(integrationFreshness({
      status: 'CONNECTED', enabled: true, credentialPresent: true,
      lastCheckedAt: '2026-09-06T23:55:00.000Z', lastError: 'verification failed', now,
    })).toBe('ERROR');
  });

  it('treats cap-reached RUNNING campaign as operationally paused', () => {
    expect(effectiveCampaignStatus({
      status: 'RUNNING',
      config: { pausedReason: 'QUALIFICATION_CAP_REACHED', pilotPhase: 'AUTO_ACQUISITION_COMPLETE' },
    })).toEqual({ status: 'PAUSED', reason: 'QUALIFICATION_CAP_REACHED' });
  });

  it('leaves a genuinely running campaign running', () => {
    expect(effectiveCampaignStatus({ status: 'RUNNING', config: { autoAcquisitionEnabled: false } }))
      .toEqual({ status: 'RUNNING', reason: null });
  });

  it('marks a recent sampled heartbeat healthy', () => {
    expect(runtimeFreshness({ createdAt: '2026-09-06T23:50:00.000Z', now })).toBe('HEALTHY');
  });

  it('marks a delayed sampled heartbeat stale', () => {
    expect(runtimeFreshness({ createdAt: '2026-09-06T23:20:00.000Z', now })).toBe('STALE');
  });

  it('summarizes version and evidence fields without trusting arbitrary nested values', () => {
    expect(runtimeEvidenceSummary({
      source: 'CLOUDFLARE_CRON', cron: '*/2 * * * *', sampleMinutes: 10,
      workerVersion: { id: 'v-123', tag: 'prod', timestamp: '2026-09-06T23:49:00Z' },
      metrics: { failed: 0, throttled: 1, evidenceAction: 'READY', evidenceReason: 'OK' },
    })).toMatchObject({
      source: 'CLOUDFLARE_CRON', cron: '*/2 * * * *', sampleMinutes: 10,
      workerVersionId: 'v-123', workerVersionTag: 'prod', failed: 0, throttled: 1,
      evidenceAction: 'READY', evidenceReason: 'OK',
    });
  });
});
