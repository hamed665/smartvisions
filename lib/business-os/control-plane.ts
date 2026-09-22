export const TENANT_SCOPE_ORDER = [
  'ORGANIZATION',
  'BRAND',
  'BUSINESS',
  'BRANCH',
  'DEPARTMENT',
  'TEAM',
] as const;

export type TenantScopeType = (typeof TENANT_SCOPE_ORDER)[number];
export type LowerTenantScopeType = Exclude<TenantScopeType, 'ORGANIZATION'>;

export type TenantScope = {
  organizationId: string;
  brandId?: string;
  tenantBusinessId?: string;
  branchId?: string;
  departmentId?: string;
  teamId?: string;
};

export type TenantScopeLineage = {
  brand?: { id: string; organizationId: string };
  tenantBusiness?: { id: string; organizationId: string; brandId: string };
  branch?: { id: string; organizationId: string; tenantBusinessId: string };
  department?: { id: string; organizationId: string; branchId: string };
  team?: { id: string; organizationId: string; departmentId: string };
};

export const ORGANIZATION_ROLES = [
  'OWNER',
  'ADMIN',
  'SALES_MANAGER',
  'SALES_AGENT',
  'VIEWER',
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type ScopedRole = Exclude<OrganizationRole, 'OWNER'>;

export const USAGE_CLASSIFICATIONS = [
  'BILLABLE',
  'NON_BILLABLE',
  'SYSTEM_RETRY',
  'CACHED',
  'PROMOTIONAL',
  'INTERNAL',
] as const;

export type UsageClassification = (typeof USAGE_CLASSIFICATIONS)[number];

export type PolicyAttributeValue = string | number | boolean;
export type PolicyAttributes = Record<string, PolicyAttributeValue>;

export type NormalizedScopeOverride<T> = {
  organizationId: string;
  scopeType: TenantScopeType;
  scopeId?: string | null;
  value: T;
};

export type MemberScopeAssignment = {
  organizationId: string;
  userId: string;
  scopeType: LowerTenantScopeType;
  scopeId: string;
  role: ScopedRole;
  attributes?: Record<string, unknown>;
};

export type EntitlementOverride<T = unknown> = {
  value: T;
  validFrom: string | Date;
  validTo?: string | Date | null;
};

export const SUBSCRIPTION_STATES = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELED',
  'EXPIRED',
] as const;

export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export const CATALOG_STATES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type CatalogState = (typeof CATALOG_STATES)[number];

function required(value: string | undefined, name: string): asserts value is string {
  if (!value?.trim()) throw new Error(`${name} is required for canonical tenant scope`);
}

export function assertCanonicalTenantScope(scope: TenantScope): TenantScope {
  required(scope.organizationId, 'organizationId');

  if (scope.teamId) required(scope.departmentId, 'departmentId');
  if (scope.departmentId) required(scope.branchId, 'branchId');
  if (scope.branchId) required(scope.tenantBusinessId, 'tenantBusinessId');
  if (scope.tenantBusinessId) required(scope.brandId, 'brandId');

  return scope;
}

export function assertTenantScopeLineage(
  scope: TenantScope,
  lineage: TenantScopeLineage = {},
): TenantScope {
  assertCanonicalTenantScope(scope);

  if (scope.brandId) {
    if (
      lineage.brand?.id !== scope.brandId
      || lineage.brand.organizationId !== scope.organizationId
    ) {
      throw new Error('brand lineage does not match canonical tenant scope');
    }
  }

  if (scope.tenantBusinessId) {
    if (
      lineage.tenantBusiness?.id !== scope.tenantBusinessId
      || lineage.tenantBusiness.organizationId !== scope.organizationId
      || lineage.tenantBusiness.brandId !== scope.brandId
    ) {
      throw new Error('tenant business lineage does not match canonical tenant scope');
    }
  }

  if (scope.branchId) {
    if (
      lineage.branch?.id !== scope.branchId
      || lineage.branch.organizationId !== scope.organizationId
      || lineage.branch.tenantBusinessId !== scope.tenantBusinessId
    ) {
      throw new Error('branch lineage does not match canonical tenant scope');
    }
  }

  if (scope.departmentId) {
    if (
      lineage.department?.id !== scope.departmentId
      || lineage.department.organizationId !== scope.organizationId
      || lineage.department.branchId !== scope.branchId
    ) {
      throw new Error('department lineage does not match canonical tenant scope');
    }
  }

  if (scope.teamId) {
    if (
      lineage.team?.id !== scope.teamId
      || lineage.team.organizationId !== scope.organizationId
      || lineage.team.departmentId !== scope.departmentId
    ) {
      throw new Error('team lineage does not match canonical tenant scope');
    }
  }

  return scope;
}

