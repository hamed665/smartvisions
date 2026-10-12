import 'server-only';

export const META_WHATSAPP_CONNECTION_MODES = [
  'BUSINESS_APP_COEXISTENCE',
  'API_NEW_NUMBER',
  'EXISTING_API_RECONNECT',
] as const;

export type MetaWhatsAppConnectionMode = typeof META_WHATSAPP_CONNECTION_MODES[number];

export function normalizeMetaWhatsAppConnectionMode(value: unknown): MetaWhatsAppConnectionMode | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (META_WHATSAPP_CONNECTION_MODES as readonly string[]).includes(normalized)
    ? normalized as MetaWhatsAppConnectionMode
    : null;
}


export function metaGraphVersion() {
  return process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
}

export async function exchangeMetaAuthorizationCode(input: {
  code: string;
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tokenUrl = `https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token`;
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
  });

  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!response.ok) throw new Error(`Meta authorization exchange failed (${response.status})`);
  const token = await response.json() as { access_token?: string };
  if (!token.access_token || token.access_token.length < 20) {
    throw new Error('Meta authorization exchange returned no usable credential');
  }
  return token.access_token;
}

export function safeMetaWhatsAppCompletionError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'Selected phone number is not part of the selected WhatsApp Business Account'
    || message === 'Meta returned assets that do not match the selected WhatsApp assets'
  ) return message;
  return 'Unable to complete WhatsApp setup safely. You can retry this setup session without deleting or migrating your existing WhatsApp account.';
}

type MetaPhone = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
};

type MetaPage = {
  data?: MetaPhone[];
  paging?: { next?: string };
};

async function metaJson<T>(url: string, accessToken: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Meta asset verification failed (${response.status})`);
  return await response.json() as T;
}

export async function discoverMetaWhatsAppPhoneNumber(input: {
  graphVersion: string;
  accessToken: string;
  wabaId: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const version = input.graphVersion.trim();
  const wabaId = input.wabaId.trim();
  if (!version || !wabaId) throw new Error('Meta WhatsApp discovery requires a WABA');

  let next: string | null =
    `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`;
  const phones: MetaPhone[] = [];

  for (let page = 0; next && page < 10; page += 1) {
    const parsed: URL = new URL(next);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'graph.facebook.com') {
      throw new Error('Meta returned an untrusted pagination URL');
    }

    const result: MetaPage = await metaJson<MetaPage>(parsed.toString(), input.accessToken, fetchImpl);
    for (const phone of result.data ?? []) {
      if (typeof phone.id === 'string' && phone.id.trim()) phones.push(phone);
    }
    next = typeof result.paging?.next === 'string' ? result.paging.next : null;
  }

  const unique = [...new Map(phones.map((phone) => [phone.id as string, phone])).values()];
  if (unique.length !== 1 || !unique[0]?.id) {
    throw new Error('Meta Coexistence completion did not identify exactly one WhatsApp phone number');
  }

  return {
    phoneNumberId: unique[0].id,
    displayPhoneNumber: unique[0].display_phone_number ?? null,
    verifiedName: unique[0].verified_name ?? null,
  };
}

export async function verifyMetaWhatsAppSelectedAssets(input: {
  graphVersion: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const version = input.graphVersion.trim();
  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();

  const [phone, waba] = await Promise.all([
    metaJson<MetaPhone>(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`,
      input.accessToken,
      fetchImpl,
    ),
    metaJson<{ id?: string; name?: string }>(
      `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}?fields=id,name`,
      input.accessToken,
      fetchImpl,
    ),
  ]);

  if (phone.id !== phoneNumberId || waba.id !== wabaId) {
    throw new Error('Meta returned assets that do not match the selected WhatsApp assets');
  }

  let next: string | null =
    `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`;
  let membership: MetaPhone | null = null;

  for (let page = 0; next && page < 10; page += 1) {
    const parsed: URL = new URL(next);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'graph.facebook.com') {
      throw new Error('Meta returned an untrusted pagination URL');
    }

    const result: MetaPage = await metaJson<MetaPage>(parsed.toString(), input.accessToken, fetchImpl);
    membership = (result.data ?? []).find((row: MetaPhone) => row.id === phoneNumberId) ?? null;
    if (membership) break;
    next = typeof result.paging?.next === 'string' ? result.paging.next : null;
  }

  if (!membership) {
    throw new Error('Selected phone number is not part of the selected WhatsApp Business Account');
  }

  return {
    wabaName: typeof waba.name === 'string' ? waba.name : null,
    displayPhoneNumber: membership.display_phone_number ?? phone.display_phone_number ?? null,
    verifiedName: membership.verified_name ?? phone.verified_name ?? null,
  };
}
