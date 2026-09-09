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

export type NormalizedWhatsAppInbound = {
  providerMessageId: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: string;
  contactName?: string;
  mediaId?: string;
  mimeType?: string;
  voice?: boolean;
  referral?: WhatsAppReferralContext;
};

export type NormalizedWhatsAppStatus = {
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted' | 'unknown';
  timestamp?: string;
  recipientId?: string;
  conversationId?: string;
  pricingCategory?: string;
  errorCode?: string;
  errorTitle?: string;
};

type WhatsAppWebhookRoot = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string; mime_type?: string; voice?: boolean };
          referral?: {
            source_url?: string;
            source_id?: string;
            source_type?: string;
            headline?: string;
            body?: string;
            media_type?: string;
            ctwa_clid?: string;
          };
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

function referralContext(referral: NonNullable<NonNullable<NonNullable<WhatsAppWebhookRoot['entry']>[number]['changes']>[number]['value']>['messages'] extends Array<infer M> ? M extends { referral?: infer R } ? R : never : never) {
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
      const contactName = value?.contacts?.[0]?.profile?.name;
      for (const message of value?.messages ?? []) {
        if (!message.id || !message.from || !message.type) continue;
        events.push({
          providerMessageId: message.id,
          from: message.from,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text?.body,
          contactName,
          mediaId: message.audio?.id,
          mimeType: message.audio?.mime_type,
          voice: message.audio?.voice,
          referral: referralContext(message.referral),
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
      for (const status of change.value?.statuses ?? []) {
        if (!status.id) continue;
        const normalized = status.status === 'sent' || status.status === 'delivered' || status.status === 'read' || status.status === 'failed' || status.status === 'deleted'
          ? status.status
          : 'unknown';
        const firstError = status.errors?.[0];
        events.push({
          providerMessageId: status.id,
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
