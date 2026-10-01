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
