import type { SupabaseClient } from '@supabase/supabase-js';

export type MetaInstagramRoute = {
  organizationId: string;
  tenantBusinessId: string;
  branchId: string | null;
  bindingId: string;
  integrationConnectionId: string;
  destinationId: string;
  providerAccountId: string | null;
};

export async function resolveMetaInstagramDestination(input: {
  service: SupabaseClient;
  destinationId: string;
}): Promise<MetaInstagramRoute> {
  const { data, error } = await input.service.rpc('resolve_meta_instagram_destination', {
    p_destination_id: input.destinationId,
  });
  if (error) throw new Error(`Instagram destination routing failed: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Instagram destination routing did not resolve exactly one tenant binding');
  }
  const row = data[0] as Record<string, unknown>;
  return {
    organizationId: String(row.organization_id),
    tenantBusinessId: String(row.tenant_business_id),
    branchId: row.branch_id ? String(row.branch_id) : null,
    bindingId: String(row.binding_id),
    integrationConnectionId: String(row.integration_connection_id),
    destinationId: String(row.destination_id),
    providerAccountId: row.provider_account_id ? String(row.provider_account_id) : null,
  };
}