export function deepestScopeType(scope: TenantScope): TenantScopeType {
  assertCanonicalTenantScope(scope);
  if (scope.teamId) return 'TEAM';
  if (scope.departmentId) return 'DEPARTMENT';
  if (scope.branchId) return 'BRANCH';
  if (scope.tenantBusinessId) return 'BUSINESS';
  if (scope.brandId) return 'BRAND';
  return 'ORGANIZATION';
}

export function scopeId(scope: TenantScope, type: TenantScopeType): string | null {
  assertCanonicalTenantScope(scope);
  if (type === 'ORGANIZATION') return scope.organizationId;
  if (type === 'BRAND') return scope.brandId ?? null;
  if (type === 'BUSINESS') return scope.tenantBusinessId ?? null;
  if (type === 'BRANCH') return scope.branchId ?? null;
  if (type === 'DEPARTMENT') return scope.departmentId ?? null;
  return scope.teamId ?? null;
}

function scopeRank(type: TenantScopeType) {
  return TENANT_SCOPE_ORDER.indexOf(type);
}

export function isOverrideApplicable<T>(
  target: TenantScope,
  override: NormalizedScopeOverride<T>,
): boolean {
  assertCanonicalTenantScope(target);
  if (override.organizationId !== target.organizationId) return false;
  if (override.scopeType === 'ORGANIZATION') {
    return override.scopeId == null || override.scopeId === target.organizationId;
  }
  const targetId = scopeId(target, override.scopeType);
  return Boolean(targetId && override.scopeId === targetId);
}

/**
 * Resolve one already-selected configuration/feature key.
 *
 * The persistence adapter is responsible for loading rows for one namespace/key
 * and normalizing each row to {scopeType, scopeId, value}. This function then
 * applies deterministic Organization -> ... -> Team precedence.
 */
export function resolveScopedValue<T>(input: {
  target: TenantScope;
  lineage?: TenantScopeLineage;
  legacyOrganizationValue?: T;
  overrides: NormalizedScopeOverride<T>[];
}): T | undefined {
  assertTenantScopeLineage(input.target, input.lineage);
  let value = input.legacyOrganizationValue;

  const applicable = input.overrides
    .filter((override) => isOverrideApplicable(input.target, override))
    .sort((a, b) => scopeRank(a.scopeType) - scopeRank(b.scopeType));

  for (const override of applicable) value = override.value;
  return value;
}

export function resolveFeatureFlag(input: {
  target: TenantScope;
  lineage?: TenantScopeLineage;
  defaultEnabled: boolean;
  overrides: NormalizedScopeOverride<boolean>[];
}) {
  return resolveScopedValue({
    target: input.target,
    lineage: input.lineage,
    legacyOrganizationValue: input.defaultEnabled,
    overrides: input.overrides,
  }) ?? input.defaultEnabled;
}

export function canReadControlPlane(role: OrganizationRole) {
  return ORGANIZATION_ROLES.includes(role);
}

/**
 * Mirrors the current database contract: only organization OWNER may mutate
 * control-plane configuration/hierarchy through authenticated tenant access.
 */
export function canMutateControlPlane(role: OrganizationRole) {
  return role === 'OWNER';
}

