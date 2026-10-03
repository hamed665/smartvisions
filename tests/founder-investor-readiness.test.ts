import { describe, expect, it } from 'vitest';

import type { FounderStatusSnapshotV1 } from '@/lib/founder/contracts';
import { buildFounderInvestorReadinessV1 } from '@/lib/founder/investor-readiness';

function status(overrides: Partial<FounderStatusSnapshotV1> = {}): FounderStatusSnapshotV1 {
  return {
    schemaVersion: 1,
    mode: 'READ_ONLY',
    generatedAt: '2026-10-03T12:00:00.000Z',
    operatingMode: 'SHADOW',
    product: {
      enabledIntegrations: 2,
      unhealthyEnabledIntegrations: 0,
      aiRegisteredActions: 5,
      activeKnowledgeVersions: 1,
      activeMemoryItems: 1,
      pendingMemoryItems: 0,
      agentRuns30d: 12,
      failedAgentRuns30d: 0,
    },
    sales: {
      leads: 10,
      qualifiedLeads: 3,
      wonLeads: 0,
      conversations: 8,
      tasks: 4,
      activeBookings: 0,
      quotes: 2,
      orders: 0,
      invoices: 0,
      paymentTransactions: 0,
    },
    finance: {
      monthSpendUsd: 1.5,
      monthlyBudgetUsd: 25,
      budgetUtilizationPct: 6,
    },
    attention: [],
    evidence: [
      { authority: 'SYSTEM_CONTROLS', quality: 'VERIFIED' },
      { authority: 'COST_GUARD', quality: 'VERIFIED' },
      { authority: 'INTEGRATION_CONNECTIONS', quality: 'VERIFIED' },
      { authority: 'TOOL_ACTION_REGISTRY', quality: 'VERIFIED' },
      { authority: 'CRM_PIPELINE', quality: 'VERIFIED' },
      { authority: 'COMMERCE', quality: 'VERIFIED' },
      { authority: 'AI_KNOWLEDGE_MEMORY', quality: 'VERIFIED' },
    ],
    ...overrides,
  };
}

describe('Founder investor readiness V1', () => {
  it('reports evidence coverage without inventing valuation or runway', () => {
    const readiness = buildFounderInvestorReadinessV1(status());
    expect(readiness.mode).toBe('READ_ONLY_EVIDENCE');
    expect(readiness.items.find((item) => item.key === 'PRODUCT_EVIDENCE')?.state).toBe('PRESENT');
    expect(readiness.items.find((item) => item.key === 'SALES_PIPELINE')?.state).toBe('PARTIAL');
    expect(readiness.items.find((item) => item.key === 'COMMERCIAL_TRAIL')?.state).toBe('PARTIAL');
    expect(readiness.items.find((item) => item.key === 'COMPANY_FINANCIALS')?.state).toBe('MISSING');
    expect(readiness.items.find((item) => item.key === 'MARKET_RESEARCH')?.state).toBe('MISSING');
    expect(readiness.items.find((item) => item.key === 'INVESTOR_PIPELINE')?.state).toBe('MISSING');
    expect(readiness.blockingGaps).toContain('Company financial model, burn and runway');
  });

  it('only treats commercial settlement evidence as present when invoice/payment evidence exists', () => {
    const base = status();
    const readiness = buildFounderInvestorReadinessV1(status({
      sales: {
        ...base.sales,
        invoices: 1,
        paymentTransactions: 1,
      },
    }));
    expect(readiness.items.find((item) => item.key === 'COMMERCIAL_TRAIL')?.state).toBe('PRESENT');
  });

  it('does not treat unverified authorities as investor evidence', () => {
    const base = status();
    const readiness = buildFounderInvestorReadinessV1(status({
      evidence: base.evidence.map((item) =>
        item.authority === 'CRM_PIPELINE' ? { ...item, quality: 'STALE' as const } : item
      ),
    }));
    expect(readiness.items.find((item) => item.key === 'SALES_PIPELINE')?.state).toBe('MISSING');
    expect(readiness.availableAuthorities).not.toContain('CRM_PIPELINE');
  });

  it('keeps provider Cost Guard separate from company financials', () => {
    const readiness = buildFounderInvestorReadinessV1(status());
    expect(readiness.items.find((item) => item.key === 'OPERATING_CONTROLS')?.state).toBe('PRESENT');
    expect(readiness.items.find((item) => item.key === 'COMPANY_FINANCIALS')?.state).toBe('MISSING');
  });
});
