import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import {
  reconcileAndRecordChatwootMembership,
  removeAndRecordChatwootMembership,
} from '@/lib/chatwoot/membership-reconciliation';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000601';
const BUSINESS_ID = '00000000-0000-4000-8000-000000000602';
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000603';

function enabled() {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');
  vi.stubEnv('NODE_ENV', 'test');
}

function serviceWithReceipt(input?: {
  observedPresence?: 'PRESENT' | 'ABSENT';
  observedAccountUserId?: string | null;
  observedRole?: 'agent' | 'administrator' | null;
}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'record_chatwoot_account_membership_reconciliation') {
      throw new Error('unexpected RPC');
    }

    return {
      data: {
        id: '00000000-0000-4000-8000-000000000604',
        organization_id: ORGANIZATION_ID,
        tenant_business_id: BUSINESS_ID,
        membership_id: MEMBERSHIP_ID,
        membership_version: 2,
        smart_user_id: '00000000-0000-4000-8000-000000000605',
        chatwoot_account_mapping_id:
          '00000000-0000-4000-8000-000000000606',
        chatwoot_user_mapping_id:
          '00000000-0000-4000-8000-000000000607',
        chatwoot_account_id: 501,
        chatwoot_user_id: 151,
        prior_chatwoot_account_user_id: '9223372036854775807',
        observed_presence:
          input?.observedPresence ?? args.p_observed_presence,
        observed_account_user_id:
          input?.observedAccountUserId ??
          (args.p_observed_account_user_id as string | null),
        observed_role:
          input?.observedRole ?? (args.p_observed_role as string | null),
        request_key: args.p_request_key,
        payload_hash: 'a'.repeat(64),
        observed_at: '2026-09-24T01:00:00.000Z',
        expires_at: '2026-09-24T01:05:00.000Z',
        created_at: '2026-09-24T01:00:00.000Z',
      },
      error: null,
    };
  });

  return {
    service: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('C3B membership reconciliation receipts', () => {
  it('records one server receipt from exact GET membership evidence', async () => {
    enabled();
    const { service, rpc } = serviceWithReceipt({
      observedPresence: 'PRESENT',
      observedAccountUserId: '9223372036854775807',
      observedRole: 'agent',
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '9223372036854775807',
            account_id: 501,
            user_id: 151,
            role: 'agent',
          },
        ]),
        { status: 200 },
      ),
    );

    const receipt = await reconcileAndRecordChatwootMembership({
      service,
      organizationId: ORGANIZATION_ID,
      tenantBusinessId: BUSINESS_ID,
      membershipId: MEMBERSHIP_ID,
      membershipVersion: 2,
      chatwootAccountId: 501,
      chatwootUserId: 151,
      requestKey: 'membership-present-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(receipt.observed_presence).toBe('PRESENT');
    expect(receipt.observed_account_user_id).toBe('9223372036854775807');
    expect(receipt.observed_role).toBe('agent');
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['GET']);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_organization_id: ORGANIZATION_ID,
      p_tenant_business_id: BUSINESS_ID,
      p_membership_id: MEMBERSHIP_ID,
      p_expected_membership_version: 2,
      p_chatwoot_account_id: 501,
      p_chatwoot_user_id: 151,
      p_observed_presence: 'PRESENT',
      p_observed_account_user_id: '9223372036854775807',
      p_observed_role: 'agent',
      p_request_key: 'membership-present-1',
    });
  });

  it('records ABSENT when GET proves no AccountUser exists', async () => {
    enabled();
    const { service, rpc } = serviceWithReceipt({
      observedPresence: 'ABSENT',
      observedAccountUserId: null,
      observedRole: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const receipt = await reconcileAndRecordChatwootMembership({
      service,
      organizationId: ORGANIZATION_ID,
      tenantBusinessId: BUSINESS_ID,
      membershipId: MEMBERSHIP_ID,
      membershipVersion: 2,
      chatwootAccountId: 501,
      chatwootUserId: 151,
      requestKey: 'membership-absent-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(receipt.observed_presence).toBe('ABSENT');
    expect(receipt.observed_account_user_id).toBeNull();
    expect(receipt.observed_role).toBeNull();
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_observed_presence: 'ABSENT',
      p_observed_account_user_id: null,
      p_observed_role: null,
    });
  });

  it('removes exactly once, verifies GET absence, then records ABSENT receipt', async () => {
    enabled();
    const { service, rpc } = serviceWithReceipt({
      observedPresence: 'ABSENT',
      observedAccountUserId: null,
      observedRole: null,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '9223372036854775807',
              account_id: 501,
              user_id: 151,
              role: 'agent',
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

    const receipt = await removeAndRecordChatwootMembership({
      service,
      organizationId: ORGANIZATION_ID,
      tenantBusinessId: BUSINESS_ID,
      membershipId: MEMBERSHIP_ID,
      membershipVersion: 2,
      chatwootAccountId: 501,
      chatwootUserId: 151,
      expectedAccountUserId: '9223372036854775807',
      requestKey: 'membership-remove-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(receipt.observed_presence).toBe('ABSENT');
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'GET',
      'DELETE',
      'GET',
    ]);
    expect(
      fetchMock.mock.calls.filter((call) => call[1]?.method === 'DELETE'),
    ).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_observed_presence: 'ABSENT',
      p_observed_account_user_id: null,
      p_observed_role: null,
    });
  });

  it('does not mint a receipt when external AccountUser identity drifts', async () => {
    enabled();
    const { service, rpc } = serviceWithReceipt();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '999',
            account_id: 501,
            user_id: 151,
            role: 'agent',
          },
        ]),
        { status: 200 },
      ),
    );

    await expect(
      removeAndRecordChatwootMembership({
        service,
        organizationId: ORGANIZATION_ID,
        tenantBusinessId: BUSINESS_ID,
        membershipId: MEMBERSHIP_ID,
        membershipVersion: 2,
        chatwootAccountId: 501,
        chatwootUserId: 151,
        expectedAccountUserId: '9223372036854775807',
        requestKey: 'membership-drift-1',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_CONFLICT' });

    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails before HTTP/RPC for unsafe numeric identifiers', async () => {
    enabled();
    const { service, rpc } = serviceWithReceipt();
    const fetchMock = vi.fn();

    await expect(
      reconcileAndRecordChatwootMembership({
        service,
        organizationId: ORGANIZATION_ID,
        tenantBusinessId: BUSINESS_ID,
        membershipId: MEMBERSHIP_ID,
        membershipVersion: 2,
        chatwootAccountId: 2_147_483_648,
        chatwootUserId: 151,
        requestKey: 'membership-invalid-1',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('chatwootAccountId is invalid');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
