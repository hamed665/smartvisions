import { describe, expect, it } from 'vitest';
import { buildUsageAnalytics } from '@/lib/reliability/usage-analytics';

describe('usage analytics', () => {
  it('groups provider, operation, lead and campaign cost and derives outcome costs', () => {
    const analytics = buildUsageAnalytics([
      { provider: 'OPENAI', operation: 'ANALYZE', cost_usd: 2, lead_id: 'lead-1', metadata: { campaign_id: 'campaign-1' }, created_at: '2026-08-20T10:00:00Z' },
      { provider: 'GOOGLE_PLACES', operation: 'QUALIFY', cost_usd: 1, lead_id: 'lead-2', metadata: { campaign_id: 'campaign-1' }, created_at: '2026-08-21T10:00:00Z' },
    ], [
      { id: 'lead-1', status: 'WON' },
      { id: 'lead-2', status: 'QUALIFIED' },
    ], { monthly_total_budget_usd: 25, warning_pct: 70, hard_stop_pct: 100 }, new Date('2026-08-22T12:00:00Z'));

    expect(analytics.providerSpend.OPENAI).toBe(2);
    expect(analytics.operationSpend.QUALIFY).toBe(1);
    expect(analytics.campaignSpend['campaign-1']).toBe(3);
    expect(analytics.costPer.qualified).toBe(1.5);
    expect(analytics.costPer.won).toBe(3);
  });

  it('flags paid spend with no qualified outcome', () => {
    const analytics = buildUsageAnalytics([
      { provider: 'OPENAI', operation: 'ANALYZE', cost_usd: 1, created_at: '2026-08-22T10:00:00Z' },
    ], [{ id: 'lead-1', status: 'NEW' }], { monthly_total_budget_usd: 25, warning_pct: 70, hard_stop_pct: 100 }, new Date('2026-08-22T12:00:00Z'));

    expect(analytics.anomalies.noOutcomeSpend).toBe(true);
  });
});
