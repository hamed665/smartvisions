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
import { chatwootAdminAccountRequest } from '@/lib/chatwoot/account-admin-request';
import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
} from '@/lib/chatwoot/tenant-bridge-slice-b';

const MAX_ACTIVE_ACCOUNT_MEMBERS = 1000;
const QUERY_CHUNK_SIZE = 100;

export type ChatwootMembershipResourceKind = 'INBOX' | 'TEAM';

export type ChatwootMembershipSyncErrorCode =
  | 'INVALID_INPUT'
  | 'FORBIDDEN'
  | 'CANONICAL_STATE_INVALID'
  | 'UPSTREAM_MISMATCH'
  | 'RECONCILIATION_REQUIRED';

export class ChatwootMembershipSyncError extends Error {
  constructor(
    public readonly code: ChatwootMembershipSyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChatwootMembershipSyncError';
  }
}

type OrganizationMemberRow = {
  organization_id: string;
  user_id: string;
  role: string;
};

type AccountProjection = {
  smartUserId: string;
  chatwootUserId: number;
};

type ResourceProjection = {
  kind: ChatwootMembershipResourceKind;
  mappingId: string;
  mappingVersion: number;
  accountMappingId: string;
  externalResourceId: string;
  target: TenantScope;
  lineage: TenantScopeLineage;
};

type SyncOutcome =
  | 'ALREADY_MATCHED'
  | 'UPDATED_VERIFIED'
  | 'RECONCILED_AFTER_AMBIGUOUS_MUTATION';

function fail(
  code: ChatwootMembershipSyncErrorCode,
  message: string,
): never {
  throw new ChatwootMembershipSyncError(code, message);
}

function requireUuid(value: string, field: string) {
  const normalized = value.trim();
  if (!isUuid(normalized)) {
    return fail('INVALID_INPUT', `${field} must be a canonical UUID`);
  }
  return normalized;
}

function childKey(base: string, suffix: string) {
  const root = base.trim();
  if (!root || root.length > 160) {
    return fail('INVALID_INPUT', 'requestKey is invalid');
  }
  const value = `${root}:${suffix}`;
  if (value.length > 200) {
    return fail('INVALID_INPUT', 'requestKey is too long');
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOrganizationRole(value: unknown): OrganizationRole {
  if (
    typeof value !== 'string' ||
    !ORGANIZATION_ROLES.includes(value as OrganizationRole)
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'Organization member role is invalid',
    );
  }
  return value as OrganizationRole;
}

const SCOPED_ROLES = new Set<ScopedRole>([
  'ADMIN',
  'SALES_MANAGER',
  'SALES_AGENT',
  'VIEWER',
]);

function normalizeAssignment(
  row: Record<string, unknown>,
): MemberScopeAssignment {
  const scopeType = row.scope_type;
  if (
    scopeType !== 'BRAND' &&
    scopeType !== 'BUSINESS' &&
    scopeType !== 'BRANCH' &&
    scopeType !== 'DEPARTMENT' &&
    scopeType !== 'TEAM'
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'Member scope assignment type is invalid',
    );
  }

  const role = row.role;
  if (typeof role !== 'string' || !SCOPED_ROLES.has(role as ScopedRole)) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'Member scope assignment role is invalid',
    );
  }

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

  if (
    typeof row.organization_id !== 'string' ||
    typeof row.user_id !== 'string' ||
    !isUuid(row.organization_id) ||
    !isUuid(row.user_id) ||
    typeof scopeId !== 'string' ||
    !isUuid(scopeId) ||
    !isPlainObject(row.attributes)
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'Member scope assignment evidence is invalid',
    );
  }

  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    scopeType,
    scopeId,
    role: role as ScopedRole,
    attributes: row.attributes,
  };
}

