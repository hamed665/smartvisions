import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { serviceFactory } = vi.hoisted(() => ({
  serviceFactory: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

import {
  ChatwootSsoError,
  createChatwootSsoLoginUrl,
} from '@/lib/chatwoot/sso';

const ORG = '00000000-0000-4000-8000-000000001401';
const BUSINESS = '00000000-0000-4000-8000-000000001402';
const USER = '00000000-0000-4000-8000-000000001403';
const USER_MAPPING = '00000000-0000-4000-8000-000000001404';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000001405';

function enable() {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-token');
  vi.stubEnv('NODE_ENV', 'test');
}

function setup(input: {
  authError?: boolean;
  orgMembership?: boolean;
  orgRole?: string;
  businessStatus?: string;
  userMappingStatus?: string;
  accountMappingStatus?: string;
  accountMembershipStatus?: string;
  effectiveRole?: string;
  chatwootRole?: string;
  accountMembershipUserId?: string;
  accountMembershipBusinessId?: string;
} = {}) {
  const serviceReads: string[] = [];

  const service = {
    from: vi.fn((table: string) => {
      serviceReads.push(table);
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
          if (table === 'chatwoot_user_mappings') {
            return {
              data: {
                id: USER_MAPPING,
                smart_user_id: USER,
                chatwoot_user_id: 171,
                status: input.userMappingStatus ?? 'ACTIVE',
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
                status: input.accountMappingStatus ?? 'ACTIVE',
              },
              error: null,
            };
          }
          if (table === 'chatwoot_account_memberships') {
            return {
              data: {
                id: '00000000-0000-4000-8000-000000001406',
                organization_id: ORG,
                tenant_business_id:
                  input.accountMembershipBusinessId ?? BUSINESS,
                smart_user_id: input.accountMembershipUserId ?? USER,
                chatwoot_user_mapping_id: USER_MAPPING,
                chatwoot_account_mapping_id: ACCOUNT_MAPPING,
                chatwoot_account_user_id: '9223372036854775001',
                effective_smart_role: input.effectiveRole ?? 'ADMIN',
                chatwoot_role: input.chatwootRole ?? 'agent',
                status: input.accountMembershipStatus ?? 'ACTIVE',
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

  serviceFactory.mockReturnValue(service);

  const membershipBuilder = {
    select: () => membershipBuilder,
    eq: () => membershipBuilder,
    maybeSingle: async () => ({
      data:
        input.orgMembership === false
          ? null
          : {
              organization_id: ORG,
              user_id: USER,
              role: input.orgRole ?? 'ADMIN',
            },
      error: null,
    }),
  };

  const supabase = {
    auth: {
      getUser: vi.fn(async () =>
        input.authError
          ? { data: { user: null }, error: { message: 'auth failed' } }
          : {
              data: {
                user: {
                  id: USER,
                  email: 'agent@example.com',
                },
              },
              error: null,
            },
      ),
    },
    from: vi.fn((table: string) => {
      if (table !== 'organization_members') {
        throw new Error('unexpected authenticated table');
      }
      return membershipBuilder;
    }),
  } as unknown as SupabaseClient;

  return { supabase, serviceReads };
}

function validSsoUrl() {
  return (
    'https://inbox.example.com/app/login?email=agent%40example.com' +
    '&sso_auth_token=' +
    'a'.repeat(64)
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  serviceFactory.mockReset();
});

describe('Chatwoot SSO adapter', () => {
  it('creates SSO only for an exact ACTIVE Smart + Chatwoot membership projection', async () => {
    enable();
    const { supabase, serviceReads } = setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: validSsoUrl() }), { status: 200 }),
    );

    const result = await createChatwootSsoLoginUrl({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({
      url: validSsoUrl(),
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      chatwootAccountId: 501,
    });
    expect(serviceReads).toEqual([
      'tenant_businesses',
      'chatwoot_user_mappings',
      'chatwoot_account_mappings',
      'chatwoot_account_memberships',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/platform/api/v1/users/171/login',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      api_access_token: 'platform-token',
    });
  });

  it('never creates a service client or calls Chatwoot before session/org authorization', async () => {
    enable();

    for (const options of [
      { authError: true },
      { orgMembership: false },
    ]) {
      serviceFactory.mockReset();
      const { supabase } = setup(options);
      const fetchMock = vi.fn();

      await expect(
        createChatwootSsoLoginUrl({
          supabase,
          organizationId: ORG,
          tenantBusinessId: BUSINESS,
          fetchImpl: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toBeInstanceOf(ChatwootSsoError);

      expect(serviceFactory).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('denies VIEWER/stale projection before the Platform login endpoint', async () => {
    enable();
    const { supabase } = setup({
      effectiveRole: 'VIEWER',
      chatwootRole: 'agent',
    });
    const fetchMock = vi.fn();

    await expect(
      createChatwootSsoLoginUrl({
        supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('denies inactive or cross-scope mapping state before the Platform login endpoint', async () => {
    enable();

    for (const options of [
      { businessStatus: 'ARCHIVED' },
      { userMappingStatus: 'DEGRADED' },
      { accountMappingStatus: 'DEGRADED' },
      { accountMembershipStatus: 'DEGRADED' },
      {
        accountMembershipBusinessId:
          '00000000-0000-4000-8000-000000009999',
      },
      {
        accountMembershipUserId:
          '00000000-0000-4000-8000-000000009998',
      },
    ]) {
      const { supabase } = setup(options);
      const fetchMock = vi.fn();

      await expect(
        createChatwootSsoLoginUrl({
          supabase,
          organizationId: ORG,
          tenantBusinessId: BUSINESS,
          fetchImpl: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('accepts OWNER->administrator and rejects inconsistent role projection', async () => {
    enable();

    const owner = setup({
      orgRole: 'OWNER',
      effectiveRole: 'OWNER',
      chatwootRole: 'administrator',
    });
    const ownerFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: validSsoUrl() }), { status: 200 }),
    );

    await expect(
      createChatwootSsoLoginUrl({
        supabase: owner.supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        fetchImpl: ownerFetch as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({ chatwootAccountId: 501 });

    const inconsistent = setup({
      effectiveRole: 'OWNER',
      chatwootRole: 'agent',
    });
    const badFetch = vi.fn();

    await expect(
      createChatwootSsoLoginUrl({
        supabase: inconsistent.supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        fetchImpl: badFetch as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(badFetch).not.toHaveBeenCalled();
  });

  it('rejects SSO URLs outside the exact Chatwoot origin/path/email/token contract', async () => {
    enable();

    const invalidUrls = [
      'https://evil.example.com/app/login?email=agent%40example.com&sso_auth_token=' +
        'a'.repeat(64),
      'https://inbox.example.com/other?email=agent%40example.com&sso_auth_token=' +
        'a'.repeat(64),
      'https://inbox.example.com/app/login?email=other%40example.com&sso_auth_token=' +
        'a'.repeat(64),
      'https://inbox.example.com/app/login?email=agent%40example.com&sso_auth_token=short',
    ];

    for (const url of invalidUrls) {
      const { supabase } = setup();
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ url }), { status: 200 }),
      );

      await expect(
        createChatwootSsoLoginUrl({
          supabase,
          organizationId: ORG,
          tenantBusinessId: BUSINESS,
          fetchImpl: fetchMock as unknown as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: 'UPSTREAM_INVALID' });
    }
  });

  it('rejects invalid UUID scope before session/service/network work', async () => {
    enable();
    const { supabase } = setup();
    const fetchMock = vi.fn();

    await expect(
      createChatwootSsoLoginUrl({
        supabase,
        organizationId: 'bad-org',
        tenantBusinessId: BUSINESS,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(serviceFactory).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
