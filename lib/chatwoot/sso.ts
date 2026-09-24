import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { chatwootPlatformProvisioningRequest } from '@/lib/chatwoot/http';
import { normalizeChatwootBaseUrl } from '@/lib/chatwoot/http-contract';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import { normalizeChatwootInt32Id } from '@/lib/chatwoot/tenant-bridge-slice-b';

export type ChatwootSsoErrorCode =
  | 'INVALID_INPUT'
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'UPSTREAM_INVALID';

export class ChatwootSsoError extends Error {
  constructor(
    public readonly code: ChatwootSsoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChatwootSsoError';
  }
}

function fail(code: ChatwootSsoErrorCode, message: string): never {
  throw new ChatwootSsoError(code, message);
}

function expectedProjection(role: unknown, chatwootRole: unknown) {
  if (role === 'OWNER') return chatwootRole === 'administrator';
  if (
    role === 'ADMIN' ||
    role === 'SALES_MANAGER' ||
    role === 'SALES_AGENT'
  ) {
    return chatwootRole === 'agent';
  }
  return false;
}

function validateSsoUrl(input: {
  value: unknown;
  canonicalEmail: string;
}) {
  if (typeof input.value !== 'string' || !input.value.trim()) {
    return fail('UPSTREAM_INVALID', 'Chatwoot SSO response is invalid');
  }

  const expectedOrigin = normalizeChatwootBaseUrl(
    process.env.CHATWOOT_BASE_URL,
    {
      allowInsecureLocalhost: process.env.NODE_ENV !== 'production',
    },
  );
  if (!expectedOrigin) {
    return fail('UPSTREAM_INVALID', 'Chatwoot SSO origin is unavailable');
  }

  let url: URL;
  try {
    url = new URL(input.value);
  } catch {
    return fail('UPSTREAM_INVALID', 'Chatwoot SSO URL is invalid');
  }

  const token = url.searchParams.get('sso_auth_token') ?? '';
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();

  if (
    url.origin !== expectedOrigin ||
    url.pathname !== '/app/login' ||
    url.username ||
    url.password ||
    url.hash ||
    email !== input.canonicalEmail.trim().toLowerCase() ||
    !/^[0-9a-f]{64}$/i.test(token)
  ) {
    return fail('UPSTREAM_INVALID', 'Chatwoot SSO URL failed validation');
  }

  return url.toString();
}

export async function createChatwootSsoLoginUrl(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  fetchImpl?: typeof fetch;
}) {
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.tenantBusinessId)
  ) {
    return fail('INVALID_INPUT', 'Invalid Chatwoot SSO scope');
  }

  const { data: authData, error: authError } =
    await input.supabase.auth.getUser();
  const user = authData.user;

  if (
    authError ||
    !user?.id ||
    !isUuid(user.id) ||
    typeof user.email !== 'string' ||
    !user.email.trim()
  ) {
    return fail(
      'AUTHENTICATION_REQUIRED',
      'Authenticated user with canonical email required',
    );
  }

  const membership = await input.supabase
    .from('organization_members')
    .select('organization_id,user_id,role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (
    membership.error ||
    !membership.data ||
    membership.data.organization_id !== input.organizationId ||
    membership.data.user_id !== user.id
  ) {
    return fail('FORBIDDEN', 'Chatwoot SSO scope is not accessible');
  }

  // Privileged reads begin only after the session has proven exact
  // Organization membership through self-read RLS.
  const service = createSupabaseServiceClient();

  const [business, userMapping, accountMapping, accountMembership] =
    await Promise.all([
      service
        .from('tenant_businesses')
        .select('id,organization_id,status')
        .eq('organization_id', input.organizationId)
        .eq('id', input.tenantBusinessId)
        .single(),
      service
        .from('chatwoot_user_mappings')
        .select('id,smart_user_id,chatwoot_user_id,status')
        .eq('smart_user_id', user.id)
        .eq('status', 'ACTIVE')
        .single(),
      service
        .from('chatwoot_account_mappings')
        .select(
          'id,organization_id,tenant_business_id,chatwoot_account_id,status',
        )
        .eq('organization_id', input.organizationId)
        .eq('tenant_business_id', input.tenantBusinessId)
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
        .eq('smart_user_id', user.id)
        .eq('status', 'ACTIVE')
        .single(),
    ]);

  if (
    business.error ||
    business.data?.id !== input.tenantBusinessId ||
    business.data?.organization_id !== input.organizationId ||
    business.data?.status !== 'ACTIVE' ||
    userMapping.error ||
    !userMapping.data ||
    userMapping.data.smart_user_id !== user.id ||
    userMapping.data.status !== 'ACTIVE' ||
    accountMapping.error ||
    !accountMapping.data ||
    accountMapping.data.organization_id !== input.organizationId ||
    accountMapping.data.tenant_business_id !== input.tenantBusinessId ||
    accountMapping.data.status !== 'ACTIVE' ||
    accountMembership.error ||
    !accountMembership.data ||
    accountMembership.data.organization_id !== input.organizationId ||
    accountMembership.data.tenant_business_id !== input.tenantBusinessId ||
    accountMembership.data.smart_user_id !== user.id ||
    accountMembership.data.status !== 'ACTIVE' ||
    accountMembership.data.chatwoot_user_mapping_id !== userMapping.data.id ||
    accountMembership.data.chatwoot_account_mapping_id !==
      accountMapping.data.id ||
    accountMembership.data.chatwoot_account_user_id === null ||
    !expectedProjection(
      accountMembership.data.effective_smart_role,
      accountMembership.data.chatwoot_role,
    )
  ) {
    return fail('FORBIDDEN', 'Active Chatwoot membership is required');
  }

  const chatwootUserId = normalizeChatwootInt32Id(
    userMapping.data.chatwoot_user_id,
  );
  const chatwootAccountId = normalizeChatwootInt32Id(
    accountMapping.data.chatwoot_account_id,
  );

  if (chatwootUserId === null || chatwootAccountId === null) {
    return fail('FORBIDDEN', 'Verified Chatwoot identity is unavailable');
  }

  const raw = await chatwootPlatformProvisioningRequest<unknown>({
    path: `/platform/api/v1/users/${chatwootUserId}/login`,
    method: 'GET',
    fetchImpl: input.fetchImpl,
  });

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('UPSTREAM_INVALID', 'Chatwoot SSO response is invalid');
  }

  const ssoUrl = validateSsoUrl({
    value: (raw as Record<string, unknown>).url,
    canonicalEmail: user.email,
  });

  return {
    url: ssoUrl,
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    chatwootAccountId,
  };
}
