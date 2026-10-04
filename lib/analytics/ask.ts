import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { runOwnerJsonModel } from '@/lib/ai/owner-model-gateway';
import {
  listCurrentMetricDefinitions,
  type MetricDefinition,
  type MetricScope,
} from '@/lib/analytics/metrics';
import {
  loadDataDashboard,
  type DashboardHistoricalMetric,
  type DashboardSnapshot,
} from '@/lib/analytics/dashboard';
import {
  normalizeDataAskDays,
  parseDataAskPlan,
  type DataAskDays,
  type DataAskPlan,
  type RawDataAskPlan,
} from '@/lib/analytics/ask-core';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type DataAskMetricResult = {
  metricKey: string;
  label: string;
  definitionVersion: number;
  unit: string;
  value: number | null;
  valuesByUnit: Record<string, number>;
  available: boolean;
  reason: string | null;
  source: 'WAREHOUSE';
};

export type DataAskAnswer = {
  mode: 'ANSWER';
  question: string;
  answer: string;
  scope: DashboardSnapshot['scope'];
  window: DashboardSnapshot['window'];
  metrics: DataAskMetricResult[];
  freshness: DashboardSnapshot['freshness'];
  evidence: {
    registry: 'metric_registry_current_v1';
    warehouse: 'analytics_warehouse_facts';
    arbitrarySql: false;
    causalClaim: false;
  };
  plannerReason: string;
  generatedAt: string;
};

export type DataAskNonAnswer = {
  mode: 'CLARIFY' | 'UNSUPPORTED';
  reason: string;
  scope: DashboardSnapshot['scope'];
  window: DashboardSnapshot['window'];
  availableMetricKeys: string[];
};

