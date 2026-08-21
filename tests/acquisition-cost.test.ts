import { describe, expect, it } from 'vitest';
import { buildAcquisitionCostPlan } from '../lib/hunters/business/acquisition-cost';

describe('acquisition cost planner', () => {
  it('shows zero-cost discovery and caps qualification reserve', () => {
    const plan = buildAcquisitionCostPlan({ requestedCandidates: 3, cachedCandidates: 0, remainingProviderBudgetUsd: 1 });
    expect(plan.discoveryReserveUsd).toBe(0);
    expect(plan.paidQualifications).toBe(3);
    expect(plan.worstCaseReserveUsd).toBe(0.06);
    expect(plan.blockedByBudget).toBe(false);
  });

  it('subtracts cached identities before estimating paid calls', () => {
    const plan = buildAcquisitionCostPlan({ requestedCandidates: 5, cachedCandidates: 4, remainingProviderBudgetUsd: 1 });
    expect(plan.paidQualifications).toBe(1);
    expect(plan.worstCaseReserveUsd).toBe(0.02);
    expect(plan.cacheSavingsUsd).toBe(0.08);
  });

  it('flags a dry run that exceeds remaining provider budget', () => {
    const plan = buildAcquisitionCostPlan({ requestedCandidates: 5, cachedCandidates: 0, remainingProviderBudgetUsd: 0.05 });
    expect(plan.worstCaseReserveUsd).toBe(0.1);
    expect(plan.blockedByBudget).toBe(true);
  });
});
