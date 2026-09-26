import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { evaluateChatwootProvisioningActivation } from '@/lib/chatwoot/activation-contract';
import {
  ensureAndRecordChatwootMembership,
  reconcileAndRecordChatwootMembership,
} from '@/lib/chatwoot/membership-reconciliation';
import {
  ChatwootProvisioningError,
} from '@/lib/chatwoot/provisioning';
import { normalizeCanonicalEmail } from '@/lib/chatwoot/provisioning-contract';
import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
} from '@/lib/chatwoot/tenant-bridge-slice-b';
import {
  ensureAndRecordChatwootUser,
  reconcileAndRecordChatwootUser,
} from '@/lib/chatwoot/user-reconciliation';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

type ProjectionStatus = 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'ARCHIVED';

type UserMappingRow = {
  id: string;
  smart_user_id: string;
  chatwoot_user_id: number | null;
  status: ProjectionStatus;
  version: number;
};

type AccountMappingRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  chatwoot_account_id: number | null;
  status: ProjectionStatus;
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
  effective_smart_role: string;
  chatwoot_role: string;
  status: ProjectionStatus;
  version: number;
};

function blocked(message: string): never {
  throw new ChatwootProvisioningError('ACTIVATION_BLOCKED', message);
}

function fail(message: string): never {
  throw new ChatwootProvisioningError('RECONCILIATION_REQUIRED', message);
}

function activationReady() {
  return evaluateChatwootProvisioningActivation({
    deploymentEnvironment: process.env.DEPLOYMENT_ENV,
    provisioningEnabled: process.env.CHATWOOT_PROVISIONING_ENABLED,
    baseUrl: process.env.CHATWOOT_BASE_URL,
    platformToken: process.env.CHATWOOT_PLATFORM_TOKEN,
  }).ready;
}

function singleRpcRow<T>(value: unknown, field: string): T {
  const row = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : null
    : value;

  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return fail(`${field} response is invalid`);
  }
  return row as T;
}

function liveStatus(value: unknown): value is ProjectionStatus {
  return (
    value === 'PROVISIONING' ||
    value === 'ACTIVE' ||
    value === 'DEGRADED' ||
    value === 'ARCHIVED'
  );
}

function requestKey(parts: Array<string | number>) {
  const key = ['comm-tenant-bridge', ...parts.map(String), 'v1'].join(':');
  if (key.length > 200) return fail('Projection request key is too long');
  return key;
}

async function requireOwnerScope(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  const smartUserId = auth.user?.id;
  const email = normalizeCanonicalEmail(auth.user?.email);

  if (
    authError ||
    !smartUserId ||
    !isUuid(smartUserId) ||
    !email
  ) {
    return fail('Authenticated Smart OWNER identity with canonical email is required');
  }

  const [member, business, accountMapping] = await Promise.all([
    input.supabase
      .from('organization_members')
      .select('organization_id,user_id,role')
      .eq('organization_id', input.organizationId)
      .eq('user_id', smartUserId)
      .single(),
    input.supabase
      .from('tenant_businesses')
      .select('id,organization_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', input.tenantBusinessId)
      .single(),
    input.supabase
      .from('chatwoot_account_mappings')
      .select(
        'id,organization_id,tenant_business_id,chatwoot_account_id,status,version',
      )
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', input.tenantBusinessId)
      .eq('status', 'ACTIVE')
      .single(),
  ]);

  const account = accountMapping.data as AccountMappingRow | null;
  const accountId = normalizeChatwootInt32Id(account?.chatwoot_account_id);

  if (
    member.error ||
    member.data?.organization_id !== input.organizationId ||
    member.data?.user_id !== smartUserId ||
    member.data?.role !== 'OWNER' ||
    business.error ||
    business.data?.id !== input.tenantBusinessId ||
    business.data?.organization_id !== input.organizationId ||
    business.data?.status !== 'ACTIVE' ||
    accountMapping.error ||
    !account ||
    account.organization_id !== input.organizationId ||
    account.tenant_business_id !== input.tenantBusinessId ||
    account.status !== 'ACTIVE' ||
    accountId === null ||
    !Number.isInteger(account.version) ||
    account.version < 1
  ) {
    return fail('Canonical OWNER, Business, or ACTIVE Chatwoot Account projection is unavailable');
  }

  return {
    smartUserId,
    email,
    accountMapping: {
      ...account,
      chatwoot_account_id: accountId,
    },
  };
}

