import 'server-only';

import { metaGraphVersion } from '@/lib/whatsapp/meta-onboarding';

export class MetaAppCredentialReadinessError extends Error {
  constructor() {
    super('Meta app credential pair could not be verified');
    this.name = 'MetaAppCredentialReadinessError';
  }
}

export async function verifyMetaAppCredentialPair(input: {
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
}) {
  const appId = input.appId.trim();
  const appSecret = input.appSecret.trim();
  if (!/^[0-9]{5,32}$/.test(appId) || appSecret.length < 16) {
    throw new MetaAppCredentialReadinessError();
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const url =
    `https://graph.facebook.com/${metaGraphVersion()}/${encodeURIComponent(appId)}?fields=id`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${appId}|${appSecret}`,
        Accept: 'application/json',
      },
    });
  } catch {
    throw new MetaAppCredentialReadinessError();
  }

  if (!response.ok) throw new MetaAppCredentialReadinessError();

  const body = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!body || String(body.id ?? '') !== appId) {
    throw new MetaAppCredentialReadinessError();
  }

  return { appId };
}
