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
};

export function extractWhatsAppInbound(payload: unknown): NormalizedWhatsAppInbound[] {
  const root = payload as {
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
          }>;
        };
      }>;
    }>;
  };

  const events: NormalizedWhatsAppInbound[] = [];
  for (const entry of root.entry ?? []) {
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
        });
      }
    }
  }
  return events;
}
