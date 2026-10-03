import type { FounderEvidenceQuality } from './contracts';

export type FounderCapTableEntryV1 = {
  id: string;
  status: 'ACTIVE' | 'ARCHIVED';
  holderType: 'FOUNDER' | 'EMPLOYEE' | 'INVESTOR' | 'OPTION_POOL' | 'OTHER';
  holderName: string;
  securityType: 'COMMON' | 'PREFERRED' | 'OPTION_POOL' | 'OTHER';
  shareClass: string | null;
  issuedUnits: number;
  reservedUnits: number;
};

export type FounderDilutionScenarioV1 = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  currency: string;
  preMoneyValuationAssumption: number;
  newMoneyAmountAssumption: number;
  optionPoolTopUpUnitsAssumption: number;
};

export type FounderTermSheetV1 = {
  id: string;
  counterpartyName: string;
  label: string;
  status: 'DRAFT' | 'RECEIVED' | 'COUNTERED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';
  instrument: 'EQUITY' | 'SAFE' | 'CONVERTIBLE_NOTE' | 'OTHER';
  currency: string;
  investmentAmount: number;
  preMoneyValuation: number | null;
  valuationCap: number | null;
  discountBps: number | null;
  interestRateBps: number | null;
  maturityMonths: number | null;
  liquidationPreferenceMultiple: number | null;
  participatingPreferred: boolean | null;
  boardSeatRights: boolean | null;
  proRataRights: boolean | null;
  informationRights: boolean | null;
  exclusivityDays: number | null;
};

