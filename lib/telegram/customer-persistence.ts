import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { createChatwootPublicIncomingMessage } from '@/lib/chatwoot/public-conversation-projection';
import type { NormalizedTelegramCustomerEvent } from './customer-webhook';
import type { TelegramCustomerWebhookContext } from './customer-routing';
import { TelegramCustomerProvider } from './customer-provider';
import {
  downloadTelegramInboundMedia,
  ensureTelegramChatwootConversation,
  projectMatchedTelegramInbound,
  resolveTelegramInboundBusiness,
} from './customer-lifecycle';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Telegram customer persistence');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type EventRow = {
  id: string;
  update_id: number | string;
  event_type: string;
  provider_message_id: string | null;
  provider_chat_id: string;
  provider_user_id: string | null;
  identity_resolution_status: string;
  chatwoot_sync_status: string;
  chatwoot_message_id: number | null;
};

function sameReplay(row: EventRow, event: NormalizedTelegramCustomerEvent) {
  return Number(row.update_id) === event.updateId
    && row.event_type === event.eventType
    && row.provider_message_id === event.providerMessageId
    && row.provider_chat_id === event.chatId
    && row.provider_user_id === event.senderId;
}

async function loadOrInsertEvent(input: {
  service: ReturnType<typeof serviceClient>;
  context: TelegramCustomerWebhookContext;
  event: NormalizedTelegramCustomerEvent;
}) {
  const row = {
    organization_id: input.context.organizationId,
    tenant_business_id: input.context.tenantBusinessId,
    branch_id: input.context.branchId,
    communication_channel_binding_id: input.context.bindingId,
    update_id: input.event.updateId,
    event_type: input.event.eventType,
    provider_message_id: input.event.providerMessageId,
    provider_chat_id: input.event.chatId,
    provider_user_id: input.event.senderId,
    payload: {
      chatType: input.event.chatType,
      senderIsBot: input.event.senderIsBot,
      text: input.event.text,
      callbackQueryId: input.event.callbackQueryId,
      callbackData: input.event.callbackData,
      media: input.event.media,
    },
    occurred_at: input.event.occurredAt,
  };

  const inserted = await input.service
    .from('telegram_customer_events')
    .insert(row)
    .select('id,update_id,event_type,provider_message_id,provider_chat_id,provider_user_id,identity_resolution_status,chatwoot_sync_status,chatwoot_message_id')
    .maybeSingle();

  if (!inserted.error && inserted.data) return { row: inserted.data as EventRow, inserted: true as const };
  if (inserted.error?.code !== '23505') {
    throw new Error(`Telegram customer event persistence failed: ${inserted.error?.message ?? 'unknown error'}`);
  }

  const existing = await input.service
    .from('telegram_customer_events')
    .select('id,update_id,event_type,provider_message_id,provider_chat_id,provider_user_id,identity_resolution_status,chatwoot_sync_status,chatwoot_message_id')
    .eq('communication_channel_binding_id', input.context.bindingId)
    .eq('update_id', input.event.updateId)
    .maybeSingle();
  if (existing.error || !existing.data) throw new Error('Telegram customer event replay lookup failed');
  if (!sameReplay(existing.data as EventRow, input.event)) {
    throw new Error('Telegram customer update replay mismatch');
  }
  return { row: existing.data as EventRow, inserted: false as const };
}

async function markNonApplicable(
  service: ReturnType<typeof serviceClient>,
  eventId: string,
  reason: string,
) {
  const result = await service.from('telegram_customer_events').update({
    identity_resolution_status: 'NOT_APPLICABLE',
    chatwoot_sync_status: 'NOT_APPLICABLE',
    processing_error_code: reason,
    processed_at: new Date().toISOString(),
  }).eq('id', eventId).in('chatwoot_sync_status', ['PENDING', 'IDENTITY_UNRESOLVED']);
  if (result.error) throw new Error(`Telegram event disposition failed: ${result.error.message}`);
}

async function markIdentityUnresolved(service: ReturnType<typeof serviceClient>, eventId: string) {
  const result = await service.from('telegram_customer_events').update({
    identity_resolution_status: 'UNRESOLVED',
    chatwoot_sync_status: 'IDENTITY_UNRESOLVED',
    processing_error_code: 'CANONICAL_IDENTITY_UNRESOLVED',
  }).eq('id', eventId).in('chatwoot_sync_status', ['PENDING', 'IDENTITY_UNRESOLVED']);
  if (result.error) throw new Error(`Telegram identity disposition failed: ${result.error.message}`);
}

