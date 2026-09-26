import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { provisionCandidateChatwootAccount } from '@/lib/chatwoot/account-orchestration';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000101';
const BUSINESS_ID = '00000000-0000-4000-8000-000000000102';
const MAPPING_ID = '00000000-0000-4000-8000-000000000103';
const OWNER_ID = '00000000-0000-4000-8000-000000000104';
const REQUEST_KEY = 'account-candidate-1';

function marker() {
  return {
    smartvisions_tenant_business_id: BUSINESS_ID,
    smartvisions_projection: true,
    smartvisions_projection_version: '1',
  };
}

function setup(input: { claimNew: boolean; role?: string; roles?: string[]; mappingVersionAfterClaim?: number; mappingBusinessAfterClaim?: string; ambiguousClaim?: boolean; replayClaimAfterFirst?: boolean; failStateOnce?: boolean }) {
  const mapping = {
    id: MAPPING_ID,
    organization_id: ORGANIZATION_ID,
    tenant_business_id: BUSINESS_ID,
    chatwoot_account_id: null,
    status: 'PROVISIONING',
    version: 1,
  };
  const updated = {
    ...mapping,
    chatwoot_account_id: 51,
    status: 'ACTIVE',
    version: 2,
  };
  const tableReads: string[] = [];
  let memberReads = 0;
  let mappingReads = 0;
  let claimCalls = 0;
  let stateCalls = 0;
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_chatwoot_account_external_create') {
      const mayAttemptCreate = claimCalls > 0 && input.replayClaimAfterFirst
        ? false : input.claimNew;
      claimCalls += 1;
      return {
        data: input.ambiguousClaim ? [
          { may_attempt_create: true, mapping_id: MAPPING_ID, tenant_business_id: BUSINESS_ID, mapping_version: 1 },
          { may_attempt_create: true, mapping_id: MAPPING_ID, tenant_business_id: BUSINESS_ID, mapping_version: 1 },
        ] : [{
          may_attempt_create: mayAttemptCreate,
          mapping_id: MAPPING_ID,
          tenant_business_id: BUSINESS_ID,
          mapping_version: 1,
        }],
        error: null,
      };
    }
    if (name === 'set_chatwoot_account_mapping_state') {
      stateCalls += 1;
      if (input.failStateOnce && stateCalls === 1) {
        return { data: null, error: { message: 'network timeout' } };
      }
      return { data: updated, error: null };
    }
    throw new Error('unexpected RPC');
  });
  const supabase = {
    auth: { getUser: vi.fn(async () => ({
      data: { user: { id: OWNER_ID } }, error: null,
    })) },
    from: vi.fn((table: string) => {
      tableReads.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => {
          if (table === 'chatwoot_account_mappings') {
            const version = mappingReads > 0 && input.mappingVersionAfterClaim
              ? input.mappingVersionAfterClaim : mapping.version;
            mappingReads += 1;
            return { data: { ...mapping, version, tenant_business_id: mappingReads > 1 && input.mappingBusinessAfterClaim ? input.mappingBusinessAfterClaim : BUSINESS_ID }, error: null };
          }
          if (table === 'organization_members') {
            const role = input.roles?.[memberReads] ?? input.role ?? 'OWNER';
            memberReads += 1;
            return { data: { role }, error: null };
          }
          if (table === 'tenant_businesses') {
            return {
              data: {
                id: BUSINESS_ID,
                organization_id: ORGANIZATION_ID,
                status: 'ACTIVE',
                name: 'Canonical Business',
              },
              error: null,
            };
          }
          throw new Error('unexpected table');
        },
      };
      return builder;
    }),
    rpc,
  } as unknown as SupabaseClient;
  return { supabase, rpc, tableReads };
}

