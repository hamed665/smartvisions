import { canPubliclyViewPreview } from './lifecycle';

type PublicPreviewRow = {
  id: string;
  organization_id: string;
  status: string;
  payload: unknown;
  quality_score: number | null;
  public_token: string;
  expires_at: string;
  created_at: string;
  sent_at: string | null;
};

function dataApiConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for public preview lifecycle');
  return { url: url.replace(/\/$/, ''), key };
}

function dataApiHeaders(key: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('apikey', key);
  headers.set('authorization', `Bearer ${key}`);
  headers.set('accept', 'application/json');
  return headers;
}

export async function loadPublicPreview(publicToken: string): Promise<PublicPreviewRow | null> {
  const { url, key } = dataApiConfig();
  const endpoint = new URL(`${url}/rest/v1/previews`);
  endpoint.searchParams.set('select', 'id,organization_id,status,payload,quality_score,public_token,expires_at,created_at,sent_at');
  endpoint.searchParams.set('public_token', `eq.${publicToken}`);
  endpoint.searchParams.set('limit', '1');

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: dataApiHeaders(key),
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const rows = (await response.json()) as PublicPreviewRow[];
  const preview = rows[0];
  if (!preview) return null;
  if (!canPubliclyViewPreview({ status: preview.status, expiresAt: preview.expires_at })) return null;

  if (preview.status === 'SENT') {
    const updateEndpoint = new URL(`${url}/rest/v1/previews`);
    updateEndpoint.searchParams.set('id', `eq.${preview.id}`);
    updateEndpoint.searchParams.set('status', 'eq.SENT');
    updateEndpoint.searchParams.set('select', 'id');

    const updateResponse = await fetch(updateEndpoint, {
      method: 'PATCH',
      headers: dataApiHeaders(key, {
        'content-type': 'application/json',
        prefer: 'return=representation',
      }),
      body: JSON.stringify({ status: 'VIEWED' }),
    });
    if (!updateResponse.ok) throw new Error(`Preview view transition failed: HTTP ${updateResponse.status}`);

    const updated = (await updateResponse.json()) as Array<{ id: string }>;
    if (updated[0]) {
      const eventResponse = await fetch(`${url}/rest/v1/preview_events`, {
        method: 'POST',
        headers: dataApiHeaders(key, {
          'content-type': 'application/json',
          prefer: 'return=minimal',
        }),
        body: JSON.stringify({
          organization_id: preview.organization_id,
          preview_id: preview.id,
          event_type: 'VIEWED',
          metadata: { source: 'public_preview' },
        }),
      });
      if (!eventResponse.ok) {
        console.warn('Preview view event persistence failed', { status: eventResponse.status, previewId: preview.id });
      }
      return { ...preview, status: 'VIEWED' };
    }
  }

  return preview;
}
