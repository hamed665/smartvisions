const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChatwootWebhookJournalEvent = {
  id: string;
  event_type: string;
  payload: unknown;
  status: string;
  received_at?: string | null;
};

export type UnifiedInboxSnapshot = {
  eventId: string;
  conversationId: string;
  chatwootConversationDisplayId: number;
  chatwootContactId: number | null;
  chatwootAssigneeUserId: number | null;
  chatwootTeamId: number | null;
  chatwootStatus: string;
  labels: string[];
  lastActivityAt: string;
  chatwootUpdatedAt: string;
};

export type UnifiedInboxEventDecision =
  | { kind: 'RECONCILE'; snapshot: UnifiedInboxSnapshot }
  | { kind: 'IGNORE'; code: 'UNSUPPORTED_EVENT' | 'UNBOUND_CONVERSATION' }
  | { kind: 'FAIL'; code: 'INVALID_EVENT_PAYLOAD' };

const CONVERSATION_EVENTS = new Set([
  'conversation_created',
  'conversation_updated',
  'conversation_status_changed',
]);

const MESSAGE_EVENTS = new Set(['message_created', 'message_updated']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveSafeInteger(value: unknown) {
  const numeric = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : typeof value === 'number' ? value : Number.NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function epochSecondsIso(value: unknown) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? date.toISOString() : null;
}

function normalizedLabels(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const labels: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const label = raw.trim();
    if (!label || label.length > 120) return null;
    labels.push(label);
  }
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

function conversationPayload(eventType: string, payload: Record<string, unknown>) {
  if (CONVERSATION_EVENTS.has(eventType)) return payload;
  if (MESSAGE_EVENTS.has(eventType)) return record(payload.conversation);
  return null;
}

export function parseChatwootUnifiedInboxEvent(
  event: ChatwootWebhookJournalEvent,
): UnifiedInboxEventDecision {
  const eventType = String(event.event_type ?? '').trim().toLowerCase();
  if (!CONVERSATION_EVENTS.has(eventType) && !MESSAGE_EVENTS.has(eventType)) {
    return { kind: 'IGNORE', code: 'UNSUPPORTED_EVENT' };
  }

  const root = record(event.payload);
  if (!root || !UUID_RE.test(String(event.id ?? ''))) {
    return { kind: 'FAIL', code: 'INVALID_EVENT_PAYLOAD' };
  }

  const conversation = conversationPayload(eventType, root);
  if (!conversation) return { kind: 'FAIL', code: 'INVALID_EVENT_PAYLOAD' };

  const additional = record(conversation.additional_attributes);
  const markerId = typeof additional?.smartvisions_conversation_id === 'string'
    ? additional.smartvisions_conversation_id.trim()
    : '';
  const markerVersion = String(additional?.smartvisions_projection_version ?? '');
  if (
    additional?.smartvisions_projection !== true ||
    markerVersion !== '1' ||
    !UUID_RE.test(markerId)
  ) {
    return { kind: 'IGNORE', code: 'UNBOUND_CONVERSATION' };
  }

  const displayId = positiveSafeInteger(conversation.id);
  const status = typeof conversation.status === 'string'
    ? conversation.status.trim().toLowerCase()
    : '';
  const labels = normalizedLabels(conversation.labels);
  const lastActivityAt = epochSecondsIso(conversation.last_activity_at);
  const chatwootUpdatedAt = epochSecondsIso(conversation.updated_at);
  const meta = record(conversation.meta);
  const sender = record(meta?.sender);
  const assignee = record(meta?.assignee);
  const team = record(meta?.team);

  const contactId = sender ? positiveSafeInteger(sender.id) : null;
  const assigneeType = typeof meta?.assignee_type === 'string'
    ? meta.assignee_type.trim().toLowerCase()
    : '';
  const assigneeId = assigneeType === 'user' && assignee
    ? positiveSafeInteger(assignee.id)
    : null;
  const teamId = team ? positiveSafeInteger(team.id) : null;

  if (
    displayId === null ||
    !status ||
    status.length > 40 ||
    !/^[a-z0-9_:-]+$/.test(status) ||
    labels === null ||
    !lastActivityAt ||
    !chatwootUpdatedAt ||
    (sender && contactId === null) ||
    (assigneeType === 'user' && assignee && assigneeId === null) ||
    (team && teamId === null)
  ) {
    return { kind: 'FAIL', code: 'INVALID_EVENT_PAYLOAD' };
  }

  return {
    kind: 'RECONCILE',
    snapshot: {
      eventId: event.id,
      conversationId: markerId,
      chatwootConversationDisplayId: displayId,
      chatwootContactId: contactId,
      chatwootAssigneeUserId: assigneeId,
      chatwootTeamId: teamId,
      chatwootStatus: status,
      labels,
      lastActivityAt,
      chatwootUpdatedAt,
    },
  };
}
