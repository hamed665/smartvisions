import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { serviceClientFactory } = vi.hoisted(() => ({
  serviceClientFactory: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceClientFactory,
}));

import { chatwootAdminAccountRequest } from '@/lib/chatwoot/account-admin-request';

const ORG = '00000000-0000-4000-8000-000000000901';
const BUSINESS = '00000000-0000-4000-8000-000000000902';
const OWNER = '00000000-0000-4000-8000-000000000903';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000000904';
const USER_MAPPING = '00000000-0000-4000-8000-000000000905';

function enableProvisioning() {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-token');
  vi.stubEnv('NODE_ENV', 'test');
}

function setup(input: {
  ownerRole?: string;
  authError?: boolean;
  businessStatus?: string;
  accountStatus?: string;
  userStatus?: string;
  membershipStatus?: string;
  membershipRole?: string;
  effectiveRole?: string;
  tokenUserId?: number;
} = {}) {
  const reads: string[] = [];

  const service = {
    from: vi.fn((table: string) => {
      reads.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => {
          if (table === 'tenant_businesses') {
            return {
              data: {
                id: BUSINESS,
                organization_id: ORG,
                status: input.businessStatus ?? 'ACTIVE',
              },
              error: null,
            };
          }
          if (table === 'chatwoot_account_mappings') {
            return {
              data: {
                id: ACCOUNT_MAPPING,
                organization_id: ORG,
                tenant_business_id: BUSINESS,
                chatwoot_account_id: 501,
                status: input.accountStatus ?? 'ACTIVE',
              },
              error: null,
            };
          }
          if (table === 'chatwoot_user_mappings') {
            return {
              data: {
                id: USER_MAPPING,
                smart_user_id: OWNER,
                chatwoot_user_id: 171,
                status: input.userStatus ?? 'ACTIVE',
              },
              error: null,
            };
          }
          if (table === 'chatwoot_account_memberships') {
            return {
              data: {
                id: '00000000-0000-4000-8000-000000000906',
                organization_id: ORG,
                tenant_business_id: BUSINESS,
                smart_user_id: OWNER,
                chatwoot_user_mapping_id: USER_MAPPING,
                chatwoot_account_mapping_id: ACCOUNT_MAPPING,
                chatwoot_account_user_id: '9223372036854775807',
                effective_smart_role: input.effectiveRole ?? 'OWNER',
                chatwoot_role: input.membershipRole ?? 'administrator',
                status: input.membershipStatus ?? 'ACTIVE',
              },
              error: null,
            };
          }
          throw new Error(`unexpected service table ${table}`);
        },
      };
      return builder;
    }),
  } as unknown as SupabaseClient;

  serviceClientFactory.mockReturnValue(service);

  const supabase = {
    auth: {
      getUser: vi.fn(async () =>
        input.authError
          ? { data: { user: null }, error: { message: 'unauthenticated' } }
          : { data: { user: { id: OWNER } }, error: null },
      ),
    },
    from: vi.fn((table: string) => {
      if (table !== 'organization_members') {
        throw new Error('unexpected authenticated table');
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({
          data: {
            organization_id: ORG,
            user_id: OWNER,
            role: input.ownerRole ?? 'OWNER',
          },
          error: null,
        }),
      };
      return builder;
    }),
  } as unknown as SupabaseClient;

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'ephemeral-admin-token',
          expiry: null,
          user: { id: input.tokenUserId ?? 171, email: 'owner@example.com' },
        }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 901, name: 'API Inbox' }), {
        status: 200,
      }),
    );

  return { supabase, service, reads, fetchMock };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  serviceClientFactory.mockReset();
});

describe('Chatwoot ephemeral Account administrator request boundary', () => {
  it('issues an ephemeral token only for the exact ACTIVE OWNER administrator projection', async () => {
    enableProvisioning();
    const { supabase, reads, fetchMock } = setup();

    const result = await chatwootAdminAccountRequest<{ id: number; name: string }>({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      resourcePath: '/inboxes',
      method: 'POST',
      body: {
        name: 'API Inbox',
        channel: { type: 'api' },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({ id: 901, name: 'API Inbox' });
    expect(reads).toEqual([
      'tenant_businesses',
      'chatwoot_account_mappings',
      'chatwoot_user_mappings',
      'chatwoot_account_memberships',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/platform/api/v1/users/171/token',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      api_access_token: 'platform-token',
    });

    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      '/api/v1/accounts/501/inboxes',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      api_access_token: 'ephemeral-admin-token',
    });
    expect(JSON.stringify(result)).not.toContain('ephemeral-admin-token');
  });

  it('does not create a service client or call Chatwoot for unauthenticated/non-OWNER callers', async () => {
    enableProvisioning();

    for (const options of [{ authError: true }, { ownerRole: 'ADMIN' }]) {
      serviceClientFactory.mockReset();
      const { supabase, fetchMock } = setup(options);

      await expect(
        chatwootAdminAccountRequest({
          supabase,
          organizationId: ORG,
          tenantBusinessId: BUSINESS,
          resourcePath: '/teams',
          fetchImpl: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toThrow('administrator projection is unavailable');

      expect(serviceClientFactory).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('fails before token issuance when the canonical Account membership is not administrator', async () => {
    enableProvisioning();
    const { supabase, fetchMock } = setup({
      membershipRole: 'agent',
      effectiveRole: 'ADMIN',
    });

    await expect(
      chatwootAdminAccountRequest({
        supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        resourcePath: '/inboxes',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('administrator projection is unavailable');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on inactive/mismatched projection state before token issuance', async () => {
    enableProvisioning();

    for (const options of [
      { businessStatus: 'ARCHIVED' },
      { accountStatus: 'DEGRADED' },
      { userStatus: 'DEGRADED' },
      { membershipStatus: 'DEGRADED' },
    ]) {
      const { supabase, fetchMock } = setup(options);
      await expect(
        chatwootAdminAccountRequest({
          supabase,
          organizationId: ORG,
          tenantBusinessId: BUSINESS,
          resourcePath: '/teams',
          fetchImpl: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toThrow('administrator projection is unavailable');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('rejects a Platform token response for a different Chatwoot User before the Account API call', async () => {
    enableProvisioning();
    const { supabase, fetchMock } = setup({ tokenUserId: 999 });

    await expect(
      chatwootAdminAccountRequest({
        supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        resourcePath: '/inboxes',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('administrator projection is unavailable');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe resource paths before authentication, service reads or token issuance', async () => {
    enableProvisioning();
    const { supabase, fetchMock } = setup();

    for (const resourcePath of [
      '/api/v1/accounts/999/inboxes',
      '/platform/api/v1/users',
      '/../accounts/999/inboxes',
      '//evil.example/inboxes',
      '/',
    ]) {
      serviceClientFactory.mockClear();
      fetchMock.mockClear();

      await expect(
        chatwootAdminAccountRequest({
          supabase,
          organizationId: ORG,
          tenantBusinessId: BUSINESS,
          resourcePath,
          fetchImpl: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toThrow('administrator projection is unavailable');

      expect(serviceClientFactory).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});
