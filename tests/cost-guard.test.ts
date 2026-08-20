import { describe, expect, it } from 'vitest';
import { evaluateBudgetMode, shouldAllowPaidOperation } from '@/lib/reliability/cost-guard';

const settings = {
  monthly_total_budget_usd: 100,
  warning_pct: 70,
  throttle_pct: 85,
  critical_pct: 95,
  hard_stop_pct: 100,
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
});
