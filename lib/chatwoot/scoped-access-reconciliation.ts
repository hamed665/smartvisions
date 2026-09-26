import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  effectiveRoleForScope,
  ORGANIZATION_ROLES,
  type MemberScopeAssignment,
  type OrganizationRole,
  type ScopedRole,
  type TenantScope,
  type TenantScopeLineage,
} from '@/lib/business-os/control-plane';
import {
  chatwootAdminAccountRequest,
  requireChatwootAdminProjection,
} from '@/lib/chatwoot/account-admin-request';
import { evaluateChatwootProvisioningActivation } from '@/lib/chatwoot/activation-contract';
import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { ChatwootProvisioningError } from '@/lib/chatwoot/provisioning';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
} from '@/lib/chatwoot/tenant-bridge-slice-b';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const MAX_SCOPE_ROWS = 5_000;
const SCOPED_ROLES = new Set<ScopedRole>([
  'ADMIN',
  'SALES_MANAGER',
  'SALES_AGENT',
  'VIEWER',
]);
const SCOPED_TYPES = new Set<MemberScopeAssignment['scopeType']>([
  'BRAND',
  'BUSINESS',
  'BRANCH',
  'DEPARTMENT',
  'TEAM',
]);

type ScopedAccessKind = 'INBOX' | 'TEAM';

type CanonicalMember = {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
};

type AccountMembership = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  smart_user_id: string;
  chatwoot_user_mapping_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_account_user_id: string | number | null;
  chatwoot_role: 'administrator' | 'agent';
  status: 'ACTIVE';
};

type UserMapping = {
  id: string;
  smart_user_id: string;
  chatwoot_user_id: number | null;
  status: 'ACTIVE';
};

type AccessTarget = {
  kind: ScopedAccessKind;
  mappingId: string;
  tenantBusinessId: string;
  accountMappingId: string;
  mappingVersion: number;
  externalResourceId: number | string;
  target: TenantScope;
  lineage: TenantScopeLineage;
};

function fail(message: string): never {
  throw new ChatwootProvisioningError('RECONCILIATION_REQUIRED', message);
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
      'Chatwoot scoped access reconciliation is blocked by the Production activation contract',
    );
  }
}

async function requireCurrentOwnerActor(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (authError || !auth.user?.id || !isUuid(auth.user.id)) {
    return fail('Authenticated Organization OWNER is required');
  }

  const { data, error } = await input.supabase
    .from('organization_members')
    .select('organization_id,user_id,role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', auth.user.id)
    .single();

  if (
    error ||
    data?.organization_id !== input.organizationId ||
    data?.user_id !== auth.user.id ||
    data?.role !== 'OWNER'
  ) {
    return fail('Authenticated Organization OWNER is required');
  }

  return auth.user.id;
}

function normalizeOrganizationRole(value: unknown): OrganizationRole {
  if (
    typeof value !== 'string' ||
    !ORGANIZATION_ROLES.includes(value as OrganizationRole)
  ) {
    return fail('Canonical Organization member role is invalid');
  }
  return value as OrganizationRole;
}

function scopeAssignment(row: Record<string, unknown>): MemberScopeAssignment {
  if (
    !isUuid(String(row.organization_id ?? '')) ||
    !isUuid(String(row.user_id ?? '')) ||
    typeof row.scope_type !== 'string' ||
    !SCOPED_TYPES.has(row.scope_type as MemberScopeAssignment['scopeType']) ||
    !SCOPED_ROLES.has(row.role as ScopedRole) ||
    !row.attributes ||
    typeof row.attributes !== 'object' ||
    Array.isArray(row.attributes)
  ) {
    return fail('Canonical member scope assignment is invalid');
  }

  const scopeType = row.scope_type as MemberScopeAssignment['scopeType'];
  const scopeId =
    scopeType === 'BRAND'
      ? row.brand_id
      : scopeType === 'BUSINESS'
        ? row.tenant_business_id
        : scopeType === 'BRANCH'
          ? row.branch_id
          : scopeType === 'DEPARTMENT'
            ? row.department_id
            : row.team_id;

  if (!isUuid(String(scopeId ?? ''))) {
    return fail('Canonical member scope assignment has invalid lineage');
  }

  return {
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    scopeType,
    scopeId: String(scopeId),
    role: row.role as ScopedRole,
    attributes: row.attributes as Record<string, unknown>,
  };
}

