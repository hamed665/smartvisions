import {
  SMART_VISIONS_CATALOG_ITEMS,
  isSmartVisionsCatalogContentId,
  type SmartVisionsCatalogContentId,
} from '@/lib/whatsapp/catalog';

type JsonRecord = Record<string, unknown>;

export type CatalogWhatsAppEvent = {
  provider_message_id?: string | null;
  lead_id?: string | null;
  conversation_id?: string | null;
  direction?: string | null;
  event_type?: string | null;
  payload?: unknown;
  created_at?: string | null;
};

export type CatalogInboundMessage = {
  id?: string | null;
  lead_id?: string | null;
  channel?: string | null;
  direction?: string | null;
  status?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

export type CatalogHandoffEvent = {
  lead_id?: string | null;
  conversation_id?: string | null;
  to_mode?: string | null;
  created_at?: string | null;
};

export type CatalogLeadOutcome = {
  id?: string | null;
  status?: string | null;
};

export type CatalogConversionRow = {
  contentId: SmartVisionsCatalogContentId;
  label: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  handoff: number;
  won: number;
  replyRate: number | null;
};

export type CatalogConversionSummary = {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  handoff: number;
  won: number;
  rows: CatalogConversionRow[];
};

type ProductSend = {
  contentId: SmartVisionsCatalogContentId;
  providerMessageId: string;
  leadId: string;
  conversationId: string;
  at: number;
  delivered: boolean;
  read: boolean;
  replied: boolean;
  handoff: boolean;
  won: boolean;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function timestamp(value: unknown) {
  const parsed = Date.parse(stringValue(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function inboundConversationId(message: CatalogInboundMessage) {
  return stringValue(record(message.metadata).conversation_id);
}

function latestPriorSend(input: {
  sends: ProductSend[];
  conversationId: string;
  leadId?: string;
  at: number;
}) {
  let match: ProductSend | undefined;
  for (const send of input.sends) {
    if (send.conversationId !== input.conversationId || send.at > input.at) continue;
    if (input.leadId && send.leadId !== input.leadId) continue;
    if (!match || send.at > match.at) match = send;
  }
  return match;
}

export function buildCatalogConversionAttribution(input: {
  whatsappEvents: CatalogWhatsAppEvent[];
  inboundMessages: CatalogInboundMessage[];
  handoffEvents: CatalogHandoffEvent[];
  leads: CatalogLeadOutcome[];
}): CatalogConversionSummary {
  const sends: ProductSend[] = [];
  const statusByProvider = new Map<string, Set<string>>();

  for (const event of input.whatsappEvents) {
    const providerMessageId = stringValue(event.provider_message_id);
    const eventType = stringValue(event.event_type).toUpperCase();
    if (providerMessageId && eventType) {
      const statuses = statusByProvider.get(providerMessageId) ?? new Set<string>();
      statuses.add(eventType);
      statusByProvider.set(providerMessageId, statuses);
    }

    if (stringValue(event.direction).toUpperCase() !== 'OUTBOUND' || eventType !== 'PRODUCT_SENT') continue;
    const contentId = stringValue(record(event.payload).catalog_content_id);
    const leadId = stringValue(event.lead_id);
    const conversationId = stringValue(event.conversation_id);
    const at = timestamp(event.created_at);
    if (!isSmartVisionsCatalogContentId(contentId) || !providerMessageId || !leadId || !conversationId || at == null) continue;

    sends.push({
      contentId,
      providerMessageId,
      leadId,
      conversationId,
      at,
      delivered: false,
      read: false,
      replied: false,
      handoff: false,
      won: false,
    });
  }

  for (const send of sends) {
    const statuses = statusByProvider.get(send.providerMessageId) ?? new Set<string>();
    send.read = statuses.has('READ');
    send.delivered = statuses.has('DELIVERED') || send.read;
  }

  for (const message of input.inboundMessages) {
    if (stringValue(message.channel).toUpperCase() !== 'WHATSAPP') continue;
    if (stringValue(message.direction).toUpperCase() !== 'INBOUND') continue;
    if (stringValue(message.status).toUpperCase() !== 'RECEIVED') continue;
    const conversationId = inboundConversationId(message);
    const leadId = stringValue(message.lead_id);
    const at = timestamp(message.received_at ?? message.created_at);
    if (!conversationId || !leadId || at == null) continue;
    const attributed = latestPriorSend({ sends, conversationId, leadId, at });
    if (attributed) attributed.replied = true;
  }

  for (const event of input.handoffEvents) {
    if (stringValue(event.to_mode).toUpperCase() !== 'HUMAN') continue;
    const conversationId = stringValue(event.conversation_id);
    const leadId = stringValue(event.lead_id);
    const at = timestamp(event.created_at);
    if (!conversationId || !leadId || at == null) continue;
    const attributed = latestPriorSend({ sends, conversationId, leadId, at });
    if (attributed) attributed.handoff = true;
  }

  // Lead status is current state, not a timestamped win ledger. To avoid fake precision,
  // attribute each currently-WON lead at most once, to its latest catalog send only.
  const wonLeadIds = new Set(
    input.leads
      .filter((lead) => stringValue(lead.status).toUpperCase() === 'WON')
      .map((lead) => stringValue(lead.id))
      .filter(Boolean),
  );
  for (const leadId of wonLeadIds) {
    const latest = sends
      .filter((send) => send.leadId === leadId)
      .sort((a, b) => b.at - a.at)[0];
    if (latest) latest.won = true;
  }

  const rows = (Object.keys(SMART_VISIONS_CATALOG_ITEMS) as SmartVisionsCatalogContentId[]).map((contentId) => {
    const itemSends = sends.filter((send) => send.contentId === contentId);
    const replied = itemSends.filter((send) => send.replied).length;
    return {
      contentId,
      label: SMART_VISIONS_CATALOG_ITEMS[contentId].label,
      sent: itemSends.length,
      delivered: itemSends.filter((send) => send.delivered).length,
      read: itemSends.filter((send) => send.read).length,
      replied,
      handoff: itemSends.filter((send) => send.handoff).length,
      won: itemSends.filter((send) => send.won).length,
      replyRate: itemSends.length ? Math.round((replied / itemSends.length) * 100) : null,
    } satisfies CatalogConversionRow;
  });

  return {
    sent: sends.length,
    delivered: sends.filter((send) => send.delivered).length,
    read: sends.filter((send) => send.read).length,
    replied: sends.filter((send) => send.replied).length,
    handoff: sends.filter((send) => send.handoff).length,
    won: sends.filter((send) => send.won).length,
    rows,
  };
}