export function resolveDesiredChatwootUserIds(input: {
  organizationId: string;
  target: TenantScope;
  lineage: TenantScopeLineage;
  organizationMembers: OrganizationMemberRow[];
  accountProjections: AccountProjection[];
  assignments: MemberScopeAssignment[];
}) {
  const memberByUser = new Map<string, OrganizationMemberRow>();
  for (const member of input.organizationMembers) {
    if (
      member.organization_id !== input.organizationId ||
      !isUuid(member.user_id) ||
      memberByUser.has(member.user_id)
    ) {
      return fail(
        'CANONICAL_STATE_INVALID',
        'Organization membership projection is inconsistent',
      );
    }
    memberByUser.set(member.user_id, member);
  }

  const seenSmartUsers = new Set<string>();
  const seenExternalUsers = new Set<number>();
  const desired: number[] = [];

  for (const projection of input.accountProjections) {
    if (
      !isUuid(projection.smartUserId) ||
      !Number.isInteger(projection.chatwootUserId) ||
      projection.chatwootUserId <= 0 ||
      projection.chatwootUserId > 2_147_483_647 ||
      seenSmartUsers.has(projection.smartUserId) ||
      seenExternalUsers.has(projection.chatwootUserId)
    ) {
      return fail(
        'CANONICAL_STATE_INVALID',
        'ACTIVE AccountUser projection is inconsistent',
      );
    }

    seenSmartUsers.add(projection.smartUserId);
    seenExternalUsers.add(projection.chatwootUserId);

    const member = memberByUser.get(projection.smartUserId);
    if (!member) {
      return fail(
        'CANONICAL_STATE_INVALID',
        'ACTIVE AccountUser has no canonical Organization member',
      );
    }

    const organizationRole = normalizeOrganizationRole(member.role);
    const userAssignments = input.assignments.filter(
      (assignment) =>
        assignment.organizationId === input.organizationId &&
        assignment.userId === projection.smartUserId,
    );

    const effectiveRole = effectiveRoleForScope({
      organizationRole,
      userId: projection.smartUserId,
      target: input.target,
      lineage: input.lineage,
      assignments: userAssignments,
      // No trusted runtime policy attributes are supplied here. Conditional
      // scope assignments therefore fail closed by the canonical resolver.
    });

    if (effectiveRole !== 'VIEWER') {
      desired.push(projection.chatwootUserId);
    }
  }

  return desired.sort((a, b) => a - b);
}

function chunk<T>(values: T[], size = QUERY_CHUNK_SIZE) {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function requireOwnerSession(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id || !isUuid(auth.user.id)) {
    return fail('FORBIDDEN', 'Organization OWNER session required');
  }

  const owner = await supabase
    .from('organization_members')
    .select('organization_id,user_id,role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .single();

  if (
    owner.error ||
    owner.data?.organization_id !== organizationId ||
    owner.data?.user_id !== auth.user.id ||
    owner.data?.role !== 'OWNER'
  ) {
    return fail('FORBIDDEN', 'Organization OWNER session required');
  }

  return auth.user.id;
}

async function readBusinessAndBrand(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  const business = await input.service
    .from('tenant_businesses')
    .select('id,organization_id,brand_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', input.tenantBusinessId)
    .single();

  if (
    business.error ||
    !business.data ||
    business.data.id !== input.tenantBusinessId ||
    business.data.organization_id !== input.organizationId ||
    business.data.status !== 'ACTIVE' ||
    !isUuid(business.data.brand_id)
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE tenant Business lineage is required',
    );
  }

  const brand = await input.service
    .from('brands')
    .select('id,organization_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', business.data.brand_id)
    .single();

  if (
    brand.error ||
    !brand.data ||
    brand.data.id !== business.data.brand_id ||
    brand.data.organization_id !== input.organizationId ||
    brand.data.status !== 'ACTIVE'
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE Brand lineage is required',
    );
  }

  return {
    business: business.data,
    brand: brand.data,
  };
}

