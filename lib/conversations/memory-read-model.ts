import type { ConversationMemoryItem } from '@/lib/agents/contracts';

type JsonRecord = Record<string, unknown>;

export type OutreachMemoryRow = {
  id?: string | null;
  provider_message_id?: string | null;
  channel?: string | null;
  direction?: string | null;
  status?: string | null;
  body?: string | null;
  received_at?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

export type ConversationMemoryRow = {
  id?: string | null;
  conversation_id?: string | null;
  provider_message_id?: string | null;
  channel?: string | null;
  direction?: string | null;
  status?: string | null;
  original_text?: string | null;
  transcript?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown, max = 1600) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value: unknown) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function exactConversation(metadata: unknown, conversationId: string) {
  return text(record(metadata).conversation_id, 80) === conversationId;
}

function senderTypeForConversationRow(row: ConversationMemoryRow): ConversationMemoryItem['senderType'] {
  if (String(row.direction).toUpperCase() === 'INBOUND') return 'CUSTOMER';
  const metadata = record(row.metadata);
  const source = text(metadata.source, 80).toUpperCase();
  const sender = text(metadata.sender_type, 80).toUpperCase();
  if (source === 'OWNER_MANUAL_REPLY' || sender === 'HUMAN' || sender === 'OWNER') return 'HUMAN';
  return 'AGENT';
}

function validConversationStatus(row: ConversationMemoryRow) {
  const direction = String(row.direction ?? '').toUpperCase();
  const status = String(row.status ?? '').toUpperCase();
  if (direction === 'OUTBOUND') return status === 'SENT';
  if (direction === 'INBOUND') return status === 'RECEIVED' || status === 'SENT';
  return false;
}

function validOutreachStatus(row: OutreachMemoryRow) {
  const direction = String(row.direction ?? '').toUpperCase();
  const status = String(row.status ?? '').toUpperCase();
  if (direction === 'INBOUND') return status === 'RECEIVED';
  if (direction === 'OUTBOUND') return status === 'SENT';
  return false;
}

function itemKey(item: ConversationMemoryItem) {
  const provider = text(item.providerMessageId, 260);
  return provider ? `provider:${provider}` : `${item.source ?? 'UNKNOWN'}:${item.sourceId ?? ''}`;
}

export function buildConversationMemory(input: {
  conversationId: string;
  channel?: string;
  outreachRows?: OutreachMemoryRow[];
  conversationRows?: ConversationMemoryRow[];
  limit?: number;
}) {
  const conversationId = text(input.conversationId, 80);
  if (!conversationId) return [] as ConversationMemoryItem[];
  const channel = text(input.channel, 40).toUpperCase();
  const candidates: ConversationMemoryItem[] = [];

  for (const row of input.outreachRows ?? []) {
    if (!validOutreachStatus(row) || !exactConversation(row.metadata, conversationId)) continue;
    const rowChannel = text(row.channel, 40).toUpperCase();
    if (channel && rowChannel !== channel) continue;
    const body = text(row.body);
    if (!body) continue;
    const direction = String(row.direction).toUpperCase() === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND';
    candidates.push({
      sourceId: text(row.id, 80) || undefined,
      providerMessageId: text(row.provider_message_id, 320) || undefined,
      source: 'OUTREACH',
      scope: 'CONVERSATION',
      senderType: direction === 'INBOUND' ? 'CUSTOMER' : 'AGENT',
      direction,
      channel: rowChannel || undefined,
      status: direction === 'INBOUND' ? 'RECEIVED' : 'SENT',
      body,
      at: text(row.received_at ?? row.sent_at ?? row.created_at, 80) || undefined,
    });
  }

  for (const row of input.conversationRows ?? []) {
    if (!validConversationStatus(row)) continue;
    if (text(row.conversation_id, 80) !== conversationId) continue;
    const rowChannel = text(row.channel, 40).toUpperCase();
    if (channel && rowChannel !== channel) continue;
    const body = text(row.original_text ?? row.transcript);
    if (!body) continue;
    const direction = String(row.direction).toUpperCase() === 'INBOUND' ? 'INBOUND' : 'OUTBOUND';
    candidates.push({
      sourceId: text(row.id, 80) || undefined,
      providerMessageId: text(row.provider_message_id, 320) || undefined,
      source: 'CONVERSATION',
      scope: 'CONVERSATION',
      senderType: senderTypeForConversationRow(row),
      direction,
      channel: rowChannel || undefined,
      status: direction === 'INBOUND' ? 'RECEIVED' : 'SENT',
      body,
      at: text(row.sent_at ?? row.created_at, 80) || undefined,
    });
  }

  candidates.sort((a, b) => {
    const delta = timestamp(a.at) - timestamp(b.at);
    if (delta !== 0) return delta;
    return String(a.sourceId ?? '').localeCompare(String(b.sourceId ?? ''));
  });

  const deduped = new Map<string, ConversationMemoryItem>();
  for (const item of candidates) {
    const key = itemKey(item);
    const existing = deduped.get(key);
    if (!existing || (existing.source === 'OUTREACH' && item.source === 'CONVERSATION')) deduped.set(key, item);
  }

  const ordered = [...deduped.values()].sort((a, b) => timestamp(a.at) - timestamp(b.at));
  return ordered.slice(-Math.max(1, Math.min(60, input.limit ?? 30)));
}

export function customerMessages(memory: ConversationMemoryItem[]) {
  return memory.filter((item) => item.direction === 'INBOUND' && item.senderType === 'CUSTOMER');
}

export function sentReplies(memory: ConversationMemoryItem[]) {
  return memory.filter((item) => item.direction === 'OUTBOUND' && item.status === 'SENT');
}
