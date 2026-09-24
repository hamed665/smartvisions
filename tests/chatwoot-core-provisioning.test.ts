import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ChatwootProvisioningError,
  ensureChatwootAccount,
  ensureChatwootAccountUser,
  ensureChatwootUser,
  reconcileChatwootAccountUser,
  removeChatwootAccountUser,
} from '@/lib/chatwoot/provisioning';

const TENANT_BUSINESS_ID = '20000000-0000-4000-8000-000000000001';
const SMART_USER_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_SMART_USER_ID = '30000000-0000-4000-8000-000000000002';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function enableProvisioning() {
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');
  vi.stubEnv('NODE_ENV', 'test');
}

function accountMarker() {
  return {
    smartvisions_tenant_business_id: TENANT_BUSINESS_ID,
    smartvisions_projection: true,
    smartvisions_projection_version: '1',
  };
}

function userResponse(input: {
  marker?: string;
  accessToken?: string;
  email?: string;
}) {
  return {
    id: 41,
    email: input.email ?? 'owner@example.com',
    name: 'Owner',
    display_name: 'Owner',
    access_token: input.accessToken ?? 'upstream-user-token',
    custom_attributes: input.marker
      ? {
          smartvisions_user_id: input.marker,
          smartvisions_projection: true,
          smartvisions_projection_version: '1',
        }
      : {},
  };
}

