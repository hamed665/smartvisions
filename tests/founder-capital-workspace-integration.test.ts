import { describe, expect, it } from 'vitest';

import type { FounderStatusSnapshotV1 } from '@/lib/founder/contracts';
import type { FounderInvestorWorkspaceV1 } from '@/lib/founder/investor';
import type { FounderCapitalWorkspaceV1 } from '@/lib/founder/capital';
import { buildFounderInvestorReadinessV1 } from '@/lib/founder/investor-readiness';
import { founderStatusModelPayload, parseFounderIntelligence } from '@/lib/founder/intelligence-core';

const status: FounderStatusSnapshotV1 = {
  schemaVersion: 1,
  mode: 'READ_ONLY',
  generatedAt: '2026-10-03T16:00:00.000Z',
  operatingMode: 'SHADOW',
  product: {
    enabledIntegrations: 1,
    unhealthyEnabledIntegrations: 0,
    aiRegisteredActions: 1,
    activeKnowledgeVersions: 1,
    activeMemoryItems: 0,
    pendingMemoryItems: 0,
    agentRuns30d: 0,
    failedAgentRuns30d: 0,
  },
  sales: {
    leads: 0,
    qualifiedLeads: 0,
    wonLeads: 0,
    conversations: 0,
    tasks: 0,
    activeBookings: 0,
    quotes: 0,
    orders: 0,
    invoices: 0,
    paymentTransactions: 0,
  },
  finance: { monthSpendUsd: 0, monthlyBudgetUsd: 25, budgetUtilizationPct: 0 },
  attention: [],
  evidence: [
    { authority: 'SYSTEM_CONTROLS', quality: 'VERIFIED' },
    { authority: 'COST_GUARD', quality: 'VERIFIED' },
    { authority: 'INTEGRATION_CONNECTIONS', quality: 'VERIFIED' },
    { authority: 'TOOL_ACTION_REGISTRY', quality: 'VERIFIED' },
    { authority: 'AI_KNOWLEDGE_MEMORY', quality: 'VERIFIED' },
  ],
};

const investor: FounderInvestorWorkspaceV1 = {
  schemaVersion: 1,
  generatedAt: status.generatedAt,
  rounds: [{
    id: '00000000-0000-4000-8000-000000000501',
    name: 'Seed',
    status: 'ACTIVE',
    instrument: 'EQUITY',
    currency: 'USD',
    targetRaise: 1_000_000,
    preMoneyValuationAssumption: 4_000_000,
    valuationCapAssumption: null,
    discountBpsAssumption: null,
    targetRunwayMonthsAssumption: 18,
    useOfFunds: {},
    assumptionSourceRef: 'owner-plan',
    notes: null,
    evidenceClass: 'ASSUMPTION',
    version: 1,
    updatedAt: status.generatedAt,
  }],
  candidates: [],
  pipeline: { id: null, name: null, status: null, stages: [], deals: [] },
  crmOptions: { businesses: [], people: [] },
  evidence: [
    { authority: 'FUNDRAISING_STRUCTURE', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 1, detail: 'verified' },
    { authority: 'INVESTOR_RESEARCH', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'verified' },
    { authority: 'INVESTOR_PIPELINE', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'verified' },
  ],
};

