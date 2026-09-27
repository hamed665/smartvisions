import type { SupabaseClient } from '@supabase/supabase-js';

export const CRM_IDENTITY_RESOLUTION_ROLES = ['OWNER', 'ADMIN', 'SALES_MANAGER'] as const;
export type CrmIdentityResolutionRole = typeof CRM_IDENTITY_RESOLUTION_ROLES[number];

export function isCrmIdentityResolutionRole(value: unknown): value is CrmIdentityResolutionRole {
  return typeof value === 'string'
    && (CRM_IDENTITY_RESOLUTION_ROLES as readonly string[]).includes(value);
}

export async function listCrmIdentityResolutionCandidates(input: {
  supabase: SupabaseClient;
  organizationId: string;
  limit: number;
}) {
  const { data, error } = await input.supabase.rpc(
    'list_crm_identity_resolution_candidates',
    {
      p_organization_id: input.organizationId,
      p_limit: input.limit,
    },
  );

  if (error) throw new Error(`CRM identity candidate lookup failed: ${error.message}`);
  return data ?? [];
}

export async function mergeCrmPeopleManual(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  sourcePersonId: string;
  targetPersonId: string;
  reason: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.service.rpc('merge_crm_people_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_source_person_id: input.sourcePersonId,
    p_target_person_id: input.targetPersonId,
    p_reason: input.reason,
    p_evidence: input.evidence,
  });

  if (error) throw new Error(`CRM Person merge failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_person_id) throw new Error('CRM Person merge returned no Person');
  return {
    personId: String(row.resolved_person_id),
    replayed: row.replayed === true,
  };
}

export async function splitCrmPersonIdentityManual(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  sourcePersonId: string;
  identityId: string;
  newPersonId: string;
  displayName?: string | null;
  reason: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.service.rpc('split_crm_person_identity_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_source_person_id: input.sourcePersonId,
    p_identity_id: input.identityId,
    p_new_person_id: input.newPersonId,
    p_display_name: input.displayName ?? null,
    p_reason: input.reason,
    p_evidence: input.evidence,
  });

  if (error) throw new Error(`CRM Person split failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.resolved_person_id) throw new Error('CRM Person split returned no Person');
  return {
    personId: String(row.resolved_person_id),
    replayed: row.replayed === true,
  };
}
