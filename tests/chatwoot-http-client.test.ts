import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ChatwootHttpError,
  chatwootAccountProvisioningRequest,
  chatwootPlatformProvisioningRequest,
} from '@/lib/chatwoot/http';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function enableProvisioning() {
  vi.stubEnv('DEPLOYMENT_ENV', 'production');
  vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
  vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
  vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');
  vi.stubEnv('NODE_ENV', 'test');
}

describe('Chatwoot provisioning HTTP client', () => {
  it('fails closed before fetch when provisioning is not explicitly enabled', async () => {
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'false');
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
    vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');

    const fetchMock = vi.fn();

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: 'PROVISIONING_DISABLED',
      ambiguousMutationOutcome: false,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed before fetch outside the Production deployment environment', async () => {
    vi.stubEnv('DEPLOYMENT_ENV', 'candidate');
    vi.stubEnv('CHATWOOT_PROVISIONING_ENABLED', 'true');
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://inbox.example.com');
    vi.stubEnv('CHATWOOT_PLATFORM_TOKEN', 'platform-secret-token');

    const fetchMock = vi.fn();

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: 'PROVISIONING_DISABLED',
      ambiguousMutationOutcome: false,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the verified api_access_token header for Platform API requests', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );

    await chatwootPlatformProvisioningRequest({
      path: '/platform/api/v1/accounts/1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      api_access_token: 'platform-secret-token',
    });
  });

  it('uses the ephemeral user token for account-scoped API requests', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 9 }), { status: 200 }),
    );

    await chatwootAccountProvisioningRequest({
      path: '/api/v1/accounts/7/inboxes',
      accessToken: 'ephemeral-user-token',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      api_access_token: 'ephemeral-user-token',
    });
  });

  it('rejects invalid user tokens before any network call', async () => {
    enableProvisioning();
    const fetchMock = vi.fn();

    await expect(
      chatwootAccountProvisioningRequest({
        path: '/api/v1/accounts/7/inboxes',
        accessToken: 'bad\ntoken',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries safe GET 429 responses but never beyond three attempts', async () => {
    enableProvisioning();

    const first = new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': '0' },
    });
    const second = new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': '0' },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7 }), { status: 200 }),
      );

    const result = await chatwootPlatformProvisioningRequest<{ id: number }>({
      path: '/platform/api/v1/accounts',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(first.bodyUsed).toBe(true);
    expect(second.bodyUsed).toBe(true);
  });

  it('never blindly retries a mutation after a network failure', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));

    let caught: unknown;
    try {
      await chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        method: 'POST',
        body: { name: 'Synthetic Candidate' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChatwootHttpError);
    expect(caught).toMatchObject({
      code: 'NETWORK_FAILED',
      retryable: false,
      ambiguousMutationOutcome: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks mutation 5xx as ambiguous and does not auto-retry it', async () => {
    enableProvisioning();

    const response = new Response('upstream failure', { status: 503 });
    const fetchMock = vi.fn().mockResolvedValue(response);

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        method: 'POST',
        body: { name: 'Synthetic Candidate' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: 'UPSTREAM_FAILED',
      retryable: false,
      ambiguousMutationOutcome: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.bodyUsed).toBe(true);
  });

  it('does not copy upstream error bodies or tokens into thrown messages', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('upstream-secret-body platform-secret-token', {
        status: 401,
      }),
    );

    let caught: unknown;
    try {
      await chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        method: 'POST',
        body: { name: 'Synthetic Candidate' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChatwootHttpError);
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toBe('Chatwoot request failed with HTTP 401');
    expect(message).not.toContain('upstream-secret-body');
    expect(message).not.toContain('platform-secret-token');
  });

  it('rejects unserializable and oversized request bodies before fetch', async () => {
    enableProvisioning();
    const fetchMock = vi.fn();

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        method: 'POST',
        body: circular,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' });

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        method: 'POST',
        body: { payload: 'x'.repeat(300_000) },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'REQUEST_TOO_LARGE' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stream-limits large successful responses even without Content-Length', async () => {
    enableProvisioning();

    const oversized = JSON.stringify({ payload: 'x'.repeat(1_000_100) });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(oversized, { status: 200 }),
    );

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
      ambiguousMutationOutcome: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns unsafe upstream bigint IDs without precision loss', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        '{"id":9223372036854775807,"user_id":2147483647,"role":"agent"}',
        { status: 200 },
      ),
    );

    const result = await chatwootPlatformProvisioningRequest<{
      id: string;
      user_id: number;
      role: string;
    }>({
      path: '/platform/api/v1/accounts/7/account_users',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({
      id: '9223372036854775807',
      user_id: 2147483647,
      role: 'agent',
    });
  });

  it('marks successful mutation with invalid JSON as ambiguous', async () => {
    enableProvisioning();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('not-json', { status: 200 }),
    );

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts',
        method: 'POST',
        body: { name: 'Synthetic Candidate' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      ambiguousMutationOutcome: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects encoded traversal and fragments before fetch', async () => {
    enableProvisioning();
    const fetchMock = vi.fn();

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/%2e%2e/admin',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' });

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/api/v1/accounts#secret',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
