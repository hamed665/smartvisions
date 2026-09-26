import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { createSupabaseServiceClient } = vi.hoisted(() => ({
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient,
}));

import { loadChatwootReadiness } from '@/lib/chatwoot/readiness';

const ORG = '00000000-0000-4000-8000-000000000111';
const OWNER = '00000000-0000-4000-8000-000000000112';

function ownerSupabase(role = 'OWNER') {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: OWNER } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== 'organization_members') {
        throw new Error('unexpected authenticated table ' + table);
      }
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.single = vi.fn(async () => ({
        data: { role },
        error: null,
      }));
      return builder;
    }),
  } as unknown as SupabaseClient;
}

function serviceClient(input: {
  counts: Record<string, number>;
  userMappingIds?: string[];
}) {
  return {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const countResponse = {
        count: input.counts[table] ?? 0,
        error: null,
      };
      const membershipResponse = {
        data: (input.userMappingIds ?? []).map((id) => ({
          chatwoot_user_mapping_id: id,
        })),
        error: null,
      };

      builder.select = vi.fn((columns: string) => {
        builder.__membershipQuery =
          table === 'chatwoot_account_memberships' &&
          columns === 'chatwoot_user_mapping_id';
        return builder;
      });
      builder.eq = vi.fn(() => builder);
      builder.in = vi.fn(() => builder);
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve(
          builder.__membershipQuery ? membershipResponse : countResponse,
        ).then(resolve, reject);
      return builder;
    }),
  } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Chatwoot readiness loader', () => {
  it('uses OWNER-gated server reads and scopes global User mappings through memberships', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'production');
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'false');
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
    vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'super-secret-platform-token');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'woot' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    createSupabaseServiceClient.mockReturnValue(
      serviceClient({
        counts: {
          brands: 1,
          tenant_businesses: 1,
          communication_channel_bindings: 1,
          chatwoot_account_mappings: 1,
          chatwoot_account_memberships: 2,
          chatwoot_inbox_mappings: 1,
          chatwoot_team_mappings: 1,
        },
        userMappingIds: ['user-map-a', 'user-map-a', 'user-map-b'],
      }),
    );

    const state = await loadChatwootReadiness({
      supabase: ownerSupabase(),
      organizationId: ORG,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://inbox.example.com/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
    expect(state.activationReady).toBe(true);
    expect(state.liveProvisioningReady).toBe(false);
    expect(state.projectionCounts.users).toBe(2);
    expect(state.projectionCounts.memberships).toBe(2);
    expect(JSON.stringify(state)).not.toContain('super-secret-platform-token');
  });

  it('fails readiness when the Chatwoot health contract is not proven', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'production');
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'false');
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
    vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'super-secret-platform-token');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'not-woot' }), { status: 200 }),
      ),
    );

    createSupabaseServiceClient.mockReturnValue(
      serviceClient({
        counts: {
          brands: 1,
          tenant_businesses: 1,
          communication_channel_bindings: 1,
          chatwoot_account_mappings: 1,
        },
      }),
    );

    const state = await loadChatwootReadiness({
      supabase: ownerSupabase(),
      organizationId: ORG,
    });

    expect(state.activationReady).toBe(false);
    expect(state.blockers).toContain('CHATWOOT_UNHEALTHY');
  });

  it('rejects non-OWNER contexts before privileged readiness reads', async () => {
    await expect(
      loadChatwootReadiness({
        supabase: ownerSupabase('ADMIN'),
        organizationId: ORG,
      }),
    ).rejects.toThrow('authenticated OWNER context');

    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });
});
