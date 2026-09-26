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
import { reconcileChatwootScopedAccess } from '@/lib/chatwoot/scoped-access-reconciliation';

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

type Row = Record<string, unknown>;

function genericService(rows: Record<string, Row[]>) {
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
  } as unknown as SupabaseClient;
}

function serviceRows(input?: {
  branchViewer?: boolean;
  scopedOnlyGrant?: boolean;
}) {
  const assignments: Row[] = [];
  if (input?.branchViewer) {
    assignments.push({
      organization_id: ORG,
      user_id: AGENT,
      scope_type: 'BRANCH',
      role: 'VIEWER',
      brand_id: null,
      tenant_business_id: null,
      branch_id: BRANCH,
      department_id: null,
      team_id: null,
      attributes: {},
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
    } as unknown as SupabaseClient,
    auditInsert,
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
