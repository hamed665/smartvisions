import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { evaluateChatwootProvisioningActivation } from '@/lib/chatwoot/activation-contract';
import {
  ChatwootProvisioningError,
  ensureChatwootAccountUser,
} from '@/lib/chatwoot/provisioning';
import {
  reconcileAndRecordChatwootMembership,
} from '@/lib/chatwoot/membership-reconciliation';
import {
  ensureAndRecordChatwootUser,
  reconcileAndRecordChatwootUser,
} from '@/lib/chatwoot/user-reconciliation';
import {
  isUuid,
} from '@/lib/chatwoot/tenant-bridge';
import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
  type ChatwootAccountRole,
} from '@/lib/chatwoot/tenant-bridge-slice-b';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

type UserMappingRow = {
  id: string;
  smart_user_id: string;
  chatwoot_user_id: number | null;
  status: 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'ARCHIVED';
  version: number;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  smart_user_id: string;
  chatwoot_user_mapping_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_account_user_id: string | number | null;
  effective_smart_role: 'OWNER' | 'ADMIN' | 'SALES_MANAGER' | 'SALES_AGENT';
  chatwoot_role: ChatwootAccountRole;
  status: 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'ARCHIVED';
  version: number;
};

type ActiveAccountMapping = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  chatwoot_account_id: number;
  status: 'ACTIVE';
};

function fail(message: string): never {
  throw new ChatwootProvisioningError('RECONCILIATION_REQUIRED', message);
}

function requestKey(parts: string[]) {
  const value = ['comm-tenant-bridge', ...parts, 'v1'].join(':');
  if (value.length > 200) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Chatwoot owner-access request key is too long',
    );
  }
  return value;
}

function requireExternalProvisioningActivation() {
  const activation = evaluateChatwootProvisioningActivation({
    deploymentEnvironment: process.env.DEPLOYMENT_ENV,
    provisioningEnabled: process.env.CHATWOOT_PROVISIONING_ENABLED,
    baseUrl: process.env.CHATWOOT_BASE_URL,
    platformToken: process.env.CHATWOOT_PLATFORM_TOKEN,
  });

  if (!activation.ready) {
    throw new ChatwootProvisioningError(
      'ACTIVATION_BLOCKED',
      'Chatwoot owner-access provisioning is blocked by the Production activation contract',
    );
  }
}

async function requireAuthenticatedOwner(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (
    authError ||
    !auth.user?.id ||
    !isUuid(auth.user.id) ||
    typeof auth.user.email !== 'string' ||
    !auth.user.email.trim()
  ) {
    return fail('Authenticated owner identity with canonical email is required');
  }

  const { data: membership, error: membershipError } = await input.supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', auth.user.id)
    .single();

  if (membershipError || membership?.role !== 'OWNER') {
    return fail('Organization OWNER authority is required');
  }

  return {
    userId: auth.user.id,
    email: auth.user.email.trim().toLowerCase(),
  };
}

async function loadActiveAccountMapping(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}): Promise<ActiveAccountMapping> {
  const { data, error } = await input.supabase
    .from('chatwoot_account_mappings')
    .select('id,organization_id,tenant_business_id,chatwoot_account_id,status')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('status', 'ACTIVE')
    .single();

  const accountId = normalizeChatwootInt32Id(data?.chatwoot_account_id);

  if (
    error ||
    !data ||
    !isUuid(data.id) ||
    data.organization_id !== input.organizationId ||
    data.tenant_business_id !== input.tenantBusinessId ||
    data.status !== 'ACTIVE' ||
    accountId === null
  ) {
    return fail('An ACTIVE verified Chatwoot Account mapping is required');
  }

  return {
    id: data.id,
    organization_id: data.organization_id,
    tenant_business_id: data.tenant_business_id,
    chatwoot_account_id: accountId,
    status: 'ACTIVE',
  };
}

function normalizeUserMapping(value: unknown, smartUserId: string): UserMappingRow {
  const row = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return fail('Chatwoot User mapping response is invalid');
  }

  const data = row as Record<string, unknown>;
  const status = data.status;
  const chatwootUserId =
    data.chatwoot_user_id === null
      ? null
      : normalizeChatwootInt32Id(data.chatwoot_user_id);

  if (
    !isUuid(data.id) ||
    data.smart_user_id !== smartUserId ||
    (status !== 'PROVISIONING' &&
      status !== 'ACTIVE' &&
      status !== 'DEGRADED' &&
      status !== 'ARCHIVED') ||
    !Number.isInteger(data.version) ||
    Number(data.version) < 1 ||
    (data.chatwoot_user_id !== null && chatwootUserId === null)
  ) {
    return fail('Chatwoot User mapping response does not match canonical owner identity');
  }

  return {
    id: data.id,
    smart_user_id: smartUserId,
    chatwoot_user_id: chatwootUserId,
    status,
    version: Number(data.version),
  };
}

