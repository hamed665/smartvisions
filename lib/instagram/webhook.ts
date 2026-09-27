import { verifyMetaSignature } from '@/lib/whatsapp/webhook';

export { verifyMetaSignature };

type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: Record<string, unknown> }>;
  };
  postback?: { mid?: string; title?: string; payload?: string };
  reaction?: { mid?: string; action?: string; reaction?: string; emoji?: string };
  read?: { mid?: string; watermark?: number };
  delivery?: { mids?: string[]; watermark?: number };
};

type InstagramWebhookRoot = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: InstagramMessagingEvent[];
  }>;
};

export type NormalizedInstagramEvent = {
  providerEventId: string;
  destinationId: string;
  senderId?: string;
  eventType: 'MESSAGE' | 'POSTBACK' | 'REACTION' | 'READ' | 'DELIVERY';
  occurredAt?: string;
  payload: Record<string, unknown>;
};

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function eventId(entryId: string, event: InstagramMessagingEvent, index: number) {
  const messageId = clean(event.message?.mid)
    ?? clean(event.postback?.mid)
    ?? clean(event.reaction?.mid)
    ?? clean(event.read?.mid)
    ?? event.delivery?.mids?.map(clean).filter(Boolean).join(',');
  return messageId
    ? `${entryId}:${messageId}`
    : `${entryId}:${event.timestamp ?? event.read?.watermark ?? event.delivery?.watermark ?? 'unknown'}:${index}`;
}

export function extractInstagramEvents(payload: unknown): NormalizedInstagramEvent[] {
  const root = payload as InstagramWebhookRoot;
  if (root.object && root.object !== 'instagram') return [];
  const events: NormalizedInstagramEvent[] = [];

  for (const entry of root.entry ?? []) {
    const entryId = clean(entry.id);
    if (!entryId) continue;
    for (const [index, event] of (entry.messaging ?? []).entries()) {
      const destinationId = clean(event.recipient?.id) ?? entryId;
      let eventType: NormalizedInstagramEvent['eventType'] | null = null;
      if (event.message) eventType = 'MESSAGE';
      else if (event.postback) eventType = 'POSTBACK';
      else if (event.reaction) eventType = 'REACTION';
      else if (event.read) eventType = 'READ';
      else if (event.delivery) eventType = 'DELIVERY';
      if (!eventType) continue;

      events.push({
        providerEventId: eventId(entryId, event, index),
        destinationId,
        senderId: clean(event.sender?.id),
        eventType,
        occurredAt: event.timestamp ? new Date(event.timestamp).toISOString() : undefined,
        payload: {
          messageId: clean(event.message?.mid) ?? clean(event.postback?.mid) ?? clean(event.reaction?.mid),
          text: clean(event.message?.text),
          isEcho: Boolean(event.message?.is_echo),
          attachments: event.message?.attachments ?? [],
          postback: event.postback ?? null,
          reaction: event.reaction ?? null,
          read: event.read ?? null,
          delivery: event.delivery ?? null,
        },
      });
    }
  }
  return events;
}
