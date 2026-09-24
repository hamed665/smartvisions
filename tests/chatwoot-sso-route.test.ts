import { afterEach, describe, expect, it, vi } from 'vitest';

const { createSso, createClientMock, SsoError } = vi.hoisted(() => {
  class SsoError extends Error {
    constructor(
      public readonly code:
        | 'INVALID_INPUT'
        | 'AUTHENTICATION_REQUIRED'
        | 'FORBIDDEN'
        | 'UPSTREAM_INVALID',
      message: string,
    ) {
      super(message);
      this.name = 'ChatwootSsoError';
    }
  }

  return {
    createSso: vi.fn(),
    createClientMock: vi.fn(),
    SsoError,
  };
});

vi.mock('@/lib/chatwoot/sso', () => ({
  ChatwootSsoError: SsoError,
  createChatwootSsoLoginUrl: createSso,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

import { GET } from '@/app/api/chatwoot/sso/[organizationId]/[tenantBusinessId]/route';

const ORG = '00000000-0000-4000-8000-000000001501';
const BUSINESS = '00000000-0000-4000-8000-000000001502';
const SSO_URL =
  'https://inbox.example.com/app/login?email=agent%40example.com&sso_auth_token=' +
  'a'.repeat(64);

function context() {
  return {
    params: Promise.resolve({
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  createSso.mockReset();
  createClientMock.mockReset();
});

describe('Chatwoot SSO route', () => {
  it('redirects to the verified SSO URL with no-store/no-referrer headers', async () => {
    const supabase = { auth: {} };
    createClientMock.mockResolvedValueOnce(supabase);
    createSso.mockResolvedValueOnce({
      url: SSO_URL,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
      chatwootAccountId: 501,
    });

    const response = await GET(
      new Request(
        `https://app.example.com/api/chatwoot/sso/${ORG}/${BUSINESS}`,
      ),
      context(),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(SSO_URL);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(createSso).toHaveBeenCalledWith({
      supabase,
      organizationId: ORG,
      tenantBusinessId: BUSINESS,
    });
  });

  it('maps bounded authorization errors without exposing upstream details', async () => {
    const cases = [
      ['INVALID_INPUT', 400],
      ['AUTHENTICATION_REQUIRED', 401],
      ['FORBIDDEN', 403],
      ['UPSTREAM_INVALID', 503],
    ] as const;

    for (const [code, expectedStatus] of cases) {
      createClientMock.mockResolvedValueOnce({ auth: {} });
      createSso.mockRejectedValueOnce(
        new SsoError(code, 'sensitive internal SSO detail'),
      );

      const response = await GET(
        new Request(
          `https://app.example.com/api/chatwoot/sso/${ORG}/${BUSINESS}`,
        ),
        context(),
      );

      expect(response.status).toBe(expectedStatus);
      const body = await response.text();
      expect(body).not.toContain('sensitive internal SSO detail');
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('pragma')).toBe('no-cache');
    }
  });

  it('normalizes unexpected failures to retryable 503 without a redirect', async () => {
    createClientMock.mockResolvedValueOnce({ auth: {} });
    createSso.mockRejectedValueOnce(new Error('unexpected'));

    const response = await GET(
      new Request(
        `https://app.example.com/api/chatwoot/sso/${ORG}/${BUSINESS}`,
      ),
      context(),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.json()).toEqual({
      error: 'Chatwoot SSO temporarily unavailable',
    });
  });
});
