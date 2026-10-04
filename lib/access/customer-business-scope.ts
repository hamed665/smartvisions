import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CUSTOMER_BUSINESS_ROLES = [
  'OWNER',
  'ADMIN',
  'SALES_MANAGER',
  'SALES_AGENT',
  'VIEWER',
] as const;

export type CustomerBusinessRole = (typeof CUSTOMER_BUSINESS_ROLES)[number];

type OrganizationMembership = {
  organization_id: string;
  role: CustomerBusinessRole;
};

type ScopeAssignment = {
  organization_id: string;
  user_id: string;
  scope_type: 'BRAND' | 'BUSINESS' | 'BRANCH' | 'DEPARTMENT' | 'TEAM';
  role: Exclude<CustomerBusinessRole, 'OWNER'>;
  brand_id: string | null;
  tenant_business_id: string | null;
  attributes: Record<string, unknown> | null;
};

export type CustomerBusinessRow = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  slug: string;
  country_code: string | null;
  timezone: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: string;
};

export type CustomerBusinessAccess = {
  id: string;
  organizationId: string;
  brandId: string;
  name: string;
  slug: string;
  countryCode: string | null;
  timezone: string | null;
  organizationRole: CustomerBusinessRole;
  businessRole: CustomerBusinessRole;
};

export class CustomerBusinessAccessError extends Error {
  code: 'AUTHENTICATION_REQUIRED' | 'INVALID_BUSINESS' | 'BUSINESS_NOT_ACCESSIBLE' | 'DATABASE';

  constructor(
    code: CustomerBusinessAccessError['code'],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export function normalizeCustomerBusinessId(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return UUID_RE.test(text) ? text : null;
}

function emptyAttributes(attributes: Record<string, unknown> | null | undefined) {
  return !attributes || Object.keys(attributes).length === 0;
}

export function resolveCustomerBusinessRole(input: {
  membership: OrganizationMembership;
  business: Pick<CustomerBusinessRow, 'id' | 'organization_id' | 'brand_id'>;
  assignments: ScopeAssignment[];
}): CustomerBusinessRole | null {
  if (input.membership.organization_id !== input.business.organization_id) {
    return null;
  }

  if (input.membership.role === 'OWNER') return 'OWNER';

  const directBusiness = input.assignments.find((assignment) =>
    assignment.organization_id === input.business.organization_id
    && assignment.scope_type === 'BUSINESS'
    && assignment.tenant_business_id === input.business.id
    && emptyAttributes(assignment.attributes),
  );
  if (directBusiness) return directBusiness.role;

  const brand = input.assignments.find((assignment) =>
    assignment.organization_id === input.business.organization_id
    && assignment.scope_type === 'BRAND'
    && assignment.brand_id === input.business.brand_id
    && emptyAttributes(assignment.attributes),
  );

  return brand?.role ?? null;
}

export function resolveDefaultCustomerBusiness(
  businesses: CustomerBusinessAccess[],
  requestedBusinessId?: string | null,
) {
  const ordered = [...businesses].sort((left, right) =>
    left.organizationId.localeCompare(right.organizationId)
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id),
  );

  if (requestedBusinessId) {
    return ordered.find((business) => business.id === requestedBusinessId) ?? null;
  }

  return ordered[0] ?? null;
}

async function loadAuthenticatedUser(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new CustomerBusinessAccessError(
      'AUTHENTICATION_REQUIRED',
      'Authentication required',
    );
  }
  return data.user;
}

export async function loadCustomerBusinessAccessContext(input: {
  requestedBusinessId?: string | null;
  supabase?: SupabaseClient;
}) {
  const requestedBusinessId = input.requestedBusinessId
    ? normalizeCustomerBusinessId(input.requestedBusinessId)
    : null;

  if (input.requestedBusinessId && !requestedBusinessId) {
    throw new CustomerBusinessAccessError(
      'INVALID_BUSINESS',
      'Business id is invalid',
    );
  }

  // Deliberately use the authenticated customer client. Operator/Founder
  // context is not an authorization source for this surface.
  const supabase = input.supabase ?? await createClient();
  const user = await loadAuthenticatedUser(supabase);

  const [membershipResult, assignmentResult, businessResult] = await Promise.all([
    supabase
      .from('organization_members')
      .select('organization_id,role')
      .eq('user_id', user.id),
    supabase
      .from('member_scope_assignments')
      .select(
        'organization_id,user_id,scope_type,role,brand_id,tenant_business_id,attributes',
      )
      .eq('user_id', user.id),
    supabase
      .from('tenant_businesses')
      .select(
        'id,organization_id,brand_id,name,slug,country_code,timezone,status,created_at',
      )
      .eq('status', 'ACTIVE'),
  ]);

  if (
    membershipResult.error
    || assignmentResult.error
    || businessResult.error
  ) {
    throw new CustomerBusinessAccessError(
      'DATABASE',
      'Unable to load customer Business access context',
    );
  }

  const memberships = (membershipResult.data ?? []) as OrganizationMembership[];
  const assignments = (assignmentResult.data ?? []) as ScopeAssignment[];
  const rows = (businessResult.data ?? []) as CustomerBusinessRow[];
  const membershipByOrganization = new Map(
    memberships.map((membership) => [membership.organization_id, membership]),
  );

  // RLS is authoritative. This second filter mirrors the same explicit
  // OWNER-or-BRAND/BUSINESS rule so a future policy regression fails closed.
  const businesses = rows.flatMap((business): CustomerBusinessAccess[] => {
    const membership = membershipByOrganization.get(business.organization_id);
    if (!membership) return [];

    const businessRole = resolveCustomerBusinessRole({
      membership,
      business,
      assignments,
    });
    if (!businessRole) return [];

    return [{
      id: business.id,
      organizationId: business.organization_id,
      brandId: business.brand_id,
      name: business.name,
      slug: business.slug,
      countryCode: business.country_code,
      timezone: business.timezone,
      organizationRole: membership.role,
      businessRole,
    }];
  });

  const selectedBusiness = resolveDefaultCustomerBusiness(
    businesses,
    requestedBusinessId,
  );

  if (requestedBusinessId && !selectedBusiness) {
    throw new CustomerBusinessAccessError(
      'BUSINESS_NOT_ACCESSIBLE',
      'Business is not accessible',
    );
  }

  return {
    userId: user.id,
    businesses,
    selectedBusiness,
  };
}
