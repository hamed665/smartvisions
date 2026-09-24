import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const { adminRequest, serviceFactory } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  serviceFactory: vi.fn(),
}));

vi.mock('@/lib/chatwoot/account-admin-request', () => ({
  chatwootAdminAccountRequest: adminRequest,
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

import type {
  MemberScopeAssignment,
  TenantScope,
  TenantScopeLineage,
} from '@/lib/business-os/control-plane';
import { ChatwootHttpError } from '@/lib/chatwoot/http';
import {
  ChatwootMembershipSyncError,
  resolveDesiredChatwootUserIds,
  syncChatwootMembershipSet,
} from '@/lib/chatwoot/membership-sync';

const ORG = '00000000-0000-4000-8000-000000001601';
const BRAND = '00000000-0000-4000-8000-000000001602';
const BUSINESS = '00000000-0000-4000-8000-000000001603';
const BRANCH = '00000000-0000-4000-8000-000000001604';
const DEPARTMENT = '00000000-0000-4000-8000-000000001605';
const TEAM = '00000000-0000-4000-8000-000000001606';
const OWNER = '00000000-0000-4000-8000-000000001607';
const AGENT = '00000000-0000-4000-8000-000000001608';
const USER_MAPPING_OWNER = '00000000-0000-4000-8000-000000001609';
const USER_MAPPING_AGENT = '00000000-0000-4000-8000-000000001610';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000001611';
const INBOX_MAPPING = '00000000-0000-4000-8000-000000001612';
const TEAM_MAPPING = '00000000-0000-4000-8000-000000001613';

function targetTeam(): {
  target: TenantScope;
  lineage: TenantScopeLineage;
} {
  return {
    target: {
      organizationId: ORG,
      brandId: BRAND,
      tenantBusinessId: BUSINESS,
      branchId: BRANCH,
      departmentId: DEPARTMENT,
      teamId: TEAM,
    },
    lineage: {
      brand: { id: BRAND, organizationId: ORG },
      tenantBusiness: {
        id: BUSINESS,
        organizationId: ORG,
        brandId: BRAND,
      },
      branch: {
        id: BRANCH,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
      },
      department: {
        id: DEPARTMENT,
        organizationId: ORG,
        branchId: BRANCH,
      },
      team: {
        id: TEAM,
        organizationId: ORG,
        departmentId: DEPARTMENT,
      },
    },
  };
}

function baseTables() {
  return {
    tenant_businesses: [
      {
        id: BUSINESS,
        organization_id: ORG,
        brand_id: BRAND,
        status: 'ACTIVE',
      },
    ],
    brands: [{ id: BRAND, organization_id: ORG, status: 'ACTIVE' }],
    branches: [
      {
        id: BRANCH,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        status: 'ACTIVE',
      },
    ],
    departments: [
      {
        id: DEPARTMENT,
        organization_id: ORG,
        branch_id: BRANCH,
        status: 'ACTIVE',
      },
    ],
    teams: [
      {
        id: TEAM,
        organization_id: ORG,
        department_id: DEPARTMENT,
        status: 'ACTIVE',
      },
    ],
    chatwoot_inbox_mappings: [
      {
        id: INBOX_MAPPING,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        branch_id: BRANCH,
        chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        chatwoot_inbox_id: 701,
        status: 'ACTIVE',
        version: 2,
        channel_type: 'Channel::Api',
      },
    ],
    chatwoot_team_mappings: [
      {
        id: TEAM_MAPPING,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        smart_team_id: TEAM,
        chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        chatwoot_team_id: '9223372036854775001',
        status: 'ACTIVE',
        version: 3,
      },
    ],
    chatwoot_account_mappings: [
      {
        id: ACCOUNT_MAPPING,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        status: 'ACTIVE',
        chatwoot_account_id: 501,
      },
    ],
    chatwoot_account_memberships: [
      {
        smart_user_id: OWNER,
        chatwoot_user_mapping_id: USER_MAPPING_OWNER,
        chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        status: 'ACTIVE',
      },
      {
        smart_user_id: AGENT,
        chatwoot_user_mapping_id: USER_MAPPING_AGENT,
        chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        status: 'ACTIVE',
      },
    ],
    chatwoot_user_mappings: [
      {
        id: USER_MAPPING_OWNER,
        smart_user_id: OWNER,
        chatwoot_user_id: 101,
        status: 'ACTIVE',
      },
      {
        id: USER_MAPPING_AGENT,
        smart_user_id: AGENT,
        chatwoot_user_id: 102,
        status: 'ACTIVE',
      },
    ],
    organization_members: [
      { organization_id: ORG, user_id: OWNER, role: 'OWNER' },
      { organization_id: ORG, user_id: AGENT, role: 'SALES_AGENT' },
    ],
    member_scope_assignments: [] as Record<string, unknown>[],
  } satisfies Record<string, Record<string, unknown>[]>;
}

function makeService(
  tables: Record<string, Record<string, unknown>[]>,
) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'record_chatwoot_membership_sync_result') {
      return { data: true, error: null };
    }
    throw new Error(`unexpected service RPC ${name}`);
  });

  const from = vi.fn((table: string) => {
    let filters: Array<
      | { kind: 'eq'; field: string; value: unknown }
      | { kind: 'in'; field: string; values: unknown[] }
    > = [];
    let countExact = false;
    let range: [number, number] | null = null;

    const execute = () => {
      let rows = [...(tables[table] ?? [])];
      for (const filter of filters) {
        if (filter.kind === 'eq') {
          rows = rows.filter((row) => row[filter.field] === filter.value);
        } else {
          rows = rows.filter((row) =>
            filter.values.includes(row[filter.field]),
          );
        }
      }
      const count = countExact ? rows.length : null;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: rows, error: null, count };
    };

    const builder: any = {
      select: vi.fn((_columns: string, options?: { count?: string }) => {
        countExact = options?.count === 'exact';
        return builder;
      }),
      eq: vi.fn((field: string, value: unknown) => {
        filters.push({ kind: 'eq', field, value });
        return builder;
      }),
      in: vi.fn((field: string, values: unknown[]) => {
        filters.push({ kind: 'in', field, values });
        return builder;
      }),
      range: vi.fn((start: number, end: number) => {
        range = [start, end];
        return Promise.resolve(execute());
      }),
      single: vi.fn(async () => {
        const result = execute();
        if (result.data.length !== 1) {
          return {
            data: null,
            error: { message: 'expected single row' },
            count: result.count,
          };
        }
        return {
          data: result.data[0],
          error: null,
          count: result.count,
        };
      }),
      then: (resolve, reject) =>
        Promise.resolve(execute()).then(resolve, reject),
    };

    return builder;
  });

  const service = { from, rpc } as unknown as SupabaseClient;
  serviceFactory.mockReturnValue(service);
  return { service, rpc, from };
}

