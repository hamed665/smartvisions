import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import {
  ensureAndRecordChatwootUser,
  reconcileAndRecordChatwootUser,
} from '@/lib/chatwoot/user-reconciliation';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000701';
const BUSINESS_ID = '00000000-0000-4000-8000-000000000702';
const MAPPING_ID = '00000000-0000-4000-8000-000000000703';
const SMART_USER_ID = '00000000-0000-4000-8000-000000000704';

function enabled() {
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');
  vi.stubEnv('NODE_ENV', 'test');
}

function userResponse(marker: string | null = SMART_USER_ID) {
  return {
    id: 171,
    email: 'agent@example.com',
    name: 'Agent',
    display_name: 'Agent',
    custom_attributes: marker
      ? {
          smartvisions_user_id: marker,
          smartvisions_projection: true,
          smartvisions_projection_version: '1',
        }
      : {},
  };
}

function service() {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'record_chatwoot_user_reconciliation') {
      throw new Error('unexpected RPC');
    }

    return {
      data: {
        id: '00000000-0000-4000-8000-000000000705',
        organization_id: ORGANIZATION_ID,
        tenant_business_id: BUSINESS_ID,
        user_mapping_id: MAPPING_ID,
        mapping_version: 1,
        smart_user_id: SMART_USER_ID,
        observed_chatwoot_user_id: 171,
        observed_email: 'agent@example.com',
        request_key: args.p_request_key,
        payload_hash: 'b'.repeat(64),
        observed_at: '2026-09-24T02:00:00.000Z',
        expires_at: '2026-09-24T02:05:00.000Z',
        created_at: '2026-09-24T02:00:00.000Z',
      },
      error: null,
    };
  });

  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('C3B Chatwoot User reconciliation receipts', () => {
  it('records a receipt only after create/adopt plus marker verification', async () => {
    enabled();
    const { client, rpc } = service();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse(null)), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse()), { status: 200 }),
      );

    const result = await ensureAndRecordChatwootUser({
      service: client,
      organizationId: ORGANIZATION_ID,
      tenantBusinessId: BUSINESS_ID,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
      smartUserId: SMART_USER_ID,
      email: 'agent@example.com',
      trustedDisplayName: 'Agent',
      requestKey: 'user-receipt-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.user.id).toBe(171);
    expect(result.receipt.observed_chatwoot_user_id).toBe(171);
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'POST',
      'PATCH',
    ]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_organization_id: ORGANIZATION_ID,
      p_tenant_business_id: BUSINESS_ID,
      p_user_mapping_id: MAPPING_ID,
      p_expected_mapping_version: 1,
      p_smart_user_id: SMART_USER_ID,
      p_observed_chatwoot_user_id: 171,
      p_observed_email: 'agent@example.com',
      p_request_key: 'user-receipt-1',
    });
  });

  it('records a receipt after ambiguous marker PATCH only when exact GET proves it', async () => {
    enabled();
    const { client, rpc } = service();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse(null)), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError('marker patch outcome unknown'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse()), { status: 200 }),
      );

    const result = await ensureAndRecordChatwootUser({
      service: client,
      organizationId: ORGANIZATION_ID,
      tenantBusinessId: BUSINESS_ID,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
      smartUserId: SMART_USER_ID,
      email: 'agent@example.com',
      requestKey: 'user-receipt-ambiguous-patch',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe(
      'RECONCILED_AFTER_AMBIGUOUS_MARKER_UPDATE',
    );
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'POST',
      'PATCH',
      'GET',
    ]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not mint a receipt when ambiguous marker PATCH GET lacks the marker', async () => {
    enabled();
    const { client, rpc } = service();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse(null)), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError('marker patch outcome unknown'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse(null)), { status: 200 }),
      );

    await expect(
      ensureAndRecordChatwootUser({
        service: client,
        organizationId: ORGANIZATION_ID,
        tenantBusinessId: BUSINESS_ID,
        mappingId: MAPPING_ID,
        mappingVersion: 1,
        smartUserId: SMART_USER_ID,
        email: 'agent@example.com',
        requestKey: 'user-receipt-unconfirmed-patch',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('reconciles a known User id by GET before recording a fresh receipt', async () => {
    enabled();
    const { client, rpc } = service();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(userResponse()), { status: 200 }),
    );

    const result = await reconcileAndRecordChatwootUser({
      service: client,
      organizationId: ORGANIZATION_ID,
      tenantBusinessId: BUSINESS_ID,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
      smartUserId: SMART_USER_ID,
      chatwootUserId: 171,
      email: 'agent@example.com',
      requestKey: 'user-receipt-get',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.user.id).toBe(171);
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['GET']);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/platform/api/v1/users/171');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails before receipt write when known User identity drifts', async () => {
    enabled();
    const { client, rpc } = service();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...userResponse(),
          email: 'other@example.com',
        }),
        { status: 200 },
      ),
    );

    await expect(
      reconcileAndRecordChatwootUser({
        service: client,
        organizationId: ORGANIZATION_ID,
        tenantBusinessId: BUSINESS_ID,
        mappingId: MAPPING_ID,
        mappingVersion: 1,
        smartUserId: SMART_USER_ID,
        chatwootUserId: 171,
        email: 'agent@example.com',
        requestKey: 'user-receipt-drift',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_MISMATCH' });

    expect(rpc).not.toHaveBeenCalled();
  });
});
