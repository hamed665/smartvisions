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

export type ScopedAccessKind = 'INBOX' | 'TEAM';

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

export async function loadChatwootScopedAccessInventory(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  await requireCurrentOwnerActor(input);
  const service = createSupabaseServiceClient();

  const [inboxes, teams] = await Promise.all([
    service
      .from('chatwoot_inbox_mappings')
      .select(
        'id,tenant_business_id,branch_id,chatwoot_inbox_id,status,version',
      )
      .eq('organization_id', input.organizationId)
      .eq('status', 'ACTIVE')
      .limit(MAX_SCOPE_ROWS + 1),
    service
      .from('chatwoot_team_mappings')
      .select(
        'id,tenant_business_id,smart_team_id,chatwoot_team_id,status,version',
      )
      .eq('organization_id', input.organizationId)
      .eq('status', 'ACTIVE')
      .limit(MAX_SCOPE_ROWS + 1),
  ]);

  if (
    inboxes.error ||
    teams.error ||
    !Array.isArray(inboxes.data) ||
    !Array.isArray(teams.data) ||
    inboxes.data.length > MAX_SCOPE_ROWS ||
    teams.data.length > MAX_SCOPE_ROWS
  ) {
    return fail('Scoped Chatwoot projection inventory is unavailable');
  }

  return {
    inboxes: inboxes.data.map((row) => ({
      kind: 'INBOX' as const,
      mappingId: String(row.id),
      tenantBusinessId: String(row.tenant_business_id),
      branchId:
        typeof row.branch_id === 'string' && isUuid(row.branch_id)
          ? row.branch_id
          : null,
      externalId: normalizeChatwootInt32Id(row.chatwoot_inbox_id),
      version: Number(row.version),
    })),
    teams: teams.data.map((row) => ({
      kind: 'TEAM' as const,
      mappingId: String(row.id),
      tenantBusinessId: String(row.tenant_business_id),
      smartTeamId: String(row.smart_team_id),
      externalId: normalizeChatwootInt64Id(row.chatwoot_team_id),
      version: Number(row.version),
    })),
  };
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


type ScopedReductionOperation = 'UPDATE' | 'DELETE';
const MAX_REDUCTION_TARGETS = 250;

function reductionKey(input: {
  assignmentId: string;
  expectedVersion: number;
  operation: ScopedReductionOperation;
  stage: 'receipt' | 'apply';
}) {
  return [
    'c5',
    input.assignmentId,
    String(input.expectedVersion),
    input.operation.toLowerCase(),
    input.stage,
    'v1',
  ].join(':');
}

async function applyCanonicalScopeReduction(input: {
  supabase: SupabaseClient;
  organizationId: string;
  assignmentId: string;
  expectedVersion: number;
  operation: ScopedReductionOperation;
  postRole: ScopedRole | null;
  postAttributes: Record<string, unknown>;
  receiptId?: string;
}) {
  if (input.receiptId) {
    const { data, error } = await input.supabase.rpc(
      'apply_member_scope_assignment_reduction_verified',
      {
        p_organization_id: input.organizationId,
        p_assignment_id: input.assignmentId,
        p_expected_version: input.expectedVersion,
        p_operation: input.operation,
        p_post_role: input.postRole,
        p_post_attributes: input.postAttributes,
        p_receipt_id: input.receiptId,
        p_request_key: reductionKey({
          assignmentId: input.assignmentId,
          expectedVersion: input.expectedVersion,
          operation: input.operation,
          stage: 'apply',
        }),
      },
    );

    if (error) {
      return fail('Verified canonical scoped reduction failed after external removal');
    }

    return data;
  }

  if (input.operation === 'UPDATE') {
    if (!input.postRole) return fail('Scoped reduction update requires a target role');

    const { data, error } = await input.supabase.rpc(
      'update_member_scope_assignment',
      {
        p_organization_id: input.organizationId,
        p_assignment_id: input.assignmentId,
        p_expected_version: input.expectedVersion,
        p_role: input.postRole,
        p_attributes: input.postAttributes,
        p_request_key: reductionKey({
          assignmentId: input.assignmentId,
          expectedVersion: input.expectedVersion,
          operation: input.operation,
          stage: 'apply',
        }),
      },
    );

    if (error) {
      return fail('Canonical scoped assignment update failed');
    }
    return data;
  }

  const { data, error } = await input.supabase.rpc(
    'delete_member_scope_assignment',
    {
      p_organization_id: input.organizationId,
      p_assignment_id: input.assignmentId,
      p_expected_version: input.expectedVersion,
      p_request_key: reductionKey({
        assignmentId: input.assignmentId,
        expectedVersion: input.expectedVersion,
        operation: input.operation,
        stage: 'apply',
      }),
    },
  );

  if (error) {
    return fail('Canonical scoped assignment delete failed');
  }
  return data;
}

export async function reduceMemberScopeAssignmentExternalFirst(input: {
  supabase: SupabaseClient;
  organizationId: string;
  assignmentId: string;
  expectedVersion: number;
  operation: ScopedReductionOperation;
  postRole?: ScopedRole | null;
  postAttributes?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}) {
  requireExternalProvisioningActivation();

  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.assignmentId) ||
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 1 ||
    (input.operation !== 'UPDATE' && input.operation !== 'DELETE')
  ) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Scoped reduction input is invalid',
    );
  }

  const actorUserId = await requireCurrentOwnerActor({
    supabase: input.supabase,
    organizationId: input.organizationId,
  });

  const postRole =
    input.operation === 'UPDATE'
      ? input.postRole && SCOPED_ROLES.has(input.postRole)
        ? input.postRole
        : fail('Scoped reduction update requires a canonical target role')
      : null;
  const postAttributes =
    input.operation === 'UPDATE'
      ? input.postAttributes ?? {}
      : {};

  if (
    postAttributes === null ||
    typeof postAttributes !== 'object' ||
    Array.isArray(postAttributes)
  ) {
    return fail('Scoped reduction attributes must be an object');
  }

  const service = createSupabaseServiceClient();

  const [assignmentResult, assignmentsResult, memberResult, inboxResult, teamResult] =
    await Promise.all([
      service
        .from('member_scope_assignments')
        .select(
          'id,organization_id,user_id,scope_type,role,brand_id,tenant_business_id,branch_id,department_id,team_id,attributes,version',
        )
        .eq('organization_id', input.organizationId)
        .eq('id', input.assignmentId)
        .single(),
      service
        .from('member_scope_assignments')
        .select(
          'id,organization_id,user_id,scope_type,role,brand_id,tenant_business_id,branch_id,department_id,team_id,attributes,version',
        )
        .eq('organization_id', input.organizationId)
        .limit(MAX_SCOPE_ROWS + 1),
      service
        .from('organization_members')
        .select('organization_id,user_id,role')
        .eq('organization_id', input.organizationId),
      service
        .from('chatwoot_inbox_mappings')
        .select('id')
        .eq('organization_id', input.organizationId)
        .eq('status', 'ACTIVE')
        .limit(MAX_REDUCTION_TARGETS + 1),
      service
        .from('chatwoot_team_mappings')
        .select('id')
        .eq('organization_id', input.organizationId)
        .eq('status', 'ACTIVE')
        .limit(MAX_REDUCTION_TARGETS + 1),
    ]);

  if (
    assignmentResult.error ||
    !assignmentResult.data ||
    assignmentResult.data.organization_id !== input.organizationId ||
    assignmentResult.data.id !== input.assignmentId ||
    assignmentResult.data.version !== input.expectedVersion ||
    !['BRANCH', 'DEPARTMENT', 'TEAM'].includes(
      String(assignmentResult.data.scope_type),
    )
  ) {
    return fail('A current BRANCH/DEPARTMENT/TEAM scope assignment is required');
  }

  if (
    assignmentsResult.error ||
    !Array.isArray(assignmentsResult.data) ||
    assignmentsResult.data.length > MAX_SCOPE_ROWS ||
    memberResult.error ||
    !Array.isArray(memberResult.data) ||
    inboxResult.error ||
    !Array.isArray(inboxResult.data) ||
    teamResult.error ||
    !Array.isArray(teamResult.data) ||
    inboxResult.data.length + teamResult.data.length > MAX_REDUCTION_TARGETS
  ) {
    return fail('Scoped reduction inventory is unavailable or exceeds the safety bound');
  }

  const targetUserId = String(assignmentResult.data.user_id);
  if (!isUuid(targetUserId)) {
    return fail('Scoped reduction target user is invalid');
  }

  const targetMember = memberResult.data.find(
    (row) => row.user_id === targetUserId,
  );
  if (
    !targetMember ||
    targetMember.organization_id !== input.organizationId
  ) {
    return fail('Scoped reduction target Organization member is missing');
  }
  const organizationRole = normalizeOrganizationRole(targetMember.role);

  const assignmentRows = assignmentsResult.data.filter(
    (row) => row.user_id === targetUserId,
  );
  const beforeAssignments = assignmentRows.map((row) =>
    scopeAssignment(row as Record<string, unknown>),
  );
  const currentAssignment = scopeAssignment(
    assignmentResult.data as Record<string, unknown>,
  );

  const afterAssignments = beforeAssignments.filter(
    (assignment) =>
      !(
        assignment.userId === currentAssignment.userId &&
        assignment.scopeType === currentAssignment.scopeType &&
        assignment.scopeId === currentAssignment.scopeId
      ),
  );

  if (input.operation === 'UPDATE') {
    afterAssignments.push({
      ...currentAssignment,
      role: postRole as ScopedRole,
      attributes: postAttributes,
    });
  }

  const targets = await Promise.all([
    ...inboxResult.data.map((row) =>
      loadAccessTarget({
        service,
        organizationId: input.organizationId,
        kind: 'INBOX',
        mappingId: String(row.id),
      }),
    ),
    ...teamResult.data.map((row) =>
      loadAccessTarget({
        service,
        organizationId: input.organizationId,
        kind: 'TEAM',
        mappingId: String(row.id),
      }),
    ),
  ]);

  const affectedTargets = targets.filter((target) => {
    const beforeRole = effectiveRoleForScope({
      organizationRole,
      userId: targetUserId,
      target: target.target,
      lineage: target.lineage,
      assignments: beforeAssignments,
    });
    const afterRole = effectiveRoleForScope({
      organizationRole,
      userId: targetUserId,
      target: target.target,
      lineage: target.lineage,
      assignments: afterAssignments,
    });
    return beforeRole !== 'VIEWER' && afterRole === 'VIEWER';
  });

  if (affectedTargets.length === 0) {
    const canonicalResult = await applyCanonicalScopeReduction({
      supabase: input.supabase,
      organizationId: input.organizationId,
      assignmentId: input.assignmentId,
      expectedVersion: input.expectedVersion,
      operation: input.operation,
      postRole,
      postAttributes,
    });

    return {
      assignmentId: input.assignmentId,
      operation: input.operation,
      externalResourcesVerifiedAbsent: 0,
      outcome: 'CANONICAL_REDUCTION_NO_EXTERNAL_REMOVAL_REQUIRED',
      canonicalResult,
    } as const;
  }

  const { data: userMapping, error: userMappingError } = await service
    .from('chatwoot_user_mappings')
    .select('id,smart_user_id,chatwoot_user_id,status')
    .eq('smart_user_id', targetUserId)
    .eq('status', 'ACTIVE')
    .single();

  const chatwootUserId = normalizeChatwootInt32Id(
    userMapping?.chatwoot_user_id,
  );
  if (
    userMappingError ||
    !userMapping ||
    userMapping.smart_user_id !== targetUserId ||
    chatwootUserId === null
  ) {
    return fail('ACTIVE Chatwoot User projection is required before scoped demotion');
  }

  const businessIds = [
    ...new Set(affectedTargets.map((target) => target.tenantBusinessId)),
  ];

  const { data: memberships, error: membershipsError } = await service
    .from('chatwoot_account_memberships')
    .select(
      'tenant_business_id,smart_user_id,chatwoot_user_mapping_id,chatwoot_account_mapping_id,chatwoot_account_user_id,status',
    )
    .eq('organization_id', input.organizationId)
    .eq('smart_user_id', targetUserId)
    .eq('status', 'ACTIVE')
    .in('tenant_business_id', businessIds);

  if (
    membershipsError ||
    !Array.isArray(memberships) ||
    memberships.length !== businessIds.length
  ) {
    return fail('ACTIVE Business-wide Chatwoot AccountUser projection is required before scoped demotion');
  }

  for (const target of affectedTargets) {
    const membership = memberships.find(
      (row) => row.tenant_business_id === target.tenantBusinessId,
    );
    if (
      !membership ||
      membership.smart_user_id !== targetUserId ||
      membership.chatwoot_user_mapping_id !== userMapping.id ||
      membership.chatwoot_account_mapping_id !== target.accountMappingId ||
      membership.chatwoot_account_user_id === null
    ) {
      return fail('Scoped demotion AccountUser projection does not match the affected resource');
    }
  }

  const verifiedInboxMappingIds: string[] = [];
  const verifiedTeamMappingIds: string[] = [];
  let changedResourceCount = 0;
  let ambiguousMutationCount = 0;

  for (const target of affectedTargets) {
    const before = await readExternalMembers({
      supabase: input.supabase,
      organizationId: input.organizationId,
      target,
      fetchImpl: input.fetchImpl,
    });
    const desired = before.filter((id) => id !== chatwootUserId);

    if (!sameIds(before, desired)) {
      changedResourceCount += 1;
      try {
        await replaceExternalMembers({
          supabase: input.supabase,
          organizationId: input.organizationId,
          target,
          desiredUserIds: desired,
          fetchImpl: input.fetchImpl,
        });
      } catch (error) {
        if (
          !(error instanceof ChatwootHttpError) ||
          !error.ambiguousMutationOutcome
        ) {
          throw error;
        }
        ambiguousMutationCount += 1;
      }
    }

    const verified = await readExternalMembers({
      supabase: input.supabase,
      organizationId: input.organizationId,
      target,
      fetchImpl: input.fetchImpl,
    });

    if (verified.includes(chatwootUserId)) {
      return fail('External scoped access removal was not confirmed by GET reconciliation');
    }

    if (target.kind === 'INBOX') {
      verifiedInboxMappingIds.push(target.mappingId);
    } else {
      verifiedTeamMappingIds.push(target.mappingId);
    }
  }

  const receiptRequestKey = reductionKey({
    assignmentId: input.assignmentId,
    expectedVersion: input.expectedVersion,
    operation: input.operation,
    stage: 'receipt',
  });

  const { data: receiptData, error: receiptError } = await service.rpc(
    'record_chatwoot_scoped_access_reduction',
    {
      p_organization_id: input.organizationId,
      p_assignment_id: input.assignmentId,
      p_expected_assignment_version: input.expectedVersion,
      p_operation: input.operation,
      p_post_role: postRole,
      p_post_attributes: postAttributes,
      p_chatwoot_user_id: chatwootUserId,
      p_verified_inbox_mapping_ids: verifiedInboxMappingIds,
      p_verified_team_mapping_ids: verifiedTeamMappingIds,
      p_request_key: receiptRequestKey,
    },
  );

  const receipt =
    Array.isArray(receiptData) && receiptData.length === 1
      ? receiptData[0]
      : receiptData;

  if (
    receiptError ||
    !receipt ||
    typeof receipt !== 'object' ||
    !isUuid((receipt as Record<string, unknown>).id)
  ) {
    return fail('Verified scoped access reduction receipt could not be persisted');
  }

  const { error: auditError } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'USER',
    actor_id: actorUserId,
    action: 'CHATWOOT_SCOPED_ACCESS_REMOVED_BEFORE_REDUCTION',
    entity_type: 'member_scope_assignment',
    entity_id: input.assignmentId,
    before_data: {
      assignment_version: input.expectedVersion,
      affected_resource_count: affectedTargets.length,
    },
    after_data: {
      verified_absent_resource_count: affectedTargets.length,
      changed_resource_count: changedResourceCount,
      ambiguous_mutation_count: ambiguousMutationCount,
      receipt_id: (receipt as Record<string, unknown>).id,
    },
  });

  if (auditError) {
    return fail('Verified scoped access removal could not be audited');
  }

  const canonicalResult = await applyCanonicalScopeReduction({
    supabase: input.supabase,
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
    expectedVersion: input.expectedVersion,
    operation: input.operation,
    postRole,
    postAttributes,
    receiptId: String((receipt as Record<string, unknown>).id),
  });

  return {
    assignmentId: input.assignmentId,
    operation: input.operation,
    externalResourcesVerifiedAbsent: affectedTargets.length,
    changedResourceCount,
    ambiguousMutationCount,
    outcome: 'EXTERNAL_ACCESS_REMOVED_THEN_CANONICAL_REDUCTION_APPLIED',
    canonicalResult,
  } as const;
}