async function loadAccessTarget(input: {
  service: SupabaseClient;
  organizationId: string;
  kind: ScopedAccessKind;
  mappingId: string;
}): Promise<AccessTarget> {
  if (input.kind === 'INBOX') {
    const mapping = await input.service
      .from('chatwoot_inbox_mappings')
      .select(
        'id,organization_id,tenant_business_id,branch_id,chatwoot_account_mapping_id,chatwoot_inbox_id,status,version',
      )
      .eq('organization_id', input.organizationId)
      .eq('id', input.mappingId)
      .eq('status', 'ACTIVE')
      .single();

    const inboxId = normalizeChatwootInt32Id(mapping.data?.chatwoot_inbox_id);
    if (
      mapping.error ||
      !mapping.data ||
      mapping.data.id !== input.mappingId ||
      mapping.data.organization_id !== input.organizationId ||
      !isUuid(mapping.data.tenant_business_id) ||
      !isUuid(mapping.data.chatwoot_account_mapping_id) ||
      !Number.isSafeInteger(mapping.data.version) ||
      Number(mapping.data.version) < 1 ||
      inboxId === null
    ) {
      return fail('ACTIVE Chatwoot Inbox mapping is required');
    }

    const business = await input.service
      .from('tenant_businesses')
      .select('id,organization_id,brand_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', mapping.data.tenant_business_id)
      .eq('status', 'ACTIVE')
      .single();

    if (
      business.error ||
      !business.data ||
      !isUuid(business.data.brand_id) ||
      business.data.id !== mapping.data.tenant_business_id ||
      business.data.organization_id !== input.organizationId
    ) {
      return fail('ACTIVE canonical Business lineage is required for Inbox access');
    }

    const brand = await input.service
      .from('brands')
      .select('id,organization_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', business.data.brand_id)
      .eq('status', 'ACTIVE')
      .single();

    if (
      brand.error ||
      !brand.data ||
      brand.data.organization_id !== input.organizationId
    ) {
      return fail('ACTIVE canonical Brand lineage is required for Inbox access');
    }

    if (mapping.data.branch_id === null) {
      return {
        kind: 'INBOX',
        mappingId: mapping.data.id,
        tenantBusinessId: mapping.data.tenant_business_id,
        accountMappingId: mapping.data.chatwoot_account_mapping_id,
        mappingVersion: Number(mapping.data.version),
        externalResourceId: inboxId,
        target: {
          organizationId: input.organizationId,
          brandId: business.data.brand_id,
          tenantBusinessId: business.data.id,
        },
        lineage: {
          brand: {
            id: brand.data.id,
            organizationId: brand.data.organization_id,
          },
          tenantBusiness: {
            id: business.data.id,
            organizationId: business.data.organization_id,
            brandId: business.data.brand_id,
          },
        },
      };
    }

    if (!isUuid(mapping.data.branch_id)) {
      return fail('Chatwoot Inbox Branch scope is invalid');
    }

    const branch = await input.service
      .from('branches')
      .select('id,organization_id,tenant_business_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', mapping.data.branch_id)
      .eq('tenant_business_id', business.data.id)
      .eq('status', 'ACTIVE')
      .single();

    if (
      branch.error ||
      !branch.data ||
      branch.data.organization_id !== input.organizationId
    ) {
      return fail('ACTIVE canonical Branch lineage is required for Inbox access');
    }

    return {
      kind: 'INBOX',
      mappingId: mapping.data.id,
      tenantBusinessId: mapping.data.tenant_business_id,
      accountMappingId: mapping.data.chatwoot_account_mapping_id,
      mappingVersion: Number(mapping.data.version),
      externalResourceId: inboxId,
      target: {
        organizationId: input.organizationId,
        brandId: business.data.brand_id,
        tenantBusinessId: business.data.id,
        branchId: branch.data.id,
      },
      lineage: {
        brand: {
          id: brand.data.id,
          organizationId: brand.data.organization_id,
        },
        tenantBusiness: {
          id: business.data.id,
          organizationId: business.data.organization_id,
          brandId: business.data.brand_id,
        },
        branch: {
          id: branch.data.id,
          organizationId: branch.data.organization_id,
          tenantBusinessId: branch.data.tenant_business_id,
        },
      },
    };
  }

  const mapping = await input.service
    .from('chatwoot_team_mappings')
    .select(
      'id,organization_id,tenant_business_id,smart_team_id,chatwoot_account_mapping_id,chatwoot_team_id,status,version',
    )
    .eq('organization_id', input.organizationId)
    .eq('id', input.mappingId)
    .eq('status', 'ACTIVE')
    .single();

  const externalTeamId = normalizeChatwootInt64Id(mapping.data?.chatwoot_team_id);
  if (
    mapping.error ||
    !mapping.data ||
    mapping.data.id !== input.mappingId ||
    mapping.data.organization_id !== input.organizationId ||
    !isUuid(mapping.data.tenant_business_id) ||
    !isUuid(mapping.data.smart_team_id) ||
    !isUuid(mapping.data.chatwoot_account_mapping_id) ||
    !Number.isSafeInteger(mapping.data.version) ||
    Number(mapping.data.version) < 1 ||
    externalTeamId === null
  ) {
    return fail('ACTIVE Chatwoot Team mapping is required');
  }

  const team = await input.service
    .from('teams')
    .select('id,organization_id,department_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', mapping.data.smart_team_id)
    .eq('status', 'ACTIVE')
    .single();

  if (
    team.error ||
    !team.data ||
    !isUuid(team.data.department_id) ||
    team.data.organization_id !== input.organizationId
  ) {
    return fail('ACTIVE canonical Team lineage is required');
  }

  const department = await input.service
    .from('departments')
    .select('id,organization_id,branch_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', team.data.department_id)
    .eq('status', 'ACTIVE')
    .single();

  if (
    department.error ||
    !department.data ||
    !isUuid(department.data.branch_id) ||
    department.data.organization_id !== input.organizationId
  ) {
    return fail('ACTIVE canonical Department lineage is required');
  }

  const branch = await input.service
    .from('branches')
    .select('id,organization_id,tenant_business_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', department.data.branch_id)
    .eq('status', 'ACTIVE')
    .single();

  if (
    branch.error ||
    !branch.data ||
    !isUuid(branch.data.tenant_business_id) ||
    branch.data.organization_id !== input.organizationId ||
    branch.data.tenant_business_id !== mapping.data.tenant_business_id
  ) {
    return fail('ACTIVE canonical Branch lineage is required for Team access');
  }

  const business = await input.service
    .from('tenant_businesses')
    .select('id,organization_id,brand_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', branch.data.tenant_business_id)
    .eq('status', 'ACTIVE')
    .single();

  if (
    business.error ||
    !business.data ||
    !isUuid(business.data.brand_id) ||
    business.data.organization_id !== input.organizationId
  ) {
    return fail('ACTIVE canonical Business lineage is required for Team access');
  }

  const brand = await input.service
    .from('brands')
    .select('id,organization_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', business.data.brand_id)
    .eq('status', 'ACTIVE')
    .single();

  if (
    brand.error ||
    !brand.data ||
    brand.data.organization_id !== input.organizationId
  ) {
    return fail('ACTIVE canonical Brand lineage is required for Team access');
  }

  return {
    kind: 'TEAM',
    mappingId: mapping.data.id,
    tenantBusinessId: mapping.data.tenant_business_id,
    accountMappingId: mapping.data.chatwoot_account_mapping_id,
    mappingVersion: Number(mapping.data.version),
    externalResourceId: externalTeamId,
    target: {
      organizationId: input.organizationId,
      brandId: brand.data.id,
      tenantBusinessId: business.data.id,
      branchId: branch.data.id,
      departmentId: department.data.id,
      teamId: team.data.id,
    },
    lineage: {
      brand: {
        id: brand.data.id,
        organizationId: brand.data.organization_id,
      },
      tenantBusiness: {
        id: business.data.id,
        organizationId: business.data.organization_id,
        brandId: business.data.brand_id,
      },
      branch: {
        id: branch.data.id,
        organizationId: branch.data.organization_id,
        tenantBusinessId: branch.data.tenant_business_id,
      },
      department: {
        id: department.data.id,
        organizationId: department.data.organization_id,
        branchId: department.data.branch_id,
      },
      team: {
        id: team.data.id,
        organizationId: team.data.organization_id,
        departmentId: team.data.department_id,
      },
    },
  };
}

