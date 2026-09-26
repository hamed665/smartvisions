import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const {
  ensureChatwootAccountUser,
  ensureAndRecordChatwootUser,
  reconcileAndRecordChatwootUser,
  reconcileAndRecordChatwootMembership,
  createSupabaseServiceClient,
} = vi.hoisted(() => ({
  ensureChatwootAccountUser: vi.fn(),
  ensureAndRecordChatwootUser: vi.fn(),
  reconcileAndRecordChatwootUser: vi.fn(),
  reconcileAndRecordChatwootMembership: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock('@/lib/chatwoot/provisioning', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chatwoot/provisioning')>(
    '@/lib/chatwoot/provisioning',
  );
  return {
    ...actual,
    ensureChatwootAccountUser,
  };
});

vi.mock('@/lib/chatwoot/user-reconciliation', () => ({
  ensureAndRecordChatwootUser,
  reconcileAndRecordChatwootUser,
}));

vi.mock('@/lib/chatwoot/membership-reconciliation', () => ({
  reconcileAndRecordChatwootMembership,
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient,
}));

import { provisionCurrentOwnerChatwootAccess } from '@/lib/chatwoot/owner-access-orchestration';

const ORG = '00000000-0000-4000-8000-000000000401';
const BUSINESS = '00000000-0000-4000-8000-000000000402';
const OWNER = '00000000-0000-4000-8000-000000000403';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000000404';
const USER_MAPPING = '00000000-0000-4000-8000-000000000405';
const MEMBERSHIP = '00000000-0000-4000-8000-000000000406';
const USER_RECEIPT = '00000000-0000-4000-8000-000000000407';
const MEMBERSHIP_RECEIPT = '00000000-0000-4000-8000-000000000408';

function enableProvisioning() {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');
}

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  return builder;
}

