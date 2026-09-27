import { describe, expect, it, vi } from 'vitest';
import { MetaInstagramProvider } from '@/lib/instagram/provider';

describe('Meta Instagram provider readiness', () => {
  it('requires tenant-injected credentials', () => {
    expect(() => new MetaInstagramProvider({ token: '', destinationId: 'ig-1' })).toThrow();
    expect(() => new MetaInstagramProvider({ token: 'token', destinationId: '' })).toThrow();
  });

  it('uses only injected tenant destination/token and returns provider evidence', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: 'mid.out.1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new MetaInstagramProvider({
      token: 'tenant-secret',
      destinationId: 'ig-business-1',
      graphVersion: 'v-test',
    });
    await expect(provider.sendText({ recipientId: 'ig-user-1', text: 'hello' }))
      .resolves.toEqual({ providerMessageId: 'mid.out.1', status: 'accepted' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v-test/ig-business-1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tenant-secret' }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('does not accept an empty provider response as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const provider = new MetaInstagramProvider({ token: 'tenant-secret', destinationId: 'ig-business-1' });
    await expect(provider.sendText({ recipientId: 'ig-user-1', text: 'hello' }))
      .rejects.toThrow('did not include a message id');
    vi.unstubAllGlobals();
  });
});