async function loadDesiredUserIds(input: {
  service: SupabaseClient;
  organizationId: string;
  target: AccessTarget;
}) {
  const [membersResult, assignmentsResult, membershipsResult] = await Promise.all([
    input.service
      .from('organization_members')
      .select('organization_id,user_id,role')
      .eq('organization_id', input.organizationId)
      .limit(MAX_SCOPE_ROWS + 1),
    input.service
      .from('member_scope_assignments')
      .select(
        'organization_id,user_id,scope_type,role,brand_id,tenant_business_id,branch_id,department_id,team_id,attributes',
      )
      .eq('organization_id', input.organizationId)
      .limit(MAX_SCOPE_ROWS + 1),
    input.service
      .from('chatwoot_account_memberships')
      .select(
        'id,organization_id,tenant_business_id,smart_user_id,chatwoot_user_mapping_id,chatwoot_account_mapping_id,chatwoot_account_user_id,chatwoot_role,status',
      )
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', input.target.tenantBusinessId)
      .eq('status', 'ACTIVE')
      .limit(MAX_SCOPE_ROWS + 1),
  ]);

  if (
    membersResult.error ||
    assignmentsResult.error ||
    membershipsResult.error ||
    !Array.isArray(membersResult.data) ||
    !Array.isArray(assignmentsResult.data) ||
    !Array.isArray(membershipsResult.data) ||
    membersResult.data.length > MAX_SCOPE_ROWS ||
    assignmentsResult.data.length > MAX_SCOPE_ROWS ||
    membershipsResult.data.length > MAX_SCOPE_ROWS
  ) {
    return fail('Scoped Chatwoot access inventory is unavailable or exceeds the bounded read limit');
  }

  const members: CanonicalMember[] = membersResult.data.map((row) => ({
    organization_id: String(row.organization_id),
    user_id: String(row.user_id),
    role: normalizeOrganizationRole(row.role),
  }));

  for (const member of members) {
    if (
      member.organization_id !== input.organizationId ||
      !isUuid(member.user_id)
    ) {
      return fail('Canonical Organization member inventory is invalid');
    }
  }

  const assignments = assignmentsResult.data.map((row) =>
    scopeAssignment(row as Record<string, unknown>),
  );

  const memberships = membershipsResult.data as AccountMembership[];
  const membershipByUser = new Map<string, AccountMembership>();
  for (const membership of memberships) {
    if (
      membership.organization_id !== input.organizationId ||
      membership.tenant_business_id !== input.target.tenantBusinessId ||
      membership.chatwoot_account_mapping_id !== input.target.accountMappingId ||
      !isUuid(membership.smart_user_id) ||
      !isUuid(membership.chatwoot_user_mapping_id) ||
      membership.chatwoot_account_user_id === null ||
      (membership.chatwoot_role !== 'administrator' &&
        membership.chatwoot_role !== 'agent')
    ) {
      return fail('ACTIVE Chatwoot Account membership inventory is inconsistent');
    }
    if (membershipByUser.has(membership.smart_user_id)) {
      return fail('Duplicate ACTIVE Chatwoot Account membership detected');
    }
    membershipByUser.set(membership.smart_user_id, membership);
  }

  const userMappingIds = memberships.map(
    (membership) => membership.chatwoot_user_mapping_id,
  );
  let userMappings: UserMapping[] = [];
  if (userMappingIds.length > 0) {
    const result = await input.service
      .from('chatwoot_user_mappings')
      .select('id,smart_user_id,chatwoot_user_id,status')
      .in('id', userMappingIds)
      .eq('status', 'ACTIVE')
      .limit(MAX_SCOPE_ROWS + 1);

    if (
      result.error ||
      !Array.isArray(result.data) ||
      result.data.length > MAX_SCOPE_ROWS
    ) {
      return fail('ACTIVE Chatwoot User mapping inventory is unavailable');
    }
    userMappings = result.data as UserMapping[];
  }

  const userMappingById = new Map(
    userMappings.map((mapping) => [mapping.id, mapping]),
  );
  const desired = new Set<number>();
  let missingProjectionCount = 0;

  for (const member of members) {
    const effectiveRole = effectiveRoleForScope({
      organizationRole: member.role,
      userId: member.user_id,
      target: input.target.target,
      lineage: input.target.lineage,
      assignments,
    });

    if (effectiveRole === 'VIEWER') continue;

    const membership = membershipByUser.get(member.user_id);
    if (!membership) {
      missingProjectionCount += 1;
      continue;
    }

    const userMapping = userMappingById.get(membership.chatwoot_user_mapping_id);
    const externalUserId = normalizeChatwootInt32Id(
      userMapping?.chatwoot_user_id,
    );

    if (
      !userMapping ||
      userMapping.smart_user_id !== member.user_id ||
      userMapping.status !== 'ACTIVE' ||
      externalUserId === null
    ) {
      missingProjectionCount += 1;
      continue;
    }

    if (
      (effectiveRole === 'OWNER' &&
        membership.chatwoot_role !== 'administrator') ||
      (effectiveRole !== 'OWNER' &&
        membership.chatwoot_role === 'administrator')
    ) {
      return fail('Chatwoot Account role is broader than canonical scoped authority');
    }

    desired.add(externalUserId);
  }

  if (missingProjectionCount > 0) {
    return fail(
      'Canonical scoped access has ' +
        missingProjectionCount +
        ' user(s) without a verified Business-wide Chatwoot AccountUser projection',
    );
  }

  return [...desired].sort((a, b) => a - b);
}

