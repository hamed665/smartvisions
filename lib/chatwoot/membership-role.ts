import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  effectiveRoleForScope,
  ORGANIZATION_ROLES,
  type MemberScopeAssignment,
  type OrganizationRole,
  type ScopedRole,
} from '@/lib/business-os/control-plane';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type BusinessWideChatwootRole = 'administrator' | 'agent' | null;

const SCOPED_ROLES = new Set<ScopedRole>([
  'ADMIN', 'SALES_MANAGER', 'SALES_AGENT', 'VIEWER',
]);

function reject(): never {
  throw new Error('Canonical Business-wide Chatwoot membership role is unavailable');
}

function memberRole(value: unknown): OrganizationRole {
  if (typeof value !== 'string' ||
      !ORGANIZATION_ROLES.includes(value as OrganizationRole)) return reject();
  return value as OrganizationRole;
}

/**
 * Read-only Candidate projection. The caller must supply the authenticated
 * Smart session, but canonical Smart Core reads use the existing server-only
 * service client after that session is verified as the current Organization
 * OWNER. Every service read is explicitly tenant/user scoped and fail closed.
 *
 * This bypass is read-only and is not an authorization ticket for mutation;
 * the governed writer must independently solve transactional authorization.
 */
async function readCanonicalBusinessWideRole(input: {
  organizationId: string;
  tenantBusinessId: string;
  smartUserId: string;
}) {
  const smartCore = createSupabaseServiceClient();

  const [member, business] = await Promise.all([
    smartCore.from('organization_members').select('organization_id,user_id,role')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.smartUserId).single(),
    smartCore.from('tenant_businesses')
      .select('id,organization_id,brand_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', input.tenantBusinessId).single(),
  ]);
  if (member.error || !member.data ||
      member.data.organization_id !== input.organizationId ||
      member.data.user_id !== input.smartUserId ||
      business.error || !business.data ||
      business.data.id !== input.tenantBusinessId ||
      business.data.organization_id !== input.organizationId ||
      !isUuid(business.data.brand_id) || business.data.status !== 'ACTIVE') return reject();

  const role = memberRole(member.data.role);
  const [brand, assignments] = await Promise.all([
    smartCore.from('brands').select('id,organization_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', business.data.brand_id).single(),
    smartCore.from('member_scope_assignments')
      .select('organization_id,user_id,scope_type,brand_id,tenant_business_id,role,attributes')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.smartUserId)
      .or(
        `and(scope_type.eq.BRAND,brand_id.eq.${business.data.brand_id}),` +
        `and(scope_type.eq.BUSINESS,tenant_business_id.eq.${input.tenantBusinessId})`,
      )
      .limit(3),
  ]);

  if (brand.error || !brand.data || brand.data.id !== business.data.brand_id ||
      brand.data.organization_id !== input.organizationId ||
      brand.data.status !== 'ACTIVE' || assignments.error ||
      !Array.isArray(assignments.data) || assignments.data.length > 2) return reject();

  const seenScopes = new Set<string>();
  const scoped: MemberScopeAssignment[] = assignments.data.map((row) => {
    if (row.organization_id !== input.organizationId ||
        row.user_id !== input.smartUserId ||
        (row.scope_type !== 'BRAND' && row.scope_type !== 'BUSINESS') ||
        !SCOPED_ROLES.has(row.role as ScopedRole) ||
        !row.attributes || typeof row.attributes !== 'object' ||
        Array.isArray(row.attributes)) return reject();
    const id = row.scope_type === 'BRAND' ? row.brand_id : row.tenant_business_id;
    if (!isUuid(id) ||
        (row.scope_type === 'BRAND' &&
          (id !== business.data.brand_id || row.tenant_business_id !== null)) ||
        (row.scope_type === 'BUSINESS' &&
          (id !== input.tenantBusinessId || row.brand_id !== null)) ||
        seenScopes.has(row.scope_type)) return reject();
    seenScopes.add(row.scope_type);
    return {
      organizationId: row.organization_id,
      userId: row.user_id,
      scopeType: row.scope_type,
      scopeId: id,
      role: row.role as ScopedRole,
      attributes: row.attributes,
    };
  });

  const effectiveSmartRole = effectiveRoleForScope({
    organizationRole: role,
    userId: input.smartUserId,
    target: {
      organizationId: input.organizationId,
      brandId: business.data.brand_id,
      tenantBusinessId: input.tenantBusinessId,
    },
    lineage: {
      brand: { id: brand.data.id, organizationId: brand.data.organization_id },
      tenantBusiness: {
        id: business.data.id,
        organizationId: business.data.organization_id,
        brandId: business.data.brand_id,
      },
    },
    assignments: scoped,
  });

  return {
    effectiveSmartRole,
    chatwootRole: effectiveSmartRole === 'OWNER' ? 'administrator'
      : effectiveSmartRole === 'VIEWER' ? null : 'agent',
  } as const;
}

export async function readSelfBusinessWideChatwootRole(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  if (!isUuid(input.organizationId) || !isUuid(input.tenantBusinessId)) {
    return reject();
  }

  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (authError || !auth.user?.id || !isUuid(auth.user.id)) return reject();

  const member = await input.supabase.from('organization_members')
    .select('organization_id,user_id,role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', auth.user.id)
    .single();

  if (member.error || !member.data ||
      member.data.organization_id !== input.organizationId ||
      member.data.user_id !== auth.user.id) return reject();

  return readCanonicalBusinessWideRole({
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    smartUserId: auth.user.id,
  });
}

export async function readBusinessWideChatwootRole(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  smartUserId: string;
}): Promise<{ effectiveSmartRole: OrganizationRole; chatwootRole: BusinessWideChatwootRole }> {
  if (!isUuid(input.organizationId) || !isUuid(input.tenantBusinessId) ||
      !isUuid(input.smartUserId)) return reject();

  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (authError || !auth.user?.id || !isUuid(auth.user.id)) return reject();

  // organization_members is self-readable under the authenticated RLS contract.
  // Prove current OWNER authority before creating any service client.
  const owner = await input.supabase.from('organization_members')
    .select('organization_id,user_id,role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', auth.user.id)
    .single();

  if (owner.error || owner.data?.role !== 'OWNER' ||
      owner.data.organization_id !== input.organizationId ||
      owner.data.user_id !== auth.user.id) return reject();

  return readCanonicalBusinessWideRole({
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    smartUserId: input.smartUserId,
  });
}
