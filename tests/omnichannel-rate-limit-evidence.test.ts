import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractProviderRateLimitEvidence,
  ProviderHttpError,
  rateLimitEvidenceFromError,
  recordProviderRateLimitEvidence,
} from '@/lib/omnichannel/rate-limit-evidence';

describe('OMNI-CHANNEL-HEALTH provider quota evidence', () => {
  it('normalizes Resend-style rate-limit headers without preserving raw headers', () => {
    const headers = new Headers({
      'ratelimit-limit': '10',
      'ratelimit-remaining': '2',
      'ratelimit-reset': '1',
      'retry-after': '3',
      'x-secret-debug': 'must-not-survive',
    });
    const evidence = extractProviderRateLimitEvidence(headers, '2026-09-27T15:00:00.000Z');
    expect(evidence).toMatchObject({
      observedAt: '2026-09-27T15:00:00.000Z',
      limit: 10,
      remaining: 2,
      resetSeconds: 1,
      retryAfterSeconds: 3,
    });
    expect(JSON.stringify(evidence)).not.toContain('x-secret-debug');
    expect(JSON.stringify(evidence)).not.toContain('must-not-survive');
  });

  it('summarizes Meta usage headers without copying account/business identifiers', () => {
    const headers = new Headers({
      'x-app-usage': JSON.stringify({
        call_count: 91,
        total_cputime: 40,
        total_time: 32,
      }),
      'x-business-use-case-usage': JSON.stringify({
        '123456789': [{
          type: 'messaging',
          call_count: 73,
          total_cputime: 44,
          total_time: 51,
          estimated_time_to_regain_access: 12,
        }],
      }),
    });
    const evidence = extractProviderRateLimitEvidence(headers);
    expect(evidence?.appUsage?.callCountPct).toBe(91);
    expect(evidence?.businessUsage).toMatchObject({
      present: true,
      maxCallCountPct: 73,
      maxTotalCpuTimePct: 44,
      maxTotalTimePct: 51,
      maxEstimatedRegainSeconds: 12,
    });
    expect(JSON.stringify(evidence)).not.toContain('123456789');
    expect(JSON.stringify(evidence)).not.toContain('messaging');
  });

  it('ignores malformed or oversized provider JSON rather than persisting it', () => {
    const headers = new Headers({
      'x-app-usage': '{not-json',
      'x-business-use-case-usage': 'x'.repeat(32_001),
    });
    expect(extractProviderRateLimitEvidence(headers)).toBeNull();
  });

  it('retains only bounded quota evidence on provider HTTP failures', () => {
    const evidence = extractProviderRateLimitEvidence(new Headers({
      'ratelimit-limit': '10',
      'ratelimit-remaining': '0',
      'retry-after': '2',
      'authorization': 'Bearer must-not-survive',
    }));
    const error = new ProviderHttpError('provider rejected request', 429, evidence);
    expect(error.status).toBe(429);
    expect(rateLimitEvidenceFromError(error)).toMatchObject({
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 2,
    });
    expect(JSON.stringify(rateLimitEvidenceFromError(error))).not.toContain('Bearer');
    expect(rateLimitEvidenceFromError(new Error('ordinary'))).toBeNull();
  });

  it('never turns telemetry persistence failure into a provider-send exception', async () => {
    const service = {
      from() {
        return {
          async insert() {
            throw new Error('audit unavailable');
          },
        };
      },
    };
    await expect(recordProviderRateLimitEvidence({
      service: service as never,
      organizationId: '00000000-0000-0000-0000-000000000001',
      provider: 'RESEND',
      channel: 'EMAIL',
      evidence: {
        observedAt: '2026-09-27T15:00:00.000Z',
        limit: 10,
        remaining: 9,
        resetSeconds: 1,
        retryAfterSeconds: null,
        appUsage: null,
        businessUsage: null,
      },
    })).resolves.toMatchObject({
      recorded: false,
      reason: 'AUDIT_PERSISTENCE_FAILED',
    });
  });

  it('wires provider boundaries and health aggregation to bounded audit evidence', () => {
    const emailProvider = readFileSync('lib/outreach/resend-provider.ts', 'utf8');
    const whatsappProvider = readFileSync('lib/whatsapp/meta-cloud.ts', 'utf8');
    const instagramProvider = readFileSync('lib/instagram/provider.ts', 'utf8');
    const messengerProvider = readFileSync('lib/facebook-messenger/provider.ts', 'utf8');
    const emailRoute = readFileSync('app/api/email/send/route.ts', 'utf8');
    const whatsappRoute = readFileSync('app/api/whatsapp/send/route.ts', 'utf8');
    const approvedRoute = readFileSync('app/api/outreach/approved-send/route-core.ts', 'utf8');
    const health = readFileSync('lib/omnichannel/health.ts', 'utf8');

    for (const source of [emailProvider, whatsappProvider, instagramProvider, messengerProvider]) {
      expect(source).toContain('extractProviderRateLimitEvidence(response.headers)');
    }
    expect(emailRoute).toContain('recordProviderRateLimitEvidence');
    expect(whatsappRoute).toContain('recordProviderRateLimitEvidence');
    expect(approvedRoute).toContain('recordProviderRateLimitEvidence');
    expect(approvedRoute).toContain('rateLimitEvidenceFromError');
    expect(health).toContain("CHANNEL_PROVIDER_RATE_LIMIT_OBSERVED");
    expect(health).toContain("'RATE_LIMITED'");
    expect(health).toContain("'NEAR_LIMIT'");
    expect(health).toContain("'EVIDENCE_PRESENT'");
  });
});
