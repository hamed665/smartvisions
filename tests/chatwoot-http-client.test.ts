import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ChatwootHttpError,
  chatwootPlatformProvisioningRequest,
} from '@/lib/chatwoot/http';

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

  it('retries safe GET 429 responses but never beyond three attempts', async () => {
    enableProvisioning();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const result = await chatwootPlatformProvisioningRequest<{ id: number }>({
      path: '/platform/api/v1/accounts',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      api_access_token: 'platform-secret-token',
    });
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

  it('rejects an unserializable mutation body before any network side effect', async () => {
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
    ).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      ambiguousMutationOutcome: false,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stream-limits large successful responses even without Content-Length', async () => {
    enableProvisioning();
    const oversized = JSON.stringify({ payload: 'x'.repeat(1_000_100) });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(oversized, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
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

  it('rejects encoded traversal before fetch', async () => {
    enableProvisioning();
    const fetchMock = vi.fn();

    await expect(
      chatwootPlatformProvisioningRequest({
        path: '/platform/%2e%2e/admin',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_INVALID' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
