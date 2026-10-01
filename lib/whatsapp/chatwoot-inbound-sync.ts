import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createChatwootPublicIncomingMessage,
  ensureChatwootPublicConversationProjection,
} from '@/lib/chatwoot/public-conversation-projection';
import { downloadMetaWhatsAppMediaForChatwoot } from '@/lib/whatsapp/media';
import { resolveMetaWhatsAppProvider, type MetaWhatsAppRoute } from '@/lib/whatsapp/tenant-routing';
import type { NormalizedWhatsAppInbound } from '@/lib/whatsapp/webhook';

type LinkedWhatsAppInbound = {
  linked: true;
  leadId: string;
  businessId: string;
  identityId: string | null;
  conversationId: string;
  messageId: string;
};

type ClaimRow = {
  event_id: string;
  claimed: boolean;
  sync_status: 'PENDING' | 'PROCESSING' | 'ACCEPTED' | 'RECONCILIATION_REQUIRED';
  chatwoot_message_id: number | null;
  lead_id: string;
  conversation_id: string;
};

function one<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === 'object' && !Array.isArray(row) ? row as T : null;
}

function requestId(providerMessageId: string) {
  const digest = createHash('sha256').update(providerMessageId).digest('hex').slice(0, 48);
  return `whatsapp:${digest}`;
}

async function activeInboxMapping(input: {
  service: SupabaseClient;
  organizationId: string;
  route: MetaWhatsAppRoute;
}) {
  const { data, error } = await input.service
    .from('chatwoot_inbox_mappings')
    .select('id,status,communication_channel_binding_id')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.route.tenantBusinessId)
    .eq('communication_channel_binding_id', input.route.bindingId)
    .in('status', ['ACTIVE', 'DEGRADED'])
    .maybeSingle();
  if (error) throw new Error(`WhatsApp Chatwoot mapping lookup failed: ${error.message}`);
  return data ?? null;
}

async function claim(input: {
  service: SupabaseClient;
  organizationId: string;
  providerMessageId: string;
}) {
  const { data, error } = await input.service.rpc('claim_whatsapp_chatwoot_sync', {
    p_organization_id: input.organizationId,
    p_provider_message_id: input.providerMessageId,
  });
  if (error) throw new Error(`WhatsApp Chatwoot sync claim failed: ${error.message}`);
  const row = one<ClaimRow>(data);
  if (!row?.event_id || typeof row.claimed !== 'boolean' || !row.sync_status) {
    throw new Error('WhatsApp Chatwoot sync claim returned an invalid result');
  }
  return row;
}

async function finalize(input: {
  service: SupabaseClient;
  eventId: string;
  status: 'ACCEPTED' | 'RECONCILIATION_REQUIRED';
  chatwootMessageId?: number | null;
}) {
  const { data, error } = await input.service.rpc('finalize_whatsapp_chatwoot_sync', {
    p_event_id: input.eventId,
    p_status: input.status,
    p_chatwoot_message_id: input.chatwootMessageId ?? null,
  });
  if (error) throw new Error(`WhatsApp Chatwoot sync finalization failed: ${error.message}`);
  const row = one<{ sync_status?: string; chatwoot_message_id?: number | null }>(data);
  if (!row?.sync_status) throw new Error('WhatsApp Chatwoot sync finalization returned an invalid result');
  return row;
}

