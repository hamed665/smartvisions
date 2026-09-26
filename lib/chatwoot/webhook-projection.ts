import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import {
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
} from '@/lib/chatwoot/tenant-bridge-slice-b';

const SUPPORTED_EVENTS = new Set([
  'conversation_created',
  'conversation_updated',
  'conversation_status_changed',
  'message_created',
  'message_updated',
]);

type JsonRecord = Record<string, unknown>;

export class ChatwootProjectionError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_EVENT'
      | 'MAPPING_MISSING'
      | 'PERSISTENCE_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ChatwootProjectionError';
  }
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function boundedErrorCode(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9_:.-]+/g, '_')
    .slice(0, 120);
  return normalized || 'PROJECTION_FAILED';
}

function epochSeconds(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const date = new Date(parsed * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function conversationPayload(eventType: string, payload: JsonRecord) {
  if (eventType.startsWith('message_')) {
    return record(payload.conversation);
  }
  if (eventType.startsWith('conversation_')) {
    return payload;
  }
  return null;
}

function conversationContactId(conversation: JsonRecord) {
  const meta = record(conversation.meta);
  const sender = record(meta?.sender);
  return normalizeChatwootInt64Id(sender?.id);
}

function conversationTeamId(conversation: JsonRecord) {
  const meta = record(conversation.meta);
  const team = record(meta?.team);
  return normalizeChatwootInt64Id(team?.id);
}

function normalizeStatus(value: unknown) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ['open', 'resolved', 'pending', 'snoozed'].includes(status)
    ? status
    : null;
}

function normalizePriority(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const priority = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ['low', 'medium', 'high', 'urgent'].includes(priority)
    ? priority
    : null;
}

function normalizeUnread(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeRpcRow(value: unknown, label: string) {
  const row = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new ChatwootProjectionError(
      'PERSISTENCE_FAILED',
      label + ' projection response is invalid',
    );
  }
  return row as JsonRecord;
}

async function finishEvent(input: {
  service: SupabaseClient;
  eventId: string;
  status: 'PROCESSED' | 'IGNORED' | 'FAILED';
  errorCode?: string | null;
}) {
  const update: Record<string, unknown> = {
    status: input.status,
    processed_at:
      input.status === 'PROCESSED' || input.status === 'IGNORED'
        ? new Date().toISOString()
        : null,
    error_code:
      input.status === 'FAILED'
        ? boundedErrorCode(input.errorCode ?? 'PROJECTION_FAILED')
        : null,
  };

  const { error } = await input.service
    .from('chatwoot_webhook_events')
    .update(update)
    .eq('id', input.eventId)
    .in('status', ['RECEIVED', 'FAILED']);

  if (error) {
    throw new ChatwootProjectionError(
      'PERSISTENCE_FAILED',
      'Chatwoot webhook projection status update failed',
    );
  }
}

export async function processChatwootWebhookProjection(input: {
  eventId: string;
  service?: SupabaseClient;
}) {
  if (!isUuid(input.eventId)) {
    throw new ChatwootProjectionError(
      'INVALID_EVENT',
      'Chatwoot webhook event ID is invalid',
    );
  }

  const service = input.service ?? createSupabaseServiceClient();

  const { data: event, error: eventError } = await service
    .from('chatwoot_webhook_events')
    .select(
      'id,organization_id,tenant_business_id,chatwoot_inbox_mapping_id,chatwoot_inbox_id,event_type,payload,status',
    )
    .eq('id', input.eventId)
    .single();

  if (
    eventError ||
    !event ||
    event.id !== input.eventId ||
    !isUuid(event.organization_id) ||
    !isUuid(event.tenant_business_id) ||
    !isUuid(event.chatwoot_inbox_mapping_id) ||
    normalizeChatwootInt32Id(event.chatwoot_inbox_id) === null ||
    !record(event.payload) ||
    typeof event.event_type !== 'string'
  ) {
    throw new ChatwootProjectionError(
      'INVALID_EVENT',
      'Chatwoot webhook journal event is invalid',
    );
  }

  if (event.status === 'PROCESSED' || event.status === 'IGNORED') {
    return {
      eventId: input.eventId,
      status: event.status,
      replayed: true,
    } as const;
  }

  if (event.status !== 'RECEIVED' && event.status !== 'FAILED') {
    throw new ChatwootProjectionError(
      'INVALID_EVENT',
      'Chatwoot webhook journal status is invalid',
    );
  }

  const eventType = event.event_type.trim().toLowerCase();
  if (!SUPPORTED_EVENTS.has(eventType)) {
    await finishEvent({
      service,
      eventId: input.eventId,
      status: 'IGNORED',
    });
    return {
      eventId: input.eventId,
      status: 'IGNORED',
      replayed: false,
    } as const;
  }

  try {
    const payload = record(event.payload)!;
    const conversation = conversationPayload(eventType, payload);
    if (!conversation) {
      throw new ChatwootProjectionError(
        'INVALID_EVENT',
        'Chatwoot webhook conversation payload is missing',
      );
    }

    const conversationId = normalizeChatwootInt32Id(conversation.id);
    const contactId = conversationContactId(conversation);
    const status = normalizeStatus(conversation.status);
    const unreadCount = normalizeUnread(conversation.unread_count);
    const priority = normalizePriority(conversation.priority);
    const canReply =
      typeof conversation.can_reply === 'boolean'
        ? conversation.can_reply
        : null;
    const lastActivityAt =
      epochSeconds(conversation.last_activity_at) ??
      epochSeconds(conversation.timestamp);

    if (
      conversationId === null ||
      contactId === null ||
      status === null ||
      unreadCount === null ||
      canReply === null
    ) {
      throw new ChatwootProjectionError(
        'INVALID_EVENT',
        'Chatwoot webhook conversation identity/state is incomplete',
      );
    }

    const { data: inboxMapping, error: inboxError } = await service
      .from('chatwoot_inbox_mappings')
      .select(
        'id,organization_id,tenant_business_id,chatwoot_account_mapping_id,chatwoot_inbox_id,status',
      )
      .eq('organization_id', event.organization_id)
      .eq('id', event.chatwoot_inbox_mapping_id)
      .in('status', ['ACTIVE', 'DEGRADED'])
      .single();

    if (
      inboxError ||
      !inboxMapping ||
      inboxMapping.organization_id !== event.organization_id ||
      inboxMapping.tenant_business_id !== event.tenant_business_id ||
      normalizeChatwootInt32Id(inboxMapping.chatwoot_inbox_id) !==
        normalizeChatwootInt32Id(event.chatwoot_inbox_id) ||
      !isUuid(inboxMapping.chatwoot_account_mapping_id)
    ) {
      throw new ChatwootProjectionError(
        'MAPPING_MISSING',
        'Live Chatwoot Inbox mapping is unavailable for projection',
      );
    }

    let teamMappingId: string | null = null;
    const externalTeamId = conversationTeamId(conversation);
    if (externalTeamId !== null) {
      const { data: teamMapping, error: teamError } = await service
        .from('chatwoot_team_mappings')
        .select(
          'id,organization_id,tenant_business_id,chatwoot_account_mapping_id,chatwoot_team_id,status',
        )
        .eq('organization_id', event.organization_id)
        .eq('tenant_business_id', event.tenant_business_id)
        .eq('chatwoot_account_mapping_id', inboxMapping.chatwoot_account_mapping_id)
        .eq('chatwoot_team_id', externalTeamId)
        .in('status', ['ACTIVE', 'DEGRADED'])
        .single();

      if (
        teamError ||
        !teamMapping ||
        !isUuid(teamMapping.id) ||
        teamMapping.organization_id !== event.organization_id ||
        teamMapping.tenant_business_id !== event.tenant_business_id
      ) {
        throw new ChatwootProjectionError(
          'MAPPING_MISSING',
          'Chatwoot Team mapping is unavailable for projected conversation',
        );
      }
      teamMappingId = teamMapping.id;
    }

    const { data: contactData, error: contactError } = await service.rpc(
      'upsert_chatwoot_contact_projection',
      {
        p_organization_id: event.organization_id,
        p_tenant_business_id: event.tenant_business_id,
        p_chatwoot_account_mapping_id: inboxMapping.chatwoot_account_mapping_id,
        p_chatwoot_contact_id: contactId,
        p_source_event_id: input.eventId,
      },
    );

    if (contactError) {
      throw new ChatwootProjectionError(
        'PERSISTENCE_FAILED',
        'Chatwoot Contact projection could not be persisted',
      );
    }

    const contact = normalizeRpcRow(contactData, 'Chatwoot Contact');
    if (!isUuid(String(contact.id ?? ''))) {
      throw new ChatwootProjectionError(
        'PERSISTENCE_FAILED',
        'Chatwoot Contact projection ID is invalid',
      );
    }

    const { data: conversationData, error: conversationError } =
      await service.rpc('upsert_chatwoot_conversation_projection', {
        p_organization_id: event.organization_id,
        p_tenant_business_id: event.tenant_business_id,
        p_chatwoot_account_mapping_id: inboxMapping.chatwoot_account_mapping_id,
        p_chatwoot_inbox_mapping_id: event.chatwoot_inbox_mapping_id,
        p_chatwoot_contact_mapping_id: contact.id,
        p_chatwoot_team_mapping_id: teamMappingId,
        p_chatwoot_conversation_display_id: conversationId,
        p_status: status,
        p_priority: priority,
        p_unread_count: unreadCount,
        p_can_reply: canReply,
        p_last_activity_at: lastActivityAt,
        p_source_event_id: input.eventId,
      });

    if (conversationError) {
      throw new ChatwootProjectionError(
        'PERSISTENCE_FAILED',
        'Chatwoot Conversation projection could not be persisted',
      );
    }

    const projection = normalizeRpcRow(
      conversationData,
      'Chatwoot Conversation',
    );
    if (!isUuid(String(projection.id ?? ''))) {
      throw new ChatwootProjectionError(
        'PERSISTENCE_FAILED',
        'Chatwoot Conversation projection ID is invalid',
      );
    }

    await finishEvent({
      service,
      eventId: input.eventId,
      status: 'PROCESSED',
    });

    return {
      eventId: input.eventId,
      status: 'PROCESSED',
      contactMappingId: String(contact.id),
      conversationMappingId: String(projection.id),
      replayed: false,
    } as const;
  } catch (error) {
    const code =
      error instanceof ChatwootProjectionError
        ? error.code
        : 'PERSISTENCE_FAILED';

    await finishEvent({
      service,
      eventId: input.eventId,
      status: 'FAILED',
      errorCode: code,
    });

    throw error instanceof ChatwootProjectionError
      ? error
      : new ChatwootProjectionError(
          'PERSISTENCE_FAILED',
          'Chatwoot webhook projection failed',
        );
  }
}
