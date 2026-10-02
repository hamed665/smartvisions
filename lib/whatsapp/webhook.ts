import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret = process.env.META_APP_SECRET) {
  if (!signatureHeader || !appSecret) return false;
  const [scheme, receivedHex] = signatureHeader.split('=');
  if (scheme !== 'sha256' || !receivedHex) return false;
  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const received = Buffer.from(receivedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export type WhatsAppReferralContext = {
  sourceUrl?: string;
  sourceId?: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  mediaType?: string;
  ctwaClid?: string;
};

type RawWhatsAppReferral = {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  ctwa_clid?: string;
};

export type WhatsAppDestinationContext = {
  displayPhoneNumber?: string;
  phoneNumberId?: string;
  wabaId?: string;
};

export type NormalizedWhatsAppInbound = {
  providerMessageId: string;
  destination: WhatsAppDestinationContext;
  from: string;
  timestamp?: string;
  type: string;
  text?: string;
  contactName?: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
  voice?: boolean;
  referral?: WhatsAppReferralContext;
};

export type NormalizedWhatsAppStatus = {
  providerMessageId: string;
  destination: WhatsAppDestinationContext;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted' | 'unknown';
  timestamp?: string;
  recipientId?: string;
  conversationId?: string;
  pricingCategory?: string;
  errorCode?: string;
  errorTitle?: string;
};

export type NormalizedWhatsAppNativeEcho = {
  providerMessageId: string;
  destination: WhatsAppDestinationContext;
  from?: string;
  to?: string;
  recipientWaId?: string;
  recipientUserId?: string;
  recipientParentUserId?: string;
  timestamp?: string;
  type: string;
  text?: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
  voice?: boolean;
};

type WhatsAppWebhookRoot = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{
          profile?: { name?: string; username?: string };
          wa_id?: string;
          user_id?: string;
          parent_user_id?: string;
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string; mime_type?: string; voice?: boolean };
          image?: { id?: string; mime_type?: string; caption?: string };
          video?: { id?: string; mime_type?: string; caption?: string };
          document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
          sticker?: { id?: string; mime_type?: string; animated?: boolean };
          referral?: RawWhatsAppReferral;
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          conversation?: { id?: string };
          pricing?: { category?: string };
          errors?: Array<{ code?: number | string; title?: string }>;
        }>;
        message_echoes?: Array<{
          id?: string;
          from?: string;
          to?: string;
          to_user_id?: string;
          to_parent_user_id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string; mime_type?: string; voice?: boolean };
          image?: { id?: string; mime_type?: string; caption?: string };
          video?: { id?: string; mime_type?: string; caption?: string };
          document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
          sticker?: { id?: string; mime_type?: string; animated?: boolean };
        }>;
      };
    }>;
  }>;
};

function webhookRoot(payload: unknown) {
  return payload as WhatsAppWebhookRoot;
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function destinationContext(input: {
  entryId?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
}): WhatsAppDestinationContext {
  return {
    displayPhoneNumber: clean(input.metadata?.display_phone_number),
    phoneNumberId: clean(input.metadata?.phone_number_id),
    wabaId: clean(input.entryId),
  };
}

function referralContext(referral?: RawWhatsAppReferral) {
  if (!referral) return undefined;
  const normalized: WhatsAppReferralContext = {
    sourceUrl: clean(referral.source_url),
    sourceId: clean(referral.source_id),
    sourceType: clean(referral.source_type),
    headline: clean(referral.headline),
    body: clean(referral.body),
    mediaType: clean(referral.media_type),
    ctwaClid: clean(referral.ctwa_clid),
  };
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

export function extractWhatsAppInbound(payload: unknown): NormalizedWhatsAppInbound[] {
  const events: NormalizedWhatsAppInbound[] = [];
  for (const entry of webhookRoot(payload).entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const destination = destinationContext({
        entryId: (entry as { id?: string }).id,
        metadata: value?.metadata,
      });
      const contactName = value?.contacts?.[0]?.profile?.name;
      for (const message of value?.messages ?? []) {
        if (!message.id || !message.from || !message.type) continue;
        const media = message.audio ?? message.image ?? message.video ?? message.document ?? message.sticker;
        const caption = clean(message.image?.caption ?? message.video?.caption ?? message.document?.caption);
        events.push({
          providerMessageId: message.id,
          destination,
          from: message.from,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text?.body,
          contactName,
          mediaId: clean(media?.id),
          mimeType: clean(media?.mime_type),
          filename: clean(message.document?.filename),
          caption,
          voice: message.audio?.voice,
          referral: referralContext(message.referral),
        });
      }
    }
  }
  return events;
}

export function extractWhatsAppNativeEchoes(payload: unknown): NormalizedWhatsAppNativeEcho[] {
  const events: NormalizedWhatsAppNativeEcho[] = [];
  for (const entry of webhookRoot(payload).entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'smb_message_echoes') continue;
      const value = change.value;
      const destination = destinationContext({
        entryId: entry.id,
        metadata: value?.metadata,
      });
      const contact = value?.contacts?.[0];
      for (const echo of value?.message_echoes ?? []) {
        if (!echo.id || !echo.type) continue;
        const media = echo.audio ?? echo.image ?? echo.video ?? echo.document ?? echo.sticker;
        const caption = clean(echo.image?.caption ?? echo.video?.caption ?? echo.document?.caption);
        events.push({
          providerMessageId: echo.id,
          destination,
          from: clean(echo.from),
          to: clean(echo.to),
          recipientWaId: clean(echo.to) ?? clean(contact?.wa_id),
          recipientUserId: clean(echo.to_user_id) ?? clean(contact?.user_id),
          recipientParentUserId: clean(echo.to_parent_user_id) ?? clean(contact?.parent_user_id),
          timestamp: clean(echo.timestamp),
          type: echo.type,
          text: clean(echo.text?.body),
          mediaId: clean(media?.id),
          mimeType: clean(media?.mime_type),
          filename: clean(echo.document?.filename),
          caption,
          voice: echo.audio?.voice,
        });
      }
    }
  }
  return events;
}

export function extractWhatsAppStatuses(payload: unknown): NormalizedWhatsAppStatus[] {
  const events: NormalizedWhatsAppStatus[] = [];
  for (const entry of webhookRoot(payload).entry ?? []) {
    for (const change of entry.changes ?? []) {
      const destination = destinationContext({
        entryId: (entry as { id?: string }).id,
        metadata: change.value?.metadata,
      });
      for (const status of change.value?.statuses ?? []) {
        if (!status.id) continue;
        const normalized = status.status === 'sent' || status.status === 'delivered' || status.status === 'read' || status.status === 'failed' || status.status === 'deleted'
          ? status.status
          : 'unknown';
        const firstError = status.errors?.[0];
        events.push({
          providerMessageId: status.id,
          destination,
          status: normalized,
          timestamp: status.timestamp,
          recipientId: status.recipient_id,
          conversationId: status.conversation?.id,
          pricingCategory: status.pricing?.category,
          errorCode: firstError?.code == null ? undefined : String(firstError.code),
          errorTitle: firstError?.title,
        });
      }
    }
  }
  return events;
}
