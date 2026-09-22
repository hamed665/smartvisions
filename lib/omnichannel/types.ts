export const ACTIVE_OMNICHANNEL_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;

export type ActiveOmnichannelChannel = (typeof ACTIVE_OMNICHANNEL_CHANNELS)[number];

export const CANONICAL_DELIVERY_STATUSES = [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'BOUNCED',
  'COMPLAINED',
  'FAILED',
  'SUPPRESSED',
  'DELETED',
  'UNKNOWN',
] as const;

export type CanonicalDeliveryStatus = (typeof CANONICAL_DELIVERY_STATUSES)[number];

export type CanonicalInboundEnvelope = {
  channel: ActiveOmnichannelChannel;
  provider: 'RESEND' | 'META_CLOUD';
  providerMessageId: string;
  providerThreadId?: string;
  occurredAt?: string;
  from: string;
  to?: string;
  contentType: 'TEXT' | 'HTML' | 'AUDIO' | 'MEDIA' | 'UNKNOWN';
  text?: string;
  subject?: string;
  metadata: Record<string, unknown>;
};

export type CanonicalDeliveryEnvelope = {
  channel: ActiveOmnichannelChannel;
  provider: 'RESEND' | 'META_CLOUD';
  providerMessageId: string;
  status: CanonicalDeliveryStatus;
  occurredAt?: string;
  detail?: string;
  metadata: Record<string, unknown>;
};

export type NativeAppCoexistenceEvidence =
  | 'UNPROVEN'
  | 'PROVIDER_EVENT'
  | 'CANONICAL_HUMAN_TAKEOVER';

export type OutboundIdempotencyBoundary =
  | 'APPLICATION_AND_PROVIDER'
  | 'APPLICATION_CLAIM_ONLY';

export type ChannelCapabilityDescriptor = {
  channel: ActiveOmnichannelChannel;
  provider: 'RESEND' | 'META_CLOUD';
  integrationProvider: 'EMAIL_PROVIDER' | 'META';
  outboundExecution: 'CANONICAL_SEND_GATE_ONLY';
  supports: {
    inbound: boolean;
    text: boolean;
    html: boolean;
    subject: boolean;
    templates: boolean;
    catalogProduct: boolean;
    deliveryReceipts: boolean;
    readReceipts: boolean;
    providerThreadIdentity: boolean;
  };
  idempotency: OutboundIdempotencyBoundary;
  policy: {
    marketWindowRequired: true;
    suppressionRequired: true;
    canonicalRecipientRequired: true;
    humanTakeoverBlocksAutomation: true;
    finalProviderBoundaryRecheckRequired: true;
    replyPolicy: 'NONE' | 'WHATSAPP_24H_OR_TEMPLATE';
  };
  coexistence: {
    humanPriority: true;
    nativeProviderActivity: NativeAppCoexistenceEvidence;
  };
};

export interface ChannelSemanticAdapter<TInbound, TStatus> {
  readonly descriptor: ChannelCapabilityDescriptor;
  normalizeInbound(input: TInbound): CanonicalInboundEnvelope | null;
  normalizeStatus(input: TStatus): CanonicalDeliveryEnvelope | null;
}
