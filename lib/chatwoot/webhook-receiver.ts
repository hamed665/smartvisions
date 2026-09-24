import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { readChatwootVaultSecret } from '@/lib/chatwoot/vault';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import { normalizeChatwootInt32Id } from '@/lib/chatwoot/tenant-bridge-slice-b';

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const DEFAULT_TOLERANCE_SECONDS = 300;

type JournalResult = {
  is_new: boolean;
  event_id: string;
  event_status: 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';
};

export class ChatwootWebhookError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_REQUEST'
      | 'UNAUTHORIZED'
      | 'NOT_READY'
      | 'PERSISTENCE_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ChatwootWebhookError';
  }
}

function genericUnauthorized(): never {
  throw new ChatwootWebhookError(
    'UNAUTHORIZED',
    'Invalid Chatwoot webhook',
  );
}

function safeHexEqual(expectedHex: string, receivedHex: string) {
  if (!/^[0-9a-f]{64}$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

export function verifyChatwootWebhookSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}) {
  if (!input.timestamp || !input.signature || !input.secret) return false;

  if (!/^\d{10,13}$/.test(input.timestamp)) return false;
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
    return false;
  }

  const nowMs = input.nowMs ?? Date.now();
  const toleranceMs =
    (input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS) * 1000;
  if (
    !Number.isFinite(toleranceMs) ||
    toleranceMs < 0 ||
    Math.abs(nowMs - timestampSeconds * 1000) > toleranceMs
  ) {
    return false;
  }

  const [scheme, receivedHex, ...extra] = input.signature.split('=');
  if (scheme !== 'sha256' || !receivedHex || extra.length > 0) return false;

  const expectedHex = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.rawBody}`, 'utf8')
    .digest('hex');

  return safeHexEqual(expectedHex, receivedHex);
}

function payloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChatwootWebhookError(
      'INVALID_REQUEST',
      'Chatwoot webhook payload must be an object',
    );
  }
  return value as Record<string, unknown>;
}

function nestedRecord(
  root: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = root[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function payloadInboxId(root: Record<string, unknown>) {
  const direct = normalizeChatwootInt32Id(root.inbox_id);
  if (direct !== null) return direct;

  const inbox = nestedRecord(root, 'inbox');
  const inboxId = normalizeChatwootInt32Id(inbox?.id);
  if (inboxId !== null) return inboxId;

  const conversation = nestedRecord(root, 'conversation');
  const conversationInboxId = normalizeChatwootInt32Id(
    conversation?.inbox_id,
  );
  return conversationInboxId;
}

function eventType(root: Record<string, unknown>) {
  const event =
    typeof root.event === 'string' ? root.event.trim().toLowerCase() : '';
  if (
    event.length < 1 ||
    event.length > 120 ||
    !/^[a-z0-9_:-]+$/.test(event)
  ) {
    throw new ChatwootWebhookError(
      'INVALID_REQUEST',
      'Chatwoot webhook event type is invalid',
    );
  }
  return event;
}

function normalizeJournalRow(value: unknown): JournalResult {
  const single =
    Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!single || typeof single !== 'object' || Array.isArray(single)) {
    throw new ChatwootWebhookError(
      'PERSISTENCE_FAILED',
      'Chatwoot webhook journal response is invalid',
    );
  }

  const row = single as Record<string, unknown>;
  if (
    typeof row.is_new !== 'boolean' ||
    typeof row.event_id !== 'string' ||
    !isUuid(row.event_id) ||
    !['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'].includes(
      String(row.event_status),
    )
  ) {
    throw new ChatwootWebhookError(
      'PERSISTENCE_FAILED',
      'Chatwoot webhook journal response is invalid',
    );
  }

  return row as unknown as JournalResult;
}

export async function persistSignedChatwootWebhook(input: {
  mappingId: string;
  rawBody: string;
  deliveryId: string | null;
  timestamp: string | null;
  signature: string | null;
  nowMs?: number;
}) {
  if (!isUuid(input.mappingId) || !input.deliveryId || !isUuid(input.deliveryId)) {
    return genericUnauthorized();
  }

  const bodyBytes = Buffer.byteLength(input.rawBody, 'utf8');
  if (bodyBytes < 2 || bodyBytes > MAX_WEBHOOK_BYTES) {
    throw new ChatwootWebhookError(
      'INVALID_REQUEST',
      'Chatwoot webhook body size is invalid',
    );
  }

  const service = createSupabaseServiceClient();
  const mapping = await service
    .from('chatwoot_inbox_mappings')
    .select(
      'id,organization_id,tenant_business_id,chatwoot_inbox_id,' +
        'webhook_secret_ref,status,channel_type',
    )
    .eq('id', input.mappingId)
    .in('status', ['ACTIVE', 'DEGRADED'])
    .single();

  if (
    mapping.error ||
    !mapping.data ||
    mapping.data.id !== input.mappingId ||
    mapping.data.channel_type !== 'Channel::Api' ||
    typeof mapping.data.webhook_secret_ref !== 'string'
  ) {
    return genericUnauthorized();
  }

  const canonicalInboxId = normalizeChatwootInt32Id(
    mapping.data.chatwoot_inbox_id,
  );
  if (canonicalInboxId === null) return genericUnauthorized();

  let secret: string;
  try {
    secret = await readChatwootVaultSecret(mapping.data.webhook_secret_ref);
  } catch {
    throw new ChatwootWebhookError(
      'NOT_READY',
      'Chatwoot webhook verification is temporarily unavailable',
    );
  }

  if (
    !verifyChatwootWebhookSignature({
      rawBody: input.rawBody,
      timestamp: input.timestamp,
      signature: input.signature,
      secret,
      nowMs: input.nowMs,
    })
  ) {
    return genericUnauthorized();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw new ChatwootWebhookError(
      'INVALID_REQUEST',
      'Chatwoot webhook body is not valid JSON',
    );
  }

  const root = payloadRecord(payload);
  const observedInboxId = payloadInboxId(root);
  if (observedInboxId === null || observedInboxId !== canonicalInboxId) {
    return genericUnauthorized();
  }

  const normalizedEventType = eventType(root);
  const rawBodySha256 = createHash('sha256')
    .update(input.rawBody, 'utf8')
    .digest('hex');

  const { data, error } = await service.rpc('record_chatwoot_webhook_event', {
    p_organization_id: mapping.data.organization_id,
    p_tenant_business_id: mapping.data.tenant_business_id,
    p_chatwoot_inbox_mapping_id: input.mappingId,
    p_chatwoot_inbox_id: canonicalInboxId,
    p_delivery_id: input.deliveryId,
    p_event_type: normalizedEventType,
    p_raw_body_sha256: rawBodySha256,
    p_payload: root,
  });

  if (error) {
    throw new ChatwootWebhookError(
      'PERSISTENCE_FAILED',
      'Chatwoot webhook persistence failed',
    );
  }

  const journal = normalizeJournalRow(data);

  return {
    accepted: true as const,
    replayed: !journal.is_new,
    eventId: journal.event_id,
    status: journal.event_status,
    eventType: normalizedEventType,
  };
}
