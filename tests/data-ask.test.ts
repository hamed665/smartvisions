import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeDataAskDays, parseDataAskPlan } from '@/lib/analytics/ask-core';

const askSource = readFileSync('lib/analytics/ask.ts', 'utf8');
const routeSource = readFileSync('app/api/data/ask/route.ts', 'utf8');
const panelSource = readFileSync('app/reports/data-ask-panel.tsx', 'utf8');
const reportsSource = readFileSync('app/reports/page.tsx', 'utf8');

describe('DATA-ASK', () => {
  it('bounds supported time windows and fails closed on unknown metric keys', () => {
    expect(normalizeDataAskDays(7)).toBe(7);
    expect(normalizeDataAskDays(30)).toBe(30);
    expect(normalizeDataAskDays(365)).toBe(30);

    const plan = parseDataAskPlan({
      mode: 'QUERY',
      metric_keys: ['payment.captured.amount', 'made.up.metric'],
      days: 90,
      reason: 'matched',
    }, ['payment.captured.amount'], 30);

    expect(plan).toEqual({
      mode: 'QUERY',
      metricKeys: ['payment.captured.amount'],
      days: 90,
      reason: 'matched',
    });

    expect(parseDataAskPlan({
      mode: 'QUERY',
      metric_keys: ['made.up.metric'],
      days: 30,
      reason: '',
    }, ['payment.captured.amount'], 30).mode).toBe('CLARIFY');
  });

  it('uses AI only as a semantic metric selector, never as SQL or numeric answer authority', () => {
    expect(askSource).toContain('runOwnerJsonModel<RawDataAskPlan>');
    expect(askSource).toContain("operation: 'DATA_ASK_SEMANTIC_RESOLUTION'");
    expect(askSource).toContain('You never receive warehouse values');
    expect(askSource).toContain('Never generate SQL');
    expect(askSource).toContain('metric_keys');
    expect(askSource).not.toContain('SELECT ');
    expect(routeSource).not.toContain('.rpc(');
    expect(routeSource).not.toContain('.from(');
  });

  it('reads only current governed metric definitions and the existing dashboard/warehouse path', () => {
    expect(askSource).toContain('listCurrentMetricDefinitions(service)');
    expect(askSource).toContain('loadDataDashboard({');
    expect(askSource).toContain("definition.source_mode === 'EVENT_FEED'");
    expect(askSource).toContain("['COUNT', 'SUM'].includes(definition.aggregation)");
    expect(askSource).toContain("registry: 'metric_registry_current_v1'");
    expect(askSource).toContain("warehouse: 'analytics_warehouse_facts'");
  });

  it('preserves the authenticated scope boundary before service-backed analytics reads', () => {
    expect(routeSource).toContain('getCurrentOrganization()');
    expect(askSource).toContain('supabase: input.supabase');
    expect(askSource).toContain('requestedTenantBusinessId');
    expect(askSource).toContain('requestedBranchId');
  });

  it('keeps unavailable evidence unavailable and makes no causal claim', () => {
    expect(askSource).toContain("if (!metric.available) return metric.label + ': Unavailable'");
    expect(askSource).toContain('causalClaim: false');
    expect(panelSource).toContain('causal claim NO');
    expect(panelSource).toContain('No SQL fallback and no guessed metric was used.');
  });

  it('ships Ask Your Data inside the existing governed reports surface', () => {
    expect(reportsSource).toContain("import { DataAskPanel } from './data-ask-panel'");
    expect(reportsSource).toContain('<DataAskPanel');
    expect(panelSource).toContain("fetch('/api/data/ask'");
    expect(panelSource).toContain('Metrics Registry + Analytics Warehouse');
  });
});
