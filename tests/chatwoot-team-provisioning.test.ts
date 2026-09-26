import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { adminRequest, adminPreflight, serviceFactory } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  adminPreflight: vi.fn(),
  serviceFactory: vi.fn(),
}));

vi.mock('@/lib/chatwoot/account-admin-request', () => ({
  chatwootAdminAccountRequest: adminRequest,
  requireChatwootAdminProjection: adminPreflight,
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

import { ChatwootHttpError } from '@/lib/chatwoot/http';
import { provisionChatwootTeam } from '@/lib/chatwoot/team-provisioning';

const ORG = '00000000-0000-4000-8000-000000001301';
const BUSINESS = '00000000-0000-4000-8000-000000001302';
const SMART_TEAM = '12345678-0000-4000-8000-000000001303';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000001304';
const TEAM_MAPPING = '00000000-0000-4000-8000-000000001305';
const RECEIPT = '00000000-0000-4000-8000-000000001306';
const PROJECTED_NAME = 'sales [12345678]';
const DESCRIPTION =
  `smartvisions:team:${SMART_TEAM};business:${BUSINESS};v=1`;

function mapping(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TEAM_MAPPING,
    organization_id: ORG,
    tenant_business_id: BUSINESS,
    smart_team_id: SMART_TEAM,
    chatwoot_account_mapping_id: ACCOUNT_MAPPING,
    chatwoot_team_id: null,
    projected_name: PROJECTED_NAME,
    status: 'PROVISIONING',
    version: 1,
    last_request_key: 'team-flow:create',
    ...overrides,
  };
}

function team(id: number | string = 1301) {
  return {
    id,
    name: PROJECTED_NAME,
    description: DESCRIPTION,
    allow_auto_assign: false,
    account_id: 501,
  };
}

function setupSupabase(input?: { createMapping?: Record<string, unknown> }) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'create_chatwoot_team_mapping') {
      return { data: input?.createMapping ?? mapping(), error: null };
    }
    if (name === 'activate_chatwoot_team_mapping_verified') {
      return {
        data: mapping({
          chatwoot_team_id: '1301',
          status: 'ACTIVE',
          version: Number(args.p_expected_version) + 1,
          last_request_key: args.p_request_key,
        }),
        error: null,
      };
    }
    throw new Error(`unexpected auth RPC ${name}`);
  });

  return {
    supabase: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

function setupService() {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'record_chatwoot_team_reconciliation') {
      throw new Error(`unexpected service RPC ${name}`);
    }
    return {
      data: {
        id: RECEIPT,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        team_mapping_id: TEAM_MAPPING,
        mapping_version: 1,
        smart_team_id: SMART_TEAM,
        observed_chatwoot_team_id: args.p_observed_chatwoot_team_id,
        observed_name: args.p_observed_name,
        observed_description: args.p_observed_description,
        request_key: args.p_request_key,
      },
      error: null,
    };
  });
  serviceFactory.mockReturnValue({ rpc });
  return rpc;
}

function input(supabase: SupabaseClient) {
  return {
    supabase,
    organizationId: ORG,
    tenantBusinessId: BUSINESS,
    smartTeamId: SMART_TEAM,
    chatwootAccountMappingId: ACCOUNT_MAPPING,
    requestKey: 'team-flow',
  };
}

beforeEach(() => {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');
});

afterEach(() => {
  vi.restoreAllMocks();
  adminRequest.mockReset();
  adminPreflight.mockReset();
  adminPreflight.mockResolvedValue({
    smartUserId: '00000000-0000-4000-8000-000000001307',
    chatwootUserId: 151,
    chatwootAccountId: 501,
  });
  serviceFactory.mockReset();
});

