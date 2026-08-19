export interface OutboundMessage {
  mailboxId: string;
  to: string;
  subject?: string;
  text: string;
  html?: string;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface DeliveryEvent {
  providerMessageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';
  occurredAt: string;
  detail?: string;
}

export interface InboundReply {
  providerMessageId: string;
  threadId?: string;
  from: string;
  to: string;
  subject?: string;
  text: string;
  receivedAt: string;
}

export interface EmailProvider {
  sendEmail(input: OutboundMessage): Promise<{ providerMessageId: string }>;
  fetchReplies(since: Date): Promise<InboundReply[]>;
  getDeliveryStatus(providerMessageId: string): Promise<DeliveryEvent[]>;
  getBounce(providerMessageId: string): Promise<DeliveryEvent | null>;
  getComplaint(providerMessageId: string): Promise<DeliveryEvent | null>;
  unsubscribe(address: string): Promise<void>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