function makeAuthenticatedClient(
  input: { ownerRole?: string; resultRecorded?: boolean } = {},
) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'claim_chatwoot_membership_sync') {
      return {
        data: {
          is_new: true,
          entity_id: args.p_mapping_id,
          applied_version: args.p_expected_mapping_version,
          result_recorded: input.resultRecorded ?? false,
        },
        error: null,
      };
    }
    if (
      name === 'mark_chatwoot_inbox_mapping_degraded' ||
      name === 'mark_chatwoot_team_mapping_degraded'
    ) {
      return { data: {}, error: null };
    }
    throw new Error(`unexpected authenticated RPC ${name}`);
  });

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

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: OWNER, email: 'owner@example.com' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== 'organization_members') {
        throw new Error(`unexpected authenticated table ${table}`);
      }
      return builder;
    }),
    rpc,
  } as unknown as SupabaseClient;

  return { client, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
  adminRequest.mockReset();
  serviceFactory.mockReset();
});

describe('C5 desired Chatwoot membership set', () => {
  it('uses canonical deepest-scope precedence and excludes VIEWER', () => {
    const { target, lineage } = targetTeam();
    const third = '00000000-0000-4000-8000-000000001620';
    const fourth = '00000000-0000-4000-8000-000000001621';

    const assignments: MemberScopeAssignment[] = [
      {
        organizationId: ORG,
        userId: AGENT,
        scopeType: 'TEAM',
        scopeId: TEAM,
        role: 'VIEWER',
        attributes: {},
      },
      {
        organizationId: ORG,
        userId: third,
        scopeType: 'TEAM',
        scopeId: TEAM,
        role: 'SALES_AGENT',
        attributes: {},
      },
      {
        organizationId: ORG,
        userId: fourth,
        scopeType: 'TEAM',
        scopeId: TEAM,
        role: 'SALES_AGENT',
        attributes: { market: 'OM' },
      },
    ];

    const result = resolveDesiredChatwootUserIds({
      organizationId: ORG,
      target,
      lineage,
      organizationMembers: [
        { organization_id: ORG, user_id: OWNER, role: 'OWNER' },
        { organization_id: ORG, user_id: AGENT, role: 'SALES_AGENT' },
        { organization_id: ORG, user_id: third, role: 'VIEWER' },
        { organization_id: ORG, user_id: fourth, role: 'VIEWER' },
      ],
      accountProjections: [
        { smartUserId: OWNER, chatwootUserId: 101 },
        { smartUserId: AGENT, chatwootUserId: 102 },
        { smartUserId: third, chatwootUserId: 103 },
        { smartUserId: fourth, chatwootUserId: 104 },
      ],
      assignments,
    });

    expect(result).toEqual([101, 103]);
  });

  it('fails closed on duplicate or inconsistent active AccountUser projection', () => {
    const { target, lineage } = targetTeam();

    expect(() =>
      resolveDesiredChatwootUserIds({
        organizationId: ORG,
        target,
        lineage,
        organizationMembers: [
          { organization_id: ORG, user_id: OWNER, role: 'OWNER' },
        ],
        accountProjections: [
          { smartUserId: OWNER, chatwootUserId: 101 },
          { smartUserId: OWNER, chatwootUserId: 102 },
        ],
        assignments: [],
      }),
    ).toThrow(ChatwootMembershipSyncError);
  });
});