async function readResourceProjection(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  kind: ChatwootMembershipResourceKind;
  mappingId: string;
}): Promise<ResourceProjection> {
  const base = await readBusinessAndBrand(input);

  if (input.kind === 'INBOX') {
    const mapping = await input.service
      .from('chatwoot_inbox_mappings')
      .select(
        'id,organization_id,tenant_business_id,branch_id,' +
          'chatwoot_account_mapping_id,chatwoot_inbox_id,status,version,channel_type',
      )
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', input.tenantBusinessId)
      .eq('id', input.mappingId)
      .single();

    const inboxId = normalizeChatwootInt32Id(mapping.data?.chatwoot_inbox_id);

    if (
      mapping.error ||
      !mapping.data ||
      mapping.data.id !== input.mappingId ||
      mapping.data.organization_id !== input.organizationId ||
      mapping.data.tenant_business_id !== input.tenantBusinessId ||
      mapping.data.status !== 'ACTIVE' ||
      mapping.data.channel_type !== 'Channel::Api' ||
      !Number.isInteger(mapping.data.version) ||
      mapping.data.version < 1 ||
      !isUuid(mapping.data.chatwoot_account_mapping_id) ||
      inboxId === null
    ) {
      return fail(
        'CANONICAL_STATE_INVALID',
        'ACTIVE Chatwoot Inbox mapping is required',
      );
    }

    const target: TenantScope = {
      organizationId: input.organizationId,
      brandId: base.business.brand_id,
      tenantBusinessId: input.tenantBusinessId,
    };
    const lineage: TenantScopeLineage = {
      brand: {
        id: base.brand.id,
        organizationId: base.brand.organization_id,
      },
      tenantBusiness: {
        id: base.business.id,
        organizationId: base.business.organization_id,
        brandId: base.business.brand_id,
      },
    };

    if (mapping.data.branch_id !== null) {
      if (!isUuid(mapping.data.branch_id)) {
        return fail(
          'CANONICAL_STATE_INVALID',
          'Inbox Branch scope is invalid',
        );
      }

      const branch = await input.service
        .from('branches')
        .select('id,organization_id,tenant_business_id,status')
        .eq('organization_id', input.organizationId)
        .eq('tenant_business_id', input.tenantBusinessId)
        .eq('id', mapping.data.branch_id)
        .single();

      if (
        branch.error ||
        !branch.data ||
        branch.data.id !== mapping.data.branch_id ||
        branch.data.organization_id !== input.organizationId ||
        branch.data.tenant_business_id !== input.tenantBusinessId ||
        branch.data.status !== 'ACTIVE'
      ) {
        return fail(
          'CANONICAL_STATE_INVALID',
          'ACTIVE Inbox Branch lineage is required',
        );
      }

      target.branchId = branch.data.id;
      lineage.branch = {
        id: branch.data.id,
        organizationId: branch.data.organization_id,
        tenantBusinessId: branch.data.tenant_business_id,
      };
    }

    return {
      kind: input.kind,
      mappingId: mapping.data.id,
      mappingVersion: mapping.data.version,
      accountMappingId: mapping.data.chatwoot_account_mapping_id,
      externalResourceId: String(inboxId),
      target,
      lineage,
    };
  }

  const mapping = await input.service
    .from('chatwoot_team_mappings')
    .select(
      'id,organization_id,tenant_business_id,smart_team_id,' +
        'chatwoot_account_mapping_id,chatwoot_team_id,status,version',
    )
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('id', input.mappingId)
    .single();

  const teamExternalId = normalizeChatwootInt64Id(
    mapping.data?.chatwoot_team_id,
  );

  if (
    mapping.error ||
    !mapping.data ||
    mapping.data.id !== input.mappingId ||
    mapping.data.organization_id !== input.organizationId ||
    mapping.data.tenant_business_id !== input.tenantBusinessId ||
    mapping.data.status !== 'ACTIVE' ||
    !Number.isInteger(mapping.data.version) ||
    mapping.data.version < 1 ||
    !isUuid(mapping.data.smart_team_id) ||
    !isUuid(mapping.data.chatwoot_account_mapping_id) ||
    teamExternalId === null
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE Chatwoot Team mapping is required',
    );
  }

  const team = await input.service
    .from('teams')
    .select('id,organization_id,department_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', mapping.data.smart_team_id)
    .single();

  if (
    team.error ||
    !team.data ||
    team.data.id !== mapping.data.smart_team_id ||
    team.data.organization_id !== input.organizationId ||
    team.data.status !== 'ACTIVE' ||
    !isUuid(team.data.department_id)
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE Smart Team lineage is required',
    );
  }

  const department = await input.service
    .from('departments')
    .select('id,organization_id,branch_id,status')
    .eq('organization_id', input.organizationId)
    .eq('id', team.data.department_id)
    .single();

  if (
    department.error ||
    !department.data ||
    department.data.id !== team.data.department_id ||
    department.data.organization_id !== input.organizationId ||
    department.data.status !== 'ACTIVE' ||
    !isUuid(department.data.branch_id)
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE Department lineage is required',
    );
  }

  const branch = await input.service
    .from('branches')
    .select('id,organization_id,tenant_business_id,status')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('id', department.data.branch_id)
    .single();

  if (
    branch.error ||
    !branch.data ||
    branch.data.id !== department.data.branch_id ||
    branch.data.organization_id !== input.organizationId ||
    branch.data.tenant_business_id !== input.tenantBusinessId ||
    branch.data.status !== 'ACTIVE'
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE Team Branch lineage is required',
    );
  }

  return {
    kind: input.kind,
    mappingId: mapping.data.id,
    mappingVersion: mapping.data.version,
    accountMappingId: mapping.data.chatwoot_account_mapping_id,
    externalResourceId: teamExternalId,
    target: {
      organizationId: input.organizationId,
      brandId: base.business.brand_id,
      tenantBusinessId: input.tenantBusinessId,
      branchId: branch.data.id,
      departmentId: department.data.id,
      teamId: team.data.id,
    },
    lineage: {
      brand: {
        id: base.brand.id,
        organizationId: base.brand.organization_id,
      },
      tenantBusiness: {
        id: base.business.id,
        organizationId: base.business.organization_id,
        brandId: base.business.brand_id,
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

async function readRowsInChunks<T>(input: {
  ids: string[];
  read: (ids: string[]) => Promise<{ data: T[] | null; error: unknown }>;
}) {
  const rows: T[] = [];
  for (const ids of chunk(input.ids)) {
    const result = await input.read(ids);
    if (result.error || !Array.isArray(result.data)) {
      return fail(
        'CANONICAL_STATE_INVALID',
        'Canonical membership evidence could not be read',
      );
    }
    rows.push(...result.data);
  }
  return rows;
}

async function readDesiredMembershipSet(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resource: ResourceProjection;
}) {
  const account = await input.service
    .from('chatwoot_account_mappings')
    .select('id,organization_id,tenant_business_id,status,chatwoot_account_id')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('id', input.resource.accountMappingId)
    .single();

  if (
    account.error ||
    !account.data ||
    account.data.id !== input.resource.accountMappingId ||
    account.data.organization_id !== input.organizationId ||
    account.data.tenant_business_id !== input.tenantBusinessId ||
    account.data.status !== 'ACTIVE' ||
    normalizeChatwootInt32Id(account.data.chatwoot_account_id) === null
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE Chatwoot Account mapping is required',
    );
  }

  const memberships = await input.service
    .from('chatwoot_account_memberships')
    .select(
      'smart_user_id,chatwoot_user_mapping_id,chatwoot_account_mapping_id,status',
      { count: 'exact' },
    )
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('chatwoot_account_mapping_id', input.resource.accountMappingId)
    .eq('status', 'ACTIVE')
    .range(0, MAX_ACTIVE_ACCOUNT_MEMBERS - 1);

  if (
    memberships.error ||
    !Array.isArray(memberships.data) ||
    memberships.count === null ||
    memberships.count > MAX_ACTIVE_ACCOUNT_MEMBERS ||
    memberships.data.length !== memberships.count
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE AccountUser projection set is unbounded or incomplete',
    );
  }

  if (memberships.data.length === 0) {
    return [] as number[];
  }

  const smartUserIds: string[] = [];
  const userMappingIds: string[] = [];
  const seenSmartUsers = new Set<string>();
  const seenUserMappings = new Set<string>();

  for (const row of memberships.data) {
    if (
      !isUuid(row.smart_user_id) ||
      !isUuid(row.chatwoot_user_mapping_id) ||
      row.chatwoot_account_mapping_id !== input.resource.accountMappingId ||
      row.status !== 'ACTIVE' ||
      seenSmartUsers.has(row.smart_user_id) ||
      seenUserMappings.has(row.chatwoot_user_mapping_id)
    ) {
      return fail(
        'CANONICAL_STATE_INVALID',
        'ACTIVE AccountUser projection set is inconsistent',
      );
    }
    seenSmartUsers.add(row.smart_user_id);
    seenUserMappings.add(row.chatwoot_user_mapping_id);
    smartUserIds.push(row.smart_user_id);
    userMappingIds.push(row.chatwoot_user_mapping_id);
  }

  const [userMappings, organizationMembers, assignmentRows] = await Promise.all([
    readRowsInChunks<Record<string, unknown>>({
      ids: userMappingIds,
      read: async (ids) => {
        const result = await input.service
          .from('chatwoot_user_mappings')
          .select('id,smart_user_id,chatwoot_user_id,status')
          .in('id', ids);
        return {
          data: result.data as Record<string, unknown>[] | null,
          error: result.error,
        };
      },
    }),
    readRowsInChunks<OrganizationMemberRow>({
      ids: smartUserIds,
      read: async (ids) => {
        const result = await input.service
          .from('organization_members')
          .select('organization_id,user_id,role')
          .eq('organization_id', input.organizationId)
          .in('user_id', ids);
        return {
          data: result.data as OrganizationMemberRow[] | null,
          error: result.error,
        };
      },
    }),
    readRowsInChunks<Record<string, unknown>>({
      ids: smartUserIds,
      read: async (ids) => {
        const result = await input.service
          .from('member_scope_assignments')
          .select(
            'organization_id,user_id,scope_type,role,brand_id,' +
              'tenant_business_id,branch_id,department_id,team_id,attributes',
          )
          .eq('organization_id', input.organizationId)
          .in('user_id', ids);
        return {
          data: result.data as Record<string, unknown>[] | null,
          error: result.error,
        };
      },
    }),
  ]);

  if (
    userMappings.length !== userMappingIds.length ||
    organizationMembers.length !== smartUserIds.length
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'ACTIVE AccountUser projection dependencies are incomplete',
    );
  }

  const membershipByUserMapping = new Map(
    memberships.data.map((row) => [
      row.chatwoot_user_mapping_id,
      row.smart_user_id,
    ]),
  );

  const accountProjections: AccountProjection[] = userMappings.map((row) => {
    const mappingId = row.id;
    const smartUserId = row.smart_user_id;
    const chatwootUserId = normalizeChatwootInt32Id(row.chatwoot_user_id);

    if (
      typeof mappingId !== 'string' ||
      !isUuid(mappingId) ||
      typeof smartUserId !== 'string' ||
      !isUuid(smartUserId) ||
      row.status !== 'ACTIVE' ||
      chatwootUserId === null ||
      membershipByUserMapping.get(mappingId) !== smartUserId
    ) {
      return fail(
        'CANONICAL_STATE_INVALID',
        'ACTIVE Chatwoot User projection is inconsistent',
      );
    }

    return { smartUserId, chatwootUserId };
  });

  const assignments = assignmentRows.map(normalizeAssignment);

  return resolveDesiredChatwootUserIds({
    organizationId: input.organizationId,
    target: input.resource.target,
    lineage: input.resource.lineage,
    organizationMembers,
    accountProjections,
    assignments,
  });
}

