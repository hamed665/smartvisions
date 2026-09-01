import { describe, expect, it } from 'vitest';
import { evaluateAiRunQuota, evaluateBudgetMode, shouldAllowPaidOperation } from '@/lib/reliability/cost-guard';

const settings = {
  monthly_total_budget_usd: 100,
  warning_pct: 70,
  throttle_pct: 85,
  critical_pct: 95,
  hard_stop_pct: 100,
};

const aiQuotaSettings = {
  max_ai_runs_per_lead: 20,
  daily_deep_ai_runs: 10,
};

describe('cost guard', () => {
  it('moves through budget modes at configured thresholds', () => {
    expect(evaluateBudgetMode(10, settings).mode).toBe('NORMAL');
    expect(evaluateBudgetMode(70, settings).mode).toBe('WARNING');
    expect(evaluateBudgetMode(85, settings).mode).toBe('THROTTLED');
    expect(evaluateBudgetMode(95, settings).mode).toBe('CRITICAL');
    expect(evaluateBudgetMode(100, settings).mode).toBe('HARD_STOP');
  });

  it('blocks low value work before high priority work', () => {
    expect(shouldAllowPaidOperation('THROTTLED', 'LOW')).toBe(false);
    expect(shouldAllowPaidOperation('THROTTLED', 'NORMAL')).toBe(true);
    expect(shouldAllowPaidOperation('CRITICAL', 'NORMAL')).toBe(false);
    expect(shouldAllowPaidOperation('CRITICAL', 'HIGH')).toBe(true);
    expect(shouldAllowPaidOperation('HARD_STOP', 'CRITICAL')).toBe(false);
  });

  it('blocks paid AI after the configured per-lead allowance', () => {
    expect(evaluateAiRunQuota({
      reasoningTier: 'LIGHT',
      leadRunCount: 20,
      dailyDeepRunCount: 0,
      settings: aiQuotaSettings,
    })).toEqual({ allowed: false, reason: 'MAX_AI_RUNS_PER_LEAD', limit: 20, used: 20 });
  });

  it('blocks FULL reasoning after the configured daily deep-run allowance', () => {
    expect(evaluateAiRunQuota({
      reasoningTier: 'FULL',
      leadRunCount: 3,
      dailyDeepRunCount: 10,
      settings: aiQuotaSettings,
    })).toEqual({ allowed: false, reason: 'DAILY_DEEP_AI_RUNS', limit: 10, used: 10 });
  });

  it('never blocks deterministic zero-cost handling because of paid AI quotas', () => {
    expect(evaluateAiRunQuota({
      reasoningTier: 'ZERO_COST',
      leadRunCount: 999,
      dailyDeepRunCount: 999,
      settings: aiQuotaSettings,
    })).toEqual({ allowed: true });
  });
});