function normalizeMembership(
  value: unknown,
  input: {
    organizationId: string;
    tenantBusinessId: string;
    smartUserId: string;
    userMappingId: string;
    accountMappingId: string;
  },
): MembershipRow {
  const row = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return fail('Chatwoot Account membership response is invalid');
  }

  const data = row as Record<string, unknown>;
  const role = data.chatwoot_role;
  const smartRole = data.effective_smart_role;
  const status = data.status;
  const accountUserId =
    data.chatwoot_account_user_id === null
      ? null
      : normalizeChatwootInt64Id(data.chatwoot_account_user_id);

  if (
    !isUuid(data.id) ||
    data.organization_id !== input.organizationId ||
    data.tenant_business_id !== input.tenantBusinessId ||
    data.smart_user_id !== input.smartUserId ||
    data.chatwoot_user_mapping_id !== input.userMappingId ||
    data.chatwoot_account_mapping_id !== input.accountMappingId ||
    smartRole !== 'OWNER' ||
    role !== 'administrator' ||
    (status !== 'PROVISIONING' &&
      status !== 'ACTIVE' &&
      status !== 'DEGRADED' &&
      status !== 'ARCHIVED') ||
    !Number.isInteger(data.version) ||
    Number(data.version) < 1 ||
    (data.chatwoot_account_user_id !== null && accountUserId === null)
  ) {
    return fail('Chatwoot Account membership response does not match OWNER projection');
  }

  return {
    id: data.id,
    organization_id: input.organizationId,
    tenant_business_id: input.tenantBusinessId,
    smart_user_id: input.smartUserId,
    chatwoot_user_mapping_id: input.userMappingId,
    chatwoot_account_mapping_id: input.accountMappingId,
    chatwoot_account_user_id: accountUserId,
    effective_smart_role: 'OWNER',
    chatwoot_role: 'administrator',
    status,
    version: Number(data.version),
  };
}