function normalizeExternalMemberIds(
  kind: ChatwootMembershipResourceKind,
  value: unknown,
) {
  let rows: unknown[];
  if (kind === 'INBOX') {
    if (!isPlainObject(value) || !Array.isArray(value.payload)) {
      return fail(
        'UPSTREAM_MISMATCH',
        'Chatwoot Inbox member response is invalid',
      );
    }
    rows = value.payload;
  } else {
    if (!Array.isArray(value)) {
      return fail(
        'UPSTREAM_MISMATCH',
        'Chatwoot Team member response is invalid',
      );
    }
    rows = value;
  }

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (!isPlainObject(row)) {
      return fail(
        'UPSTREAM_MISMATCH',
        'Chatwoot member response contains an invalid agent',
      );
    }
    const id = normalizeChatwootInt32Id(row.id);
    if (id === null || seen.has(id)) {
      return fail(
        'UPSTREAM_MISMATCH',
        'Chatwoot member response contains invalid or duplicate IDs',
      );
    }
    seen.add(id);
    ids.push(id);
  }

  return ids.sort((a, b) => a - b);
}

function sameIds(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

async function hashMemberSet(ids: number[]) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(ids)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function membershipPath(resource: ResourceProjection) {
  if (resource.kind === 'INBOX') {
    return `/inboxes/${resource.externalResourceId}/members`;
  }
  return `/teams/${resource.externalResourceId}/team_members`;
}

async function readExternalMembers(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resource: ResourceProjection;
  fetchImpl?: typeof fetch;
}) {
  const raw = await chatwootAdminAccountRequest<unknown>({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    resourcePath: membershipPath(input.resource),
    method: 'GET',
    fetchImpl: input.fetchImpl,
  });
  return normalizeExternalMemberIds(input.resource.kind, raw);
}

