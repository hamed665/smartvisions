import type { SupabaseClient } from '@supabase/supabase-js';

export const CRM_CUSTOMER360_RESOLUTION_ROLES = ['OWNER', 'ADMIN', 'SALES_MANAGER'] as const;
export const CRM_CUSTOMER360_ENTITY_TYPES = ['LEAD', 'CONVERSATION', 'TASK', 'DEAL'] as const;

export type CrmCustomer360ResolutionRole = typeof CRM_CUSTOMER360_RESOLUTION_ROLES[number];
export type CrmCustomer360EntityType = typeof CRM_CUSTOMER360_ENTITY_TYPES[number];

export function isCrmCustomer360ResolutionRole(value: unknown): value is CrmCustomer360ResolutionRole {
  return typeof value === 'string'
    && (CRM_CUSTOMER360_RESOLUTION_ROLES as readonly string[]).includes(value);
}

export function isCrmCustomer360EntityType(value: unknown): value is CrmCustomer360EntityType {
  return typeof value === 'string'
    && (CRM_CUSTOMER360_ENTITY_TYPES as readonly string[]).includes(value);
}

export async function getCrmCustomer360(input: {
  supabase: SupabaseClient;
  organizationId: string;
  personId: string;
  limit: number;
}) {
  const { data, error } = await input.supabase.rpc('get_crm_customer360_v3', {
    p_organization_id: input.organizationId,
    p_person_id: input.personId,
    p_limit: input.limit,
  });

  if (error) throw new Error(`CRM Customer 360 lookup failed: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('CRM Customer 360 returned no data');
  return data as Record<string, unknown>;
}

export async function linkCrmCustomer360PersonContext(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string | null;
  entityType: CrmCustomer360EntityType;
  entityId: string;
  personId: string;
  verificationMethod: 'MANUAL_CONFIRMED' | 'PROVIDER_AUTHENTICATED' | 'IMPORT_VERIFIED';
  sourceRef: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.service.rpc('link_crm_customer360_person_context', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_person_id: input.personId,
    p_verification_method: input.verificationMethod,
    p_source_ref: input.sourceRef,
    p_evidence: input.evidence,
  });

  if (error) throw new Error(`CRM Customer 360 Person link failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_entity_id || !row?.resolved_person_id) {
    throw new Error('CRM Customer 360 Person link returned no entity');
  }
  return {
    entityType: String(row.resolved_entity_type),
    entityId: String(row.resolved_entity_id),
    personId: String(row.resolved_person_id),
    replayed: row.replayed === true,
  };
}

export async function unlinkCrmCustomer360PersonContext(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  entityType: CrmCustomer360EntityType;
  entityId: string;
  expectedPersonId: string;
  reason: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.service.rpc('unlink_crm_customer360_person_context', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_expected_person_id: input.expectedPersonId,
    p_reason: input.reason,
    p_evidence: input.evidence,
  });

  if (error) throw new Error(`CRM Customer 360 Person unlink failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_entity_id || !row?.resolved_person_id) {
    throw new Error('CRM Customer 360 Person unlink returned no entity');
  }
  return {
    entityType: String(row.resolved_entity_type),
    entityId: String(row.resolved_entity_id),
    personId: String(row.resolved_person_id),
    replayed: row.replayed === true,
  };
}
