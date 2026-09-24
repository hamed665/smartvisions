import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  chatwootAccountProvisioningRequest,
  chatwootPlatformProvisioningRequest,
} from '@/lib/chatwoot/http';
import {
  normalizeChatwootAccessToken,
  normalizeChatwootRequestPath,
  type ChatwootHttpMethod,
} from '@/lib/chatwoot/http-contract';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import { normalizeChatwootInt32Id } from '@/lib/chatwoot/tenant-bridge-slice-b';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

type AdminProjection = {
  smartUserId: string;
  chatwootUserId: number;
  chatwootAccountId: number;
};

function unavailable(): never {
  throw new Error('Chatwoot Account administrator projection is unavailable');
}

async function readAdminProjection(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}): Promise<AdminProjection> {
  if (!isUuid(input.organizationId) || !isUuid(input.tenantBusinessId)) {
    return unavailable();
  }

  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (authError || !auth.user?.id || !isUuid(auth.user.id)) return unavailable();

  const owner = await input.supabase
    .from('organization_members')
    .select('organization_id,user_id,role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', auth.user.id)
    .single();

  if (
    owner.error ||
    owner.data?.organization_id !== input.organizationId ||
    owner.data?.user_id !== auth.user.id ||
    owner.data?.role !== 'OWNER'
  ) {
    return unavailable();
  }

  // Service reads begin only after the authenticated caller is proven OWNER.
  // They are read-only, exact-scope reconciliation reads, never mutation authority.
  const service = createSupabaseServiceClient();

  const [business, accountMapping, userMapping, membership] = await Promise.all([
    service
      .from('tenant_businesses')
      .select('id,organization_id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', input.tenantBusinessId)
      .single(),
    service
      .from('chatwoot_account_mappings')
      .select('id,organization_id,tenant_business_id,chatwoot_account_id,status')
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', input.tenantBusinessId)
      .eq('status', 'ACTIVE')
      .single(),
    service
      .from('chatwoot_user_mappings')
      .select('id,smart_user_id,chatwoot_user_id,status')
      .eq('smart_user_id', auth.user.id)
      .eq('status', 'ACTIVE')
      .single(),
    service
      .from('chatwoot_account_memberships')
      .select(
        'id,organization_id,tenant_business_id,smart_user_id,' +
          'chatwoot_user_mapping_id,chatwoot_account_mapping_id,' +
          'chatwoot_account_user_id,effective_smart_role,chatwoot_role,status',
      )
      .eq('organization_id', input.organizationId)
      .eq('tenant_business_id', input.tenantBusinessId)
      .eq('smart_user_id', auth.user.id)
      .eq('status', 'ACTIVE')
      .single(),
  ]);

  if (
    business.error ||
    business.data?.id !== input.tenantBusinessId ||
    business.data?.organization_id !== input.organizationId ||
    business.data?.status !== 'ACTIVE' ||
    accountMapping.error ||
    !accountMapping.data ||
    accountMapping.data.organization_id !== input.organizationId ||
    accountMapping.data.tenant_business_id !== input.tenantBusinessId ||
    accountMapping.data.status !== 'ACTIVE' ||
    userMapping.error ||
    !userMapping.data ||
    userMapping.data.smart_user_id !== auth.user.id ||
    userMapping.data.status !== 'ACTIVE' ||
    membership.error ||
    !membership.data ||
    membership.data.organization_id !== input.organizationId ||
    membership.data.tenant_business_id !== input.tenantBusinessId ||
    membership.data.smart_user_id !== auth.user.id ||
    membership.data.status !== 'ACTIVE' ||
    membership.data.effective_smart_role !== 'OWNER' ||
    membership.data.chatwoot_role !== 'administrator' ||
    membership.data.chatwoot_user_mapping_id !== userMapping.data.id ||
    membership.data.chatwoot_account_mapping_id !== accountMapping.data.id
  ) {
    return unavailable();
  }

  const chatwootUserId = normalizeChatwootInt32Id(
    userMapping.data.chatwoot_user_id,
  );
  const chatwootAccountId = normalizeChatwootInt32Id(
    accountMapping.data.chatwoot_account_id,
  );

  if (
    chatwootUserId === null ||
    chatwootAccountId === null ||
    membership.data.chatwoot_account_user_id === null
  ) {
    return unavailable();
  }

  return {
    smartUserId: auth.user.id,
    chatwootUserId,
    chatwootAccountId,
  };
}

async function issueEphemeralAdminToken(input: {
  chatwootUserId: number;
  fetchImpl?: typeof fetch;
}) {
  const raw = await chatwootPlatformProvisioningRequest<unknown>({
    path: `/platform/api/v1/users/${input.chatwootUserId}/token`,
    method: 'POST',
    fetchImpl: input.fetchImpl,
  });

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return unavailable();

  const row = raw as Record<string, unknown>;
  const token = normalizeChatwootAccessToken(row.access_token);
  const user =
    row.user && typeof row.user === 'object' && !Array.isArray(row.user)
      ? (row.user as Record<string, unknown>)
      : null;
  const returnedUserId = normalizeChatwootInt32Id(user?.id);

  if (!token || returnedUserId !== input.chatwootUserId) return unavailable();

  return token;
}

function accountResourcePath(value: string) {
  const resourcePath = value.trim();
  if (
    !resourcePath.startsWith('/') ||
    resourcePath.startsWith('//') ||
    resourcePath === '/' ||
    resourcePath.startsWith('/api/') ||
    resourcePath.startsWith('/platform/')
  ) {
    return unavailable();
  }

  // Run the final composed path through the canonical traversal/fragment guard.
  return resourcePath;
}

/**
 * Performs exactly one Account-scoped Chatwoot API request with a token issued
 * for the authenticated Organization OWNER's ACTIVE administrator projection.
 *
 * The temporary Chatwoot user token exists only in this call stack and is never
 * returned, persisted, logged or audited.
 */
export async function chatwootAdminAccountRequest<T>(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  resourcePath: string;
  method?: ChatwootHttpMethod;
  body?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const resourcePath = accountResourcePath(input.resourcePath);
  const projection = await readAdminProjection(input);
  const token = await issueEphemeralAdminToken({
    chatwootUserId: projection.chatwootUserId,
    fetchImpl: input.fetchImpl,
  });

  const path =
    `/api/v1/accounts/${projection.chatwootAccountId}` + resourcePath;

  if (!normalizeChatwootRequestPath(path)) return unavailable();

  return chatwootAccountProvisioningRequest<T>({
    path,
    accessToken: token,
    method: input.method,
    body: input.body,
    fetchImpl: input.fetchImpl,
  });
}