async function claimSync(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resource: ResourceProjection;
  desiredHash: string;
  desiredCount: number;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc(
    'claim_chatwoot_membership_sync',
    {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_resource_kind: input.resource.kind,
      p_mapping_id: input.resource.mappingId,
      p_expected_mapping_version: input.resource.mappingVersion,
      p_desired_set_sha256: input.desiredHash,
      p_desired_count: input.desiredCount,
      p_request_key: input.requestKey,
    },
  );

  if (error) {
    return fail(
      'RECONCILIATION_REQUIRED',
      'Chatwoot membership sync claim failed',
    );
  }

  const single = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (
    !isPlainObject(single) ||
    typeof single.is_new !== 'boolean' ||
    single.entity_id !== input.resource.mappingId ||
    single.applied_version !== input.resource.mappingVersion
  ) {
    return fail(
      'CANONICAL_STATE_INVALID',
      'Chatwoot membership sync claim response is invalid',
    );
  }
}

async function recordResult(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resource: ResourceProjection;
  desiredHash: string;
  desiredCount: number;
  beforeHash: string;
  beforeCount: number;
  afterHash: string;
  afterCount: number;
  mutationAttempted: boolean;
  outcome:
    | SyncOutcome
    | 'AMBIGUOUS_UNRESOLVED'
    | 'DRIFT_UNRESOLVED';
  requestKey: string;
}) {
  const { error } = await input.service.rpc(
    'record_chatwoot_membership_sync_result',
    {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_resource_kind: input.resource.kind,
      p_mapping_id: input.resource.mappingId,
      p_mapping_version: input.resource.mappingVersion,
      p_desired_set_sha256: input.desiredHash,
      p_desired_count: input.desiredCount,
      p_observed_before_sha256: input.beforeHash,
      p_observed_before_count: input.beforeCount,
      p_observed_after_sha256: input.afterHash,
      p_observed_after_count: input.afterCount,
      p_mutation_attempted: input.mutationAttempted,
      p_outcome: input.outcome,
      p_request_key: input.requestKey,
    },
  );

  if (error) {
    return fail(
      'RECONCILIATION_REQUIRED',
      'Chatwoot membership sync audit could not be recorded',
    );
  }
}