export async function provisionCurrentOwnerChatwootAccess(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  fetchImpl?: typeof fetch;
}) {
  requireExternalProvisioningActivation();

  if (!isUuid(input.organizationId) || !isUuid(input.tenantBusinessId)) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Organization and tenant Business identifiers must be canonical UUIDs',
    );
  }

  const owner = await requireAuthenticatedOwner(input);
  const accountMapping = await loadActiveAccountMapping(input);

  const createUserKey = requestKey([
    input.tenantBusinessId,
    owner.userId,
    'owner-user-mapping',
  ]);

  const { data: userMappingData, error: userMappingError } =
    await input.supabase.rpc('create_chatwoot_user_mapping', {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_smart_user_id: owner.userId,
      p_request_key: createUserKey,
    });

  if (userMappingError) {
    return fail('Chatwoot User mapping could not be prepared');
  }

  let userMapping = normalizeUserMapping(userMappingData, owner.userId);
  if (userMapping.status === 'ARCHIVED') {
    return fail('ARCHIVED Chatwoot User mapping is terminal');
  }

  const service = createSupabaseServiceClient();

  if (userMapping.status === 'ACTIVE') {
    if (userMapping.chatwoot_user_id === null) {
      return fail('ACTIVE Chatwoot User mapping lacks an external User ID');
    }

    await reconcileAndRecordChatwootUser({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      mappingId: userMapping.id,
      mappingVersion: userMapping.version,
      smartUserId: owner.userId,
      chatwootUserId: userMapping.chatwoot_user_id,
      email: owner.email,
      requestKey: requestKey([
        input.tenantBusinessId,
        owner.userId,
        'owner-user-reconcile',
        String(userMapping.version),
      ]),
      fetchImpl: input.fetchImpl,
    });
  } else {
    const userEvidence = await ensureAndRecordChatwootUser({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      mappingId: userMapping.id,
      mappingVersion: userMapping.version,
      smartUserId: owner.userId,
      email: owner.email,
      trustedDisplayName: null,
      requestKey: requestKey([
        input.tenantBusinessId,
        owner.userId,
        'owner-user-receipt',
        String(userMapping.version),
      ]),
      fetchImpl: input.fetchImpl,
    });

    const { data: activatedData, error: activatedError } =
      await input.supabase.rpc('activate_chatwoot_user_mapping_verified', {
        p_organization_id: input.organizationId,
        p_tenant_business_id: input.tenantBusinessId,
        p_smart_user_id: owner.userId,
        p_mapping_id: userMapping.id,
        p_expected_version: userMapping.version,
        p_receipt_id: userEvidence.receipt.id,
        p_request_key: requestKey([
          input.tenantBusinessId,
          owner.userId,
          'owner-user-activate',
          String(userMapping.version),
        ]),
      });

    if (activatedError) {
      return fail('Verified Chatwoot User activation requires reconciliation');
    }

    userMapping = normalizeUserMapping(activatedData, owner.userId);
    if (
      userMapping.status !== 'ACTIVE' ||
      userMapping.chatwoot_user_id !== userEvidence.user.id
    ) {
      return fail('Activated Chatwoot User mapping does not match external evidence');
    }
  }

  if (userMapping.chatwoot_user_id === null) {
    return fail('Verified Chatwoot User ID is unavailable');
  }

  const { data: membershipData, error: membershipError } =
    await input.supabase.rpc('create_chatwoot_account_membership', {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_smart_user_id: owner.userId,
      p_chatwoot_user_mapping_id: userMapping.id,
      p_chatwoot_account_mapping_id: accountMapping.id,
      p_request_key: requestKey([
        input.tenantBusinessId,
        owner.userId,
        'owner-account-membership',
      ]),
    });

  if (membershipError) {
    return fail('Chatwoot OWNER Account membership could not be prepared');
  }

  let membership = normalizeMembership(membershipData, {
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    smartUserId: owner.userId,
    userMappingId: userMapping.id,
    accountMappingId: accountMapping.id,
  });

  if (membership.status === 'ARCHIVED') {
    return fail('ARCHIVED Chatwoot OWNER membership is terminal');
  }

  if (membership.status === 'ACTIVE') {
    if (membership.chatwoot_account_user_id === null) {
      return fail('ACTIVE Chatwoot OWNER membership lacks external identity');
    }

    const receipt = await reconcileAndRecordChatwootMembership({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      membershipId: membership.id,
      membershipVersion: membership.version,
      chatwootAccountId: accountMapping.chatwoot_account_id,
      chatwootUserId: userMapping.chatwoot_user_id,
      requestKey: requestKey([
        input.tenantBusinessId,
        owner.userId,
        'owner-membership-reconcile',
        String(membership.version),
      ]),
      fetchImpl: input.fetchImpl,
    });

    if (
      receipt.observed_presence !== 'PRESENT' ||
      receipt.observed_account_user_id !== membership.chatwoot_account_user_id ||
      receipt.observed_role !== 'administrator'
    ) {
      return fail('ACTIVE Chatwoot OWNER membership has external identity drift');
    }
  } else {
    const externalMembership = await ensureChatwootAccountUser({
      accountId: accountMapping.chatwoot_account_id,
      userId: userMapping.chatwoot_user_id,
      role: 'administrator',
      fetchImpl: input.fetchImpl,
    });

    const receipt = await reconcileAndRecordChatwootMembership({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      membershipId: membership.id,
      membershipVersion: membership.version,
      chatwootAccountId: accountMapping.chatwoot_account_id,
      chatwootUserId: userMapping.chatwoot_user_id,
      requestKey: requestKey([
        input.tenantBusinessId,
        owner.userId,
        'owner-membership-receipt',
        String(membership.version),
      ]),
      fetchImpl: input.fetchImpl,
    });

    if (
      receipt.observed_presence !== 'PRESENT' ||
      receipt.observed_account_user_id !== externalMembership.accountUser.id ||
      receipt.observed_role !== 'administrator'
    ) {
      return fail('Chatwoot OWNER membership reconciliation did not confirm mutation');
    }

    const { data: activatedMembershipData, error: activatedMembershipError } =
      await input.supabase.rpc(
        'activate_chatwoot_account_membership_verified',
        {
          p_organization_id: input.organizationId,
          p_tenant_business_id: input.tenantBusinessId,
          p_membership_id: membership.id,
          p_expected_version: membership.version,
          p_receipt_id: receipt.id,
          p_request_key: requestKey([
            input.tenantBusinessId,
            owner.userId,
            'owner-membership-activate',
            String(membership.version),
          ]),
        },
      );

    if (activatedMembershipError) {
      return fail('Verified Chatwoot OWNER membership activation requires reconciliation');
    }

    membership = normalizeMembership(activatedMembershipData, {
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      smartUserId: owner.userId,
      userMappingId: userMapping.id,
      accountMappingId: accountMapping.id,
    });

    if (
      membership.status !== 'ACTIVE' ||
      membership.chatwoot_account_user_id !== externalMembership.accountUser.id
    ) {
      return fail('Activated Chatwoot OWNER membership does not match external evidence');
    }
  }

  return {
    tenantBusinessId: input.tenantBusinessId,
    chatwootAccountId: accountMapping.chatwoot_account_id,
    chatwootUserId: userMapping.chatwoot_user_id,
    userMappingStatus: userMapping.status,
    membershipStatus: membership.status,
    chatwootRole: membership.chatwoot_role,
  };
}
