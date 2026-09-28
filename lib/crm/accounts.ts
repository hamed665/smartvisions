import type { SupabaseClient } from '@supabase/supabase-js';

export const CRM_ACCOUNT_MUTATION_ROLES = ['OWNER', 'ADMIN', 'SALES_MANAGER'] as const;
export const CRM_ACCOUNT_LIFECYCLES = [
  'UNCLASSIFIED',
  'PROSPECT',
  'QUALIFIED',
  'CUSTOMER',
  'FORMER_CUSTOMER',
  'PARTNER',
  'ARCHIVED',
] as const;
export const CRM_ACCOUNT_HIERARCHY_RELATIONS = [
  'BRANCH_OF',
  'SUBSIDIARY_OF',
  'DIVISION_OF',
] as const;

export type CrmAccountMutationRole = typeof CRM_ACCOUNT_MUTATION_ROLES[number];
export type CrmAccountLifecycle = typeof CRM_ACCOUNT_LIFECYCLES[number];
export type CrmAccountHierarchyRelation = typeof CRM_ACCOUNT_HIERARCHY_RELATIONS[number];

export type CrmAccountListRow = {
  id: string;
  organization_id: string;
  name: string;
  country_code: string;
  account_lifecycle: CrmAccountLifecycle;
  account_owner_user_id: string | null;
  parent_business_id: string | null;
  hierarchy_relation: CrmAccountHierarchyRelation | null;
  updated_at: string;
};

export function isCrmAccountMutationRole(value: unknown): value is CrmAccountMutationRole {
  return typeof value === 'string'
    && (CRM_ACCOUNT_MUTATION_ROLES as readonly string[]).includes(value);
}

export function isCrmAccountLifecycle(value: unknown): value is CrmAccountLifecycle {
  return typeof value === 'string'
    && (CRM_ACCOUNT_LIFECYCLES as readonly string[]).includes(value);
}

export function isCrmAccountHierarchyRelation(value: unknown): value is CrmAccountHierarchyRelation {
  return typeof value === 'string'
    && (CRM_ACCOUNT_HIERARCHY_RELATIONS as readonly string[]).includes(value);
}

function clampLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.trunc(value ?? 100), 1), 250);
}

export async function listCrmAccounts(input: {
  supabase: SupabaseClient;
  organizationId: string;
  limit?: number;
}) {
  const { data, error } = await input.supabase
    .from('businesses')
    .select([
      'id',
      'organization_id',
      'name',
      'country_code',
      'account_lifecycle',
      'account_owner_user_id',
      'parent_business_id',
      'hierarchy_relation',
      'updated_at',
    ].join(','))
    .eq('organization_id', input.organizationId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(clampLimit(input.limit));

  if (error) throw new Error(`CRM Account list failed: ${error.message}`);
  return (data ?? []) as unknown as CrmAccountListRow[];
}

export async function getCrmAccountV2(input: {
  supabase: SupabaseClient;
  organizationId: string;
  businessId: string;
  limit?: number;
}) {
  const { data, error } = await input.supabase.rpc('get_crm_account_v2', {
    p_organization_id: input.organizationId,
    p_business_id: input.businessId,
    p_limit: Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100),
  });

  if (error) throw new Error(`CRM Account lookup failed: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('CRM Account lookup returned no data');
  return data as Record<string, unknown>;
}

export async function setCrmAccountOwnerManual(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  businessId: string;
  ownerUserId: string | null;
  reason: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.service.rpc('set_crm_account_owner_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_business_id: input.businessId,
    p_owner_user_id: input.ownerUserId,
    p_reason: input.reason,
    p_evidence: input.evidence,
  });
  if (error) throw new Error(`CRM Account owner mutation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_business_id) throw new Error('CRM Account owner mutation returned no Account');
  return {
    businessId: String(row.resolved_business_id),
    ownerUserId: row.resolved_owner_user_id ? String(row.resolved_owner_user_id) : null,
    replayed: row.replayed === true,
  };
}

export async function setCrmAccountLifecycleManual(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  businessId: string;
  lifecycle: CrmAccountLifecycle;
  reason: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.service.rpc('set_crm_account_lifecycle_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_business_id: input.businessId,
    p_lifecycle: input.lifecycle,
    p_reason: input.reason,
    p_evidence: input.evidence,
  });
  if (error) throw new Error(`CRM Account lifecycle mutation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_business_id) throw new Error('CRM Account lifecycle mutation returned no Account');
  return {
    businessId: String(row.resolved_business_id),
    lifecycle: String(row.resolved_lifecycle) as CrmAccountLifecycle,
    replayed: row.replayed === true,
  };
}

export async function setCrmAccountParentManual(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  businessId: string;
  parentBusinessId: string | null;
  relation: CrmAccountHierarchyRelation | null;
  reason: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.service.rpc('set_crm_account_parent_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_business_id: input.businessId,
    p_parent_business_id: input.parentBusinessId,
    p_relation: input.relation,
    p_reason: input.reason,
    p_evidence: input.evidence,
  });
  if (error) throw new Error(`CRM Account hierarchy mutation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_business_id) throw new Error('CRM Account hierarchy mutation returned no Account');
  return {
    businessId: String(row.resolved_business_id),
    parentBusinessId: row.resolved_parent_business_id
      ? String(row.resolved_parent_business_id)
      : null,
    relation: row.resolved_relation
      ? String(row.resolved_relation) as CrmAccountHierarchyRelation
      : null,
    replayed: row.replayed === true,
  };
}
