import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeChatwootAccessToken,
  normalizeChatwootBaseUrl,
} from '@/lib/chatwoot/http-contract';
import { buildChatwootReadiness } from '@/lib/chatwoot/readiness-contract';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

// The remote Production health route can take several seconds to respond.
// Keep one bounded GET and the exact health contract; do not retry or bypass it.
const HEALTH_TIMEOUT_MS = 10_000;

async function requireOwnerContext(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id) {
    throw new Error('Chatwoot readiness requires authenticated OWNER context');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .single();

  if (membershipError || membership?.role !== 'OWNER') {
    throw new Error('Chatwoot readiness requires authenticated OWNER context');
  }
}

async function countScopedRows(
  service: SupabaseClient,
  table: string,
  organizationId: string,
  statuses?: string[],
) {
  let query = service
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (statuses?.length) query = query.in('status', statuses);

  const { count, error } = await query;
  if (error) throw new Error('Unable to read ' + table + ' readiness state');
  return count ?? 0;
}

async function countScopedUserMappings(
  service: SupabaseClient,
  organizationId: string,
) {
  const { data, error } = await service
    .from('chatwoot_account_memberships')
    .select('chatwoot_user_mapping_id')
    .eq('organization_id', organizationId)
    .in('status', ['PROVISIONING', 'ACTIVE', 'DEGRADED']);

  if (error) {
    throw new Error('Unable to read Chatwoot User mapping readiness state');
  }

  return new Set(
    (data ?? [])
      .map((row) => row.chatwoot_user_mapping_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  ).size;
}

async function readChatwootHealth(baseUrl: string | null) {
  const startedAt = Date.now();
  let httpStatus: number | null = null;
  const result = (code: 'HEALTHY' | 'BASE_URL_MISSING' | 'HTTP_ERROR' | 'BODY_TOO_LARGE' | 'INVALID_JSON' | 'UNEXPECTED_STATUS' | 'TIMEOUT' | 'NETWORK_OR_REDIRECT_ERROR') => ({
    healthy: code === 'HEALTHY', code, httpStatus, latencyMs: Math.max(0, Date.now() - startedAt),
  });
  if (!baseUrl) return result('BASE_URL_MISSING');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl + '/health', {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    httpStatus = response.status;
    if (!response.ok) return result('HTTP_ERROR');

    const body = await response.text();
    if (body.length > 512) return result('BODY_TOO_LARGE');

    let payload: { status?: unknown } | null;
    try {
      payload = JSON.parse(body) as { status?: unknown } | null;
    } catch {
      return result('INVALID_JSON');
    }
    return result(payload?.status === 'woot' ? 'HEALTHY' : 'UNEXPECTED_STATUS');
  } catch {
    return result(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_REDIRECT_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadChatwootReadiness(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  await requireOwnerContext(input.supabase, input.organizationId);

  const service = createSupabaseServiceClient();
  const baseUrl = normalizeChatwootBaseUrl(process.env.CHATWOOT_BASE_URL, {
    allowInsecureLocalhost: false,
  });

  const [
    healthProbe,
    brandCount,
    tenantBusinessCount,
    communicationBindingCount,
    accountMappingCount,
    userMappingCount,
    membershipCount,
    inboxMappingCount,
    teamMappingCount,
  ] = await Promise.all([
    readChatwootHealth(baseUrl),
    countScopedRows(service, 'brands', input.organizationId, ['ACTIVE']),
    countScopedRows(service, 'tenant_businesses', input.organizationId, ['ACTIVE']),
    countScopedRows(
      service,
      'communication_channel_bindings',
      input.organizationId,
      ['ACTIVE'],
    ),
    countScopedRows(
      service,
      'chatwoot_account_mappings',
      input.organizationId,
      ['PROVISIONING', 'ACTIVE', 'DEGRADED'],
    ),
    countScopedUserMappings(service, input.organizationId),
    countScopedRows(
      service,
      'chatwoot_account_memberships',
      input.organizationId,
      ['PROVISIONING', 'ACTIVE', 'DEGRADED'],
    ),
    countScopedRows(
      service,
      'chatwoot_inbox_mappings',
      input.organizationId,
      ['PROVISIONING', 'ACTIVE', 'DEGRADED'],
    ),
    countScopedRows(
      service,
      'chatwoot_team_mappings',
      input.organizationId,
      ['PROVISIONING', 'ACTIVE', 'DEGRADED'],
    ),
  ]);

  const readiness = buildChatwootReadiness({
    deploymentEnvironment:
      typeof process.env.DEPLOYMENT_ENV === 'string'
        ? process.env.DEPLOYMENT_ENV
        : null,
    provisioningEnabled:
      process.env.CHATWOOT_PROVISIONING_ENABLED === 'true',
    baseUrlValid: Boolean(baseUrl),
    platformTokenConfigured: Boolean(
      normalizeChatwootAccessToken(process.env.CHATWOOT_PLATFORM_TOKEN),
    ),
    chatwootHealthy: healthProbe.healthy,
    brandCount,
    tenantBusinessCount,
    communicationBindingCount,
    accountMappingCount,
    userMappingCount,
    membershipCount,
    inboxMappingCount,
    teamMappingCount,
  });
  return { ...readiness, healthProbe: {
    code: healthProbe.code, httpStatus: healthProbe.httpStatus, latencyMs: healthProbe.latencyMs,
  } };
}