export type FounderDueDiligenceItemV1 = {
  id: string;
  category: 'CORPORATE' | 'FINANCE' | 'LEGAL' | 'IP' | 'SECURITY' | 'PRODUCT' | 'COMMERCIAL' | 'HR' | 'TAX' | 'OTHER';
  title: string;
  status: 'MISSING' | 'REQUESTED' | 'READY' | 'SHARED' | 'NOT_APPLICABLE';
  sensitivity: 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  evidenceRef: string | null;
  lastVerifiedAt: string | null;
};

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function rounded(value: number | null, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

export function calculateFounderCapTable(entries: FounderCapTableEntryV1[]) {
  const active = entries.filter((entry) => entry.status === 'ACTIVE');
  const totalIssuedUnits = active.reduce((sum, entry) => sum + finite(entry.issuedUnits), 0);
  const totalReservedUnits = active.reduce((sum, entry) => sum + finite(entry.reservedUnits), 0);
  const totalFullyDilutedUnits = totalIssuedUnits + totalReservedUnits;

  return {
    evidenceClass: 'DERIVED' as const,
    totalIssuedUnits: rounded(totalIssuedUnits, 8) ?? 0,
    totalReservedUnits: rounded(totalReservedUnits, 8) ?? 0,
    totalFullyDilutedUnits: rounded(totalFullyDilutedUnits, 8) ?? 0,
    holders: active.map((entry) => {
      const units = finite(entry.issuedUnits) + finite(entry.reservedUnits);
      return {
        id: entry.id,
        holderName: entry.holderName,
        holderType: entry.holderType,
        securityType: entry.securityType,
        units: rounded(units, 8) ?? 0,
        ownershipBps: totalFullyDilutedUnits > 0
          ? Math.round((units / totalFullyDilutedUnits) * 10_000)
          : null,
      };
    }),
  };
}

export function calculateFounderDilutionScenario(
  entries: FounderCapTableEntryV1[],
  scenario: FounderDilutionScenarioV1,
) {
  const cap = calculateFounderCapTable(entries);
  const currentUnits = cap.totalFullyDilutedUnits;
  const topUpUnits = finite(scenario.optionPoolTopUpUnitsAssumption);
  const preMoneyUnits = currentUnits + topUpUnits;
  const preMoneyValuation = finite(scenario.preMoneyValuationAssumption);
  const newMoney = finite(scenario.newMoneyAmountAssumption);

  if (preMoneyUnits <= 0 || preMoneyValuation <= 0 || newMoney <= 0) {
    return {
      evidenceClass: 'SCENARIO' as const,
      pricePerUnit: null,
      newInvestorUnits: null,
      postMoneyFullyDilutedUnits: null,
      newInvestorOwnershipBps: null,
      optionPoolTopUpOwnershipBps: null,
      existingOwnershipAfterBps: null,
      holderResults: [],
    };
  }

  const pricePerUnit = preMoneyValuation / preMoneyUnits;
  const newInvestorUnits = newMoney / pricePerUnit;
  const postMoneyUnits = preMoneyUnits + newInvestorUnits;

  return {
    evidenceClass: 'SCENARIO' as const,
    pricePerUnit: rounded(pricePerUnit, 8),
    newInvestorUnits: rounded(newInvestorUnits, 8),
    postMoneyFullyDilutedUnits: rounded(postMoneyUnits, 8),
    newInvestorOwnershipBps: Math.round((newInvestorUnits / postMoneyUnits) * 10_000),
    optionPoolTopUpOwnershipBps: Math.round((topUpUnits / postMoneyUnits) * 10_000),
    existingOwnershipAfterBps: Math.round((currentUnits / postMoneyUnits) * 10_000),
    holderResults: cap.holders.map((holder) => ({
      ...holder,
      beforeOwnershipBps: holder.ownershipBps,
      afterOwnershipBps: Math.round((holder.units / postMoneyUnits) * 10_000),
    })),
  };
}

export function compareFounderTermSheets(termSheets: FounderTermSheetV1[]) {
  return termSheets.map((term) => {
    const preMoney = term.preMoneyValuation == null ? null : finite(term.preMoneyValuation);
    const investment = finite(term.investmentAmount);
    const isEquityComparable = term.instrument === 'EQUITY' && preMoney != null && preMoney > 0 && investment > 0;
    const postMoney = isEquityComparable ? preMoney + investment : null;

    return {
      id: term.id,
      counterpartyName: term.counterpartyName,
      label: term.label,
      status: term.status,
      instrument: term.instrument,
      currency: term.currency,
      investmentAmount: investment,
      preMoneyValuation: preMoney,
      postMoneyValuation: rounded(postMoney, 2),
      headlineNewInvestorOwnershipBps: postMoney && postMoney > 0
        ? Math.round((investment / postMoney) * 10_000)
        : null,
      valuationCap: term.valuationCap,
      discountBps: term.discountBps,
      interestRateBps: term.interestRateBps,
      maturityMonths: term.maturityMonths,
      liquidationPreferenceMultiple: term.liquidationPreferenceMultiple,
      participatingPreferred: term.participatingPreferred,
      boardSeatRights: term.boardSeatRights,
      proRataRights: term.proRataRights,
      informationRights: term.informationRights,
      exclusivityDays: term.exclusivityDays,
      comparisonBoundary: isEquityComparable
        ? 'HEADLINE_EQUITY_ONLY' as const
        : 'CONVERSION_ASSUMPTIONS_REQUIRED' as const,
    };
  });
}

export function buildFounderDiligenceCoverage(items: FounderDueDiligenceItemV1[]) {
  const total = items.length;
  const ready = items.filter((item) => item.status === 'READY').length;
  const shared = items.filter((item) => item.status === 'SHARED').length;
  const notApplicable = items.filter((item) => item.status === 'NOT_APPLICABLE').length;
  const requested = items.filter((item) => item.status === 'REQUESTED').length;
  const missing = items.filter((item) => item.status === 'MISSING').length;
  const satisfied = ready + shared + notApplicable;

  return {
    evidenceClass: 'DERIVED' as const,
    total,
    ready,
    shared,
    notApplicable,
    requested,
    missing,
    coverageBps: total > 0 ? Math.round((satisfied / total) * 10_000) : null,
    outstanding: items
      .filter((item) => item.status === 'MISSING' || item.status === 'REQUESTED')
      .map((item) => ({ id: item.id, category: item.category, title: item.title, status: item.status })),
  };
}


export type FounderCapTableRecordV1 = FounderCapTableEntryV1 & {
  personId: string | null;
  businessId: string | null;
  sourceType: 'MANUAL_CONFIRMED' | 'IMPORT_VERIFIED';
  sourceRef: string;
  notes: string | null;
  version: number;
  updatedAt: string;
};

export type FounderDilutionScenarioRecordV1 = FounderDilutionScenarioV1 & {
  fundraisingRoundId: string;
  assumptionSourceRef: string;
  notes: string | null;
  version: number;
  updatedAt: string;
};

export type FounderTermSheetRecordV1 = FounderTermSheetV1 & {
  fundraisingRoundId: string;
  investorCandidateId: string | null;
  crmDealId: string | null;
  sourceType: 'MANUAL_CONFIRMED' | 'IMPORT_VERIFIED';
  sourceRef: string;
  notes: string | null;
  version: number;
  updatedAt: string;
};

export type FounderDueDiligenceRecordV1 = FounderDueDiligenceItemV1 & {
  fundraisingRoundId: string | null;
  notes: string | null;
  version: number;
  updatedAt: string;
};

export type FounderCapitalEvidenceV1 = {
  authority: 'CAP_TABLE' | 'DILUTION_SCENARIOS' | 'TERM_SHEETS' | 'DUE_DILIGENCE';
  quality: FounderEvidenceQuality;
  evidenceClass: 'VERIFIED_PRODUCTION';
  count: number;
  detail: string;
};

export type FounderCapitalWorkspaceV1 = {
  schemaVersion: 1;
  generatedAt: string;
  capEntries: FounderCapTableRecordV1[];
  capTable: ReturnType<typeof calculateFounderCapTable>;
  dilutionScenarios: Array<{
    scenario: FounderDilutionScenarioRecordV1;
    result: ReturnType<typeof calculateFounderDilutionScenario>;
  }>;
  termSheets: FounderTermSheetRecordV1[];
  termComparison: ReturnType<typeof compareFounderTermSheets>;
  diligenceItems: FounderDueDiligenceRecordV1[];
  diligenceCoverage: ReturnType<typeof buildFounderDiligenceCoverage>;
  evidence: FounderCapitalEvidenceV1[];
};

export function founderCapitalVerifiedAuthorities(
  capital: FounderCapitalWorkspaceV1 | null | undefined,
) {
  return capital
    ? capital.evidence
        .filter((item) => item.quality === 'VERIFIED')
        .map((item) => item.authority)
    : [];
}

export function founderCapitalModelPayload(
  capital: FounderCapitalWorkspaceV1 | null | undefined,
) {
  if (!capital) return null;
  return {
    schemaVersion: capital.schemaVersion,
    generatedAt: capital.generatedAt,
    capTable: capital.capTable,
    capEntries: capital.capEntries
      .filter((entry) => entry.status === 'ACTIVE')
      .map((entry) => ({
        id: entry.id,
        holderType: entry.holderType,
        holderName: entry.holderName,
        securityType: entry.securityType,
        shareClass: entry.shareClass,
        issuedUnits: entry.issuedUnits,
        reservedUnits: entry.reservedUnits,
        sourceType: entry.sourceType,
      })),
    dilutionScenarios: capital.dilutionScenarios
      .filter(({ scenario }) => scenario.status === 'ACTIVE')
      .map(({ scenario, result }) => ({
        id: scenario.id,
        name: scenario.name,
        currency: scenario.currency,
        fundraisingRoundId: scenario.fundraisingRoundId,
        assumptions: {
          preMoneyValuation: scenario.preMoneyValuationAssumption,
          newMoneyAmount: scenario.newMoneyAmountAssumption,
          optionPoolTopUpUnits: scenario.optionPoolTopUpUnitsAssumption,
        },
        result,
      })),
    termSheets: capital.termComparison,
    diligence: {
      coverage: capital.diligenceCoverage,
      items: capital.diligenceItems.map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        status: item.status,
        sensitivity: item.sensitivity,
        lastVerifiedAt: item.lastVerifiedAt,
      })),
    },
    evidence: capital.evidence,
  };
}
