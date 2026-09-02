import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPublicPreview } from '@/lib/preview/public-persistence';

const supabaseUrl = 'https://pkypexzpyfbikdnkrzvw.supabase.co';
const secretKey = 'test-server-secret';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

function configureServerCredentials() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SECRET_KEY = secretKey;
}

describe('public preview persistence', () => {
  it('returns null for a missing token without exposing the server key as a bearer token', async () => {
    configureServerCredentials();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadPublicPreview('missing-token')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(requestUrl)).toContain('/rest/v1/previews?');
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe(secretKey);
    expect(headers.get('authorization')).toBeNull();
  });

  it('atomically marks the first SENT view as VIEWED and records the event', async () => {
    configureServerCredentials();
    const row = {
      id: 'preview-1',
      organization_id: 'org-1',
      status: 'SENT',
      payload: { preview: { ok: true } },
      quality_score: 90,
      public_token: 'public-1',
      expires_at: '2099-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      sent_at: '2026-01-01T00:01:00.000Z',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([row]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: row.id }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadPublicPreview(row.public_token)).resolves.toMatchObject({ id: row.id, status: 'VIEWED' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(String(updateUrl)).toContain('status=eq.SENT');
    expect(updateInit.method).toBe('PATCH');
    expect(updateInit.body).toBe(JSON.stringify({ status: 'VIEWED' }));

    const [eventUrl, eventInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(eventUrl).toBe(`${supabaseUrl}/rest/v1/preview_events`);
    expect(eventInit.method).toBe('POST');
  });
});
