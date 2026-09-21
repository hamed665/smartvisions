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
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
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
  legacyOrganizationValue?: T;
  overrides: NormalizedScopeOverride<T>[];
}): T | undefined {
  assertCanonicalTenantScope(input.target);
  let value = input.legacyOrganizationValue;

  const applicable = input.overrides
    .filter((override) => isOverrideApplicable(input.target, override))
    .sort((a, b) => scopeRank(a.scopeType) - scopeRank(b.scopeType));

  for (const override of applicable) value = override.value;
  return value;
}

export function resolveFeatureFlag(input: {
  target: TenantScope;
  defaultEnabled: boolean;
  overrides: NormalizedScopeOverride<boolean>[];
}) {
  return resolveScopedValue({
    target: input.target,
    legacyOrganizationValue: input.defaultEnabled,
    overrides: input.overrides,
  }) ?? input.defaultEnabled;
}

export function canReadControlPlane(_role: OrganizationRole) {
  return true;
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

export function effectiveRoleForScope(input: {
  organizationRole: OrganizationRole;
  userId: string;
  target: TenantScope;
  assignments: MemberScopeAssignment[];
}): OrganizationRole {
  if (input.organizationRole === 'OWNER') return 'OWNER';

  const applicable = input.assignments
    .filter((assignment) =>
      assignment.userId === input.userId
      && isScopeAssignmentApplicable(input.target, assignment))
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
 * Returns the exact multiplier to apply in the numeric billing ledger.
 * Keeping multiplication out of JS avoids introducing floating-point money as
 * a source of truth. Pricing versions currently default this multiplier to 4.
 */
export function customerAiChargeMultiplier(
  classification: UsageClassification,
  configuredMultiplier = 4,
) {
  if (!Number.isFinite(configuredMultiplier) || configuredMultiplier < 0) {
    throw new Error('AI customer charge multiplier must be a finite non-negative number');
  }
  return classification === 'BILLABLE' ? configuredMultiplier : 0;
}

export function isCatalogTransitionAllowed(from: CatalogState, to: CatalogState) {
  if (from === to) return true;
  if (from === 'DRAFT') return to === 'ACTIVE';
  if (from === 'ACTIVE') return to === 'RETIRED';
  return false;
}

const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionState, ReadonlySet<SubscriptionState>> = {
  TRIALING: new Set(['ACTIVE', 'CANCELED']),
  ACTIVE: new Set(['PAST_DUE', 'PAUSED', 'CANCELED']),
  PAST_DUE: new Set(['ACTIVE', 'PAUSED', 'CANCELED']),
  PAUSED: new Set(['ACTIVE', 'CANCELED']),
  CANCELED: new Set(['EXPIRED']),
  EXPIRED: new Set(),
};

export function isSubscriptionTransitionAllowed(
  from: SubscriptionState,
  to: SubscriptionState,
) {
  return from === to || SUBSCRIPTION_TRANSITIONS[from].has(to);
}