function validateUserMapping(
  value: unknown,
  smartUserId: string,
): UserMappingRow {
  const row = singleRpcRow<UserMappingRow>(value, 'Chatwoot User mapping');
  const externalId =
    row.chatwoot_user_id === null
      ? null
      : normalizeChatwootInt32Id(row.chatwoot_user_id);

  if (
    !isUuid(row.id) ||
    row.smart_user_id !== smartUserId ||
    !liveStatus(row.status) ||
    row.status === 'ARCHIVED' ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    (row.chatwoot_user_id !== null && externalId === null) ||
    (row.status === 'ACTIVE' && externalId === null)
  ) {
    return fail('Chatwoot User mapping scope/state is invalid');
  }

  return {
    ...row,
    chatwoot_user_id: externalId,
  };
}

function validateMembership(
  value: unknown,
  input: {
    organizationId: string;
    tenantBusinessId: string;
    smartUserId: string;
    userMappingId: string;
    accountMappingId: string;
  },
): MembershipRow {
  const row = singleRpcRow<MembershipRow>(
    value,
    'Chatwoot Account membership',
  );
  const externalId =
    row.chatwoot_account_user_id === null
      ? null
      : normalizeChatwootInt64Id(row.chatwoot_account_user_id);

  if (
    !isUuid(row.id) ||
    row.organization_id !== input.organizationId ||
    row.tenant_business_id !== input.tenantBusinessId ||
    row.smart_user_id !== input.smartUserId ||
    row.chatwoot_user_mapping_id !== input.userMappingId ||
    row.chatwoot_account_mapping_id !== input.accountMappingId ||
    row.effective_smart_role !== 'OWNER' ||
    row.chatwoot_role !== 'administrator' ||
    !liveStatus(row.status) ||
    row.status === 'ARCHIVED' ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    (row.chatwoot_account_user_id !== null && externalId === null) ||
    (row.status === 'ACTIVE' && externalId === null)
  ) {
    return fail('Chatwoot OWNER membership scope/state is invalid');
  }

  return {
    ...row,
    chatwoot_account_user_id: externalId,
  };
}

async function activateUserMapping(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  smartUserId: string;
  mapping: UserMappingRow;
  receiptId: string;
}) {
  const { data, error } = await input.supabase.rpc(
    'activate_chatwoot_user_mapping_verified',
    {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_smart_user_id: input.smartUserId,
      p_mapping_id: input.mapping.id,
      p_expected_version: input.mapping.version,
      p_receipt_id: input.receiptId,
      p_request_key: requestKey([
        input.mapping.id,
        'user-activate',
        input.mapping.version,
      ]),
    },
  );

  if (error) return fail('Verified Chatwoot User activation failed');
  const activated = validateUserMapping(data, input.smartUserId);
  if (activated.status !== 'ACTIVE' || activated.chatwoot_user_id === null) {
    return fail('Verified Chatwoot User activation did not become ACTIVE');
  }
  return activated;
}

async function activateMembership(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  membership: MembershipRow;
  receiptId: string;
  smartUserId: string;
  userMappingId: string;
  accountMappingId: string;
}) {
  const { data, error } = await input.supabase.rpc(
    'activate_chatwoot_account_membership_verified',
    {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_membership_id: input.membership.id,
      p_expected_version: input.membership.version,
      p_receipt_id: input.receiptId,
      p_request_key: requestKey([
        input.membership.id,
        'membership-activate',
        input.membership.version,
      ]),
    },
  );

  if (error) return fail('Verified Chatwoot OWNER membership activation failed');

  const activated = validateMembership(data, {
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    smartUserId: input.smartUserId,
    userMappingId: input.userMappingId,
    accountMappingId: input.accountMappingId,
  });

  if (
    activated.status !== 'ACTIVE' ||
    activated.chatwoot_account_user_id === null
  ) {
    return fail('Verified Chatwoot OWNER membership did not become ACTIVE');
  }
  return activated;
}

