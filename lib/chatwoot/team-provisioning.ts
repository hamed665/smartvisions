import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  chatwootAdminAccountRequest,
  requireChatwootAdminProjection,
} from '@/lib/chatwoot/account-admin-request';
import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { ChatwootProvisioningError } from '@/lib/chatwoot/provisioning';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import { normalizeChatwootInt64Id } from '@/lib/chatwoot/tenant-bridge-slice-b';

type TeamMappingRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  smart_team_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_team_id: string | number | null;
  projected_name: string;
  status: 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'ARCHIVED';
  version: number;
  last_request_key: string;
};

type TeamProjection = {
  id: string;
  name: string;
  description: string;
};

function requireUuid(value: string, field: string) {
  const normalized = value.trim();
  if (!isUuid(normalized)) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      `${field} must be a canonical UUID`,
    );
  }
  return normalized;
}

function childKey(base: string, suffix: string) {
  const root = base.trim();
  const value = `${root}:${suffix}`;
  if (!root || root.length > 160 || value.length > 200) {
    throw new ChatwootProvisioningError('INVALID_INPUT', 'requestKey is invalid');
  }
  return value;
}

function normalizeMapping(value: unknown): TeamMappingRow {
  const single = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!single || typeof single !== 'object' || Array.isArray(single)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Team mapping response is invalid',
    );
  }
  return single as TeamMappingRow;
}

function teamMarker(smartTeamId: string, tenantBusinessId: string) {
  return `smartvisions:team:${smartTeamId};business:${tenantBusinessId};v=1`;
}

function parseTeam(
  value: unknown,
  expected: { projectedName: string; description: string },
): TeamProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Team response is invalid',
    );
  }

  const row = value as Record<string, unknown>;
  const id = normalizeChatwootInt64Id(row.id);
  const name = typeof row.name === 'string' ? row.name.trim().toLowerCase() : '';
  const description =
    typeof row.description === 'string' ? row.description.trim() : '';

  if (
    id === null ||
    name !== expected.projectedName.trim().toLowerCase() ||
    description !== expected.description
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Team does not match the Smart projection contract',
    );
  }

  return { id, name, description };
}

async function reconcileTeam(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  projectedName: string;
  description: string;
  fetchImpl?: typeof fetch;
}) {
  const raw = await chatwootAdminAccountRequest<unknown>({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    resourcePath: '/teams',
    method: 'GET',
    fetchImpl: input.fetchImpl,
  });

  if (!Array.isArray(raw)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Team list response is invalid',
    );
  }

  const matches = raw.filter((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return (value as Record<string, unknown>).description === input.description;
  });

  if (matches.length > 1) {
    throw new ChatwootProvisioningError(
      'DUPLICATE_MATCH',
      'Multiple Chatwoot Teams match the Smart projection marker',
    );
  }

  return matches.length === 1
    ? parseTeam(matches[0], {
        projectedName: input.projectedName,
        description: input.description,
      })
    : null;
}

async function createOrReconcileTeam(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  projectedName: string;
  description: string;
  fetchImpl?: typeof fetch;
}) {
  const existing = await reconcileTeam(input);
  if (existing) return { team: existing, outcome: 'RECONCILED_EXISTING' as const };

  try {
    const created = await chatwootAdminAccountRequest<unknown>({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      resourcePath: '/teams',
      method: 'POST',
      body: {
        team: {
          name: input.projectedName,
          description: input.description,
          allow_auto_assign: false,
        },
      },
      fetchImpl: input.fetchImpl,
    });

    return {
      team: parseTeam(created, {
        projectedName: input.projectedName,
        description: input.description,
      }),
      outcome: 'CREATED' as const,
    };
  } catch (error) {
    if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
      throw error;
    }

    const reconciled = await reconcileTeam(input);
    if (!reconciled) {
      throw new ChatwootProvisioningError(
        'RECONCILIATION_REQUIRED',
        'Ambiguous Chatwoot Team create is not confirmed by marker reconciliation',
      );
    }

    return {
      team: reconciled,
      outcome: 'RECONCILED_AFTER_AMBIGUOUS_CREATE' as const,
    };
  }
}