function parseAgentIds(value: unknown, kind: ScopedAccessKind) {
  const list =
    kind === 'INBOX'
      ? value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          Array.isArray((value as Record<string, unknown>).payload)
        ? ((value as Record<string, unknown>).payload as unknown[])
        : null
      : Array.isArray(value)
        ? value
        : null;

  if (!list) return fail('Chatwoot scoped member response is invalid');

  const ids = list.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return fail('Chatwoot scoped member response contains an invalid agent');
    }
    const id = normalizeChatwootInt32Id(
      (row as Record<string, unknown>).id,
    );
    if (id === null) {
      return fail('Chatwoot scoped member response contains an invalid agent ID');
    }
    return id;
  });

  if (new Set(ids).size !== ids.length) {
    return fail('Chatwoot scoped member response contains duplicate agent IDs');
  }

  return ids.sort((a, b) => a - b);
}

function sameIds(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

async function readExternalMembers(input: {
  supabase: SupabaseClient;
  organizationId: string;
  target: AccessTarget;
  fetchImpl?: typeof fetch;
}) {
  const resourcePath =
    input.target.kind === 'INBOX'
      ? '/inbox_members/' + input.target.externalResourceId
      : '/teams/' + input.target.externalResourceId + '/team_members';

  const raw = await chatwootAdminAccountRequest<unknown>({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: input.target.tenantBusinessId,
    resourcePath,
    method: 'GET',
    fetchImpl: input.fetchImpl,
  });

  return parseAgentIds(raw, input.target.kind);
}

async function replaceExternalMembers(input: {
  supabase: SupabaseClient;
  organizationId: string;
  target: AccessTarget;
  desiredUserIds: number[];
  fetchImpl?: typeof fetch;
}) {
  if (input.target.kind === 'INBOX') {
    await chatwootAdminAccountRequest<unknown>({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: input.target.tenantBusinessId,
      resourcePath: '/inbox_members',
      method: 'PATCH',
      body: {
        inbox_id: input.target.externalResourceId,
        user_ids: input.desiredUserIds,
      },
      fetchImpl: input.fetchImpl,
    });
    return;
  }

  await chatwootAdminAccountRequest<unknown>({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: input.target.tenantBusinessId,
    resourcePath:
      '/teams/' + input.target.externalResourceId + '/team_members',
    method: 'PATCH',
    body: { user_ids: input.desiredUserIds },
    fetchImpl: input.fetchImpl,
  });
}

async function writeAudit(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  target: AccessTarget;
  beforeCount: number;
  afterCount: number;
  changed: boolean;
  ambiguousMutationReconciled: boolean;
}) {
  const { error } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'USER',
    actor_id: input.actorUserId,
    action: 'CHATWOOT_SCOPED_ACCESS_RECONCILED',
    entity_type:
      input.target.kind === 'INBOX'
        ? 'chatwoot_inbox_mapping'
        : 'chatwoot_team_mapping',
    entity_id: input.target.mappingId,
    before_data: {
      member_count: input.beforeCount,
      mapping_version: input.target.mappingVersion,
    },
    after_data: {
      member_count: input.afterCount,
      mapping_version: input.target.mappingVersion,
      changed: input.changed,
      ambiguous_mutation_reconciled: input.ambiguousMutationReconciled,
    },
  });

  if (error) {
    return fail('Scoped Chatwoot access verification could not be audited');
  }
}