export async function provisionChatwootOwnerMembership(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  fetchImpl?: typeof fetch;
}) {
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.tenantBusinessId)
  ) {
    return fail('Chatwoot OWNER projection identifiers are invalid');
  }

  // This must happen before create_* mapping RPCs. Credential/activation
  // absence cannot leave durable projection claims behind.
  if (!activationReady()) {
    return blocked('Chatwoot external provisioning activation is not ready');
  }

  const owner = await requireOwnerScope(input);
  const service = createSupabaseServiceClient();

  const userCreateKey = requestKey([
    input.tenantBusinessId,
    owner.smartUserId,
    'owner-user-map',
  ]);

  const userCreate = await input.supabase.rpc('create_chatwoot_user_mapping', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_smart_user_id: owner.smartUserId,
    p_request_key: userCreateKey,
  });
  if (userCreate.error) return fail('Chatwoot User mapping preparation failed');

  let userMapping = validateUserMapping(
    userCreate.data,
    owner.smartUserId,
  );

  if (userMapping.status === 'ACTIVE') {
    const reconciled = await reconcileAndRecordChatwootUser({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      mappingId: userMapping.id,
      mappingVersion: userMapping.version,
      smartUserId: owner.smartUserId,
      chatwootUserId: userMapping.chatwoot_user_id!,
      email: owner.email,
      requestKey: requestKey([
        userMapping.id,
        'user-reconcile',
        userMapping.version,
      ]),
      fetchImpl: input.fetchImpl,
    });

    if (reconciled.user.id !== userMapping.chatwoot_user_id) {
      return fail('ACTIVE Chatwoot User mapping has external identity drift');
    }
  } else {
    const observed = await ensureAndRecordChatwootUser({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      mappingId: userMapping.id,
      mappingVersion: userMapping.version,
      smartUserId: owner.smartUserId,
      email: owner.email,
      trustedDisplayName: null,
      requestKey: requestKey([
        userMapping.id,
        'user-evidence',
        userMapping.version,
      ]),
      fetchImpl: input.fetchImpl,
    });

    userMapping = await activateUserMapping({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      smartUserId: owner.smartUserId,
      mapping: userMapping,
      receiptId: observed.receipt.id,
    });
  }

  if (userMapping.chatwoot_user_id === null) {
    return fail('ACTIVE Chatwoot User mapping lacks an external User ID');
  }

  const membershipCreate = await input.supabase.rpc(
    'create_chatwoot_account_membership',
    {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_smart_user_id: owner.smartUserId,
      p_chatwoot_user_mapping_id: userMapping.id,
      p_chatwoot_account_mapping_id: owner.accountMapping.id,
      p_request_key: requestKey([
        input.tenantBusinessId,
        owner.smartUserId,
        'owner-membership',
      ]),
    },
  );
  if (membershipCreate.error) {
    return fail('Chatwoot OWNER membership preparation failed');
  }

  let membership = validateMembership(membershipCreate.data, {
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    smartUserId: owner.smartUserId,
    userMappingId: userMapping.id,
    accountMappingId: owner.accountMapping.id,
  });

  if (membership.status === 'ACTIVE') {
    const receipt = await reconcileAndRecordChatwootMembership({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      membershipId: membership.id,
      membershipVersion: membership.version,
      chatwootAccountId: owner.accountMapping.chatwoot_account_id,
      chatwootUserId: userMapping.chatwoot_user_id,
      requestKey: requestKey([
        membership.id,
        'membership-reconcile',
        membership.version,
      ]),
      fetchImpl: input.fetchImpl,
    });

    if (
      receipt.observed_presence !== 'PRESENT' ||
      receipt.observed_role !== 'administrator' ||
      normalizeChatwootInt64Id(receipt.observed_account_user_id) !==
        normalizeChatwootInt64Id(membership.chatwoot_account_user_id)
    ) {
      return fail('ACTIVE Chatwoot OWNER membership has external identity drift');
    }
  } else {
    const observed = await ensureAndRecordChatwootMembership({
      service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      membershipId: membership.id,
      membershipVersion: membership.version,
      chatwootAccountId: owner.accountMapping.chatwoot_account_id,
      chatwootUserId: userMapping.chatwoot_user_id,
      role: 'administrator',
      requestKey: requestKey([
        membership.id,
        'membership-evidence',
        membership.version,
      ]),
      fetchImpl: input.fetchImpl,
    });

    membership = await activateMembership({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      membership,
      receiptId: observed.receipt.id,
      smartUserId: owner.smartUserId,
      userMappingId: userMapping.id,
      accountMappingId: owner.accountMapping.id,
    });
  }

  return {
    smartUserId: owner.smartUserId,
    userMapping,
    membership,
  };
}
