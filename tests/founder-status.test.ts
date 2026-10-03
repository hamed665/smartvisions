import { describe, expect, it } from 'vitest';

import { buildFounderStatusV1 } from '@/lib/founder/status';

const base = {
  nowIso: '2026-10-03T10:00:00.000Z',
  controls: {
    globalKillSwitch: false,
    agentsPaused: false,
    shadowMode: true,
    updatedAt: '2026-10-03T09:59:00.000Z',
  },
  costGuard: {
    monthlyBudgetUsd: 25,
    updatedAt: '2026-10-03T09:00:00.000Z',
  },
  counts: {
    leads: 19,
    qualifiedLeads: 4,
    wonLeads: 0,
    conversations: 12,
    tasks: 5,
    activeBookings: 0,
    quotes: 0,
    orders: 0,
    invoices: 0,
    paymentTransactions: 0,
    activeKnowledgeVersions: 2,
    activeMemoryItems: 0,
    pendingMemoryItems: 0,
    agentRuns30d: 20,
    failedAgentRuns30d: 1,
  },
  monthSpendUsd: 0.22,
  integrations: [
    { enabled: true, status: 'CONNECTED', lastCheckedAt: '2026-10-03T09:58:00.000Z' },
    { enabled: true, status: 'ERROR', lastCheckedAt: '2026-10-03T09:57:00.000Z' },
  ],
  toolActions: [
    { availability: 'AVAILABLE', metadata: { executionSurfaces: ['AI'] } },
    { availability: 'AVAILABLE', metadata: { executionSurfaces: ['AUTOMATION'] } },
    { availability: 'DEPENDENCY_PENDING', metadata: { executionSurfaces: ['AI'] } },
  ],
};

describe('Founder OS V1 status', () => {
  it('is read-only and composes current canonical evidence without inventing traction', () => {
    const status = buildFounderStatusV1(base);
    expect(status.mode).toBe('READ_ONLY');
    expect(status.operatingMode).toBe('SHADOW');
    expect(status.product.aiRegisteredActions).toBe(1);
    expect(status.sales.wonLeads).toBe(0);
    expect(status.sales.paymentTransactions).toBe(0);
    expect(status.finance.budgetUtilizationPct).toBe(0.88);
    expect(status.attention.some((item) => item.key === 'qualified-no-wins')).toBe(true);
    expect(status.attention.some((item) => item.key === 'shadow-mode')).toBe(true);
  });

  it('treats unhealthy enabled integrations as evidence-backed attention', () => {
    const status = buildFounderStatusV1(base);
    expect(status.product.enabledIntegrations).toBe(2);
    expect(status.product.unhealthyEnabledIntegrations).toBe(1);
    expect(status.attention).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'integration-health', level: 'WATCH' }),
    ]));
  });

  it('fails closed when canonical runtime control evidence is missing', () => {
    const status = buildFounderStatusV1({
      ...base,
      controls: null,
    });
    expect(status.operatingMode).toBe('UNKNOWN');
    expect(status.attention[0]).toMatchObject({
      key: 'runtime-controls-missing',
      level: 'BLOCKED',
    });
    expect(status.evidence.find((item) => item.authority === 'SYSTEM_CONTROLS')).toMatchObject({
      quality: 'MISSING',
    });
  });

  it('keeps execution blocked when canonical runtime controls say so', () => {
    const status = buildFounderStatusV1({
      ...base,
      controls: { ...base.controls, globalKillSwitch: true, shadowMode: false },
    });
    expect(status.operatingMode).toBe('KILL_SWITCH');
    expect(status.attention[0]).toMatchObject({ key: 'kill-switch', level: 'BLOCKED' });
  });

  it('does not count generic Tool Registry availability as an AI execution surface', () => {
    const status = buildFounderStatusV1(base);
    expect(status.product.aiRegisteredActions).toBe(1);
    expect(status.evidence.find((item) => item.authority === 'TOOL_ACTION_REGISTRY')).toMatchObject({
      quality: 'VERIFIED',
      count: 3,
    });
  });
});
