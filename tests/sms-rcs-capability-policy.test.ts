import { describe, expect, it } from 'vitest';
import {
  evaluateSmsRcsRoute,
  type SmsRcsCapabilityEvidence,
} from '@/lib/sms-rcs/capability-policy';

const now = new Date('2026-09-28T00:00:00.000Z');

function capability(
  channel: 'SMS' | 'RCS',
  overrides: Partial<SmsRcsCapabilityEvidence> = {},
): SmsRcsCapabilityEvidence {
  return {
    provider: 'EXAMPLE_PROVIDER',
    countryCode: 'OM',
    channel,
    outboundText: true,
    inboundText: false,
    deliveryReceipts: true,
    readReceipts: channel === 'RCS',
    media: channel === 'RCS',
    senderRegistration: 'REQUIRED',
    automaticFallbackChannel: null,
    verifiedAt: '2026-09-27T00:00:00.000Z',
    evidenceSource: 'official-provider-contract',
    ...overrides,
  };
}

function baseInput() {
  return {
    provider: 'EXAMPLE_PROVIDER',
    providerConnected: true,
    requestedChannel: 'SMS' as const,
    recipientCountryCode: 'OM',
    permissionState: 'VERIFIED_ALLOWED' as const,
    suppressed: false,
    pricingEvidence: 'CONSERVATIVE' as const,
    senderReady: true,
    capabilities: [capability('SMS')],
    maxEvidenceAgeMs: 7 * 24 * 60 * 60 * 1000,
    now,
  };
}

describe('SMS/RCS provider-neutral routing policy', () => {
  it('fails closed without canonical permission evidence', () => {
    const result = evaluateSmsRcsRoute({
      ...baseInput(),
      permissionState: 'UNKNOWN',
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain('PERMISSION_EVIDENCE_REQUIRED');
  });

  it('fails closed for suppression and unknown pricing evidence', () => {
    const result = evaluateSmsRcsRoute({
      ...baseInput(),
      suppressed: true,
      pricingEvidence: 'UNKNOWN',
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'SUPPRESSED',
      'PRICING_EVIDENCE_REQUIRED',
    ]));
  });

  it('requires exact country and channel capability evidence', () => {
    const result = evaluateSmsRcsRoute({
      ...baseInput(),
      recipientCountryCode: 'AE',
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain('CAPABILITY_EVIDENCE_MISSING');
  });

  it('rejects stale or unsupported provider capability evidence', () => {
    const stale = evaluateSmsRcsRoute({
      ...baseInput(),
      capabilities: [capability('SMS', { verifiedAt: '2026-08-01T00:00:00.000Z' })],
    });
    expect(stale.allowed).toBe(false);
    expect(stale.blockers).toContain('CAPABILITY_EVIDENCE_STALE');

    const unsupported = evaluateSmsRcsRoute({
      ...baseInput(),
      capabilities: [capability('SMS', { outboundText: false })],
    });
    expect(unsupported.allowed).toBe(false);
    expect(unsupported.blockers).toContain('OUTBOUND_TEXT_UNSUPPORTED');
  });

  it('requires sender-registration evidence and readiness when provider says it is required', () => {
    const unknown = evaluateSmsRcsRoute({
      ...baseInput(),
      capabilities: [capability('SMS', { senderRegistration: 'UNKNOWN' })],
    });
    expect(unknown.allowed).toBe(false);
    expect(unknown.blockers).toContain('SENDER_REGISTRATION_EVIDENCE_REQUIRED');

    const notReady = evaluateSmsRcsRoute({
      ...baseInput(),
      senderReady: false,
    });
    expect(notReady.allowed).toBe(false);
    expect(notReady.blockers).toContain('SENDER_REGISTRATION_REQUIRED');
  });

  it('allows an exact evidence-backed SMS route without inventing fallback', () => {
    const result = evaluateSmsRcsRoute(baseInput());
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.route).toMatchObject({
      provider: 'EXAMPLE_PROVIDER',
      countryCode: 'OM',
      primaryChannel: 'SMS',
      fallbackChannel: null,
      pricingEvidence: 'CONSERVATIVE',
    });
  });

  it('uses RCS to SMS fallback only when provider evidence explicitly supports it', () => {
    const rcs = capability('RCS', { automaticFallbackChannel: 'SMS' });
    const sms = capability('SMS');
    const result = evaluateSmsRcsRoute({
      ...baseInput(),
      requestedChannel: 'RCS',
      capabilities: [rcs, sms],
    });
    expect(result.allowed).toBe(true);
    expect(result.route?.fallbackChannel).toBe('SMS');

    const noSmsEvidence = evaluateSmsRcsRoute({
      ...baseInput(),
      requestedChannel: 'RCS',
      capabilities: [rcs],
    });
    expect(noSmsEvidence.allowed).toBe(true);
    expect(noSmsEvidence.route?.fallbackChannel).toBeNull();
  });
});
