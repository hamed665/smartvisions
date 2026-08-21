export type AcquisitionCostPlan = {
  requestedCandidates: number;
  cachedCandidates: number;
  paidQualifications: number;
  discoveryReserveUsd: number;
  qualificationReserveUsd: number;
  worstCaseReserveUsd: number;
  cacheSavingsUsd: number;
  blockedByBudget: boolean;
};

const QUALIFICATION_RESERVE_USD = 0.02;

export function buildAcquisitionCostPlan(input: {
  requestedCandidates: number;
  cachedCandidates?: number;
  remainingProviderBudgetUsd?: number | null;
}): AcquisitionCostPlan {
  const requestedCandidates = Math.max(0, Math.min(5, Math.floor(Number(input.requestedCandidates) || 0)));
  const cachedCandidates = Math.max(0, Math.min(requestedCandidates, Math.floor(Number(input.cachedCandidates) || 0)));
  const paidQualifications = Math.max(0, requestedCandidates - cachedCandidates);
  const discoveryReserveUsd = 0;
  const qualificationReserveUsd = Number((paidQualifications * QUALIFICATION_RESERVE_USD).toFixed(4));
  const worstCaseReserveUsd = Number((discoveryReserveUsd + qualificationReserveUsd).toFixed(4));
  const cacheSavingsUsd = Number((cachedCandidates * QUALIFICATION_RESERVE_USD).toFixed(4));
  const remaining = input.remainingProviderBudgetUsd == null ? null : Math.max(0, Number(input.remainingProviderBudgetUsd) || 0);
  return {
    requestedCandidates,
    cachedCandidates,
    paidQualifications,
    discoveryReserveUsd,
    qualificationReserveUsd,
    worstCaseReserveUsd,
    cacheSavingsUsd,
    blockedByBudget: remaining != null && worstCaseReserveUsd > remaining,
  };
}
