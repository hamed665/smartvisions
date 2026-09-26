import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const {
  adminRequest,
  adminProjection,
  serviceFactory,
} = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  adminProjection: vi.fn(),
  serviceFactory: vi.fn(),
}));

vi.mock('@/lib/chatwoot/account-admin-request', () => ({
  chatwootAdminAccountRequest: adminRequest,
  requireChatwootAdminProjection: adminProjection,
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

import { ChatwootHttpError } from '@/lib/chatwoot/http';
import {
  reconcileChatwootScopedAccess,
  reduceMemberScopeAssignmentExternalFirst,
} from '@/lib/chatwoot/scoped-access-reconciliation';

const ORG = '00000000-0000-4000-8000-000000002001';
const BRAND = '00000000-0000-4000-8000-000000002002';
const BUSINESS = '00000000-0000-4000-8000-000000002003';
const BRANCH = '00000000-0000-4000-8000-000000002004';
const INBOX_MAPPING = '00000000-0000-4000-8000-000000002005';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000002006';
const OWNER = '00000000-0000-4000-8000-000000002007';
const AGENT = '00000000-0000-4000-8000-000000002008';
const SCOPED = '00000000-0000-4000-8000-000000002009';
const OWNER_USER_MAPPING = '00000000-0000-4000-8000-000000002010';
const AGENT_USER_MAPPING = '00000000-0000-4000-8000-000000002011';
const ASSIGNMENT = '00000000-0000-4000-8000-000000002012';
const RECEIPT = '00000000-0000-4000-8000-000000002013';

type Row = Record<string, unknown>;

function genericService(rows: Record<string, Row[]>) {
  const rpc: any = vi.fn(async () => ({ data: null, error: null }));
  return {
    from: vi.fn((table: string) => {
      let selected = '*';
      const equals: Array<[string, unknown]> = [];
      let inFilter: [string, unknown[]] | null = null;
      let limitValue: number | null = null;
      const builder: Record<string, unknown> = {};

      const filtered = () => {
        let list = [...(rows[table] ?? [])];
        for (const [column, value] of equals) {
          list = list.filter((row) => row[column] === value);
        }
        if (inFilter) {
          const [column, values] = inFilter;
          list = list.filter((row) => values.includes(row[column]));
        }
        if (limitValue !== null) list = list.slice(0, limitValue);
        return list.map((row) => {
          if (selected === '*') return row;
          const result: Row = {};
          for (const column of selected.split(',').map((value) => value.trim())) {
            result[column] = row[column];
          }
          return result;
        });
      };

      builder.select = vi.fn((columns: string) => {
        selected = columns;
        return builder;
      });
      builder.eq = vi.fn((column: string, value: unknown) => {
        equals.push([column, value]);
        return builder;
      });
      builder.in = vi.fn((column: string, values: unknown[]) => {
        inFilter = [column, values];
        return builder;
      });
      builder.limit = vi.fn((value: number) => {
        limitValue = value;
        return builder;
      });
      builder.single = vi.fn(async () => {
        const list = filtered();
        return list.length === 1
          ? { data: list[0], error: null }
          : { data: null, error: { code: 'PGRST116' } };
      });
      builder.then = (
        resolve: (value: { data: Row[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: filtered(), error: null }).then(resolve, reject);

      return builder;
    }),
    rpc,
  } as unknown as SupabaseClient;
}

function serviceRows(input?: {
  branchViewer?: boolean;
  branchAgent?: boolean;
  scopedOnlyGrant?: boolean;
}) {
  const assignments: Row[] = [];
  if (input?.branchViewer || input?.branchAgent) {
    assignments.push({
      id: ASSIGNMENT,
      organization_id: ORG,
      user_id: AGENT,
      scope_type: 'BRANCH',
      role: input?.branchViewer ? 'VIEWER' : 'SALES_AGENT',
      brand_id: null,
      tenant_business_id: null,
      branch_id: BRANCH,
      department_id: null,
      team_id: null,
      attributes: {},
      version: 1,
    });
  }
  if (input?.scopedOnlyGrant) {
    assignments.push({
      organization_id: ORG,
      user_id: SCOPED,
      scope_type: 'BRANCH',
      role: 'SALES_AGENT',
      brand_id: null,
      tenant_business_id: null,
      branch_id: BRANCH,
      department_id: null,
      team_id: null,
      attributes: {},
    });
  }

  return {
    chatwoot_inbox_mappings: [
      {
        id: INBOX_MAPPING,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        branch_id: BRANCH,
        chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        chatwoot_inbox_id: 701,
        status: 'ACTIVE',
        version: 3,
      },
    ],
    tenant_businesses: [
      {
        id: BUSINESS,
        organization_id: ORG,
        brand_id: BRAND,
        status: 'ACTIVE',
      },
    ],
    brands: [
      {
        id: BRAND,
        organization_id: ORG,
        status: 'ACTIVE',
      },
    ],
    branches: [
      {
        id: BRANCH,
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        status: 'ACTIVE',
      },
    ],
    organization_members: [
      { organization_id: ORG, user_id: OWNER, role: 'OWNER' },
      { organization_id: ORG, user_id: AGENT, role: 'ADMIN' },
      ...(input?.scopedOnlyGrant
        ? [{ organization_id: ORG, user_id: SCOPED, role: 'VIEWER' }]
        : []),
    ],
    member_scope_assignments: assignments,
    chatwoot_account_memberships: [
      {
        id: '00000000-0000-4000-8000-000000002101',
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        smart_user_id: OWNER,
        chatwoot_user_mapping_id: OWNER_USER_MAPPING,
        chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        chatwoot_account_user_id: '9001',
        chatwoot_role: 'administrator',
        status: 'ACTIVE',
      },
      {
        id: '00000000-0000-4000-8000-000000002102',
        organization_id: ORG,
        tenant_business_id: BUSINESS,
        smart_user_id: AGENT,
        chatwoot_user_mapping_id: AGENT_USER_MAPPING,
        chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        chatwoot_account_user_id: '9002',
        chatwoot_role: 'agent',
        status: 'ACTIVE',
      },
    ],
    chatwoot_user_mappings: [
      {
        id: OWNER_USER_MAPPING,
        smart_user_id: OWNER,
        chatwoot_user_id: 151,
        status: 'ACTIVE',
      },
      {
        id: AGENT_USER_MAPPING,
        smart_user_id: AGENT,
        chatwoot_user_id: 152,
        status: 'ACTIVE',
      },
    ],
  };
}

function authenticatedOwner() {
  const auditInsert = vi.fn(async () => ({ error: null }));
  const rpc: any = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn((table: string) => {
    if (table === 'organization_members') {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.single = vi.fn(async () => ({
        data: { organization_id: ORG, user_id: OWNER, role: 'OWNER' },
        error: null,
      }));
      return builder;
    }
    if (table === 'audit_logs') {
      return { insert: auditInsert };
    }
    throw new Error('unexpected authenticated table ' + table);
  });

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: OWNER } },
          error: null,
        })),
      },
      from,
      rpc,
    } as unknown as SupabaseClient,
    auditInsert,
    rpc,
  };
}

