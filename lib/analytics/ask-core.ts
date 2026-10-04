export type DataAskDays = 7 | 30 | 90;

export type DataAskPlanMode = 'QUERY' | 'CLARIFY' | 'UNSUPPORTED';

export type RawDataAskPlan = {
  mode?: unknown;
  metric_keys?: unknown;
  days?: unknown;
  reason?: unknown;
};

export type DataAskPlan = {
  mode: DataAskPlanMode;
  metricKeys: string[];
  days: DataAskDays;
  reason: string;
};

const ALLOWED_DAYS = new Set<DataAskDays>([7, 30, 90]);

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeDataAskDays(value: unknown, fallback: DataAskDays = 30): DataAskDays {
  const numeric = Number(value);
  if (ALLOWED_DAYS.has(numeric as DataAskDays)) return numeric as DataAskDays;
  return fallback;
}

export function parseDataAskPlan(
  raw: RawDataAskPlan,
  allowedMetricKeys: string[],
  fallbackDays: DataAskDays = 30,
): DataAskPlan {
  const allowed = new Set(allowedMetricKeys);
  const requestedMode = text(raw.mode, 20).toUpperCase();
  const mode: DataAskPlanMode =
    requestedMode === 'QUERY' || requestedMode === 'UNSUPPORTED'
      ? requestedMode
      : 'CLARIFY';

  const metricKeys = Array.isArray(raw.metric_keys)
    ? [...new Set(
      raw.metric_keys
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => allowed.has(value)),
    )].slice(0, 6)
    : [];

  const days = normalizeDataAskDays(raw.days, fallbackDays);
  const reason = text(raw.reason, 600);

  if (mode === 'QUERY' && metricKeys.length === 0) {
    return {
      mode: 'CLARIFY',
      metricKeys: [],
      days,
      reason: reason || 'No governed metric matched the question.',
    };
  }

  return {
    mode,
    metricKeys: mode === 'QUERY' ? metricKeys : [],
    days,
    reason,
  };
}