describe('Chatwoot C3A external provisioning adapter', () => {
  it('adopts exactly one Account marker match without creating a duplicate', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 11, name: 'Existing', custom_attributes: accountMarker() },
        ]),
        { status: 200 },
      ),
    );

    const result = await ensureChatwootAccount({
      tenantBusinessId: TENANT_BUSINESS_ID,
      name: 'Smart Business',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('ADOPTED');
    expect(result.account.id).toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates an Account only after marker reconciliation finds none', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 12,
            name: 'Smart Business',
            custom_attributes: accountMarker(),
          }),
          { status: 200 },
        ),
      );

    const result = await ensureChatwootAccount({
      tenantBusinessId: TENANT_BUSINESS_ID,
      name: 'Smart Business',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('CREATED');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.custom_attributes).toMatchObject(accountMarker());
  });

  it('reconciles an ambiguous Account create instead of blindly retrying POST', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError('network lost after send'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 13,
              name: 'Smart Business',
              custom_attributes: accountMarker(),
            },
          ]),
          { status: 200 },
        ),
      );

    const result = await ensureChatwootAccount({
      tenantBusinessId: TENANT_BUSINESS_ID,
      name: 'Smart Business',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('ADOPTED_AFTER_AMBIGUOUS_CREATE');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('GET');
  });

  it('does not create a duplicate when the target Account marker is incomplete', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 16,
            name: 'Partial',
            custom_attributes: {
              smartvisions_tenant_business_id: TENANT_BUSINESS_ID,
            },
          },
        ]),
        { status: 200 },
      ),
    );

    await expect(
      ensureChatwootAccount({
        tenantBusinessId: TENANT_BUSINESS_ID,
        name: 'Smart Business',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_CONFLICT' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when multiple Accounts claim the same tenant marker', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 14, name: 'A', custom_attributes: accountMarker() },
          { id: 15, name: 'B', custom_attributes: accountMarker() },
        ]),
        { status: 200 },
      ),
    );

    await expect(
      ensureChatwootAccount({
        tenantBusinessId: TENANT_BUSINESS_ID,
        name: 'Smart Business',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_MATCH' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates/adopts User, patches the marker and never returns access token or password', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse({})), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(userResponse({ marker: SMART_USER_ID })),
          { status: 200 },
        ),
      );

    const result = await ensureChatwootUser({
      smartUserId: SMART_USER_ID,
      email: 'owner@example.com',
      trustedDisplayName: 'Owner',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('CREATED_OR_ADOPTED');
    expect(result.user).not.toHaveProperty('access_token');
    expect(result.user).not.toHaveProperty('password');

    const createBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const patchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(createBody.password).toMatch(/^[0-9a-f]{64}$/);
    expect(patchBody).not.toHaveProperty('password');
    expect(patchBody.custom_attributes.smartvisions_user_id).toBe(
      SMART_USER_ID,
    );
  });

  it('reuses the same ephemeral password for the one safe email retry', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('ambiguous create'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse({})), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(userResponse({ marker: SMART_USER_ID })),
          { status: 200 },
        ),
      );

    const result = await ensureChatwootUser({
      smartUserId: SMART_USER_ID,
      email: 'owner@example.com',
      trustedDisplayName: 'Owner',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('RECOVERED_BY_SAFE_EMAIL_RETRY');

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryBody.password).toBe(firstBody.password);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails closed on malformed adopted User projection metadata', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 41,
          email: 'owner@example.com',
          name: 'Owner',
          custom_attributes: {
            smartvisions_user_id: 123,
            smartvisions_projection: true,
            smartvisions_projection_version: '1',
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      ensureChatwootUser({
        smartUserId: SMART_USER_ID,
        email: 'owner@example.com',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_CONFLICT' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed if an adopted User is marked for another Smart user', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(userResponse({ marker: OTHER_SMART_USER_ID })),
        { status: 200 },
      ),
    );

    await expect(
      ensureChatwootUser({
        smartUserId: SMART_USER_ID,
        email: 'owner@example.com',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_CONFLICT' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reconciles an ambiguous User marker PATCH by GET of the exact User id', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse({})), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError('patch outcome unknown'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(userResponse({ marker: SMART_USER_ID })),
          { status: 200 },
        ),
      );

    const result = await ensureChatwootUser({
      smartUserId: SMART_USER_ID,
      email: 'owner@example.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe(
      'RECONCILED_AFTER_AMBIGUOUS_MARKER_UPDATE',
    );
    expect(result.user.id).toBe(41);
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'POST',
      'PATCH',
      'GET',
    ]);
    expect(fetchMock.mock.calls[2]?.[0]).toContain(
      '/platform/api/v1/users/41',
    );
  });

  it('fails closed when ambiguous User marker PATCH is not proven by GET', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse({})), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError('patch outcome unknown'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(userResponse({})), { status: 200 }),
      );

    await expect(
      ensureChatwootUser({
        smartUserId: SMART_USER_ID,
        email: 'owner@example.com',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'POST',
      'PATCH',
      'GET',
    ]);
  });

  it('reconciles an ambiguous AccountUser mutation by GET without retrying POST', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('membership outcome unknown'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '9223372036854775807',
              account_id: 12,
              user_id: 41,
              role: 'agent',
            },
          ]),
          { status: 200 },
        ),
      );

    const result = await ensureChatwootAccountUser({
      accountId: 12,
      userId: 41,
      role: 'agent',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('RECONCILED_AFTER_AMBIGUOUS_MUTATION');
    expect(result.accountUser.id).toBe('9223372036854775807');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('GET');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeUndefined();
  });

  it('fails closed when ambiguous AccountUser mutation is not proven by GET', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('membership outcome unknown'))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await expect(
      ensureChatwootAccountUser({
        accountId: 12,
        userId: 41,
        role: 'agent',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('GET');
  });

  it('reconciles exact AccountUser identity and preserves bigint ids', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '9223372036854775807',
            account_id: 12,
            user_id: 41,
            role: 'administrator',
          },
          {
            id: '200',
            account_id: 12,
            user_id: 42,
            role: 'agent',
          },
        ]),
        { status: 200 },
      ),
    );

    const result = await reconcileChatwootAccountUser({
      accountId: 12,
      userId: 41,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      id: '9223372036854775807',
      accountId: 12,
      userId: 41,
      role: 'administrator',
    });
  });

  it('removes AccountUser only after exact preflight and GET absence verification', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '9223372036854775807',
              account_id: 12,
              user_id: 41,
              role: 'agent',
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const result = await removeChatwootAccountUser({
      accountId: 12,
      userId: 41,
      expectedAccountUserId: '9223372036854775807',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('REMOVED');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('GET');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      user_id: 41,
    });
  });

  it('reconciles an ambiguous AccountUser DELETE without blindly deleting twice', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '9223372036854775807',
              account_id: 12,
              user_id: 41,
              role: 'agent',
            },
          ]),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new TypeError('delete outcome unknown'))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const result = await removeChatwootAccountUser({
      accountId: 12,
      userId: 41,
      expectedAccountUserId: '9223372036854775807',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.outcome).toBe('REMOVED_AFTER_AMBIGUOUS_DELETE');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'DELETE')).toHaveLength(1);
  });

  it('refuses AccountUser removal when external identity drift is detected', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '999',
            account_id: 12,
            user_id: 41,
            role: 'agent',
          },
        ]),
        { status: 200 },
      ),
    );

    await expect(
      removeChatwootAccountUser({
        accountId: 12,
        userId: 41,
        expectedAccountUserId: '9223372036854775807',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_CONFLICT' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects membership response drift and invalid int32 input', async () => {
    enableProvisioning();

    const mismatchFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '100',
          account_id: 12,
          user_id: 41,
          role: 'administrator',
        }),
        { status: 200 },
      ),
    );

    await expect(
      ensureChatwootAccountUser({
        accountId: 12,
        userId: 41,
        role: 'agent',
        fetchImpl: mismatchFetch as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_MISMATCH' });

    const neverFetch = vi.fn();
    await expect(
      ensureChatwootAccountUser({
        accountId: 2_147_483_648,
        userId: 41,
        role: 'agent',
        fetchImpl: neverFetch as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(neverFetch).not.toHaveBeenCalled();
  });
});
