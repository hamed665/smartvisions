import type { SupabaseClient } from '@supabase/supabase-js';

export type InstagramActivationReadiness = {
  ready: boolean;
  blockers: string[];
  bindingId: string | null;
  destinationId: string | null;
  inboxMappingId: string | null;
};

export async function getInstagramActivationReadiness(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  branchId?: string | null;
}): Promise<InstagramActivationReadiness> {
  const { data, error } = await input.service.rpc('instagram_activation_readiness', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_branch_id: input.branchId ?? null,
  });
  if (error) throw new Error(`Instagram activation readiness failed: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1) throw new Error('Instagram activation readiness is ambiguous');
  const row = data[0] as Record<string, unknown>;
  return {
    ready: row.ready === true,
    blockers: Array.isArray(row.blockers) ? row.blockers.map(String) : [],
    bindingId: row.binding_id ? String(row.binding_id) : null,
    destinationId: row.destination_id ? String(row.destination_id) : null,
    inboxMappingId: row.inbox_mapping_id ? String(row.inbox_mapping_id) : null,
  };
}

export function assertInstagramActivationAllowed(readiness: InstagramActivationReadiness) {
  if (!readiness.ready) {
    throw new Error(`INSTAGRAM_ACTIVATION_BLOCKED:${readiness.blockers.join(',') || 'UNKNOWN'}`);
  }
}