function enabled() {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');
  vi.stubEnv('NODE_ENV', 'test');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('C3B Candidate Account orchestration', () => {
  it('performs no DB or HTTP work when provisioning is disabled', async () => {
    const { supabase, rpc, tableReads } = setup({ claimNew: true });
    const fetchMock = vi.fn();
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('disabled');
    expect(rpc).not.toHaveBeenCalled();
    expect(tableReads).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses one committed claim before the first external POST and owner state RPC', async () => {
    enabled();
    const { supabase, rpc, tableReads } = setup({ claimNew: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 51, name: 'Canonical Business', custom_attributes: marker(),
      }), { status: 200 }));

    const mapping = await provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(mapping.status).toBe('ACTIVE');
    expect(mapping.chatwoot_account_id).toBe(51);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'claim_chatwoot_account_external_create',
      'set_chatwoot_account_mapping_state',
    ]);
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['GET', 'POST']);
    expect(tableReads).not.toContain('businesses');
  });

  it('reconciles an ambiguous Account POST by exact marker without a second POST', async () => {
    enabled();
    const { supabase, rpc } = setup({ claimNew: true });
    const projected = {
      id: 51, name: 'Canonical Business', custom_attributes: marker(),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify([projected]), { status: 200 }));

    const mapping = await provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(mapping.chatwoot_account_id).toBe(51);
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'GET', 'POST', 'GET',
    ]);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'claim_chatwoot_account_external_create',
      'set_chatwoot_account_mapping_state',
    ]);
  });

  it('fails closed on duplicate external Account markers before POST or mapping commit', async () => {
    enabled();
    const { supabase, rpc } = setup({ claimNew: true });
    const projected = {
      id: 51, name: 'Canonical Business', custom_attributes: marker(),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([projected, { ...projected, id: 52 }]), { status: 200 }),
    );
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('Multiple Chatwoot Accounts');
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['GET']);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('reconciles a mapping commit timeout on replay without a second POST', async () => {
    enabled();
    const { supabase, rpc } = setup({
      claimNew: true, replayClaimAfterFirst: true, failStateOnce: true,
    });
    const projected = {
      id: 51, name: 'Canonical Business', custom_attributes: marker(),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(projected), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([projected]), { status: 200 }));
    const input = {
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    };
    await expect(provisionCandidateChatwootAccount(input)).rejects.toThrow();
    const mapping = await provisionCandidateChatwootAccount(input);
    expect(mapping.chatwoot_account_id).toBe(51);
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'GET', 'POST', 'GET',
    ]);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'claim_chatwoot_account_external_create',
      'set_chatwoot_account_mapping_state',
      'claim_chatwoot_account_external_create',
      'set_chatwoot_account_mapping_state',
    ]);
  });

  it('reconciles a replay by GET only and refuses another POST on zero matches', async () => {
    enabled();
    const { supabase, rpc } = setup({ claimNew: false });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('no exact external match');
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['GET']);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('adopts one exact marker on replay with GET only', async () => {
    enabled();
    const { supabase, rpc } = setup({ claimNew: false });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{
        id: 51, name: 'Canonical Business', custom_attributes: marker(),
      }]), { status: 200 }),
    );

    const mapping = await provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(mapping.status).toBe('ACTIVE');
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['GET']);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'claim_chatwoot_account_external_create',
      'set_chatwoot_account_mapping_state',
    ]);
  });

  it('stops before HTTP when OWNER is revoked after the claim', async () => {
    enabled();
    const { supabase, rpc } = setup({
      claimNew: true, roles: ['OWNER', 'ADMIN'],
    });
    const fetchMock = vi.fn();
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('owner');
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'claim_chatwoot_account_external_create',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops before HTTP if mapping version changes after the claim', async () => {
    enabled();
    const { supabase, rpc } = setup({
      claimNew: true, mappingVersionAfterClaim: 2,
    });
    const fetchMock = vi.fn();
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('changed after external claim');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops before HTTP if tenant Business identity changes after the claim', async () => {
    enabled();
    const { supabase, rpc } = setup({
      claimNew: true,
      mappingBusinessAfterClaim: '00000000-0000-4000-8000-000000000105',
    });
    const fetchMock = vi.fn();
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('changed after external claim');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous claim response before external HTTP', async () => {
    enabled();
    const { supabase, rpc } = setup({ claimNew: true, ambiguousClaim: true });
    const fetchMock = vi.fn();
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('claim is unavailable');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects ADMIN before the durable claim or external call', async () => {
    enabled();
    const { supabase, rpc } = setup({ claimNew: true, role: 'ADMIN' });
    const fetchMock = vi.fn();
    await expect(provisionCandidateChatwootAccount({
      supabase, organizationId: ORGANIZATION_ID, mappingId: MAPPING_ID,
      requestKey: REQUEST_KEY, fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toThrow('owner');
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
