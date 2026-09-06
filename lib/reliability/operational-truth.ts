export type HealthFreshness = 'HEALTHY' | 'STALE' | 'NOT_CHECKED' | 'ERROR';

export const DEFAULT_INTEGRATION_STALE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RUNTIME_SAMPLE_MINUTES = 10;
export const DEFAULT_RUNTIME_STALE_AFTER_MS = 25 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function integrationFreshness(input: {
  status?: unknown;
  enabled?: unknown;
  lastCheckedAt?: unknown;
  lastError?: unknown;
  credentialPresent: boolean;
  now?: Date;
  staleAfterMs?: number;
}): HealthFreshness {
  if (!input.credentialPresent) return 'NOT_CHECKED';
  const error = String(input.lastError ?? '').trim();
  if (error) return 'ERROR';
  const checked = String(input.lastCheckedAt ?? '').trim();
  if (!checked) return 'NOT_CHECKED';
  const checkedAt = Date.parse(checked);
  if (!Number.isFinite(checkedAt)) return 'NOT_CHECKED';
  const ageMs = Math.max(0, (input.now ?? new Date()).getTime() - checkedAt);
  if (ageMs > (input.staleAfterMs ?? DEFAULT_INTEGRATION_STALE_MS)) return 'STALE';
  return input.enabled === true && String(input.status ?? '') === 'CONNECTED' ? 'HEALTHY' : 'NOT_CHECKED';
}

export function effectiveCampaignStatus(input: { status?: unknown; config?: unknown }) {
  const status = String(input.status ?? '').toUpperCase();
  const config = record(input.config);
  const pausedReason = String(config.pausedReason ?? '').trim();
  const pilotPhase = String(config.pilotPhase ?? '').toUpperCase();
  const terminalPilot = pilotPhase.includes('CAP_REACHED') || pilotPhase.includes('COMPLETE');
  if (status === 'RUNNING' && (pausedReason || terminalPilot)) {
    return { status: 'PAUSED', reason: pausedReason || pilotPhase } as const;
  }
  return { status, reason: null } as const;
}

export function runtimeFreshness(input: {
  createdAt?: unknown;
  now?: Date;
  staleAfterMs?: number;
}): HealthFreshness {
  const value = String(input.createdAt ?? '').trim();
  if (!value) return 'NOT_CHECKED';
  const createdAt = Date.parse(value);
  if (!Number.isFinite(createdAt)) return 'NOT_CHECKED';
  return Math.max(0, (input.now ?? new Date()).getTime() - createdAt) > (input.staleAfterMs ?? DEFAULT_RUNTIME_STALE_AFTER_MS)
    ? 'STALE'
    : 'HEALTHY';
}

export function runtimeEvidenceSummary(afterData: unknown) {
  const data = record(afterData);
  const metrics = record(data.metrics);
  const version = record(data.workerVersion);
  return {
    source: String(data.source ?? ''),
    cron: String(data.cron ?? ''),
    sampleMinutes: Number(data.sampleMinutes ?? DEFAULT_RUNTIME_SAMPLE_MINUTES),
    scheduledTime: Number.isFinite(Number(data.scheduledTime)) ? Number(data.scheduledTime) : null,
    workerVersionId: String(version.id ?? ''),
    workerVersionTag: String(version.tag ?? ''),
    workerVersionTimestamp: String(version.timestamp ?? ''),
    failed: Math.max(0, Number(metrics.failed ?? 0)),
    throttled: Math.max(0, Number(metrics.throttled ?? 0)),
    safetyBlocked: Math.max(0, Number(metrics.safetyBlocked ?? 0)),
    evidenceAction: String(metrics.evidenceAction ?? ''),
    evidenceReason: String(metrics.evidenceReason ?? ''),
  };
}
