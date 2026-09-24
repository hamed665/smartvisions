import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  reconcileChatwootAccountUser,
  removeChatwootAccountUser,
} from '@/lib/chatwoot/provisioning';
import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
  type ChatwootAccountRole,
} from '@/lib/chatwoot/tenant-bridge-slice-b';

type ReceiptRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  membership_id: string;
  membership_version: number;
  smart_user_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_user_mapping_id: string;
  chatwoot_account_id: number;
  chatwoot_user_id: number;
  prior_chatwoot_account_user_id: string | number | null;
  observed_presence: 'PRESENT' | 'ABSENT';
  observed_account_user_id: string | number | null;
  observed_role: ChatwootAccountRole | null;
  request_key: string;
  payload_hash: string;
  observed_at: string;
  expires_at: string;
  created_at: string;
};

function requirePositiveInt32(value: unknown, field: string) {
  const normalized = normalizeChatwootInt32Id(value);
  if (normalized === null) throw new Error(`${field} is invalid`);
  return normalized;
}

function requirePositiveInt64(value: unknown, field: string) {
  const normalized = normalizeChatwootInt64Id(value);
  if (normalized === null) throw new Error(`${field} is invalid`);
  return normalized;
}

function requireText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizeReceiptRow(value: unknown): ReceiptRow {
  const single =
    Array.isArray(value) && value.length === 1 ? value[0] : value;

  if (!single || typeof single !== 'object' || Array.isArray(single)) {
    throw new Error('Chatwoot reconciliation receipt response is invalid');
  }

  const row = single as Record<string, unknown>;
  const observedPresence = row.observed_presence;
  const observedRole = row.observed_role;

  if (
    observedPresence !== 'PRESENT' &&
    observedPresence !== 'ABSENT'
  ) {
    throw new Error('Chatwoot reconciliation receipt presence is invalid');
  }

  if (
    observedRole !== null &&
    observedRole !== 'agent' &&
    observedRole !== 'administrator'
  ) {
    throw new Error('Chatwoot reconciliation receipt role is invalid');
  }

  return {
    ...(row as unknown as ReceiptRow),
    prior_chatwoot_account_user_id:
      row.prior_chatwoot_account_user_id === null
        ? null
        : requirePositiveInt64(
            row.prior_chatwoot_account_user_id,
            'prior Chatwoot AccountUser ID',
          ),
    observed_account_user_id:
      row.observed_account_user_id === null
        ? null
        : requirePositiveInt64(
            row.observed_account_user_id,
            'observed Chatwoot AccountUser ID',
          ),
    observed_presence: observedPresence,
    observed_role: observedRole,
  };
}

async function recordReceipt(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  membershipId: string;
  membershipVersion: number;
  chatwootAccountId: number;
  chatwootUserId: number;
  presence: 'PRESENT' | 'ABSENT';
  accountUserId: string | null;
  role: ChatwootAccountRole | null;
  requestKey: string;
}) {
  if (!Number.isInteger(input.membershipVersion) || input.membershipVersion < 1) {
    throw new Error('membershipVersion is invalid');
  }

  const { data, error } = await input.service.rpc(
    'record_chatwoot_account_membership_reconciliation',
    {
      p_organization_id: requireText(input.organizationId, 'organizationId'),
      p_tenant_business_id: requireText(
        input.tenantBusinessId,
        'tenantBusinessId',
      ),
      p_membership_id: requireText(input.membershipId, 'membershipId'),
      p_expected_membership_version: input.membershipVersion,
      p_chatwoot_account_id: input.chatwootAccountId,
      p_chatwoot_user_id: input.chatwootUserId,
      p_observed_presence: input.presence,
      p_observed_account_user_id: input.accountUserId,
      p_observed_role: input.role,
      p_request_key: requireText(input.requestKey, 'requestKey'),
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeReceiptRow(data);
}

export async function reconcileAndRecordChatwootMembership(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  membershipId: string;
  membershipVersion: number;
  chatwootAccountId: number;
  chatwootUserId: number;
  requestKey: string;
  fetchImpl?: typeof fetch;
}) {
  const accountId = requirePositiveInt32(
    input.chatwootAccountId,
    'chatwootAccountId',
  );
  const userId = requirePositiveInt32(input.chatwootUserId, 'chatwootUserId');

  const observed = await reconcileChatwootAccountUser({
    accountId,
    userId,
    fetchImpl: input.fetchImpl,
  });

  if (!observed) {
    return recordReceipt({
      ...input,
      chatwootAccountId: accountId,
      chatwootUserId: userId,
      presence: 'ABSENT',
      accountUserId: null,
      role: null,
    });
  }

  return recordReceipt({
    ...input,
    chatwootAccountId: accountId,
    chatwootUserId: userId,
    presence: 'PRESENT',
    accountUserId: observed.id,
    role: observed.role,
  });
}

export async function removeAndRecordChatwootMembership(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  membershipId: string;
  membershipVersion: number;
  chatwootAccountId: number;
  chatwootUserId: number;
  expectedAccountUserId: string;
  requestKey: string;
  fetchImpl?: typeof fetch;
}) {
  const accountId = requirePositiveInt32(
    input.chatwootAccountId,
    'chatwootAccountId',
  );
  const userId = requirePositiveInt32(input.chatwootUserId, 'chatwootUserId');
  const accountUserId = requirePositiveInt64(
    input.expectedAccountUserId,
    'expectedAccountUserId',
  );

  await removeChatwootAccountUser({
    accountId,
    userId,
    expectedAccountUserId: accountUserId,
    fetchImpl: input.fetchImpl,
  });

  return recordReceipt({
    ...input,
    chatwootAccountId: accountId,
    chatwootUserId: userId,
    presence: 'ABSENT',
    accountUserId: null,
    role: null,
  });
}