export function isScopeAssignmentApplicable(
  target: TenantScope,
  assignment: MemberScopeAssignment,
) {
  assertCanonicalTenantScope(target);
  if (assignment.organizationId !== target.organizationId) return false;
  return scopeId(target, assignment.scopeType) === assignment.scopeId;
}

function isPolicyAttributeValue(value: unknown): value is PolicyAttributeValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Foundation ABAC is deliberately small and fail-closed: an assignment may
 * require scalar attributes and every declared requirement must exactly match
 * the trusted policy context supplied by the caller. Nested/unsupported values
 * never grant access.
 */
export function matchesPolicyAttributes(
  requiredAttributes: Record<string, unknown> | undefined,
  actualAttributes: PolicyAttributes = {},
) {
  if (!requiredAttributes) return true;
  for (const [key, requiredValue] of Object.entries(requiredAttributes)) {
    if (!isPolicyAttributeValue(requiredValue)) return false;
    if (actualAttributes[key] !== requiredValue) return false;
  }
  return true;
}

export function effectiveRoleForScope(input: {
  organizationRole: OrganizationRole;
  userId: string;
  target: TenantScope;
  lineage?: TenantScopeLineage;
  assignments: MemberScopeAssignment[];
  policyAttributes?: PolicyAttributes;
}): OrganizationRole {
  assertTenantScopeLineage(input.target, input.lineage);
  if (input.organizationRole === 'OWNER') return 'OWNER';

  const applicable = input.assignments
    .filter((assignment) =>
      assignment.userId === input.userId
      && isScopeAssignmentApplicable(input.target, assignment)
      && matchesPolicyAttributes(assignment.attributes, input.policyAttributes))
    .sort((a, b) => scopeRank(b.scopeType) - scopeRank(a.scopeType));

  return applicable[0]?.role ?? input.organizationRole;
}

function toMillis(value: string | Date) {
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(millis)) throw new Error('invalid entitlement validity timestamp');
  return millis;
}

export function resolveEntitlement<T>(input: {
  planValue?: T;
  overrides?: EntitlementOverride<T>[];
  at?: Date;
}): T | undefined {
  const at = (input.at ?? new Date()).getTime();
  const active = (input.overrides ?? [])
    .filter((override) => {
      const start = toMillis(override.validFrom);
      const end = override.validTo == null ? Number.POSITIVE_INFINITY : toMillis(override.validTo);
      return start <= at && at < end;
    })
    .sort((a, b) => toMillis(b.validFrom) - toMillis(a.validFrom));

  return active[0]?.value ?? input.planValue;
}

/**
 * Current commercial policy is fixed at 4x for explicitly BILLABLE AI usage.
 * Money multiplication itself belongs in the numeric billing ledger, not JS.
 * Changing this policy requires an explicit versioned commercial migration.
 */
export function customerAiChargeMultiplier(classification: UsageClassification) {
  return classification === 'BILLABLE' ? 4 : 0;
}

export function isCatalogTransitionAllowed(from: CatalogState, to: CatalogState) {
  if (from === to) return true;
  if (from === 'DRAFT') return to === 'ACTIVE';
  if (from === 'ACTIVE') return to === 'RETIRED';
  return false;
}

const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionState, ReadonlySet<SubscriptionState>> = {
  TRIAL: new Set(['ACTIVE']),
  ACTIVE: new Set(['PAST_DUE']),
  PAST_DUE: new Set(['ACTIVE', 'GRACE_PERIOD']),
  GRACE_PERIOD: new Set(['SUSPENDED']),
  SUSPENDED: new Set(['CANCELED', 'EXPIRED']),
  CANCELED: new Set(),
  EXPIRED: new Set(),
};

export function isSubscriptionTransitionAllowed(
  from: SubscriptionState,
  to: SubscriptionState,
) {
  return from === to || SUBSCRIPTION_TRANSITIONS[from].has(to);
}
