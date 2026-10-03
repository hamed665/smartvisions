import { describe, expect, it } from 'vitest';

import type { FounderStatusSnapshotV1 } from '@/lib/founder/contracts';
import { buildFounderInvestorReadinessV1 } from '@/lib/founder/investor-readiness';
import type { FounderInvestorWorkspaceV1 } from '@/lib/founder/investor';

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


function investor(overrides: Partial<FounderInvestorWorkspaceV1> = {}): FounderInvestorWorkspaceV1 {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-03T15:00:00.000Z',
    rounds: [],
    candidates: [],
    pipeline: { id: null, name: null, status: null, stages: [], deals: [] },
    crmOptions: { businesses: [], people: [] },
    evidence: [
      { authority: 'FUNDRAISING_STRUCTURE', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'verified' },
      { authority: 'INVESTOR_RESEARCH', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'verified' },
      { authority: 'INVESTOR_PIPELINE', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'verified' },
    ],
    ...overrides,
  };
}

describe('Founder investor workspace readiness integration', () => {
  it('treats a governed fundraising round as PARTIAL until cap table and terms exist', () => {
    const workspace = investor({
      rounds: [{
        id: '00000000-0000-4000-8000-000000000101',
        name: 'Seed',
        status: 'ACTIVE',
        instrument: 'EQUITY',
        currency: 'USD',
        targetRaise: 1000000,
        preMoneyValuationAssumption: 4000000,
        valuationCapAssumption: null,
        discountBpsAssumption: null,
        targetRunwayMonthsAssumption: 18,
        useOfFunds: {},
        assumptionSourceRef: 'owner-plan',
        notes: null,
        evidenceClass: 'ASSUMPTION',
        version: 1,
        updatedAt: '2026-10-03T15:00:00.000Z',
      }],
    });
    const readiness = buildFounderInvestorReadinessV1(status(), null, workspace);
    expect(readiness.items.find((item) => item.key === 'FUNDRAISING_STRUCTURE')?.state).toBe('PARTIAL');
    expect(readiness.availableAuthorities).toContain('FUNDRAISING_STRUCTURE');
  });

  it('treats external investor discovery as PARTIAL but canonical fundraising deals as PRESENT evidence coverage', () => {
    const candidate = {
      id: '00000000-0000-4000-8000-000000000201',
      recordState: 'DISCOVERED_EXTERNAL' as const,
      fundName: 'Research Fund',
      personName: null,
      geography: 'GCC',
      stageFit: 'Seed',
      ticketMin: 250000,
      ticketMax: 1000000,
      currency: 'USD',
      sectorFit: 'B2B SaaS',
      aiSaasFit: true,
      menaGccFit: true,
      sourceUrl: 'https://example.com/fund',
      sourceTitle: null,
      lastVerifiedAt: '2026-10-03T15:00:00.000Z',
      businessId: null,
      personId: null,
      confirmationMethod: null,
      confirmedAt: null,
      notes: null,
      evidenceClass: 'EXTERNAL_RESEARCH' as const,
      version: 1,
      updatedAt: '2026-10-03T15:00:00.000Z',
    };
    const partial = buildFounderInvestorReadinessV1(status(), null, investor({ candidates: [candidate] }));
    expect(partial.items.find((item) => item.key === 'INVESTOR_PIPELINE')?.state).toBe('PARTIAL');

    const present = buildFounderInvestorReadinessV1(status(), null, investor({
      candidates: [{ ...candidate, recordState: 'CRM_CONFIRMED', businessId: '00000000-0000-4000-8000-000000000211', confirmationMethod: 'MANUAL_CONFIRMED', confirmedAt: '2026-10-03T15:00:00.000Z', evidenceClass: 'CRM_CONFIRMED' }],
      pipeline: {
        id: '00000000-0000-4000-8000-000000000220',
        name: 'Investor Fundraising',
        status: 'ACTIVE',
        stages: [],
        deals: [{
          id: '00000000-0000-4000-8000-000000000221',
          candidateId: candidate.id,
          fundraisingRoundId: '00000000-0000-4000-8000-000000000101',
          businessId: '00000000-0000-4000-8000-000000000211',
          businessName: 'Research Fund',
          personId: null,
          title: 'Research Fund · Seed',
          stageId: '00000000-0000-4000-8000-000000000222',
          stageName: 'IDENTIFIED',
          state: 'OPEN',
          amount: null,
          currency: null,
          expectedCloseAt: null,
          lostReason: null,
          wonAt: null,
          lostAt: null,
          version: 1,
          updatedAt: '2026-10-03T15:00:00.000Z',
          evidenceClass: 'CRM_CONFIRMED',
        }],
      },
    }));
    expect(present.items.find((item) => item.key === 'INVESTOR_PIPELINE')?.state).toBe('PRESENT');
  });
});
