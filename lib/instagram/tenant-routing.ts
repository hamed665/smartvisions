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

import { MetaInstagramProvider } from './provider';

type CredentialRow = {
  binding_id: string;
  integration_connection_id: string;
  destination_id: string;
  provider_account_id: string | null;
  access_token: string;
};

function one<T>(value: unknown): T | null {
  return Array.isArray(value) && value.length === 1 ? value[0] as T : null;
}

export async function resolveMetaInstagramProvider(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  branchId?: string | null;
}) {
  const { data, error } = await input.service.rpc('resolve_meta_instagram_credential', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_branch_id: input.branchId ?? null,
  });
  if (error) throw new Error(`Meta Instagram credential resolution failed: ${error.message}`);
  const row = one<CredentialRow>(data);
  if (!row?.access_token || !row.destination_id) throw new Error('Meta Instagram tenant credential is unavailable');
  return {
    bindingId: row.binding_id,
    integrationConnectionId: row.integration_connection_id,
    destinationId: row.destination_id,
    providerAccountId: row.provider_account_id,
    provider: new MetaInstagramProvider({ token: row.access_token, destinationId: row.destination_id }),
  };
}
