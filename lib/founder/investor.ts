import type { FounderEvidenceQuality } from './contracts';

export type FounderInvestorEvidenceClass =
  | 'VERIFIED_PRODUCTION'
  | 'ASSUMPTION'
  | 'EXTERNAL_RESEARCH'
  | 'CRM_CONFIRMED'
  | 'MISSING';

export type FounderFundraisingRoundV1 = {
  id: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'CANCELED';
  instrument: 'EQUITY' | 'SAFE' | 'CONVERTIBLE_NOTE' | 'OTHER';
  currency: string;
  targetRaise: number;
  preMoneyValuationAssumption: number | null;
  valuationCapAssumption: number | null;
  discountBpsAssumption: number | null;
  targetRunwayMonthsAssumption: number | null;
  useOfFunds: Record<string, unknown>;
  assumptionSourceRef: string;
  notes: string | null;
  evidenceClass: 'ASSUMPTION';
  version: number;
  updatedAt: string;
};

export type FounderInvestorCandidateV1 = {
  id: string;
  recordState: 'DISCOVERED_EXTERNAL' | 'CRM_CONFIRMED';
  fundName: string;
  personName: string | null;
  geography: string | null;
  stageFit: string | null;
  ticketMin: number | null;
  ticketMax: number | null;
  currency: string | null;
  sectorFit: string | null;
  aiSaasFit: boolean | null;
  menaGccFit: boolean | null;
  sourceUrl: string;
  sourceTitle: string | null;
  lastVerifiedAt: string;
  businessId: string | null;
  personId: string | null;
  confirmationMethod: 'MANUAL_CONFIRMED' | 'IMPORT_VERIFIED' | null;
  confirmedAt: string | null;
  notes: string | null;
  evidenceClass: 'EXTERNAL_RESEARCH' | 'CRM_CONFIRMED';
  version: number;
  updatedAt: string;
};

export type FounderInvestorPipelineStageV1 = {
  id: string;
  name: string;
  position: number;
  category: 'OPEN' | 'WON' | 'LOST';
  probabilityBps: number;
  forecastCategory: string;
  requireAmount: boolean;
  requireExpectedClose: boolean;
};

export type FounderInvestorPipelineDealV1 = {
  id: string;
  candidateId: string | null;
  fundraisingRoundId: string;
  businessId: string;
  businessName: string;
  personId: string | null;
  title: string;
  stageId: string;
  stageName: string;
  state: 'OPEN' | 'WON' | 'LOST';
  amount: number | null;
  currency: string | null;
  expectedCloseAt: string | null;
  lostReason: string | null;
  wonAt: string | null;
  lostAt: string | null;
  version: number;
  updatedAt: string;
  evidenceClass: 'CRM_CONFIRMED';
};

export type FounderInvestorCrmBusinessOption = {
  id: string;
  name: string;
  countryCode: string;
  city: string | null;
};

export type FounderInvestorCrmPersonOption = {
  id: string;
  displayName: string;
};

export type FounderInvestorEvidenceV1 = {
  authority: 'FUNDRAISING_STRUCTURE' | 'INVESTOR_RESEARCH' | 'INVESTOR_PIPELINE';
  quality: FounderEvidenceQuality;
  evidenceClass: 'VERIFIED_PRODUCTION';
  count: number;
  detail: string;
};

export type FounderInvestorWorkspaceV1 = {
  schemaVersion: 1;
  generatedAt: string;
  rounds: FounderFundraisingRoundV1[];
  candidates: FounderInvestorCandidateV1[];
  pipeline: {
    id: string | null;
    name: string | null;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | null;
    stages: FounderInvestorPipelineStageV1[];
    deals: FounderInvestorPipelineDealV1[];
  };
  crmOptions: {
    businesses: FounderInvestorCrmBusinessOption[];
    people: FounderInvestorCrmPersonOption[];
  };
  evidence: FounderInvestorEvidenceV1[];
};

export function founderInvestorVerifiedAuthorities(
  investor: FounderInvestorWorkspaceV1 | null | undefined,
) {
  return investor
    ? investor.evidence
        .filter((item) => item.quality === 'VERIFIED')
        .map((item) => item.authority)
    : [];
}

export function founderInvestorModelPayload(
  investor: FounderInvestorWorkspaceV1 | null | undefined,
) {
  if (!investor) return null;
  return {
    schemaVersion: investor.schemaVersion,
    generatedAt: investor.generatedAt,
    rounds: investor.rounds.map((round) => ({
      id: round.id,
      name: round.name,
      status: round.status,
      instrument: round.instrument,
      currency: round.currency,
      targetRaise: round.targetRaise,
      preMoneyValuationAssumption: round.preMoneyValuationAssumption,
      valuationCapAssumption: round.valuationCapAssumption,
      discountBpsAssumption: round.discountBpsAssumption,
      targetRunwayMonthsAssumption: round.targetRunwayMonthsAssumption,
      useOfFunds: round.useOfFunds,
      evidenceClass: round.evidenceClass,
    })),
    candidates: investor.candidates.map((candidate) => ({
      id: candidate.id,
      recordState: candidate.recordState,
      fundName: candidate.fundName,
      personName: candidate.personName,
      geography: candidate.geography,
      stageFit: candidate.stageFit,
      ticketMin: candidate.ticketMin,
      ticketMax: candidate.ticketMax,
      currency: candidate.currency,
      sectorFit: candidate.sectorFit,
      aiSaasFit: candidate.aiSaasFit,
      menaGccFit: candidate.menaGccFit,
      sourceUrl: candidate.sourceUrl,
      lastVerifiedAt: candidate.lastVerifiedAt,
      businessId: candidate.businessId,
      personId: candidate.personId,
      confirmationMethod: candidate.confirmationMethod,
      confirmedAt: candidate.confirmedAt,
      evidenceClass: candidate.evidenceClass,
    })),
    pipeline: {
      id: investor.pipeline.id,
      status: investor.pipeline.status,
      stages: investor.pipeline.stages,
      deals: investor.pipeline.deals.map((deal) => ({
        id: deal.id,
        candidateId: deal.candidateId,
        fundraisingRoundId: deal.fundraisingRoundId,
        businessId: deal.businessId,
        businessName: deal.businessName,
        personId: deal.personId,
        stageId: deal.stageId,
        stageName: deal.stageName,
        state: deal.state,
        amount: deal.amount,
        currency: deal.currency,
        expectedCloseAt: deal.expectedCloseAt,
        wonAt: deal.wonAt,
        lostAt: deal.lostAt,
        evidenceClass: deal.evidenceClass,
      })),
    },
    evidence: investor.evidence,
  };
}
