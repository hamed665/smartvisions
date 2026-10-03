import { describe, expect, it } from 'vitest';

import {
  buildFounderDiligenceCoverage,
  calculateFounderCapTable,
  calculateFounderDilutionScenario,
  compareFounderTermSheets,
  type FounderCapTableEntryV1,
} from '@/lib/founder/capital';

const cap: FounderCapTableEntryV1[] = [
  {
    id: 'founder',
    status: 'ACTIVE',
    holderType: 'FOUNDER',
    holderName: 'Founder',
    securityType: 'COMMON',
    shareClass: 'Common',
    issuedUnits: 800_000,
    reservedUnits: 0,
  },
  {
    id: 'pool',
    status: 'ACTIVE',
    holderType: 'OPTION_POOL',
    holderName: 'Option Pool',
    securityType: 'OPTION_POOL',
    shareClass: null,
    issuedUnits: 0,
    reservedUnits: 200_000,
  },
];

describe('Founder capital and diligence V1', () => {
  it('derives current ownership only from ACTIVE confirmed cap-table units', () => {
    const result = calculateFounderCapTable([
      ...cap,
      {
        id: 'archived',
        status: 'ARCHIVED',
        holderType: 'INVESTOR',
        holderName: 'Old row',
        securityType: 'PREFERRED',
        shareClass: 'Seed',
        issuedUnits: 1_000_000,
        reservedUnits: 0,
      },
    ]);
    expect(result.totalIssuedUnits).toBe(800_000);
    expect(result.totalReservedUnits).toBe(200_000);
    expect(result.totalFullyDilutedUnits).toBe(1_000_000);
    expect(result.holders.find((row) => row.id === 'founder')?.ownershipBps).toBe(8000);
    expect(result.holders.find((row) => row.id === 'pool')?.ownershipBps).toBe(2000);
  });

  it('computes dilution from explicit financing and option-pool assumptions', () => {
    const result = calculateFounderDilutionScenario(cap, {
      id: 'scenario',
      name: 'Seed scenario',
      status: 'ACTIVE',
      currency: 'USD',
      preMoneyValuationAssumption: 4_000_000,
      newMoneyAmountAssumption: 1_000_000,
      optionPoolTopUpUnitsAssumption: 250_000,
    });
    expect(result.pricePerUnit).toBe(3.2);
    expect(result.newInvestorUnits).toBe(312_500);
    expect(result.postMoneyFullyDilutedUnits).toBe(1_562_500);
    expect(result.newInvestorOwnershipBps).toBe(2000);
    expect(result.optionPoolTopUpOwnershipBps).toBe(1600);
    expect(result.existingOwnershipAfterBps).toBe(6400);
    expect(result.evidenceClass).toBe('SCENARIO');
  });

  it('does not fake dilution when current cap-table evidence is missing', () => {
    const result = calculateFounderDilutionScenario([], {
      id: 'scenario',
      name: 'Seed scenario',
      status: 'ACTIVE',
      currency: 'USD',
      preMoneyValuationAssumption: 4_000_000,
      newMoneyAmountAssumption: 1_000_000,
      optionPoolTopUpUnitsAssumption: 0,
    });
    expect(result.pricePerUnit).toBeNull();
    expect(result.newInvestorOwnershipBps).toBeNull();
    expect(result.holderResults).toEqual([]);
  });

  it('compares equity headline dilution but refuses to invent SAFE conversion ownership', () => {
    const compared = compareFounderTermSheets([
      {
        id: 'equity',
        counterpartyName: 'Fund A',
        label: 'Equity',
        status: 'RECEIVED',
        instrument: 'EQUITY',
        currency: 'USD',
        investmentAmount: 1_000_000,
        preMoneyValuation: 4_000_000,
        valuationCap: null,
        discountBps: null,
        interestRateBps: null,
        maturityMonths: null,
        liquidationPreferenceMultiple: 1,
        participatingPreferred: false,
        boardSeatRights: false,
        proRataRights: true,
        informationRights: true,
        exclusivityDays: 30,
      },
      {
        id: 'safe',
        counterpartyName: 'Fund B',
        label: 'SAFE',
        status: 'RECEIVED',
        instrument: 'SAFE',
        currency: 'USD',
        investmentAmount: 500_000,
        preMoneyValuation: null,
        valuationCap: 5_000_000,
        discountBps: 2000,
        interestRateBps: null,
        maturityMonths: null,
        liquidationPreferenceMultiple: null,
        participatingPreferred: null,
        boardSeatRights: false,
        proRataRights: true,
        informationRights: true,
        exclusivityDays: null,
      },
    ]);
    expect(compared[0]?.postMoneyValuation).toBe(5_000_000);
    expect(compared[0]?.headlineNewInvestorOwnershipBps).toBe(2000);
    expect(compared[0]?.comparisonBoundary).toBe('HEADLINE_EQUITY_ONLY');
    expect(compared[1]?.headlineNewInvestorOwnershipBps).toBeNull();
    expect(compared[1]?.comparisonBoundary).toBe('CONVERSION_ASSUMPTIONS_REQUIRED');
  });

  it('reports data-room coverage instead of treating an empty checklist as complete', () => {
    expect(buildFounderDiligenceCoverage([]).coverageBps).toBeNull();
    const coverage = buildFounderDiligenceCoverage([
      { id: '1', category: 'CORPORATE', title: 'CR docs', status: 'READY', sensitivity: 'CONFIDENTIAL', evidenceRef: 'drive:1', lastVerifiedAt: '2026-10-03T00:00:00Z' },
      { id: '2', category: 'FINANCE', title: 'Financial model', status: 'REQUESTED', sensitivity: 'RESTRICTED', evidenceRef: null, lastVerifiedAt: null },
      { id: '3', category: 'TAX', title: 'Tax opinion', status: 'NOT_APPLICABLE', sensitivity: 'CONFIDENTIAL', evidenceRef: null, lastVerifiedAt: null },
      { id: '4', category: 'SECURITY', title: 'Security pack', status: 'SHARED', sensitivity: 'RESTRICTED', evidenceRef: 'drive:4', lastVerifiedAt: '2026-10-03T00:00:00Z' },
    ]);
    expect(coverage.coverageBps).toBe(7500);
    expect(coverage.outstanding).toHaveLength(1);
  });
});
