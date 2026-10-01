import 'server-only';

export type MetaWhatsAppProvisioningEvidence = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  subscriptionConfirmed: boolean;
  subscriptionCreated: boolean;
};

type MetaGraphResponse<T> = T & {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type PhoneNumberRow = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
};

type SubscribedApp = {
  id?: string;
  name?: string;
  whatsapp_business_api_data?: {
    id?: string;
    name?: string;
  };
};

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function graphJson<T>(input: {
  graphVersion: string;
  path: string;
  accessToken: string;
  method?: 'GET' | 'POST';
  fetchImpl?: typeof fetch;
  body?: Record<string, unknown>;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = input.path.startsWith('https://')
    ? new URL(input.path)
    : new URL(`https://graph.facebook.com/${input.graphVersion}/${input.path}`);

  if (url.protocol !== 'https:' || url.hostname !== 'graph.facebook.com') {
    throw new Error('Meta returned an untrusted pagination URL');
  }

  const response = await fetchImpl(
    url.toString(),
    {
      method: input.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: 'no-store',
    },
  );

  let body: MetaGraphResponse<T> | null = null;
  try {
    body = await response.json() as MetaGraphResponse<T>;
  } catch {
    body = null;
  }

  return { response, body };
}

async function readPhoneEvidence(input: {
  graphVersion: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  fetchImpl?: typeof fetch;
}) {
  const query = new URLSearchParams({
    fields: 'id,display_phone_number,verified_name,quality_rating',
    limit: '100',
  });
  let next: string | null =
    `https://graph.facebook.com/${input.graphVersion}/${encodeURIComponent(input.wabaId)}/phone_numbers?${query.toString()}`;
  let phone: PhoneNumberRow | null = null;

  for (let page = 0; next && page < 10; page += 1) {
    const { response, body } = await graphJson<{
      data?: PhoneNumberRow[];
      paging?: { next?: string };
    }>({
      graphVersion: input.graphVersion,
      accessToken: input.accessToken,
      path: next,
      fetchImpl: input.fetchImpl,
    });

    if (!response.ok) {
      throw new Error('Meta phone eligibility readback failed');
    }

    phone = body?.data?.find((row) => clean(row.id) === input.phoneNumberId) ?? null;
    if (phone) break;
    next = typeof body?.paging?.next === 'string' ? body.paging.next : null;
  }

  if (!phone) {
    throw new Error('Selected phone number is no longer assigned to the selected WhatsApp Business Account');
  }

  return {
    displayPhoneNumber: clean(phone.display_phone_number),
    verifiedName: clean(phone.verified_name),
    qualityRating: clean(phone.quality_rating),
  };
}

async function isAppSubscribed(input: {
  graphVersion: string;
  accessToken: string;
  wabaId: string;
  appId: string;
  fetchImpl?: typeof fetch;
}) {
  let next: string | null =
    `https://graph.facebook.com/${input.graphVersion}/${encodeURIComponent(input.wabaId)}/subscribed_apps?limit=100`;

  for (let page = 0; next && page < 10; page += 1) {
    const { response, body } = await graphJson<{
      data?: SubscribedApp[];
      paging?: { next?: string };
    }>({
      graphVersion: input.graphVersion,
      accessToken: input.accessToken,
      path: next,
      fetchImpl: input.fetchImpl,
    });

    if (!response.ok) {
      throw new Error('Meta webhook subscription readback failed');
    }

    if (body?.data?.some((row) =>
      clean(row.whatsapp_business_api_data?.id ?? row.id) === input.appId
    )) return true;

    next = typeof body?.paging?.next === 'string' ? body.paging.next : null;
  }

  return false;
}

export async function provisionMetaWhatsAppBinding(input: {
  graphVersion: string;
  accessToken: string;
  appId: string;
  wabaId: string;
  phoneNumberId: string;
  fetchImpl?: typeof fetch;
}): Promise<MetaWhatsAppProvisioningEvidence> {
  const graphVersion = input.graphVersion.trim();
  const accessToken = input.accessToken.trim();
  const appId = input.appId.trim();
  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();

  if (!graphVersion || !accessToken || !appId || !wabaId || !phoneNumberId) {
    throw new Error('Meta WhatsApp provisioning input is incomplete');
  }

  const phone = await readPhoneEvidence({
    graphVersion,
    accessToken,
    wabaId,
    phoneNumberId,
    fetchImpl: input.fetchImpl,
  });

  let subscribed = await isAppSubscribed({
    graphVersion,
    accessToken,
    wabaId,
    appId,
    fetchImpl: input.fetchImpl,
  });
  let subscriptionCreated = false;

  if (!subscribed) {
    const attempt = await graphJson<{ success?: boolean }>({
      graphVersion,
      accessToken,
      path: `${encodeURIComponent(wabaId)}/subscribed_apps`,
      method: 'POST',
      fetchImpl: input.fetchImpl,
    });

    // Provider responses can be ambiguous after transport errors or retries.
    // Re-read provider truth regardless of the POST result before deciding.
    subscribed = await isAppSubscribed({
      graphVersion,
      accessToken,
      wabaId,
      appId,
      fetchImpl: input.fetchImpl,
    });
    subscriptionCreated = subscribed && attempt.response.ok;
  }

  if (!subscribed) {
    throw new Error('Meta webhook subscription could not be confirmed after reconciliation');
  }

  return {
    wabaId,
    phoneNumberId,
    displayPhoneNumber: phone.displayPhoneNumber,
    verifiedName: phone.verifiedName,
    qualityRating: phone.qualityRating,
    subscriptionConfirmed: true,
    subscriptionCreated,
  };
}


export function normalizeMetaWhatsAppRegistrationPin(value: unknown) {
  const pin = typeof value === 'string' ? value.trim() : '';
  return /^\d{6}$/.test(pin) ? pin : null;
}

export async function registerMetaWhatsAppPhone(input: {
  graphVersion: string;
  accessToken: string;
  phoneNumberId: string;
  pin: string;
  fetchImpl?: typeof fetch;
}) {
  const pin = normalizeMetaWhatsAppRegistrationPin(input.pin);
  if (!pin) throw new Error('WhatsApp registration PIN must be exactly 6 digits');

  const { response, body } = await graphJson<{ success?: boolean | string }>({
    graphVersion: input.graphVersion.trim(),
    accessToken: input.accessToken.trim(),
    path: `${encodeURIComponent(input.phoneNumberId.trim())}/register`,
    method: 'POST',
    fetchImpl: input.fetchImpl,
    body: {
      messaging_product: 'whatsapp',
      pin,
    },
  });

  const succeeded = body?.success === true || body?.success === 'true';
  if (!response.ok || !succeeded) {
    throw new Error('Meta phone registration was not confirmed');
  }
  return { registered: true as const };
}

export function safeMetaWhatsAppProvisioningError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'Selected phone number is no longer assigned to the selected WhatsApp Business Account'
    || message === 'Meta webhook subscription could not be confirmed after reconciliation'
    || message === 'WhatsApp registration PIN must be exactly 6 digits'
    || message === 'Meta phone registration was not confirmed'
  ) return message;
  if (message === 'Meta phone eligibility readback failed') {
    return 'Meta could not confirm the selected WhatsApp phone number yet. Retry provisioning from the same setup session.';
  }
  if (message === 'Meta returned an untrusted pagination URL') {
    return 'Meta returned an invalid pagination response. Provider provisioning was stopped safely.';
  }
  if (message === 'Meta webhook subscription readback failed') {
    return 'Meta could not confirm the webhook subscription yet. Retry provisioning from the same setup session.';
  }
  return 'Unable to finish WhatsApp provider provisioning safely. Retry from the same setup session.';
}
