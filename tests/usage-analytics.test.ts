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

  it('separates final, conservative and pending pricing instead of pretending all zero-cost rows are final', () => {
    const analytics = buildUsageAnalytics([
      { provider: 'WHATSAPP', operation: 'SEND_TEXT', cost_usd: 0, units: 1, metadata: { pricing_status: 'FINAL_FREE_SERVICE_WINDOW' }, created_at: '2026-08-22T08:00:00Z' },
      { provider: 'GOOGLE_PLACES', operation: 'QUALIFY', cost_usd: 0.02, units: 1, metadata: { pricing_status: 'CONSERVATIVE_LIST_PRICE_RESERVE' }, created_at: '2026-08-22T09:00:00Z' },
      { provider: 'EMAIL', operation: 'SEND_EMAIL', cost_usd: 0, units: 2, metadata: { pricing_status: 'PENDING_PLAN_RECONCILIATION' }, created_at: '2026-08-22T10:00:00Z' },
      { provider: 'WHATSAPP', operation: 'SEND_TEMPLATE', cost_usd: 0, units: 1, metadata: { pricing_status: 'PENDING_TEMPLATE_CATEGORY_RECONCILIATION' }, created_at: '2026-08-22T11:00:00Z' },
    ], [], { monthly_total_budget_usd: 25, warning_pct: 70, hard_stop_pct: 100 }, new Date('2026-08-22T12:00:00Z'));

    expect(analytics.totalSpend).toBeCloseTo(0.02, 6);
    expect(analytics.costQuality.reconciledEvents).toBe(1);
    expect(analytics.costQuality.conservativeEvents).toBe(1);
    expect(analytics.costQuality.conservativeSpend).toBeCloseTo(0.02, 6);
    expect(analytics.costQuality.pendingEvents).toBe(2);
    expect(analytics.costQuality.pendingUnits).toBe(3);
    expect(analytics.costQuality.pendingByProvider.EMAIL).toBe(1);
    expect(analytics.costQuality.pendingByProvider.WHATSAPP).toBe(1);
  });
});
