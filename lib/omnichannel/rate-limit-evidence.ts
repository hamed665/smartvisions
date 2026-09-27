import type { SupabaseClient } from '@supabase/supabase-js';

export type ProviderRateLimitEvidence = {
  observedAt: string;
  limit: number | null;
  remaining: number | null;
  resetSeconds: number | null;
  retryAfterSeconds: number | null;
  appUsage: {
    callCountPct: number | null;
    totalCpuTimePct: number | null;
    totalTimePct: number | null;
  } | null;
  businessUsage: {
    present: boolean;
    maxCallCountPct: number | null;
    maxTotalCpuTimePct: number | null;
    maxTotalTimePct: number | null;
    maxEstimatedRegainSeconds: number | null;
  } | null;
};

function finiteNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function boundedPercent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000 ? parsed : null;
}

function parseObjectJson(value: string | null) {
  if (!value || value.length > 32_000) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function maxNumericByKey(value: unknown, keys: Set<string>, depth = 0): number | null {
  if (depth > 5 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.reduce<number | null>((best, item) => {
      const current = maxNumericByKey(item, keys, depth + 1);
      return current === null ? best : best === null ? current : Math.max(best, current);
    }, null);
  }
  if (typeof value !== 'object') return null;
  let best: number | null = null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key)) {
      const numeric = boundedPercent(child);
      if (numeric !== null) best = best === null ? numeric : Math.max(best, numeric);
    }
    const nested = maxNumericByKey(child, keys, depth + 1);
    if (nested !== null) best = best === null ? nested : Math.max(best, nested);
  }
  return best;
}

export function extractProviderRateLimitEvidence(
  headers: Headers,
  observedAt = new Date().toISOString(),
): ProviderRateLimitEvidence | null {
  const limit = finiteNumber(headers.get('ratelimit-limit'));
  const remaining = finiteNumber(headers.get('ratelimit-remaining'));
  const resetSeconds = finiteNumber(headers.get('ratelimit-reset'));
  const retryAfterSeconds = finiteNumber(headers.get('retry-after'));

  const appRaw = parseObjectJson(headers.get('x-app-usage'));
  const appUsage = appRaw
    ? {
        callCountPct: boundedPercent(appRaw.call_count),
        totalCpuTimePct: boundedPercent(appRaw.total_cputime),
        totalTimePct: boundedPercent(appRaw.total_time),
      }
    : null;

  const businessRaw = parseObjectJson(headers.get('x-business-use-case-usage'));
  const businessUsage = businessRaw
    ? {
        present: true,
        maxCallCountPct: maxNumericByKey(businessRaw, new Set(['call_count'])),
        maxTotalCpuTimePct: maxNumericByKey(businessRaw, new Set(['total_cputime'])),
        maxTotalTimePct: maxNumericByKey(businessRaw, new Set(['total_time'])),
        maxEstimatedRegainSeconds: maxNumericByKey(
          businessRaw,
          new Set(['estimated_time_to_regain_access']),
        ),
      }
    : null;

  if (
    limit === null
    && remaining === null
    && resetSeconds === null
    && retryAfterSeconds === null
    && appUsage === null
    && businessUsage === null
  ) {
    return null;
  }

  return {
    observedAt,
    limit,
    remaining,
    resetSeconds,
    retryAfterSeconds,
    appUsage,
    businessUsage,
  };
}

export async function recordProviderRateLimitEvidence(input: {
  service: SupabaseClient;
  organizationId: string;
  provider: string;
  channel: string;
  evidence: ProviderRateLimitEvidence | null | undefined;
  tenantBusinessId?: string | null;
  branchId?: string | null;
  integrationConnectionId?: string | null;
}) {
  if (!input.evidence) return { recorded: false as const, reason: 'NO_EVIDENCE' as const };
  const result = await input.service.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'SYSTEM',
    actor_id: 'provider-boundary',
    action: 'CHANNEL_PROVIDER_RATE_LIMIT_OBSERVED',
    entity_type: 'integration_connection',
    entity_id: input.integrationConnectionId ?? null,
    tenant_business_id: input.tenantBusinessId ?? null,
    branch_id: input.branchId ?? null,
    correlation_id: globalThis.crypto.randomUUID(),
    after_data: {
      provider: input.provider,
      channel: input.channel,
      observed_at: input.evidence.observedAt,
      rate_limit: input.evidence,
      raw_headers_persisted: false,
    },
  });
  if (result.error) {
    return {
      recorded: false as const,
      reason: 'AUDIT_PERSISTENCE_FAILED' as const,
      error: result.error.message.slice(0, 300),
    };
  }
  return { recorded: true as const };
}