async function markMembershipDrift(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resource: ResourceProjection;
  requestKey: string;
}) {
  const rpc =
    input.resource.kind === 'INBOX'
      ? 'mark_chatwoot_inbox_mapping_degraded'
      : 'mark_chatwoot_team_mapping_degraded';

  const mappingArg =
    input.resource.kind === 'INBOX'
      ? { p_inbox_mapping_id: input.resource.mappingId }
      : { p_team_mapping_id: input.resource.mappingId };

  const { error } = await input.supabase.rpc(rpc, {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    ...mappingArg,
    p_expected_version: input.resource.mappingVersion,
    p_last_error_code: 'MEMBERSHIP_DRIFT',
    p_request_key: input.requestKey,
  });

  if (error) {
    return fail(
      'RECONCILIATION_REQUIRED',
      'Unresolved membership drift could not degrade the mapping safely',
    );
  }
}

async function recordUnresolvedAndDegrade(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resource: ResourceProjection;
  desiredHash: string;
  desiredCount: number;
  beforeHash: string;
  beforeCount: number;
  afterIds: number[];
  outcome: 'AMBIGUOUS_UNRESOLVED' | 'DRIFT_UNRESOLVED';
  claimRequestKey: string;
  degradeRequestKey: string;
}) {
  const afterHash = await hashMemberSet(input.afterIds);
  let auditFailure: unknown;

  try {
    await recordResult({
      service: input.service,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      resource: input.resource,
      desiredHash: input.desiredHash,
      desiredCount: input.desiredCount,
      beforeHash: input.beforeHash,
      beforeCount: input.beforeCount,
      afterHash,
      afterCount: input.afterIds.length,
      mutationAttempted: true,
      outcome: input.outcome,
      requestKey: input.claimRequestKey,
    });
  } catch (error) {
    auditFailure = error;
  }

  await markMembershipDrift({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    resource: input.resource,
    requestKey: input.degradeRequestKey,
  });

  if (auditFailure) throw auditFailure;

  return fail(
    'RECONCILIATION_REQUIRED',
    'Chatwoot membership drift remains unresolved',
  );
}

