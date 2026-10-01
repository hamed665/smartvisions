import 'server-only';

export type MetaWhatsAppProvisioningEvidence = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  platformType: string | null;
  codeVerificationStatus: string | null;
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
  platform_type?: string;
  code_verification_status?: string;
};

type SubscribedApp = {
  id?: string;
  name?: string;
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
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://graph.facebook.com/${input.graphVersion}/${input.path}`,
    {
      method: input.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
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
    fields: 'id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status',
  });
  const { response, body } = await graphJson<{ data?: PhoneNumberRow[] }>({
    graphVersion: input.graphVersion,
    accessToken: input.accessToken,
    path: `${encodeURIComponent(input.wabaId)}/phone_numbers?${query.toString()}`,
    fetchImpl: input.fetchImpl,
  });

  if (!response.ok) {
    throw new Error('Meta phone eligibility readback failed');
  }

  const phone = body?.data?.find((row) => clean(row.id) === input.phoneNumberId) ?? null;
  if (!phone) {
    throw new Error('Selected phone number is no longer assigned to the selected WhatsApp Business Account');
  }

  return {
    displayPhoneNumber: clean(phone.display_phone_number),
    verifiedName: clean(phone.verified_name),
    qualityRating: clean(phone.quality_rating),
    platformType: clean(phone.platform_type),
    codeVerificationStatus: clean(phone.code_verification_status),
  };
}

async function isAppSubscribed(input: {
  graphVersion: string;
  accessToken: string;
  wabaId: string;
  appId: string;
  fetchImpl?: typeof fetch;
}) {
  const { response, body } = await graphJson<{ data?: SubscribedApp[] }>({
    graphVersion: input.graphVersion,
    accessToken: input.accessToken,
    path: `${encodeURIComponent(input.wabaId)}/subscribed_apps`,
    fetchImpl: input.fetchImpl,
  });

  if (!response.ok) {
    throw new Error('Meta webhook subscription readback failed');
  }

  return Boolean(body?.data?.some((row) => clean(row.id) === input.appId));
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
    platformType: phone.platformType,
    codeVerificationStatus: phone.codeVerificationStatus,
    subscriptionConfirmed: true,
    subscriptionCreated,
  };
}

export function safeMetaWhatsAppProvisioningError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'Selected phone number is no longer assigned to the selected WhatsApp Business Account'
    || message === 'Meta webhook subscription could not be confirmed after reconciliation'
  ) return message;
  if (message === 'Meta phone eligibility readback failed') {
    return 'Meta could not confirm the selected WhatsApp phone number yet. Retry provisioning from the same setup session.';
  }
  if (message === 'Meta webhook subscription readback failed') {
    return 'Meta could not confirm the webhook subscription yet. Retry provisioning from the same setup session.';
  }
  return 'Unable to finish WhatsApp provider provisioning safely. Retry from the same setup session.';
}
