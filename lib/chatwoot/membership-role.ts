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
 * Read-only Candidate projection. Use an authenticated OWNER client: RLS must
 * permit reading the target member and assignments. This is not an authorization
 * ticket for a future mutation; the governed writer must recheck fresh canonical
 * state in its transaction before any external AccountUser change.
 */
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

  const [owner, member, business] = await Promise.all([
    input.supabase.from('organization_members').select('role')
      .eq('organization_id', input.organizationId)
      .eq('user_id', auth.user.id).single(),
    input.supabase.from('organization_members').select('role')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.smartUserId).single(),
    input.supabase.from('tenant_businesses')
      .select('id,organization_id,brand_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', input.tenantBusinessId).single(),
  ]);
  if (owner.error || owner.data?.role !== 'OWNER' || member.error ||
      !member.data || business.error || !business.data ||
      business.data.id !== input.tenantBusinessId ||
      business.data.organization_id !== input.organizationId ||
      !isUuid(business.data.brand_id) || business.data.status !== 'ACTIVE') return reject();

  const role = memberRole(member.data.role);
  const [brand, assignments] = await Promise.all([
    input.supabase.from('brands').select('id,organization_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', business.data.brand_id).single(),
    input.supabase.from('member_scope_assignments')
      .select('organization_id,user_id,scope_type,brand_id,tenant_business_id,role,attributes')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.smartUserId)
      .in('scope_type', ['BRAND', 'BUSINESS']),
  ]);

  if (brand.error || !brand.data || brand.data.id !== business.data.brand_id ||
      brand.data.organization_id !== input.organizationId ||
      brand.data.status !== 'ACTIVE' || assignments.error ||
      !Array.isArray(assignments.data)) return reject();

  const scoped: MemberScopeAssignment[] = assignments.data.map((row) => {
    if (row.organization_id !== input.organizationId ||
        row.user_id !== input.smartUserId ||
        (row.scope_type !== 'BRAND' && row.scope_type !== 'BUSINESS') ||
        !SCOPED_ROLES.has(row.role as ScopedRole) ||
        !row.attributes || typeof row.attributes !== 'object' ||
        Array.isArray(row.attributes)) return reject();
    const id = row.scope_type === 'BRAND' ? row.brand_id : row.tenant_business_id;
    if (!isUuid(id) ||
        (row.scope_type === 'BRAND' && row.tenant_business_id !== null) ||
        (row.scope_type === 'BUSINESS' && row.brand_id !== null)) return reject();
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
    // No caller-provided policy attributes: conditional grants cannot be
    // upgraded into a Business-wide Account membership without trusted context.
  });

  return {
    effectiveSmartRole,
    chatwootRole: effectiveSmartRole === 'OWNER' ? 'administrator'
      : effectiveSmartRole === 'VIEWER' ? null : 'agent',
  };
}
