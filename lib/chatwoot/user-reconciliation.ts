import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureChatwootUser,
  reconcileChatwootUser,
} from '@/lib/chatwoot/provisioning';
import { normalizeChatwootInt32Id } from '@/lib/chatwoot/tenant-bridge-slice-b';

type UserReceiptRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  user_mapping_id: string;
  mapping_version: number;
  smart_user_id: string;
  observed_chatwoot_user_id: number;
  observed_email: string;
  request_key: string;
  payload_hash: string;
  observed_at: string;
  expires_at: string;
  created_at: string;
};

function requireText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizeUserReceipt(value: unknown): UserReceiptRow {
  const single = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!single || typeof single !== 'object' || Array.isArray(single)) {
    throw new Error('Chatwoot User reconciliation receipt response is invalid');
  }

  const row = single as Record<string, unknown>;
  const observedUserId = normalizeChatwootInt32Id(
    row.observed_chatwoot_user_id,
  );
  if (observedUserId === null) {
    throw new Error('Chatwoot User reconciliation receipt ID is invalid');
  }

  if (
    typeof row.observed_email !== 'string' ||
    !row.observed_email.trim()
  ) {
    throw new Error('Chatwoot User reconciliation receipt email is invalid');
  }

  return {
    ...(row as unknown as UserReceiptRow),
    observed_chatwoot_user_id: observedUserId,
    observed_email: row.observed_email.trim().toLowerCase(),
  };
}

async function recordUserReceipt(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  mappingId: string;
  mappingVersion: number;
  smartUserId: string;
  chatwootUserId: number;
  email: string;
  requestKey: string;
}) {
  if (!Number.isInteger(input.mappingVersion) || input.mappingVersion < 1) {
    throw new Error('mappingVersion is invalid');
  }

  const chatwootUserId = normalizeChatwootInt32Id(input.chatwootUserId);
  if (chatwootUserId === null) throw new Error('chatwootUserId is invalid');

  const { data, error } = await input.service.rpc(
    'record_chatwoot_user_reconciliation',
    {
      p_organization_id: requireText(input.organizationId, 'organizationId'),
      p_tenant_business_id: requireText(
        input.tenantBusinessId,
        'tenantBusinessId',
      ),
      p_user_mapping_id: requireText(input.mappingId, 'mappingId'),
      p_expected_mapping_version: input.mappingVersion,
      p_smart_user_id: requireText(input.smartUserId, 'smartUserId'),
      p_observed_chatwoot_user_id: chatwootUserId,
      p_observed_email: requireText(input.email, 'email').toLowerCase(),
      p_request_key: requireText(input.requestKey, 'requestKey'),
    },
  );

  if (error) throw new Error(error.message);
  return normalizeUserReceipt(data);
}

export async function ensureAndRecordChatwootUser(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  mappingId: string;
  mappingVersion: number;
  smartUserId: string;
  email: string;
  trustedDisplayName?: string | null;
  requestKey: string;
  fetchImpl?: typeof fetch;
}) {
  const result = await ensureChatwootUser({
    smartUserId: input.smartUserId,
    email: input.email,
    trustedDisplayName: input.trustedDisplayName,
    fetchImpl: input.fetchImpl,
  });

  const receipt = await recordUserReceipt({
    service: input.service,
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    mappingId: input.mappingId,
    mappingVersion: input.mappingVersion,
    smartUserId: input.smartUserId,
    chatwootUserId: result.user.id,
    email: result.user.email,
    requestKey: input.requestKey,
  });

  return { user: result.user, outcome: result.outcome, receipt };
}

export async function reconcileAndRecordChatwootUser(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  mappingId: string;
  mappingVersion: number;
  smartUserId: string;
  chatwootUserId: number;
  email: string;
  requestKey: string;
  fetchImpl?: typeof fetch;
}) {
  const user = await reconcileChatwootUser({
    userId: input.chatwootUserId,
    smartUserId: input.smartUserId,
    email: input.email,
    fetchImpl: input.fetchImpl,
  });

  const receipt = await recordUserReceipt({
    service: input.service,
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    mappingId: input.mappingId,
    mappingVersion: input.mappingVersion,
    smartUserId: input.smartUserId,
    chatwootUserId: user.id,
    email: user.email,
    requestKey: input.requestKey,
  });

  return { user, receipt };
}
