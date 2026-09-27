import type { SupabaseClient } from '@supabase/supabase-js';

export const CRM_PERSON_VERIFICATION_METHODS = [
  'MANUAL_CONFIRMED',
  'PROVIDER_AUTHENTICATED',
  'IMPORT_VERIFIED',
] as const;

export const CRM_PERSON_RELATIONSHIP_TYPES = [
  'CONTACT',
  'OWNER',
  'EMPLOYEE',
  'DECISION_MAKER',
  'BILLING_CONTACT',
  'OTHER',
] as const;

export type CrmPersonVerificationMethod = typeof CRM_PERSON_VERIFICATION_METHODS[number];
export type CrmPersonRelationshipType = typeof CRM_PERSON_RELATIONSHIP_TYPES[number];

export type CrmPersonMutationRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SALES_MANAGER'
  | 'SALES_AGENT';

export const CRM_PERSON_MUTATION_ROLES: readonly CrmPersonMutationRole[] = [
  'OWNER',
  'ADMIN',
  'SALES_MANAGER',
  'SALES_AGENT',
];

export function isCrmPersonVerificationMethod(value: unknown): value is CrmPersonVerificationMethod {
  return typeof value === 'string'
    && (CRM_PERSON_VERIFICATION_METHODS as readonly string[]).includes(value);
}

export function isCrmPersonRelationshipType(value: unknown): value is CrmPersonRelationshipType {
  return typeof value === 'string'
    && (CRM_PERSON_RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

export function isCrmPersonMutationRole(value: unknown): value is CrmPersonMutationRole {
  return typeof value === 'string'
    && (CRM_PERSON_MUTATION_ROLES as readonly string[]).includes(value);
}

export async function createOrResolveCrmPerson(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  identityId: string;
  displayName?: string | null;
  verificationMethod: CrmPersonVerificationMethod;
  sourceRef: string;
  evidence: Record<string, unknown>;
  relationship?: {
    businessId: string;
    relationshipType: CrmPersonRelationshipType;
    jobTitle?: string | null;
    verificationMethod: CrmPersonVerificationMethod;
    sourceRef: string;
    evidence: Record<string, unknown>;
  } | null;
}) {
  const relationship = input.relationship ?? null;
  const { data, error } = await input.service.rpc(
    'create_or_resolve_crm_person_from_verified_identity',
    {
      p_organization_id: input.organizationId,
      p_actor_user_id: input.actorUserId,
      p_identity_id: input.identityId,
      p_display_name: input.displayName ?? null,
      p_verification_method: input.verificationMethod,
      p_source_ref: input.sourceRef,
      p_evidence: input.evidence,
      p_business_id: relationship?.businessId ?? null,
      p_relationship_type: relationship?.relationshipType ?? null,
      p_job_title: relationship?.jobTitle ?? null,
      p_relationship_verification_method: relationship?.verificationMethod ?? null,
      p_relationship_source_ref: relationship?.sourceRef ?? null,
      p_relationship_evidence: relationship?.evidence ?? null,
    },
  );

  if (error) {
    throw new Error(`CRM Person mutation failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_person_id) {
    throw new Error('CRM Person mutation returned no Person');
  }

  return {
    personId: String(row.resolved_person_id),
    created: row.created === true,
    relationshipId: row.resolved_relationship_id
      ? String(row.resolved_relationship_id)
      : null,
  };
}

export async function listCrmPeople(input: {
  supabase: SupabaseClient;
  organizationId: string;
  businessId?: string | null;
  identityId?: string | null;
  limit: number;
}) {
  let personIds: string[] | null = null;

  if (input.businessId) {
    const { data, error } = await input.supabase
      .from('crm_person_business_relationships')
      .select('person_id')
      .eq('organization_id', input.organizationId)
      .eq('business_id', input.businessId)
      .eq('status', 'ACTIVE');

    if (error) throw new Error(`CRM Person relationship lookup failed: ${error.message}`);
    personIds = [...new Set((data ?? []).map(row => String(row.person_id)))];
  }

  if (input.identityId) {
    const { data, error } = await input.supabase
      .from('crm_person_identity_links')
      .select('person_id')
      .eq('organization_id', input.organizationId)
      .eq('identity_id', input.identityId)
      .neq('status', 'RETIRED');

    if (error) throw new Error(`CRM Person identity lookup failed: ${error.message}`);
    const identityPersonIds = [...new Set((data ?? []).map(row => String(row.person_id)))];
    personIds = personIds === null
      ? identityPersonIds
      : personIds.filter(id => identityPersonIds.includes(id));
  }

  if (personIds !== null && personIds.length === 0) return [];

  let query = input.supabase
    .from('crm_people')
    .select('id,organization_id,created_from_identity_id,display_name,status,merged_into_person_id,first_seen_at,last_seen_at,created_at,updated_at')
    .eq('organization_id', input.organizationId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(input.limit);

  if (personIds !== null) query = query.in('id', personIds);

  const { data, error } = await query;
  if (error) throw new Error(`CRM Person list failed: ${error.message}`);
  return data ?? [];
}
