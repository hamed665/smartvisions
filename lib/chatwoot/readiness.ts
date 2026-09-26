import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeChatwootAccessToken, normalizeChatwootBaseUrl } from '@/lib/chatwoot/http-contract';
import { buildChatwootReadiness } from '@/lib/chatwoot/readiness-contract';

const HEALTH_TIMEOUT_MS = 3_000;

async function countScopedRows(
  supabase: SupabaseClient,
  table: string,
  organizationId: string,
  statuses?: string[],
) {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (statuses?.length) {
    query = query.in('status', statuses);
  }

  const { count, error } = await query;

  if (error) throw new Error(`Unable to read ${table} readiness state`);
  return count ?? 0;
}

async function readChatwootHealth(baseUrl: string | null) {
  if (!baseUrl) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;

    const text = await response.text();
    if (text.length > 512) return false;

    const payload = JSON.parse(text) as { status?: unknown };
    return payload.status === 'woot';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadChatwootReadiness(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const baseUrl = normalizeChatwootBaseUrl(process.env.CHATWOOT_BASE_URL, {
    allowInsecureLocalhost: false,
  });

  const [
    chatwootHealthy,
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
    countScopedRows(input.supabase, 'brands', input.organizationId, ['ACTIVE']),
    countScopedRows(input.supabase, 'tenant_businesses', input.organizationId, ['ACTIVE']),
    countScopedRows(input.supabase, 'communication_channel_bindings', input.organizationId, ['ACTIVE']),
    countScopedRows(
      input.supabase,
      'chatwoot_account_mappings',
      input.organizationId,
      ['PROVISIONING', 'ACTIVE', 'DEGRADED'],
    ),
    countScopedRows(input.supabase, 'chatwoot_user_mappings', input.organizationId),
    countScopedRows(input.supabase, 'chatwoot_account_memberships', input.organizationId),
    countScopedRows(input.supabase, 'chatwoot_inbox_mappings', input.organizationId),
    countScopedRows(input.supabase, 'chatwoot_team_mappings', input.organizationId),
  ]);

  return buildChatwootReadiness({
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
    chatwootHealthy,
    brandCount,
    tenantBusinessCount,
    communicationBindingCount,
    accountMappingCount,
    userMappingCount,
    membershipCount,
    inboxMappingCount,
    teamMappingCount,
  });
}