describe('C5 Chatwoot membership reconciliation', () => {
  it('replaces Inbox membership with the exact canonical desired set', async () => {
    const tables = baseTables();
    const { rpc: serviceRpc } = makeService(tables);
    const { client, rpc } = makeAuthenticatedClient();

    adminRequest
      .mockResolvedValueOnce({ payload: [{ id: 101 }] })
      .mockResolvedValueOnce({ payload: [{ id: 101 }, { id: 102 }] });

    const result = await syncChatwootMembershipSet({
      supabase: client,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      resourceKind: 'INBOX',
      mappingId: INBOX_MAPPING,
      requestKey: 'c5-inbox-members',
    });

    expect(result).toMatchObject({
      resourceKind: 'INBOX',
      mappingId: INBOX_MAPPING,
      mappingVersion: 2,
      desiredCount: 2,
      observedCount: 2,
      outcome: 'UPDATED_VERIFIED',
    });

    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'PATCH',
    ]);
    expect(adminRequest.mock.calls[0]?.[0]?.resourcePath).toBe(
      '/inboxes/701/members',
    );
    expect(adminRequest.mock.calls[1]?.[0]).toMatchObject({
      resourcePath: '/inboxes/701/members',
      method: 'PATCH',
      body: { user_ids: [101, 102] },
    });

    const claim = rpc.mock.calls.find(
      (call) => call[0] === 'claim_chatwoot_membership_sync',
    );
    expect(claim?.[1]).toMatchObject({
      p_resource_kind: 'INBOX',
      p_mapping_id: INBOX_MAPPING,
      p_expected_mapping_version: 2,
      p_desired_count: 2,
      p_request_key: 'c5-inbox-members:members',
    });

    const recorded = serviceRpc.mock.calls.find(
      (call) => call[0] === 'record_chatwoot_membership_sync_result',
    );
    expect(recorded?.[1]).toMatchObject({
      p_resource_kind: 'INBOX',
      p_mapping_id: INBOX_MAPPING,
      p_mapping_version: 2,
      p_desired_count: 2,
      p_observed_before_count: 1,
      p_observed_after_count: 2,
      p_mutation_attempted: true,
      p_outcome: 'UPDATED_VERIFIED',
      p_request_key: 'c5-inbox-members:members',
    });
  });

  it('does not PATCH when the external Inbox set already matches', async () => {
    makeService(baseTables());
    const { client } = makeAuthenticatedClient();

    adminRequest.mockResolvedValueOnce({
      payload: [{ id: 102 }, { id: 101 }],
    });

    const result = await syncChatwootMembershipSet({
      supabase: client,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      resourceKind: 'INBOX',
      mappingId: INBOX_MAPPING,
      requestKey: 'c5-inbox-noop',
    });

    expect(result.outcome).toBe('ALREADY_MATCHED');
    expect(adminRequest).toHaveBeenCalledTimes(1);
    expect(adminRequest.mock.calls[0]?.[0]?.method).toBe('GET');
  });

  it('reconciles an ambiguous PATCH by GET and never blindly PATCHes again', async () => {
    makeService(baseTables());
    const { client } = makeAuthenticatedClient();

    adminRequest
      .mockResolvedValueOnce({ payload: [{ id: 101 }] })
      .mockRejectedValueOnce(
        new ChatwootHttpError({
          code: 'NETWORK_FAILED',
          message: 'membership patch outcome unknown',
          retryable: true,
          ambiguousMutationOutcome: true,
        }),
      )
      .mockResolvedValueOnce({
        payload: [{ id: 101 }, { id: 102 }],
      });

    const result = await syncChatwootMembershipSet({
      supabase: client,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      resourceKind: 'INBOX',
      mappingId: INBOX_MAPPING,
      requestKey: 'c5-inbox-ambiguous',
    });

    expect(result.outcome).toBe('RECONCILED_AFTER_AMBIGUOUS_MUTATION');
    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(
      adminRequest.mock.calls.filter((call) => call[0]?.method === 'PATCH'),
    ).toHaveLength(1);
  });

  it('marks the mapping DEGRADED when ambiguous membership drift remains', async () => {
    makeService(baseTables());
    const { client, rpc } = makeAuthenticatedClient();

    adminRequest
      .mockResolvedValueOnce({ payload: [{ id: 101 }] })
      .mockRejectedValueOnce(
        new ChatwootHttpError({
          code: 'NETWORK_FAILED',
          message: 'membership patch outcome unknown',
          retryable: true,
          ambiguousMutationOutcome: true,
        }),
      )
      .mockResolvedValueOnce({ payload: [{ id: 101 }] });

    await expect(
      syncChatwootMembershipSet({
        supabase: client,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        resourceKind: 'INBOX',
        mappingId: INBOX_MAPPING,
        requestKey: 'c5-inbox-unresolved',
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    const degraded = rpc.mock.calls.find(
      (call) => call[0] === 'mark_chatwoot_inbox_mapping_degraded',
    );
    expect(degraded?.[1]).toMatchObject({
      p_inbox_mapping_id: INBOX_MAPPING,
      p_expected_version: 2,
      p_last_error_code: 'MEMBERSHIP_DRIFT',
      p_request_key: 'c5-inbox-unresolved:members-degraded',
    });
  });

  it('uses Team scope and the bigint Team path while member IDs remain int32', async () => {
    const tables = baseTables();
    tables.member_scope_assignments.push({
      organization_id: ORG,
      user_id: AGENT,
      scope_type: 'TEAM',
      role: 'VIEWER',
      brand_id: null,
      tenant_business_id: null,
      branch_id: null,
      department_id: null,
      team_id: TEAM,
      attributes: {},
    });
    makeService(tables);
    const { client } = makeAuthenticatedClient();

    adminRequest
      .mockResolvedValueOnce([{ id: 101 }, { id: 102 }])
      .mockResolvedValueOnce([{ id: 101 }]);

    const result = await syncChatwootMembershipSet({
      supabase: client,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      resourceKind: 'TEAM',
      mappingId: TEAM_MAPPING,
      requestKey: 'c5-team-members',
    });

    expect(result).toMatchObject({
      resourceKind: 'TEAM',
      mappingVersion: 3,
      desiredCount: 1,
      observedCount: 1,
      outcome: 'UPDATED_VERIFIED',
    });
    expect(adminRequest.mock.calls[0]?.[0]?.resourcePath).toBe(
      '/teams/9223372036854775001/team_members',
    );
    expect(adminRequest.mock.calls[1]?.[0]).toMatchObject({
      resourcePath: '/teams/9223372036854775001/team_members',
      method: 'PATCH',
      body: { user_ids: [101] },
    });
  });

  it('GET-verifies a 2xx PATCH response mismatch and degrades when drift remains', async () => {
    makeService(baseTables());
    const { client, rpc } = makeAuthenticatedClient();

    adminRequest
      .mockResolvedValueOnce({ payload: [{ id: 101 }] })
      .mockResolvedValueOnce({ payload: [{ id: 101 }] })
      .mockResolvedValueOnce({ payload: [{ id: 101 }] });

    await expect(
      syncChatwootMembershipSet({
        supabase: client,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        resourceKind: 'INBOX',
        mappingId: INBOX_MAPPING,
        requestKey: 'c5-inbox-2xx-drift',
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(
      adminRequest.mock.calls.filter((call) => call[0]?.method === 'PATCH'),
    ).toHaveLength(1);

    const degraded = rpc.mock.calls.find(
      (call) => call[0] === 'mark_chatwoot_inbox_mapping_degraded',
    );
    expect(degraded?.[1]).toMatchObject({
      p_last_error_code: 'MEMBERSHIP_DRIFT',
    });
  });

  it('does not reuse a completed request key to repair later external drift', async () => {
    makeService(baseTables());
    const { client } = makeAuthenticatedClient({ resultRecorded: true });

    adminRequest.mockResolvedValueOnce({ payload: [{ id: 101 }] });

    await expect(
      syncChatwootMembershipSet({
        supabase: client,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        resourceKind: 'INBOX',
        mappingId: INBOX_MAPPING,
        requestKey: 'c5-completed-key',
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(adminRequest).toHaveBeenCalledTimes(1);
    expect(adminRequest.mock.calls[0]?.[0]?.method).toBe('GET');
    expect(
      adminRequest.mock.calls.some((call) => call[0]?.method === 'PATCH'),
    ).toBe(false);
  });

  it('returns no-op for an exact replay of a completed request key', async () => {
    const { rpc: serviceRpc } = makeService(baseTables());
    const { client } = makeAuthenticatedClient({ resultRecorded: true });

    adminRequest.mockResolvedValueOnce({
      payload: [{ id: 102 }, { id: 101 }],
    });

    const result = await syncChatwootMembershipSet({
      supabase: client,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      resourceKind: 'INBOX',
      mappingId: INBOX_MAPPING,
      requestKey: 'c5-completed-noop',
    });

    expect(result.outcome).toBe('ALREADY_MATCHED');
    expect(adminRequest).toHaveBeenCalledTimes(1);
    expect(serviceRpc).not.toHaveBeenCalledWith(
      'record_chatwoot_membership_sync_result',
      expect.anything(),
    );
  });

  it('fails before service-role reads for a non-OWNER initiating session', async () => {
    const { client } = makeAuthenticatedClient({ ownerRole: 'ADMIN' });

    await expect(
      syncChatwootMembershipSet({
        supabase: client,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        resourceKind: 'INBOX',
        mappingId: INBOX_MAPPING,
        requestKey: 'c5-not-owner',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(serviceFactory).not.toHaveBeenCalled();
    expect(adminRequest).not.toHaveBeenCalled();
  });
});