function agent(id: number) {
  return {
    id,
    account_id: 501,
    role: id === 151 ? 'administrator' : 'agent',
  };
}

beforeEach(() => {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');

  adminProjection.mockResolvedValue({
    smartUserId: OWNER,
    chatwootUserId: 151,
    chatwootAccountId: 501,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Chatwoot scoped Inbox/Team access reconciliation', () => {
  it('fails before auth or privileged reads while provisioning is disabled', async () => {
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'false');
    const { supabase } = authenticatedOwner();

    await expect(
      reconcileChatwootScopedAccess({
        supabase,
        organizationId: ORG,
        kind: 'INBOX',
        mappingId: INBOX_MAPPING,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_BLOCKED' });

    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(serviceFactory).not.toHaveBeenCalled();
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('replaces a Branch Inbox set from canonical scope and verifies with a second GET', async () => {
    const { supabase, auditInsert } = authenticatedOwner();
    serviceFactory.mockReturnValue(
      genericService(serviceRows({ branchViewer: true })),
    );

    adminRequest
      .mockResolvedValueOnce({ payload: [agent(151), agent(152)] })
      .mockResolvedValueOnce({ payload: [agent(151)] })
      .mockResolvedValueOnce({ payload: [agent(151)] });

    const result = await reconcileChatwootScopedAccess({
      supabase,
      organizationId: ORG,
      kind: 'INBOX',
      mappingId: INBOX_MAPPING,
    });

    expect(result).toMatchObject({
      outcome: 'REPLACED_AND_VERIFIED',
      desiredMemberCount: 1,
      verifiedMemberCount: 1,
    });

    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(adminRequest.mock.calls[1]?.[0]).toMatchObject({
      resourcePath: '/inbox_members',
      body: {
        inbox_id: 701,
        user_ids: [151],
      },
    });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG,
        actor_type: 'USER',
        actor_id: OWNER,
        action: 'CHATWOOT_SCOPED_ACCESS_RECONCILED',
        entity_id: INBOX_MAPPING,
      }),
    );
  });

  it('blocks a scoped-only entitlement that lacks verified Business-wide AccountUser projection', async () => {
    const { supabase } = authenticatedOwner();
    serviceFactory.mockReturnValue(
      genericService(serviceRows({ scopedOnlyGrant: true })),
    );

    await expect(
      reconcileChatwootScopedAccess({
        supabase,
        organizationId: ORG,
        kind: 'INBOX',
        mappingId: INBOX_MAPPING,
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('uses GET-only reconciliation after an ambiguous replace-set PATCH', async () => {
    const { supabase } = authenticatedOwner();
    serviceFactory.mockReturnValue(genericService(serviceRows()));

    adminRequest
      .mockResolvedValueOnce({ payload: [agent(151)] })
      .mockRejectedValueOnce(
        new ChatwootHttpError({
          code: 'NETWORK_FAILED',
          message: 'patch outcome unknown',
          retryable: false,
          ambiguousMutationOutcome: true,
        }),
      )
      .mockResolvedValueOnce({ payload: [agent(151), agent(152)] });

    const result = await reconcileChatwootScopedAccess({
      supabase,
      organizationId: ORG,
      kind: 'INBOX',
      mappingId: INBOX_MAPPING,
    });

    expect(result.outcome).toBe('RECONCILED_AFTER_AMBIGUOUS_PATCH');
    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(
      adminRequest.mock.calls.filter((call) => call[0]?.method === 'PATCH'),
    ).toHaveLength(1);
  });

  it('fails closed when post-PATCH GET does not exactly match the desired set', async () => {
    const { supabase } = authenticatedOwner();
    serviceFactory.mockReturnValue(genericService(serviceRows()));

    adminRequest
      .mockResolvedValueOnce({ payload: [agent(151)] })
      .mockResolvedValueOnce({ payload: [agent(151), agent(152)] })
      .mockResolvedValueOnce({ payload: [agent(151)] });

    await expect(
      reconcileChatwootScopedAccess({
        supabase,
        organizationId: ORG,
        kind: 'INBOX',
        mappingId: INBOX_MAPPING,
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(adminRequest).toHaveBeenCalledTimes(3);
  });
});


describe('Chatwoot external-first scoped demotion', () => {
  it('fails before auth or privileged reads while provisioning is disabled', async () => {
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'false');
    const { supabase } = authenticatedOwner();

    await expect(
      reduceMemberScopeAssignmentExternalFirst({
        supabase,
        organizationId: ORG,
        assignmentId: ASSIGNMENT,
        expectedVersion: 1,
        operation: 'UPDATE',
        postRole: 'VIEWER',
        postAttributes: {},
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_BLOCKED' });

    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(serviceFactory).not.toHaveBeenCalled();
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('removes external Inbox access, GET-verifies absence, records a receipt, then commits canonical reduction', async () => {
    const { supabase, rpc, auditInsert } = authenticatedOwner();
    const service = genericService(serviceRows({ branchAgent: true }));
    const serviceRpc = (service as unknown as { rpc: any }).rpc;

    serviceRpc.mockImplementation(async (name: string) => {
      if (name === 'record_chatwoot_scoped_access_reduction') {
        return {
          data: {
            id: RECEIPT,
            organization_id: ORG,
            assignment_id: ASSIGNMENT,
            assignment_version: 1,
          },
          error: null,
        };
      }
      throw new Error('unexpected service RPC ' + name);
    });

    rpc.mockImplementation(async (name: string) => {
      if (name === 'apply_member_scope_assignment_reduction_verified') {
        return {
          data: {
            assignment_id: ASSIGNMENT,
            deleted: false,
            version: 2,
            role: 'VIEWER',
          },
          error: null,
        };
      }
      throw new Error('unexpected authenticated RPC ' + name);
    });

    serviceFactory.mockReturnValue(service);

    adminRequest
      .mockResolvedValueOnce({ payload: [agent(151), agent(152)] })
      .mockResolvedValueOnce({ payload: [agent(151)] })
      .mockResolvedValueOnce({ payload: [agent(151)] });

    const result = await reduceMemberScopeAssignmentExternalFirst({
      supabase,
      organizationId: ORG,
      assignmentId: ASSIGNMENT,
      expectedVersion: 1,
      operation: 'UPDATE',
      postRole: 'VIEWER',
      postAttributes: {},
    });

    expect(result).toMatchObject({
      assignmentId: ASSIGNMENT,
      operation: 'UPDATE',
      externalResourcesVerifiedAbsent: 1,
      changedResourceCount: 1,
      ambiguousMutationCount: 0,
      outcome: 'EXTERNAL_ACCESS_REMOVED_THEN_CANONICAL_REDUCTION_APPLIED',
    });

    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(adminRequest.mock.calls[1]?.[0]).toMatchObject({
      resourcePath: '/inbox_members',
      body: {
        inbox_id: 701,
        user_ids: [151],
      },
    });

    expect(serviceRpc).toHaveBeenCalledWith(
      'record_chatwoot_scoped_access_reduction',
      expect.objectContaining({
        p_organization_id: ORG,
        p_assignment_id: ASSIGNMENT,
        p_expected_assignment_version: 1,
        p_operation: 'UPDATE',
        p_post_role: 'VIEWER',
        p_chatwoot_user_id: 152,
        p_verified_inbox_mapping_ids: [INBOX_MAPPING],
        p_verified_team_mapping_ids: [],
      }),
    );

    expect(rpc).toHaveBeenCalledWith(
      'apply_member_scope_assignment_reduction_verified',
      expect.objectContaining({
        p_organization_id: ORG,
        p_assignment_id: ASSIGNMENT,
        p_expected_version: 1,
        p_operation: 'UPDATE',
        p_post_role: 'VIEWER',
        p_receipt_id: RECEIPT,
      }),
    );

    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG,
        actor_type: 'USER',
        actor_id: OWNER,
        action: 'CHATWOOT_SCOPED_ACCESS_REMOVED_BEFORE_REDUCTION',
        entity_id: ASSIGNMENT,
      }),
    );
  });

  it('does not blindly repeat an ambiguous PATCH and proceeds only after GET proves absence', async () => {
    const { supabase, rpc } = authenticatedOwner();
    const service = genericService(serviceRows({ branchAgent: true }));
    const serviceRpc = (service as unknown as { rpc: any }).rpc;

    serviceRpc.mockResolvedValue({
      data: { id: RECEIPT },
      error: null,
    });
    rpc.mockResolvedValue({
      data: {
        assignment_id: ASSIGNMENT,
        deleted: false,
        version: 2,
        role: 'VIEWER',
      },
      error: null,
    });
    serviceFactory.mockReturnValue(service);

    adminRequest
      .mockResolvedValueOnce({ payload: [agent(151), agent(152)] })
      .mockRejectedValueOnce(
        new ChatwootHttpError({
          code: 'NETWORK_FAILED',
          message: 'patch outcome unknown',
          retryable: false,
          ambiguousMutationOutcome: true,
        }),
      )
      .mockResolvedValueOnce({ payload: [agent(151)] });

    const result = await reduceMemberScopeAssignmentExternalFirst({
      supabase,
      organizationId: ORG,
      assignmentId: ASSIGNMENT,
      expectedVersion: 1,
      operation: 'UPDATE',
      postRole: 'VIEWER',
      postAttributes: {},
    });

    expect(result.ambiguousMutationCount).toBe(1);
    expect(
      adminRequest.mock.calls.filter((call) => call[0]?.method === 'PATCH'),
    ).toHaveLength(1);
    expect(adminRequest.mock.calls.map((call) => call[0]?.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
  });

  it('uses the existing canonical RPC without external mutation when effective access is not reduced to VIEWER', async () => {
    const { supabase, rpc } = authenticatedOwner();
    const service = genericService(serviceRows({ branchAgent: true }));
    serviceFactory.mockReturnValue(service);

    rpc.mockResolvedValue({
      data: {
        id: ASSIGNMENT,
        version: 2,
        role: 'SALES_MANAGER',
      },
      error: null,
    });

    const result = await reduceMemberScopeAssignmentExternalFirst({
      supabase,
      organizationId: ORG,
      assignmentId: ASSIGNMENT,
      expectedVersion: 1,
      operation: 'UPDATE',
      postRole: 'SALES_MANAGER',
      postAttributes: {},
    });

    expect(result).toMatchObject({
      externalResourcesVerifiedAbsent: 0,
      outcome: 'CANONICAL_REDUCTION_NO_EXTERNAL_REMOVAL_REQUIRED',
    });
    expect(adminRequest).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'update_member_scope_assignment',
      expect.objectContaining({
        p_assignment_id: ASSIGNMENT,
        p_expected_version: 1,
        p_role: 'SALES_MANAGER',
      }),
    );
  });
});