function eventName(definition: MetricDefinition) {
  const value = definition.definition?.eventName;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isAskableMetric(definition: MetricDefinition, scope: MetricScope) {
  return (
    definition.source_mode === 'EVENT_FEED'
    && ['COUNT', 'SUM'].includes(definition.aggregation)
    && definition.supported_scopes.includes(scope)
    && Boolean(eventName(definition))
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function displayMetric(metric: DataAskMetricResult) {
  if (!metric.available) return metric.label + ': Unavailable';
  const units = Object.entries(metric.valuesByUnit).sort(([a], [b]) => a.localeCompare(b));
  if (units.length) {
    return metric.label + ': ' + units.map(([unit, value]) => formatNumber(value) + ' ' + unit).join(' · ');
  }
  if (metric.value == null) return metric.label + ': —';
  if (metric.unit === 'PERCENT') return metric.label + ': ' + formatNumber(metric.value) + '%';
  return metric.label + ': ' + formatNumber(metric.value) + (metric.unit === 'COUNT' ? '' : ' ' + metric.unit);
}

function metricResult(metric: DashboardHistoricalMetric): DataAskMetricResult {
  return {
    metricKey: metric.key,
    label: metric.label,
    definitionVersion: metric.definitionVersion,
    unit: metric.unit,
    value: metric.value,
    valuesByUnit: metric.valuesByUnit,
    available: metric.available,
    reason: metric.reason,
    source: 'WAREHOUSE',
  };
}

export async function planDataAskQuestion(input: {
  organizationId: string;
  question: string;
  requestedDays: DataAskDays;
  scope: MetricScope;
  definitions: MetricDefinition[];
  signal?: AbortSignal;
}): Promise<DataAskPlan> {
  const definitions = input.definitions.filter((definition) => isAskableMetric(definition, input.scope));
  if (!definitions.length) {
    return {
      mode: 'UNSUPPORTED',
      metricKeys: [],
      days: input.requestedDays,
      reason: 'No governed metric is available for the selected scope.',
    };
  }

  const metricKeys = definitions.map((definition) => definition.metric_key);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      mode: { type: 'string', enum: ['QUERY', 'CLARIFY', 'UNSUPPORTED'] },
      metric_keys: {
        type: 'array',
        items: { type: 'string', enum: metricKeys },
        maxItems: 6,
      },
      days: { type: 'integer', enum: [7, 30, 90] },
      reason: { type: 'string' },
    },
    required: ['mode', 'metric_keys', 'days', 'reason'],
  } as const;

  const instructions = [
    'You are a read-only semantic metric resolver for Smart Visions Ask Your Data.',
    'Your only job is to map the user question to existing governed metric keys and one supported time window. Do not answer the business question.',
    'Never generate SQL, database expressions, filters, table names, joins, formulas, IDs or mutation instructions.',
    'You receive semantic metric definitions only. You never receive warehouse values, customer records, provider payloads or secrets.',
    'Use only metric keys from AVAILABLE_METRICS. Never invent a metric, derive a new metric, combine currencies, infer attribution or infer causality.',
    'If the requested concept is not represented by AVAILABLE_METRICS, use mode=UNSUPPORTED and metric_keys=[].',
    'If the request is materially ambiguous and choosing a metric would guess user intent, use mode=CLARIFY and metric_keys=[].',
    'For QUERY, select the smallest sufficient set of metric keys, at most 6.',
    'Use 7, 30 or 90 days. If the user explicitly asks for one of those windows, use it. Otherwise preserve REQUESTED_WINDOW_DAYS.',
    'Sales, quote or order value is not revenue. Captured payment metrics are provider-verified money movement, not causal attribution or net accounting revenue.',
    'Keep reason short and factual.',
  ].join('\n');

  const response = await runOwnerJsonModel<RawDataAskPlan>({
    organizationId: input.organizationId,
    task: 'OWNER_ASSISTANT',
    operation: 'DATA_ASK_SEMANTIC_RESOLUTION',
    instructions,
    payload: {
      question: input.question,
      requested_window_days: input.requestedDays,
      selected_scope: input.scope,
      available_metrics: definitions.map((definition) => ({
        key: definition.metric_key,
        name: definition.display_name,
        description: definition.description,
        unit: definition.unit,
        aggregation: definition.aggregation,
        source_mode: definition.source_mode,
      })),
    },
    schemaName: 'data_ask_semantic_plan_v1',
    schema,
    maxOutputTokens: 350,
    signal: input.signal,
  });

  return parseDataAskPlan(response.data, metricKeys, input.requestedDays);
}

export async function answerDataQuestion(input: {
  supabase: SupabaseClient;
  organizationId: string;
  question: string;
  requestedDays?: unknown;
  requestedTenantBusinessId?: string | null;
  requestedBranchId?: string | null;
  signal?: AbortSignal;
}): Promise<DataAskAnswer | DataAskNonAnswer> {
  const requestedDays = normalizeDataAskDays(input.requestedDays, 30);
  const service = createSupabaseServiceClient();

  const [definitions, initialDashboard] = await Promise.all([
    listCurrentMetricDefinitions(service),
    loadDataDashboard({
      supabase: input.supabase,
      organizationId: input.organizationId,
      days: requestedDays,
      requestedTenantBusinessId: input.requestedTenantBusinessId ?? null,
      requestedBranchId: input.requestedBranchId ?? null,
    }),
  ]);

  const plan = await planDataAskQuestion({
    organizationId: input.organizationId,
    question: input.question,
    requestedDays,
    scope: initialDashboard.scope.level,
    definitions,
    signal: input.signal,
  });

  const availableMetricKeys = definitions
    .filter((definition) => isAskableMetric(definition, initialDashboard.scope.level))
    .map((definition) => definition.metric_key)
    .sort();

  if (plan.mode !== 'QUERY') {
    return {
      mode: plan.mode,
      reason: plan.reason || (
        plan.mode === 'UNSUPPORTED'
          ? 'The current governed Metrics Registry does not define this question.'
          : 'The question needs a more specific governed metric.'
      ),
      scope: initialDashboard.scope,
      window: initialDashboard.window,
      availableMetricKeys,
    };
  }

  const dashboard = plan.days === initialDashboard.window.days
    ? initialDashboard
    : await loadDataDashboard({
      supabase: input.supabase,
      organizationId: input.organizationId,
      days: plan.days,
      requestedTenantBusinessId: input.requestedTenantBusinessId ?? null,
      requestedBranchId: input.requestedBranchId ?? null,
    });

  const selected = new Set(plan.metricKeys);
  const metrics = dashboard.historical
    .filter((metric) => selected.has(metric.key))
    .map(metricResult);

  return {
    mode: 'ANSWER',
    question: input.question,
    answer: metrics.length
      ? metrics.map(displayMetric).join(' · ')
      : 'No governed metric result is available for this question.',
    scope: dashboard.scope,
    window: dashboard.window,
    metrics,
    freshness: dashboard.freshness,
    evidence: {
      registry: 'metric_registry_current_v1',
      warehouse: 'analytics_warehouse_facts',
      arbitrarySql: false,
      causalClaim: false,
    },
    plannerReason: plan.reason,
    generatedAt: new Date().toISOString(),
  };
}