function authenticatedSupabase(input?: {
  userMappingStatus?: 'PROVISIONING' | 'ACTIVE';
  membershipStatus?: 'PROVISIONING' | 'ACTIVE';
}) {
  const userMappingStatus = input?.userMappingStatus ?? 'PROVISIONING';
  const membershipStatus = input?.membershipStatus ?? 'PROVISIONING';

  const rpc = vi.fn(async (name: string) => {
    if (name === 'create_chatwoot_user_mapping') {
      return {
        data: {
          id: USER_MAPPING,
          smart_user_id: OWNER,
          chatwoot_user_id: userMappingStatus === 'ACTIVE' ? 151 : null,
          status: userMappingStatus,
          version: 1,
        },
        error: null,
      };
    }

    if (name === 'activate_chatwoot_user_mapping_verified') {
      return {
        data: {
          id: USER_MAPPING,
          smart_user_id: OWNER,
          chatwoot_user_id: 151,
          status: 'ACTIVE',
          version: 2,
        },
        error: null,
      };
    }

    if (name === 'create_chatwoot_account_membership') {
      return {
        data: {
          id: MEMBERSHIP,
          organization_id: ORG,
          tenant_business_id: BUSINESS,
          smart_user_id: OWNER,
          chatwoot_user_mapping_id: USER_MAPPING,
          chatwoot_account_mapping_id: ACCOUNT_MAPPING,
          chatwoot_account_user_id:
            membershipStatus === 'ACTIVE' ? '9001' : null,
          effective_smart_role: 'OWNER',
          chatwoot_role: 'administrator',
          status: membershipStatus,
          version: 1,
        },
        error: null,
      };
    }

    if (name === 'activate_chatwoot_account_membership_verified') {
      return {
        data: {
          id: MEMBERSHIP,
          organization_id: ORG,
          tenant_business_id: BUSINESS,
          smart_user_id: OWNER,
          chatwoot_user_mapping_id: USER_MAPPING,
          chatwoot_account_mapping_id: ACCOUNT_MAPPING,
          chatwoot_account_user_id: '9001',
          effective_smart_role: 'OWNER',
          chatwoot_role: 'administrator',
          status: 'ACTIVE',
          version: 2,
        },
        error: null,
      };
    }

    throw new Error(`unexpected RPC ${name}`);
  });

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: OWNER,
            email: 'owner@example.com',
          },
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'organization_members') {
        return queryBuilder({ data: { role: 'OWNER' }, error: null });
      }
      if (table === 'chatwoot_account_mappings') {
        return queryBuilder({
          data: {
            id: ACCOUNT_MAPPING,
            organization_id: ORG,
            tenant_business_id: BUSINESS,
            chatwoot_account_id: 501,
            status: 'ACTIVE',
          },
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    }),
    rpc,
  } as unknown as SupabaseClient;

  return { supabase, rpc };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('governed Chatwoot OWNER access orchestration', () => {
  it('fails before auth, DB claims, service client, or HTTP helpers while activation is blocked', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'production');
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'false');
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
    vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');

    const { supabase, rpc } = authenticatedSupabase();

    await expect(
      provisionCurrentOwnerChatwootAccess({
        supabase,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_BLOCKED' });

    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
    expect(ensureAndRecordChatwootUser).not.toHaveBeenCalled();
    expect(ensureChatwootAccountUser).not.toHaveBeenCalled();
  });

  it('creates verified OWNER User and administrator membership through receipt-backed activation', async () => {
    enableProvisioning();
    const { supabase, rpc } = authenticatedSupabase();
    const service = { marker: 'service-receipt-client' };
    createSupabaseServiceClient.mockReturnValue(service);

    ensureAndRecordChatwootUser.mockResolvedValue({
      user: { id: 151, email: 'owner@example.com' },
      outcome: 'CREATED_OR_ADOPTED',
      receipt: { id: USER_RECEIPT },
    });

    ensureChatwootAccountUser.mockResolvedValue({
      accountUser: {
        id: '9001',
        accountId: 501,
        userId: 151,
        role: 'administrator',
      },
      outcome: 'CREATED_OR_UPDATED',
    });

    reconcileAndRecordChatwootMembership.mockResolvedValue({
      id: MEMBERSHIP_RECEIPT,
      observed_presence: 'PRESENT',
      observed_account_user_id: '9001',
      observed_role: 'administrator',
    });

    const result = await provisionCurrentOwnerChatwootAccess({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    });

    expect(result).toEqual({
      tenantBusinessId: BUSINESS,
      chatwootAccountId: 501,
      chatwootUserId: 151,
      userMappingStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      chatwootRole: 'administrator',
    });

    expect(ensureAndRecordChatwootUser).toHaveBeenCalledWith(
      expect.objectContaining({
        service,
        organizationId: ORG,
        tenantBusinessId: BUSINESS,
        mappingId: USER_MAPPING,
        mappingVersion: 1,
        smartUserId: OWNER,
        email: 'owner@example.com',
      }),
    );

    expect(ensureChatwootAccountUser).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 501,
        userId: 151,
        role: 'administrator',
      }),
    );

    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'create_chatwoot_user_mapping',
      'activate_chatwoot_user_mapping_verified',
      'create_chatwoot_account_membership',
      'activate_chatwoot_account_membership_verified',
    ]);
  });

  it('reconciles already ACTIVE OWNER identity and membership without recreating them', async () => {
    enableProvisioning();
    const { supabase, rpc } = authenticatedSupabase({
      userMappingStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
    });
    const service = { marker: 'service-receipt-client' };
    createSupabaseServiceClient.mockReturnValue(service);

    reconcileAndRecordChatwootUser.mockResolvedValue({
      user: { id: 151, email: 'owner@example.com' },
      receipt: { id: USER_RECEIPT },
    });

    reconcileAndRecordChatwootMembership.mockResolvedValue({
      id: MEMBERSHIP_RECEIPT,
      observed_presence: 'PRESENT',
      observed_account_user_id: '9001',
      observed_role: 'administrator',
    });

    const result = await provisionCurrentOwnerChatwootAccess({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    });

    expect(result.membershipStatus).toBe('ACTIVE');
    expect(ensureAndRecordChatwootUser).not.toHaveBeenCalled();
    expect(ensureChatwootAccountUser).not.toHaveBeenCalled();
    expect(reconcileAndRecordChatwootUser).toHaveBeenCalledTimes(1);
    expect(reconcileAndRecordChatwootMembership).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'create_chatwoot_user_mapping',
      'create_chatwoot_account_membership',
    ]);
  });
});