async function markIdentityMatched(service: ReturnType<typeof serviceClient>, eventId: string) {
  const result = await service.from('telegram_customer_events').update({
    identity_resolution_status: 'MATCHED',
    processing_error_code: null,
  }).eq('id', eventId);
  if (result.error) throw new Error(`Telegram identity match persistence failed: ${result.error.message}`);
}

async function claim(service: ReturnType<typeof serviceClient>, eventId: string) {
  const { data, error } = await service.rpc('claim_telegram_customer_chatwoot_sync', { p_event_id: eventId });
  if (error) throw new Error(`Telegram Chatwoot sync claim failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    claimed: row?.claimed === true,
    status: String(row?.current_status ?? 'UNKNOWN'),
  };
}

async function markAccepted(service: ReturnType<typeof serviceClient>, eventId: string, chatwootMessageId: number) {
  const { error } = await service.rpc('accept_telegram_customer_chatwoot_sync', {
    p_event_id: eventId,
    p_chatwoot_message_id: chatwootMessageId,
  });
  if (error) throw new Error(`Telegram Chatwoot acceptance persistence failed: ${error.message}`);
}

async function markReconciliationRequired(service: ReturnType<typeof serviceClient>, eventId: string, code: string) {
  const { error } = await service.rpc('require_telegram_customer_reconciliation', {
    p_event_id: eventId,
    p_error_code: code,
  });
  if (error) {
    console.error('Telegram reconciliation state persistence failed', error.message);
  }
}

export async function persistTelegramCustomerEvent(input: {
  context: TelegramCustomerWebhookContext;
  event: NormalizedTelegramCustomerEvent;
  fetchImpl?: typeof fetch;
}) {
  const service = serviceClient();
  const persisted = await loadOrInsertEvent({ service, context: input.context, event: input.event });
  const eventId = persisted.row.id;

  if (
    input.event.eventType !== 'MESSAGE'
    || input.event.chatType !== 'private'
    || input.event.senderIsBot
    || !input.event.senderId
    || !input.event.providerMessageId
  ) {
    await markNonApplicable(service, eventId, 'NOT_PRIVATE_CUSTOMER_MESSAGE');
    return { accepted: true, projected: false, disposition: 'NOT_APPLICABLE', eventId };
  }

  const identity = await resolveTelegramInboundBusiness({
    service,
    context: input.context,
    event: input.event,
  });
  if (identity.status !== 'MATCH') {
    await markIdentityUnresolved(service, eventId);
    return { accepted: true, projected: false, disposition: 'IDENTITY_UNRESOLVED', eventId };
  }
  await markIdentityMatched(service, eventId);

  const provider = new TelegramCustomerProvider({
    token: input.context.botToken,
    fetchImpl: input.fetchImpl,
  });
  const [external, attachments] = await Promise.all([
    ensureTelegramChatwootConversation({
      service,
      context: input.context,
      identity,
    }),
    downloadTelegramInboundMedia({
      provider,
      media: input.event.media,
    }),
  ]);

  const syncClaim = await claim(service, eventId);
  if (!syncClaim.claimed) {
    if (syncClaim.status === 'ACCEPTED') {
      const projection = await projectMatchedTelegramInbound({
        service,
        context: input.context,
        eventId,
        event: input.event,
        identity,
        external,
      });
      return { accepted: true, projected: projection.projected, disposition: 'REPLAY_CANONICAL_RECONCILED', eventId };
    }
    return {
      accepted: true,
      projected: false,
      disposition: syncClaim.status,
      eventId,
    };
  }

  let chatwootMessageId: number;
  try {
    const chatwoot = await createChatwootPublicIncomingMessage({
      service,
      organizationId: input.context.organizationId,
      tenantBusinessId: input.context.tenantBusinessId,
      bindingId: input.context.bindingId,
      canonicalIdentityId: identity.identityId,
      conversationDisplayId: Number(external.conversation.id),
      requestId: `telegram:${input.context.bindingId}:${input.event.updateId}`.slice(0, 160),
      content: input.event.text,
      attachments,
      fetchImpl: input.fetchImpl,
    });
    chatwootMessageId = chatwoot.chatwootMessageId;
  } catch {
    await markReconciliationRequired(service, eventId, 'CHATWOOT_SIDE_EFFECT_AMBIGUOUS');
    return {
      accepted: true,
      projected: false,
      disposition: 'RECONCILIATION_REQUIRED',
      eventId,
    };
  }

  await markAccepted(service, eventId, chatwootMessageId);

  const projection = await projectMatchedTelegramInbound({
    service,
    context: input.context,
    eventId,
    event: input.event,
    identity,
    external,
  });
  return {
    accepted: true,
    projected: projection.projected,
    disposition: 'ACCEPTED',
    eventId,
    chatwootMessageId,
  };
}