export async function reconcileChatwootScopedAccess(input: {
  supabase: SupabaseClient;
  organizationId: string;
  kind: ScopedAccessKind;
  mappingId: string;
  fetchImpl?: typeof fetch;
}) {
  requireExternalProvisioningActivation();

  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.mappingId) ||
    (input.kind !== 'INBOX' && input.kind !== 'TEAM')
  ) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Scoped Chatwoot access input is invalid',
    );
  }

  const actorUserId = await requireCurrentOwnerActor({
    supabase: input.supabase,
    organizationId: input.organizationId,
  });

  const service = createSupabaseServiceClient();
  const table =
    input.kind === 'INBOX'
      ? 'chatwoot_inbox_mappings'
      : 'chatwoot_team_mappings';
  const { data: scopeRow, error: scopeError } = await service
    .from(table)
    .select('tenant_business_id')
    .eq('organization_id', input.organizationId)
    .eq('id', input.mappingId)
    .eq('status', 'ACTIVE')
    .single();

  if (
    scopeError ||
    !scopeRow ||
    !isUuid(scopeRow.tenant_business_id)
  ) {
    return fail('ACTIVE scoped Chatwoot mapping is required');
  }

  const adminProjection = await requireChatwootAdminProjection({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: scopeRow.tenant_business_id,
  });

  if (adminProjection.smartUserId !== actorUserId) {
    return fail('Chatwoot administrator projection does not match current OWNER');
  }
  const target = await loadAccessTarget({
    service,
    organizationId: input.organizationId,
    kind: input.kind,
    mappingId: input.mappingId,
  });

  if (target.tenantBusinessId === '' || !isUuid(target.tenantBusinessId)) {
    return fail('Scoped Chatwoot target Business is invalid');
  }

  const desiredUserIds = await loadDesiredUserIds({
    service,
    organizationId: input.organizationId,
    target,
  });

  const before = await readExternalMembers({
    supabase: input.supabase,
    organizationId: input.organizationId,
    target,
    fetchImpl: input.fetchImpl,
  });

  let changed = false;
  let ambiguousMutationReconciled = false;

  if (!sameIds(before, desiredUserIds)) {
    changed = true;
    try {
      await replaceExternalMembers({
        supabase: input.supabase,
        organizationId: input.organizationId,
        target,
        desiredUserIds,
        fetchImpl: input.fetchImpl,
      });
    } catch (error) {
      if (
        !(error instanceof ChatwootHttpError) ||
        !error.ambiguousMutationOutcome
      ) {
        throw error;
      }
      ambiguousMutationReconciled = true;
    }
  }

  const verified = await readExternalMembers({
    supabase: input.supabase,
    organizationId: input.organizationId,
    target,
    fetchImpl: input.fetchImpl,
  });

  if (!sameIds(verified, desiredUserIds)) {
    return fail(
      'Chatwoot scoped member replace-set is not confirmed by exact GET reconciliation',
    );
  }

  await writeAudit({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorUserId: adminProjection.smartUserId,
    target,
    beforeCount: before.length,
    afterCount: verified.length,
    changed,
    ambiguousMutationReconciled,
  });

  return {
    kind: target.kind,
    mappingId: target.mappingId,
    tenantBusinessId: target.tenantBusinessId,
    desiredMemberCount: desiredUserIds.length,
    verifiedMemberCount: verified.length,
    outcome: changed
      ? ambiguousMutationReconciled
        ? 'RECONCILED_AFTER_AMBIGUOUS_PATCH'
        : 'REPLACED_AND_VERIFIED'
      : 'ALREADY_VERIFIED',
  } as const;
}
