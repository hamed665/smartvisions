import { describe, expect, it } from 'vitest';
import { evaluatePilotAcquisitionPolicy } from '@/lib/operations/pilot-acquisition-policy';

const now = new Date('2026-09-05T12:00:00.000Z');
const baseConfig = {
  pilot: true,
  autoAcquisitionEnabled: true,
  shadowOnly: true,
  manualReviewOnly: true,
  outreachEnabled: false,
  maxPaidQualifications: 3,
  stopAfterPriorityLeads: 1,
  autoAcquisitionCooldownMinutes: 10,
  pilotWindowStartedAt: '2026-09-05T11:55:00.000Z',
  pilotWindowEndsAt: '2026-09-05T12:55:00.000Z',
};

const base = {
  status: 'RUNNING',
  countryCode: 'OM',
  config: baseConfig,
  shadowMode: true,
  globalKillSwitch: false,
  agentsPaused: false,
  qualificationCount: 0,
  priorityQualifiedCount: 0,
  now,
};

describe('time-boxed Oman pilot acquisition policy', () => {
  it('allows only an explicit Shadow/manual-review Oman acquisition window', () => {
    const result = evaluatePilotAcquisitionPolicy(base);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ALLOWED');
    expect(result.maxPaidQualifications).toBe(3);
    expect(result.stopAfterPriorityLeads).toBe(1);
  });

  it('fails closed if Shadow Mode is disabled', () => {
    expect(evaluatePilotAcquisitionPolicy({ ...base, shadowMode: false }).reason).toBe('SHADOW_MODE_REQUIRED');
  });

  it('fails closed if provider outreach is enabled on the campaign', () => {
    expect(evaluatePilotAcquisitionPolicy({
      ...base,
      config: { ...baseConfig, outreachEnabled: true },
    }).reason).toBe('OUTREACH_MUST_REMAIN_DISABLED');
  });

  it('rejects every non-Oman campaign', () => {
    expect(evaluatePilotAcquisitionPolicy({ ...base, countryCode: 'AE' }).reason).toBe('OMAN_ONLY');
  });

  it('self-closes when the one-hour window expires', () => {
    const result = evaluatePilotAcquisitionPolicy({ ...base, now: new Date('2026-09-05T12:55:00.000Z') });
    expect(result.allowed).toBe(false);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('PILOT_WINDOW_EXPIRED');
  });

  it('self-closes before another provider cycle when the priority lead target is reached', () => {
    const result = evaluatePilotAcquisitionPolicy({ ...base, qualificationCount: 1, priorityQualifiedCount: 1 });
    expect(result.allowed).toBe(false);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('PRIORITY_LEAD_TARGET_REACHED');
  });

  it('does not confuse a non-priority qualification with the priority lead target', () => {
    const result = evaluatePilotAcquisitionPolicy({ ...base, qualificationCount: 1, priorityQualifiedCount: 0 });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ALLOWED');
  });

  it('ignores a disabled or invalid priority stop target', () => {
    const result = evaluatePilotAcquisitionPolicy({
      ...base,
      config: { ...baseConfig, stopAfterPriorityLeads: 0 },
      qualificationCount: 1,
      priorityQualifiedCount: 1,
    });
    expect(result.allowed).toBe(true);
    expect(result.stopAfterPriorityLeads).toBeNull();
  });

  it('self-closes when the paid qualification cap is reached', () => {
    const result = evaluatePilotAcquisitionPolicy({ ...base, qualificationCount: 3, priorityQualifiedCount: 0 });
    expect(result.allowed).toBe(false);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('QUALIFICATION_CAP_REACHED');
  });

  it('enforces a cooldown between scheduled provider qualification cycles', () => {
    const result = evaluatePilotAcquisitionPolicy({
      ...base,
      config: { ...baseConfig, lastAutoAcquisitionAt: '2026-09-05T11:55:01.000Z' },
    });
    expect(result.allowed).toBe(false);
    expect(result.terminal).toBe(false);
    expect(result.reason).toBe('COOLDOWN');
  });

  it('caps configuration attempts above three paid qualifications and priority leads', () => {
    const result = evaluatePilotAcquisitionPolicy({
      ...base,
      config: { ...baseConfig, maxPaidQualifications: 99, stopAfterPriorityLeads: 99 },
      qualificationCount: 2,
      priorityQualifiedCount: 0,
    });
    expect(result.allowed).toBe(true);
    expect(result.maxPaidQualifications).toBe(3);
    expect(result.stopAfterPriorityLeads).toBe(3);
  });
});