describe('C4 Chatwoot Team provisioning', () => {
  it('fails before mapping claim when ACTIVE OWNER administrator projection is absent', async () => {
    const { supabase, rpc } = setupSupabase();
    adminPreflight.mockRejectedValueOnce(new Error('admin projection unavailable'));

    await expect(
      provisionChatwootTeam(input(supabase)),
    ).rejects.toThrow('admin projection unavailable');

    expect(rpc).not.toHaveBeenCalled();
    expect(adminRequest).not.toHaveBeenCalled();
    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('GET-reconciles first, creates once, receipts server evidence, then activates', async () => {
    const { supabase, rpc } = setupSupabase();
    const serviceRpc = setupService();

    adminRequest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(team());

    const result = await provisionChatwootTeam(input(supabase));

    expect(result.outcome).toBe('CREATED');
    expect(result.mapping).toMatchObject({
      id: TEAM_MAPPING,
      status: 'ACTIVE',
      chatwoot_team_id: '1301',
    });

    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'POST',
    ]);
    expect(adminRequest.mock.calls[1]?.[0]).toMatchObject({
      resourcePath: '/teams',
      method: 'POST',
      body: {
        team: {
          name: PROJECTED_NAME,
          description: DESCRIPTION,
          allow_auto_assign: false,
        },
      },
    });

    expect(serviceRpc).toHaveBeenCalledTimes(1);
    expect(serviceRpc.mock.calls[0]?.[1]).toMatchObject({
      p_team_mapping_id: TEAM_MAPPING,
      p_expected_mapping_version: 1,
      p_observed_chatwoot_team_id: '1301',
      p_observed_name: PROJECTED_NAME,
      p_observed_description: DESCRIPTION,
    });

    const activation = rpc.mock.calls.find(
      (call) => call[0] === 'activate_chatwoot_team_mapping_verified',
    );
    expect(activation?.[1]).toMatchObject({
      p_team_mapping_id: TEAM_MAPPING,
      p_expected_version: 1,
      p_receipt_id: RECEIPT,
    });
  });

  it('adopts an existing marker match without POST', async () => {
    const { supabase } = setupSupabase();
    setupService();
    adminRequest.mockResolvedValueOnce([team()]);

    const result = await provisionChatwootTeam(input(supabase));

    expect(result.outcome).toBe('RECONCILED_EXISTING');
    expect(adminRequest).toHaveBeenCalledTimes(1);
    expect(adminRequest.mock.calls[0]?.[0]?.method).toBe('GET');
  });

  it('uses GET-only reconciliation after ambiguous Team create', async () => {
    const { supabase } = setupSupabase();
    setupService();

    adminRequest
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(
        new ChatwootHttpError({
          code: 'NETWORK_FAILED',
          message: 'team create outcome unknown',
          retryable: true,
          ambiguousMutationOutcome: true,
        }),
      )
      .mockResolvedValueOnce([team()]);

    const result = await provisionChatwootTeam(input(supabase));

    expect(result.outcome).toBe('RECONCILED_AFTER_AMBIGUOUS_CREATE');
    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'POST',
      'GET',
    ]);
    expect(
      adminRequest.mock.calls.filter((call) => call[0]?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('fails closed on duplicate description markers', async () => {
    const { supabase } = setupSupabase();
    adminRequest.mockResolvedValueOnce([
      team(1301),
      team(1302),
    ]);

    await expect(
      provisionChatwootTeam(input(supabase)),
    ).rejects.toMatchObject({ code: 'DUPLICATE_MATCH' });

    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('rejects unsafe bigint JSON ids before receipt persistence', async () => {
    const { supabase } = setupSupabase();
    adminRequest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(team(Number.MAX_SAFE_INTEGER + 1));

    await expect(
      provisionChatwootTeam(input(supabase)),
    ).rejects.toMatchObject({ code: 'UPSTREAM_MISMATCH' });

    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('returns an already ACTIVE mapping without external work', async () => {
    const { supabase } = setupSupabase({
      createMapping: mapping({
        status: 'ACTIVE',
        version: 2,
        chatwoot_team_id: '1301',
      }),
    });

    const result = await provisionChatwootTeam(input(supabase));

    expect(result.outcome).toBe('ALREADY_ACTIVE');
    expect(adminRequest).not.toHaveBeenCalled();
    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('rejects scope drift in the claimed mapping before external work', async () => {
    const { supabase } = setupSupabase({
      createMapping: mapping({
        tenant_business_id: '00000000-0000-4000-8000-000000009999',
      }),
    });

    await expect(
      provisionChatwootTeam(input(supabase)),
    ).rejects.toMatchObject({ code: 'UPSTREAM_MISMATCH' });

    expect(adminRequest).not.toHaveBeenCalled();
  });
});
