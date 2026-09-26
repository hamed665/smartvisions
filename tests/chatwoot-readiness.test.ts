import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { loadChatwootReadiness } from '@/lib/chatwoot/readiness';

const ORG = '00000000-0000-4000-8000-000000000111';

function fakeSupabase(counts: Record<string, number>) {
  return {
    from: vi.fn((table: string) => {
      const response = { count: counts[table] ?? 0, error: null };
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((column: string, value: string) => {
        expect(column).toBe('organization_id');
        expect(value).toBe(ORG);
        return builder;
      });
      builder.in = vi.fn(() => builder);
      builder.then = (
        resolve: (value: typeof response) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(response).then(resolve, reject);
      return builder;
    }),
  } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Chatwoot readiness loader', () => {
  it('reads health and canonical tenant counts without exposing the Platform token', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'production');
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'false');
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
    vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'super-secret-platform-token');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'woot' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const state = await loadChatwootReadiness({
      supabase: fakeSupabase({
        brands: 1,
        tenant_businesses: 1,
        communication_channel_bindings: 1,
        chatwoot_account_mappings: 1,
        chatwoot_user_mappings: 0,
        chatwoot_account_memberships: 0,
        chatwoot_inbox_mappings: 0,
        chatwoot_team_mappings: 0,
      }),
      organizationId: ORG,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://inbox.example.com/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
    expect(state.activationReady).toBe(true);
    expect(state.liveProvisioningReady).toBe(false);
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

    const state = await loadChatwootReadiness({
      supabase: fakeSupabase({ brands: 1, tenant_businesses: 1 }),
      organizationId: ORG,
    });

    expect(state.activationReady).toBe(false);
    expect(state.blockers).toContain('CHATWOOT_UNHEALTHY');
  });
});