export async function syncWhatsAppInboundToChatwoot(input: {
  service: SupabaseClient;
  organizationId: string;
  route: MetaWhatsAppRoute;
  event: NormalizedWhatsAppInbound;
  linked: LinkedWhatsAppInbound;
  fetchImpl?: typeof fetch;
}) {
  const mapping = await activeInboxMapping({
    service: input.service,
    organizationId: input.organizationId,
    route: input.route,
  });
  if (!mapping) return { outcome: 'CHATWOOT_NOT_READY' as const };

  if (!input.linked.identityId) {
    return { outcome: 'CANONICAL_IDENTITY_NOT_READY' as const };
  }

  let attachments: Awaited<ReturnType<typeof downloadMetaWhatsAppMediaForChatwoot>>[] = [];
  if (input.event.mediaId) {
    const tenantProvider = await resolveMetaWhatsAppProvider({
      service: input.service,
      organizationId: input.organizationId,
      tenantBusinessId: input.route.tenantBusinessId,
      branchId: input.route.branchId,
    });
    if (tenantProvider.bindingId !== input.route.bindingId) {
      throw new Error('WhatsApp media credential no longer matches the webhook binding');
    }
    attachments = [await downloadMetaWhatsAppMediaForChatwoot({
      mediaId: input.event.mediaId,
      accessToken: tenantProvider.accessToken,
      expectedMimeType: input.event.mimeType ?? null,
      filename: input.event.filename ?? null,
      fetchImpl: input.fetchImpl,
    })];
  }

  const claimed = await claim({
    service: input.service,
    organizationId: input.organizationId,
    providerMessageId: input.event.providerMessageId,
  });
  if (!claimed.claimed) {
    if (claimed.sync_status === 'ACCEPTED') {
      return {
        outcome: 'REPLAY' as const,
        chatwootMessageId: claimed.chatwoot_message_id,
      };
    }
    return { outcome: 'RECONCILIATION_REQUIRED' as const };
  }

  try {
    const external = await ensureChatwootPublicConversationProjection({
      service: input.service,
      organizationId: input.organizationId,
      tenantBusinessId: input.route.tenantBusinessId,
      bindingId: input.route.bindingId,
      canonicalIdentityId: input.linked.identityId,
      canonicalConversationId: input.linked.conversationId,
      contactDisplayName: input.event.contactName?.trim().slice(0, 120) || 'WhatsApp customer',
      fetchImpl: input.fetchImpl,
    });

    const displayId = Number(external.conversation.id);
    if (!Number.isSafeInteger(displayId) || displayId <= 0) {
      throw new Error('Chatwoot conversation identity is invalid');
    }

    const content = input.event.text?.trim()
      || input.event.caption?.trim()
      || (attachments.length === 0 ? `[WhatsApp ${input.event.type} message]` : null);

    const accepted = await createChatwootPublicIncomingMessage({
      service: input.service,
      organizationId: input.organizationId,
      tenantBusinessId: input.route.tenantBusinessId,
      bindingId: input.route.bindingId,
      canonicalIdentityId: input.linked.identityId,
      conversationDisplayId: displayId,
      requestId: requestId(input.event.providerMessageId),
      content,
      attachments,
      fetchImpl: input.fetchImpl,
    });

    await finalize({
      service: input.service,
      eventId: claimed.event_id,
      status: 'ACCEPTED',
      chatwootMessageId: accepted.chatwootMessageId,
    });

    return {
      outcome: 'SYNCED' as const,
      chatwootMessageId: accepted.chatwootMessageId,
      conversationDisplayId: displayId,
    };
  } catch (error) {
    try {
      await finalize({
        service: input.service,
        eventId: claimed.event_id,
        status: 'RECONCILIATION_REQUIRED',
      });
    } catch {
      // PROCESSING remains fail-closed. Never repeat an ambiguous Chatwoot mutation.
    }
    throw error;
  }
}

