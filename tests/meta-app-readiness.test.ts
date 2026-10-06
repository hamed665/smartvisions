import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  MetaAppCredentialReadinessError,
  verifyMetaAppCredentialPair,
} from '@/lib/whatsapp/meta-app-readiness';

describe('Meta app credential readiness', () => {
  it('verifies the app id with an app access token without placing the secret in the URL', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://graph.facebook.com/v23.0/2838776553165089?fields=id');
      expect(url).not.toContain('secret-value-for-test');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer 2838776553165089|secret-value-for-test-123456',
        Accept: 'application/json',
      });
      return new Response(JSON.stringify({ id: '2838776553165089' }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(verifyMetaAppCredentialPair({
      appId: '2838776553165089',
      appSecret: 'secret-value-for-test-123456',
      fetchImpl,
    })).resolves.toEqual({ appId: '2838776553165089' });
  });

  it('fails closed on provider rejection without surfacing provider response details', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'sensitive provider detail' } }),
      { status: 401 },
    )) as unknown as typeof fetch;

    await expect(verifyMetaAppCredentialPair({
      appId: '2838776553165089',
      appSecret: 'wrong-secret-value-for-test',
      fetchImpl,
    })).rejects.toEqual(new MetaAppCredentialReadinessError());
  });

  it('fails closed when Meta returns another app id', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ id: '9999999999999999' }),
      { status: 200 },
    )) as unknown as typeof fetch;

    await expect(verifyMetaAppCredentialPair({
      appId: '2838776553165089',
      appSecret: 'secret-value-for-test-123456',
      fetchImpl,
    })).rejects.toThrow('Meta app credential pair could not be verified');
  });

  it('rejects malformed input before making a provider request', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await expect(verifyMetaAppCredentialPair({
      appId: 'not-an-app-id',
      appSecret: 'short',
      fetchImpl,
    })).rejects.toThrow('Meta app credential pair could not be verified');

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