async function recordTeamReceipt(input: {
  organizationId: string;
  tenantBusinessId: string;
  mapping: TeamMappingRow;
  team: TeamProjection;
  requestKey: string;
}) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc(
    'record_chatwoot_team_reconciliation',
    {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_team_mapping_id: input.mapping.id,
      p_expected_mapping_version: input.mapping.version,
      p_observed_chatwoot_team_id: input.team.id,
      p_observed_name: input.team.name,
      p_observed_description: input.team.description,
      p_request_key: input.requestKey,
    },
  );

  if (error) {
    throw new ChatwootProvisioningError(
      'RECONCILIATION_REQUIRED',
      'Chatwoot Team reconciliation receipt could not be persisted',
    );
  }

  const single = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (
    !single ||
    typeof single !== 'object' ||
    Array.isArray(single) ||
    !isUuid(String((single as Record<string, unknown>).id ?? ''))
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Team reconciliation receipt response is invalid',
    );
  }

  return single as Record<string, unknown>;
}

export async function provisionChatwootTeam(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  smartTeamId: string;
  chatwootAccountMappingId: string;
  requestKey: string;
  fetchImpl?: typeof fetch;
}) {
  const organizationId = requireUuid(input.organizationId, 'organizationId');
  const tenantBusinessId = requireUuid(
    input.tenantBusinessId,
    'tenantBusinessId',
  );
  const smartTeamId = requireUuid(input.smartTeamId, 'smartTeamId');
  const accountMappingId = requireUuid(
    input.chatwootAccountMappingId,
    'chatwootAccountMappingId',
  );
  await requireChatwootAdminProjection({
    supabase: input.supabase,
    organizationId,
    tenantBusinessId,
  });

  const createRequestKey = childKey(input.requestKey, 'create');
  const receiptRequestKey = childKey(input.requestKey, 'receipt');
  const activateRequestKey = childKey(input.requestKey, 'activate');

  const { data: mappingData, error: mappingError } = await input.supabase.rpc(
    'create_chatwoot_team_mapping',
    {
      p_organization_id: organizationId,
      p_tenant_business_id: tenantBusinessId,
      p_smart_team_id: smartTeamId,
      p_chatwoot_account_mapping_id: accountMappingId,
      p_request_key: createRequestKey,
    },
  );

  if (mappingError) {
    throw new ChatwootProvisioningError(
      'RECONCILIATION_REQUIRED',
      'Chatwoot Team mapping could not be claimed',
    );
  }

  const mapping = normalizeMapping(mappingData);
  if (
    !isUuid(mapping.id) ||
    mapping.organization_id !== organizationId ||
    mapping.tenant_business_id !== tenantBusinessId ||
    mapping.smart_team_id !== smartTeamId ||
    mapping.chatwoot_account_mapping_id !== accountMappingId ||
    !mapping.projected_name ||
    !['PROVISIONING', 'ACTIVE', 'DEGRADED', 'ARCHIVED'].includes(mapping.status) ||
    !Number.isInteger(mapping.version) ||
    mapping.version < 1
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Team mapping does not match requested scope',
    );
  }

  if (mapping.status === 'ACTIVE') {
    if (normalizeChatwootInt64Id(mapping.chatwoot_team_id) === null) {
      throw new ChatwootProvisioningError(
        'UPSTREAM_MISMATCH',
        'ACTIVE Chatwoot Team mapping is incomplete',
      );
    }
    return { mapping, outcome: 'ALREADY_ACTIVE' as const };
  }

  if (mapping.status === 'ARCHIVED') {
    throw new ChatwootProvisioningError(
      'IDENTITY_CONFLICT',
      'ARCHIVED Chatwoot Team mapping is terminal',
    );
  }

  const description = teamMarker(smartTeamId, tenantBusinessId);
  const external = await createOrReconcileTeam({
    supabase: input.supabase,
    organizationId,
    tenantBusinessId,
    projectedName: mapping.projected_name,
    description,
    fetchImpl: input.fetchImpl,
  });

  const receipt = await recordTeamReceipt({
    organizationId,
    tenantBusinessId,
    mapping,
    team: external.team,
    requestKey: receiptRequestKey,
  });

  const { data: activatedData, error: activatedError } = await input.supabase.rpc(
    'activate_chatwoot_team_mapping_verified',
    {
      p_organization_id: organizationId,
      p_tenant_business_id: tenantBusinessId,
      p_team_mapping_id: mapping.id,
      p_expected_version: mapping.version,
      p_receipt_id: String(receipt.id),
      p_request_key: activateRequestKey,
    },
  );

  if (activatedError) {
    throw new ChatwootProvisioningError(
      'RECONCILIATION_REQUIRED',
      'Chatwoot Team activation requires reconciliation',
    );
  }

  const activated = normalizeMapping(activatedData);
  if (
    activated.id !== mapping.id ||
    activated.status !== 'ACTIVE' ||
    normalizeChatwootInt64Id(activated.chatwoot_team_id) !== external.team.id
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Activated Chatwoot Team mapping is inconsistent',
    );
  }

  return { mapping: activated, outcome: external.outcome };
}