function inboundFromPayload(value: unknown): NormalizedWhatsAppInbound | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const destination = row.destination && typeof row.destination === 'object' && !Array.isArray(row.destination)
    ? row.destination as Record<string, unknown>
    : {};
  if (
    typeof row.providerMessageId !== 'string'
    || typeof row.from !== 'string'
    || typeof row.type !== 'string'
    || typeof destination.phoneNumberId !== 'string'
  ) return null;
  return {
    providerMessageId: row.providerMessageId,
    from: row.from,
    type: row.type,
    destination: {
      phoneNumberId: destination.phoneNumberId,
      displayPhoneNumber: typeof destination.displayPhoneNumber === 'string' ? destination.displayPhoneNumber : undefined,
      wabaId: typeof destination.wabaId === 'string' ? destination.wabaId : undefined,
    },
    timestamp: typeof row.timestamp === 'string' ? row.timestamp : undefined,
    text: typeof row.text === 'string' ? row.text : undefined,
    contactName: typeof row.contactName === 'string' ? row.contactName : undefined,
    mediaId: typeof row.mediaId === 'string' ? row.mediaId : undefined,
    mimeType: typeof row.mimeType === 'string' ? row.mimeType : undefined,
    filename: typeof row.filename === 'string' ? row.filename : undefined,
    caption: typeof row.caption === 'string' ? row.caption : undefined,
    voice: typeof row.voice === 'boolean' ? row.voice : undefined,
  };
}

export async function processPendingWhatsAppChatwootSync(input: {
  service: SupabaseClient;
  organizationId: string;
  bindingId: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}) {
  const limit = Math.min(25, Math.max(1, Math.trunc(input.limit ?? 10)));
  const pending = await input.service
    .from('whatsapp_events')
    .select('provider_message_id,payload,lead_id,conversation_id')
    .eq('organization_id', input.organizationId)
    .eq('direction', 'INBOUND')
    .eq('chatwoot_sync_status', 'PENDING')
    .contains('payload', { routing: { bindingId: input.bindingId } })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (pending.error) throw new Error(`Pending WhatsApp Chatwoot sync lookup failed: ${pending.error.message}`);

  const summary = { discovered: pending.data?.length ?? 0, synced: 0, pending: 0, reconciliationRequired: 0 };
  for (const row of pending.data ?? []) {
    const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : null;
    const event = inboundFromPayload(payload);
    const routing = payload?.routing && typeof payload.routing === 'object' && !Array.isArray(payload.routing)
      ? payload.routing as Record<string, unknown>
      : null;
    const canonical = payload?.canonical && typeof payload.canonical === 'object' && !Array.isArray(payload.canonical)
      ? payload.canonical as Record<string, unknown>
      : null;
    if (
      !event
      || typeof routing?.tenantBusinessId !== 'string'
      || typeof routing?.bindingId !== 'string'
      || routing.bindingId !== input.bindingId
      || typeof row.lead_id !== 'string'
      || typeof row.conversation_id !== 'string'
      || typeof canonical?.businessId !== 'string'
    ) {
      summary.reconciliationRequired += 1;
      continue;
    }
    const route: MetaWhatsAppRoute = {
      organizationId: input.organizationId,
      tenantBusinessId: routing.tenantBusinessId,
      branchId: typeof routing.branchId === 'string' ? routing.branchId : null,
      bindingId: routing.bindingId,
      integrationConnectionId: typeof routing.integrationConnectionId === 'string' ? routing.integrationConnectionId : '',
      phoneNumberId: typeof routing.phoneNumberId === 'string' ? routing.phoneNumberId : event.destination.phoneNumberId!,
      wabaId: typeof routing.wabaId === 'string' ? routing.wabaId : null,
    };
    try {
      const result = await syncWhatsAppInboundToChatwoot({
        service: input.service,
        organizationId: input.organizationId,
        route,
        event,
        linked: {
          linked: true,
          leadId: row.lead_id,
          businessId: canonical.businessId,
          identityId: typeof canonical.identityId === 'string' ? canonical.identityId : null,
          conversationId: row.conversation_id,
          messageId: typeof canonical.messageId === 'string' ? canonical.messageId : '',
        },
        fetchImpl: input.fetchImpl,
      });
      if (result.outcome === 'SYNCED' || result.outcome === 'REPLAY') summary.synced += 1;
      else if (result.outcome === 'RECONCILIATION_REQUIRED') summary.reconciliationRequired += 1;
      else summary.pending += 1;
    } catch {
      summary.reconciliationRequired += 1;
    }
  }
  return summary;
}
