import type { ResendWebhookEvent } from '@/lib/outreach/resend-webhook';
import type {
  NormalizedWhatsAppInbound,
  NormalizedWhatsAppStatus,
} from '@/lib/whatsapp/webhook';
import type {
  CanonicalDeliveryEnvelope,
  CanonicalDeliveryStatus,
  CanonicalInboundEnvelope,
  ChannelCapabilityDescriptor,
  ChannelSemanticAdapter,
} from './types';

export const EMAIL_CHANNEL_DESCRIPTOR = {
  channel: 'EMAIL',
  provider: 'RESEND',
  integrationProvider: 'EMAIL_PROVIDER',
  outboundExecution: 'CANONICAL_SEND_GATE_ONLY',
  supports: {
    inbound: true,
    text: true,
    html: true,
    subject: true,
    templates: false,
    catalogProduct: false,
    deliveryReceipts: true,
    readReceipts: false,
    providerThreadIdentity: true,
  },
  idempotency: 'APPLICATION_AND_PROVIDER',
  policy: {
    marketWindowRequired: true,
    suppressionRequired: true,
    canonicalRecipientRequired: true,
    humanTakeoverBlocksAutomation: true,
    finalProviderBoundaryRecheckRequired: true,
    replyPolicy: 'NONE',
  },
  coexistence: {
    humanPriority: true,
    nativeProviderActivity: 'UNPROVEN',
  },
} as const satisfies ChannelCapabilityDescriptor;

export const WHATSAPP_CHANNEL_DESCRIPTOR = {
  channel: 'WHATSAPP',
  provider: 'META_CLOUD',
  integrationProvider: 'META',
  outboundExecution: 'CANONICAL_SEND_GATE_ONLY',
  supports: {
    inbound: true,
    text: true,
    html: false,
    subject: false,
    templates: true,
    catalogProduct: true,
    deliveryReceipts: true,
    readReceipts: true,
    providerThreadIdentity: true,
  },
  idempotency: 'APPLICATION_CLAIM_ONLY',
  policy: {
    marketWindowRequired: true,
    suppressionRequired: true,
    canonicalRecipientRequired: true,
    humanTakeoverBlocksAutomation: true,
    finalProviderBoundaryRecheckRequired: true,
    replyPolicy: 'WHATSAPP_24H_OR_TEMPLATE',
  },
  coexistence: {
    humanPriority: true,
    nativeProviderActivity: 'UNPROVEN',
  },
} as const satisfies ChannelCapabilityDescriptor;

export function mapEmailProviderStatus(eventType: string): CanonicalDeliveryStatus | null {
  switch (eventType) {
    case 'email.scheduled': return 'QUEUED';
    case 'email.sent': return 'SENT';
    case 'email.delivered': return 'DELIVERED';
    case 'email.bounced': return 'BOUNCED';
    case 'email.complained': return 'COMPLAINED';
    case 'email.failed': return 'FAILED';
    case 'email.suppressed': return 'SUPPRESSED';
    default: return null;
  }
}

export function mapWhatsAppProviderStatus(
  status: NormalizedWhatsAppStatus['status'],
): CanonicalDeliveryStatus {
  switch (status) {
    case 'sent': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'read': return 'READ';
    case 'failed': return 'FAILED';
    case 'deleted': return 'DELETED';
    default: return 'UNKNOWN';
  }
}

function whatsappInboundContentType(
  event: NormalizedWhatsAppInbound,
): CanonicalInboundEnvelope['contentType'] {
  if (event.type === 'text') return 'TEXT';
  if (event.type === 'audio') return 'AUDIO';
  if (event.mediaId) return 'MEDIA';
  return 'UNKNOWN';
}

export const emailSemanticAdapter: ChannelSemanticAdapter<
  ResendWebhookEvent,
  ResendWebhookEvent
> = {
  descriptor: EMAIL_CHANNEL_DESCRIPTOR,

  normalizeInbound(event) {
    if (
      event.eventType !== 'email.received'
      || !event.providerMessageId
      || !event.from?.trim()
    ) return null;
    return {
      channel: 'EMAIL',
      provider: 'RESEND',
      providerMessageId: event.providerMessageId,
      ...(event.messageId ? { providerThreadId: event.messageId } : {}),
      occurredAt: event.occurredAt,
      from: event.from,
      ...(event.to ? { to: event.to } : {}),
      contentType: event.text ? 'TEXT' : 'UNKNOWN',
      ...(event.text ? { text: event.text } : {}),
      ...(event.subject ? { subject: event.subject } : {}),
      metadata: {
        providerEventId: event.eventId,
      },
    };
  },

  normalizeStatus(event) {
    if (!event.providerMessageId) return null;
    const status = mapEmailProviderStatus(event.eventType);
    if (!status) return null;
    return {
      channel: 'EMAIL',
      provider: 'RESEND',
      providerMessageId: event.providerMessageId,
      status,
      occurredAt: event.occurredAt,
      ...(event.bounceDetail ? { detail: event.bounceDetail } : {}),
      metadata: {
        providerEventId: event.eventId,
        eventType: event.eventType,
      },
    };
  },
};

export const whatsappSemanticAdapter: ChannelSemanticAdapter<
  NormalizedWhatsAppInbound,
  NormalizedWhatsAppStatus
> = {
  descriptor: WHATSAPP_CHANNEL_DESCRIPTOR,

  normalizeInbound(event) {
    return {
      channel: 'WHATSAPP',
      provider: 'META_CLOUD',
      providerMessageId: event.providerMessageId,
      ...(event.timestamp
        ? { occurredAt: new Date(Number(event.timestamp) * 1000).toISOString() }
        : {}),
      from: event.from,
      contentType: whatsappInboundContentType(event),
      ...(event.text ? { text: event.text } : {}),
      metadata: {
        providerType: event.type,
        contactName: event.contactName ?? null,
        mediaId: event.mediaId ?? null,
        mimeType: event.mimeType ?? null,
        voice: Boolean(event.voice),
        referral: event.referral ?? null,
      },
    };
  },

  normalizeStatus(event) {
    return {
      channel: 'WHATSAPP',
      provider: 'META_CLOUD',
      providerMessageId: event.providerMessageId,
      status: mapWhatsAppProviderStatus(event.status),
      ...(event.timestamp
        ? { occurredAt: new Date(Number(event.timestamp) * 1000).toISOString() }
        : {}),
      ...(event.errorTitle ? { detail: event.errorTitle } : {}),
      metadata: {
        recipientId: event.recipientId ?? null,
        providerConversationId: event.conversationId ?? null,
        pricingCategory: event.pricingCategory ?? null,
        errorCode: event.errorCode ?? null,
      },
    };
  },
};

export const ACTIVE_CHANNEL_ADAPTERS = {
  EMAIL: emailSemanticAdapter,
  WHATSAPP: whatsappSemanticAdapter,
} as const;