function capital(overrides: Partial<FounderCapitalWorkspaceV1> = {}): FounderCapitalWorkspaceV1 {
  return {
    schemaVersion: 1,
    generatedAt: status.generatedAt,
    capEntries: [],
    capTable: {
      evidenceClass: 'DERIVED',
      totalIssuedUnits: 900_000,
      totalReservedUnits: 100_000,
      totalFullyDilutedUnits: 1_000_000,
      holders: [],
    },
    dilutionScenarios: [{
      scenario: {
        id: '00000000-0000-4000-8000-000000000502',
        fundraisingRoundId: investor.rounds[0]!.id,
        name: 'Seed base case',
        status: 'ACTIVE',
        currency: 'USD',
        preMoneyValuationAssumption: 4_000_000,
        newMoneyAmountAssumption: 1_000_000,
        optionPoolTopUpUnitsAssumption: 0,
        assumptionSourceRef: 'owner-plan',
        notes: null,
        version: 1,
        updatedAt: status.generatedAt,
      },
      result: {
        evidenceClass: 'SCENARIO',
        pricePerUnit: 4,
        newInvestorUnits: 250_000,
        postMoneyFullyDilutedUnits: 1_250_000,
        newInvestorOwnershipBps: 2000,
        optionPoolTopUpOwnershipBps: 0,
        existingOwnershipAfterBps: 8000,
        holderResults: [],
      },
    }],
    termSheets: [],
    termComparison: [],
    diligenceItems: [],
    diligenceCoverage: {
      evidenceClass: 'DERIVED',
      total: 0,
      ready: 0,
      shared: 0,
      notApplicable: 0,
      requested: 0,
      missing: 0,
      coverageBps: null,
      outstanding: [],
    },
    evidence: [
      { authority: 'CAP_TABLE', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 2, detail: 'verified' },
      { authority: 'DILUTION_SCENARIOS', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 1, detail: 'verified' },
      { authority: 'TERM_SHEETS', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'verified' },
      { authority: 'DUE_DILIGENCE', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'verified' },
    ],
    ...overrides,
  };
}

describe('Founder capital workspace integration', () => {
  it('treats round + cap table + dilution evidence as present fundraising structure', () => {
    const readiness=buildFounderInvestorReadinessV1(status,null,investor,capital());
    expect(readiness.items.find((item)=>item.key==='FUNDRAISING_STRUCTURE')?.state).toBe('PRESENT');
    expect(readiness.availableAuthorities).toContain('CAP_TABLE');
    expect(readiness.availableAuthorities).toContain('DILUTION_SCENARIOS');
  });

  it('keeps partial diligence coverage partial and never equates it with investor approval', () => {
    const workspace=capital({
      diligenceCoverage: {
        evidenceClass: 'DERIVED',
        total: 2,
        ready: 1,
        shared: 0,
        notApplicable: 0,
        requested: 1,
        missing: 0,
        coverageBps: 5000,
        outstanding: [{ id:'x', category:'LEGAL', title:'Contracts', status:'REQUESTED' }],
      },
    });
    const readiness=buildFounderInvestorReadinessV1(status,null,investor,workspace);
    expect(readiness.items.find((item)=>item.key==='DUE_DILIGENCE_READINESS')?.state).toBe('PARTIAL');
  });

  it('passes bounded capital metadata to the model and rejects invented funded-cash authority', () => {
    const workspace=capital();
    const payload=founderStatusModelPayload(status,null,investor,workspace);
    expect(payload.founderCapital?.capTable.totalFullyDilutedUnits).toBe(1_000_000);
    expect(payload.evidence.map((item)=>item.authority)).toContain('CAP_TABLE');

    const result=parseFounderIntelligence({
      status,
      investor,
      capital: workspace,
      raw: {
        question_kind:'INVESTOR',
        answer:'Capital evidence exists but funded cash is not evidenced.',
        facts:[
          { text:'The governed cap-table authority is available.', authority:'CAP_TABLE' },
          { text:'A term sheet funded the company.', authority:'FUNDED_CASH' },
        ],
        external_facts:[],
        gaps:['No payment authority proves funded cash.'],
        next_action:'Keep settlement evidence separate.',
        kpi:'Verified capital evidence coverage.',
        risks:['Scenario dilution is not current ownership.'],
        confidence:'HIGH',
      },
    });
    expect(result.facts).toEqual([{ text:'The governed cap-table authority is available.', authority:'CAP_TABLE' }]);
    expect(result.evidenceAuthorities).toEqual(['CAP_TABLE']);
  });
});