export async function syncChatwootMembershipSet(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resourceKind: ChatwootMembershipResourceKind;
  mappingId: string;
  requestKey: string;
  fetchImpl?: typeof fetch;
}) {
  const organizationId = requireUuid(input.organizationId, 'organizationId');
  const tenantBusinessId = requireUuid(
    input.tenantBusinessId,
    'tenantBusinessId',
  );
  const mappingId = requireUuid(input.mappingId, 'mappingId');
  if (input.resourceKind !== 'INBOX' && input.resourceKind !== 'TEAM') {
    return fail('INVALID_INPUT', 'resourceKind is invalid');
  }

  const claimRequestKey = childKey(input.requestKey, 'members');
  const degradeRequestKey = childKey(input.requestKey, 'members-degraded');

  await requireOwnerSession(input.supabase, organizationId);
  const service = createSupabaseServiceClient();

  const resource = await readResourceProjection({
    service,
    organizationId,
    tenantBusinessId,
    kind: input.resourceKind,
    mappingId,
  });

  const desiredIds = await readDesiredMembershipSet({
    service,
    organizationId,
    tenantBusinessId,
    resource,
  });
  const desiredHash = await hashMemberSet(desiredIds);

  const beforeIds = await readExternalMembers({
    supabase: input.supabase,
    organizationId,
    tenantBusinessId,
    resource,
    fetchImpl: input.fetchImpl,
  });
  const beforeHash = await hashMemberSet(beforeIds);

  await claimSync({
    supabase: input.supabase,
    organizationId,
    tenantBusinessId,
    resource,
    desiredHash,
    desiredCount: desiredIds.length,
    requestKey: claimRequestKey,
  });

  if (sameIds(beforeIds, desiredIds)) {
    await recordResult({
      service,
      organizationId,
      tenantBusinessId,
      resource,
      desiredHash,
      desiredCount: desiredIds.length,
      beforeHash,
      beforeCount: beforeIds.length,
      afterHash: beforeHash,
      afterCount: beforeIds.length,
      mutationAttempted: false,
      outcome: 'ALREADY_MATCHED',
      requestKey: claimRequestKey,
    });

    return {
      resourceKind: resource.kind,
      mappingId: resource.mappingId,
      mappingVersion: resource.mappingVersion,
      desiredCount: desiredIds.length,
      observedCount: beforeIds.length,
      outcome: 'ALREADY_MATCHED' as const,
    };
  }

  let mutationResponse: unknown;
  try {
    mutationResponse = await chatwootAdminAccountRequest<unknown>({
      supabase: input.supabase,
      organizationId,
      tenantBusinessId,
      resourcePath: membershipPath(resource),
      method: 'PATCH',
      body: { user_ids: desiredIds },
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
      throw error;
    }

    const afterIds = await readExternalMembers({
      supabase: input.supabase,
      organizationId,
      tenantBusinessId,
      resource,
      fetchImpl: input.fetchImpl,
    });
    const afterHash = await hashMemberSet(afterIds);

    if (sameIds(afterIds, desiredIds)) {
      await recordResult({
        service,
        organizationId,
        tenantBusinessId,
        resource,
        desiredHash,
        desiredCount: desiredIds.length,
        beforeHash,
        beforeCount: beforeIds.length,
        afterHash,
        afterCount: afterIds.length,
        mutationAttempted: true,
        outcome: 'RECONCILED_AFTER_AMBIGUOUS_MUTATION',
        requestKey: claimRequestKey,
      });

      return {
        resourceKind: resource.kind,
        mappingId: resource.mappingId,
        mappingVersion: resource.mappingVersion,
        desiredCount: desiredIds.length,
        observedCount: afterIds.length,
        outcome: 'RECONCILED_AFTER_AMBIGUOUS_MUTATION' as const,
      };
    }

    return recordUnresolvedAndDegrade({
      supabase: input.supabase,
      service,
      organizationId,
      tenantBusinessId,
      resource,
      desiredHash,
      desiredCount: desiredIds.length,
      beforeHash,
      beforeCount: beforeIds.length,
      afterIds,
      outcome: 'AMBIGUOUS_UNRESOLVED',
      claimRequestKey,
      degradeRequestKey,
    });
  }

  let afterIds = normalizeExternalMemberIds(resource.kind, mutationResponse);

  if (!sameIds(afterIds, desiredIds)) {
    afterIds = await readExternalMembers({
      supabase: input.supabase,
      organizationId,
      tenantBusinessId,
      resource,
      fetchImpl: input.fetchImpl,
    });
  }

  if (!sameIds(afterIds, desiredIds)) {
    return recordUnresolvedAndDegrade({
      supabase: input.supabase,
      service,
      organizationId,
      tenantBusinessId,
      resource,
      desiredHash,
      desiredCount: desiredIds.length,
      beforeHash,
      beforeCount: beforeIds.length,
      afterIds,
      outcome: 'DRIFT_UNRESOLVED',
      claimRequestKey,
      degradeRequestKey,
    });
  }

  const afterHash = await hashMemberSet(afterIds);
  await recordResult({
    service,
    organizationId,
    tenantBusinessId,
    resource,
    desiredHash,
    desiredCount: desiredIds.length,
    beforeHash,
    beforeCount: beforeIds.length,
    afterHash,
    afterCount: afterIds.length,
    mutationAttempted: true,
    outcome: 'UPDATED_VERIFIED',
    requestKey: claimRequestKey,
  });

  return {
    resourceKind: resource.kind,
    mappingId: resource.mappingId,
    mappingVersion: resource.mappingVersion,
    desiredCount: desiredIds.length,
    observedCount: afterIds.length,
    outcome: 'UPDATED_VERIFIED' as const,
  };
}
