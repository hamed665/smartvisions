import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { downloadChatwootMessageAttachmentForProvider } from '@/lib/chatwoot/conversation-actions';

import {
  assertCanonicalSendAllowed,
  normalizeCanonicalPhone,
} from '@/lib/outreach/canonical-send-gate';
import {
  assertPaidOperationAllowed,
  getCostGuardState,
  recordUsage,
} from '@/lib/reliability/cost-guard';
import { ProviderHttpError } from '@/lib/omnichannel/rate-limit-evidence';
import { resolveMetaWhatsAppProvider } from '@/lib/whatsapp/tenant-routing';
import { replayPersistedWhatsAppStatuses } from '@/lib/whatsapp/lifecycle';
import type { ChatwootWebhookJournalEvent } from '@/lib/chatwoot/unified-inbox-event';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function finalizeFailed(
  service: SupabaseClient,
  eventId: string,
  code: string,
) {
  const result = await service.rpc('finalize_chatwoot_webhook_event', {
    p_event_id: eventId,
    p_status: 'FAILED',
    p_error_code: code,
  });
  if (result.error) throw new Error('Chatwoot human outbound failure evidence could not be finalized');
}

async function completeProcessed(
  service: SupabaseClient,
  eventId: string,
  messageId: string,
) {
  const result = await service.rpc('complete_whatsapp_chatwoot_outbound_event', {
    p_event_id: eventId,
    p_message_id: messageId,
  });
  if (result.error) throw new Error('Chatwoot human outbound completion evidence could not be finalized');
}

async function resolveHumanSender(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  chatwootAccountMappingId: string;
  chatwootUserId: number;
}) {
  const mappings = await input.service
    .from('chatwoot_user_mappings')
    .select('id,smart_user_id,chatwoot_user_id,status')
    .eq('chatwoot_user_id', input.chatwootUserId)
    .eq('status', 'ACTIVE')
    .limit(2);
  if (mappings.error || !Array.isArray(mappings.data) || mappings.data.length !== 1) {
    throw new Error('Chatwoot human sender is not mapped to exactly one ACTIVE Smart user');
  }
  const mapping = mappings.data[0];

  const membership = await input.service
    .from('chatwoot_account_memberships')
    .select('smart_user_id,chatwoot_user_mapping_id,chatwoot_account_mapping_id,effective_smart_role,status')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('smart_user_id', mapping.smart_user_id)
    .eq('chatwoot_user_mapping_id', mapping.id)
    .eq('chatwoot_account_mapping_id', input.chatwootAccountMappingId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (membership.error || !membership.data) {
    throw new Error('Chatwoot human sender has no ACTIVE tenant Account membership');
  }

  const member = await input.service
    .from('organization_members')
    .select('role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', mapping.smart_user_id)
    .maybeSingle();
  if (
    member.error
    || !member.data
    || !['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'].includes(String(member.data.role))
    || member.data.role !== membership.data.effective_smart_role
  ) {
    throw new Error('Chatwoot human sender no longer matches canonical Smart Core authority');
  }

  return {
    smartUserId: String(mapping.smart_user_id),
    role: String(member.data.role),
  };
}

async function claimCanonicalMessage(input: {
  service: SupabaseClient;
  event: ChatwootWebhookJournalEvent;
  conversationId: string;
  leadId: string;
  chatwootMessageId: number;
  chatwootSenderId: number;
  smartUserId: string;
  smartRole: string;
  content: string;
  mediaType: 'TEXT' | 'AUDIO' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  attachmentId?: number | null;
  attachmentContentType?: string | null;
}) {
  const sourceMessageId = String(input.chatwootMessageId);
  const existing = await input.service
    .from('conversation_messages')
    .select('id,conversation_id,status,provider_message_id,original_text,provenance,source_plane,source_message_id')
    .eq('organization_id', (input.event as ChatwootWebhookJournalEvent & { organization_id?: string }).organization_id)
    .eq('channel', 'WHATSAPP')
    .eq('source_plane', 'CHATWOOT')
    .eq('source_message_id', sourceMessageId)
    .maybeSingle();

  if (existing.error) throw new Error(`WhatsApp human message replay lookup failed: ${existing.error.message}`);
  if (existing.data) {
    if (
      existing.data.conversation_id !== input.conversationId
      || existing.data.original_text !== input.content
      || existing.data.provenance !== 'HUMAN_SMARTVISIONS'
    ) {
      throw new Error('Chatwoot human message replay does not match canonical evidence');
    }
    return { row: existing.data, claimed: false as const };
  }

  const organizationId = (input.event as ChatwootWebhookJournalEvent & { organization_id?: string }).organization_id;
  if (!organizationId) throw new Error('Chatwoot journal event is missing Organization scope');

  const created = await input.service
    .from('conversation_messages')
    .insert({
      organization_id: organizationId,
      conversation_id: input.conversationId,
      lead_id: input.leadId,
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      media_type: input.mediaType,
      original_text: input.content,
      requires_approval: false,
      status: 'PROCESSING',
      provenance: 'HUMAN_SMARTVISIONS',
      source_plane: 'CHATWOOT',
      source_message_id: sourceMessageId,
      processed_at: new Date().toISOString(),
      metadata: {
        source: 'CHATWOOT_SIGNED_WEBHOOK',
        chatwoot_event_id: input.event.id,
        chatwoot_message_id: input.chatwootMessageId,
        chatwoot_sender_id: input.chatwootSenderId,
        smart_user_id: input.smartUserId,
        smart_role: input.smartRole,
        attachment_id: input.attachmentId ?? null,
        attachment_content_type: input.attachmentContentType ?? null,
      },
    })
    .select('id,conversation_id,status,provider_message_id,original_text,provenance,source_plane,source_message_id')
    .single();

  if (!created.error && created.data) {
    return { row: created.data, claimed: true as const };
  }

  if (created.error?.code !== '23505') {
    throw new Error(`WhatsApp human message claim failed: ${created.error?.message ?? 'no row returned'}`);
  }

  const raced = await input.service
    .from('conversation_messages')
    .select('id,conversation_id,status,provider_message_id,original_text,provenance,source_plane,source_message_id')
    .eq('organization_id', organizationId)
    .eq('channel', 'WHATSAPP')
    .eq('source_plane', 'CHATWOOT')
    .eq('source_message_id', sourceMessageId)
    .maybeSingle();
  if (
    raced.error
    || !raced.data
    || raced.data.conversation_id !== input.conversationId
    || raced.data.original_text !== input.content
    || raced.data.provenance !== 'HUMAN_SMARTVISIONS'
  ) {
    throw new Error('Concurrent Chatwoot human message claim could not be reconciled safely');
  }

  return { row: raced.data, claimed: false as const };
}

export async function reconcileWhatsAppChatwootHumanOutboundEvent(
  service: SupabaseClient,
  event: ChatwootWebhookJournalEvent & {
    organization_id?: string;
    tenant_business_id?: string;
    chatwoot_inbox_mapping_id?: string;
  },
) {
  if (String(event.event_type ?? '').trim().toLowerCase() !== 'message_created') {
    return { handled: false as const, outcome: 'NOT_MESSAGE_CREATED' as const };
  }

  const organizationId = String(event.organization_id ?? '');
  const tenantBusinessId = String(event.tenant_business_id ?? '');
  const inboxMappingId = String(event.chatwoot_inbox_mapping_id ?? '');
  if (!organizationId || !tenantBusinessId || !inboxMappingId) {
    return { handled: false as const, outcome: 'MISSING_JOURNAL_SCOPE' as const };
  }

  const inbox = await service
    .from('chatwoot_inbox_mappings')
    .select('id,chatwoot_account_mapping_id,communication_channel_binding_id,status')
    .eq('organization_id', organizationId)
    .eq('tenant_business_id', tenantBusinessId)
    .eq('id', inboxMappingId)
    .in('status', ['ACTIVE','DEGRADED'])
    .maybeSingle();
  if (inbox.error || !inbox.data) {
    return { handled: false as const, outcome: 'NOT_ACTIVE_CHATWOOT_INBOX' as const };
  }

  const binding = await service
    .from('communication_channel_bindings')
    .select('id,channel,branch_id,status')
    .eq('organization_id', organizationId)
    .eq('tenant_business_id', tenantBusinessId)
    .eq('id', inbox.data.communication_channel_binding_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (binding.error || !binding.data || binding.data.channel !== 'WHATSAPP') {
    return { handled: false as const, outcome: 'NOT_WHATSAPP_INBOX' as const };
  }

  const root = record(event.payload);
  if (!root) {
    await finalizeFailed(service, event.id, 'WHATSAPP_INVALID_MESSAGE_PAYLOAD');
    return { handled: true as const, outcome: 'FAILED_INVALID_PAYLOAD' as const };
  }

  const mirrorAttributes = record(root.content_attributes);
  const mirrorSourceId = typeof root.source_id === 'string' ? root.source_id.trim() : '';
  if (
    mirrorSourceId.startsWith('sv:mirror:')
    && mirrorAttributes?.smartvisions_mirror === true
    && mirrorAttributes.smartvisions_mirror_version === '1'
  ) {
    return { handled: false as const, outcome: 'SMART_CORE_MIRROR' as const };
  }

  const messageType = String(root.message_type ?? '').trim().toLowerCase();
  const isPrivate = root.private === true || String(root.private ?? '').toLowerCase() === 'true';
  if (messageType !== 'outgoing' || isPrivate) {
    return { handled: false as const, outcome: 'NOT_PUBLIC_OUTGOING' as const };
  }

  const chatwootMessageId = positiveId(root.id);
  const conversation = record(root.conversation);
  const displayId = positiveId(conversation?.id);
  const sender = record(root.sender);
  const senderId = positiveId(sender?.id);
  const rawContent = typeof root.content === 'string' ? root.content.trim() : '';
  const attachments = Array.isArray(root.attachments)
    ? root.attachments.map(record).filter((row): row is RecordValue => Boolean(row))
    : [];

  if (!chatwootMessageId || !displayId || !senderId || (!rawContent && attachments.length === 0)) {
    await finalizeFailed(service, event.id, 'WHATSAPP_INVALID_HUMAN_MESSAGE');
    return { handled: true as const, outcome: 'FAILED_INVALID_MESSAGE' as const };
  }
  if (attachments.length > 1) {
    await finalizeFailed(service, event.id, 'WHATSAPP_MULTIPLE_ATTACHMENTS_REQUIRE_RECONCILIATION');
    return { handled: true as const, outcome: 'FAILED_MULTIPLE_ATTACHMENTS' as const };
  }

  const attachment = attachments[0] ?? null;
  const attachmentId = attachment ? positiveId(attachment.id) : null;
  const attachmentContentType = attachment && typeof attachment.content_type === 'string'
    ? attachment.content_type.trim().toLowerCase()
    : null;
  if (attachment && !attachmentId) {
    await finalizeFailed(service, event.id, 'WHATSAPP_INVALID_ATTACHMENT_IDENTITY');
    return { handled: true as const, outcome: 'FAILED_INVALID_ATTACHMENT' as const };
  }

  const mediaKind = attachmentContentType?.startsWith('image/')
    ? 'image' as const
    : attachmentContentType?.startsWith('video/')
      ? 'video' as const
      : attachmentContentType?.startsWith('audio/')
        ? 'audio' as const
        : attachment
          ? 'document' as const
          : null;
  if (mediaKind === 'audio' && rawContent) {
    await finalizeFailed(service, event.id, 'WHATSAPP_AUDIO_WITH_TEXT_REQUIRES_RECONCILIATION');
    return { handled: true as const, outcome: 'FAILED_AUDIO_WITH_TEXT' as const };
  }
  const canonicalMediaType = mediaKind === 'image'
    ? 'IMAGE' as const
    : mediaKind === 'video'
      ? 'VIDEO' as const
      : mediaKind === 'audio'
        ? 'AUDIO' as const
        : mediaKind === 'document'
          ? 'DOCUMENT' as const
          : 'TEXT' as const;
  const content = rawContent || (mediaKind ? `[Chatwoot ${mediaKind} attachment]` : '');

  const projectionResult = await service
    .from('unified_inbox_conversation_projections')
    .select('id,conversation_id,tenant_business_id,branch_id,communication_channel_binding_id,chatwoot_inbox_mapping_id,chatwoot_conversation_display_id,lifecycle_status')
    .eq('organization_id', organizationId)
    .eq('tenant_business_id', tenantBusinessId)
    .eq('chatwoot_inbox_mapping_id', inboxMappingId)
    .eq('chatwoot_conversation_display_id', displayId)
    .in('lifecycle_status', ['ACTIVE','DEGRADED'])
    .limit(2);
  if (
    projectionResult.error
    || !Array.isArray(projectionResult.data)
    || projectionResult.data.length !== 1
  ) {
    await finalizeFailed(service, event.id, 'WHATSAPP_CANONICAL_PROJECTION_REQUIRED');
    return { handled: true as const, outcome: 'FAILED_PROJECTION_REQUIRED' as const };
  }
  const projection = projectionResult.data[0];
  if (projection.communication_channel_binding_id !== binding.data.id) {
    await finalizeFailed(service, event.id, 'WHATSAPP_BINDING_SCOPE_MISMATCH');
    return { handled: true as const, outcome: 'FAILED_BINDING_SCOPE' as const };
  }

  const marker = record(conversation?.additional_attributes);
  if (
    marker?.smartvisions_projection !== true
    || marker.smartvisions_projection_version !== '1'
    || marker.smartvisions_conversation_id !== projection.conversation_id
  ) {
    await finalizeFailed(service, event.id, 'WHATSAPP_CONVERSATION_MARKER_MISMATCH');
    return { handled: true as const, outcome: 'FAILED_MARKER_MISMATCH' as const };
  }

  const human = await resolveHumanSender({
    service,
    organizationId,
    tenantBusinessId,
    chatwootAccountMappingId: String(inbox.data.chatwoot_account_mapping_id),
    chatwootUserId: senderId,
  });

  const conversationRow = await service
    .from('sales_conversations')
    .select('id,lead_id,channel')
    .eq('organization_id', organizationId)
    .eq('id', projection.conversation_id)
    .maybeSingle();
  if (
    conversationRow.error
    || !conversationRow.data?.lead_id
    || conversationRow.data.channel !== 'WHATSAPP'
  ) {
    await finalizeFailed(service, event.id, 'WHATSAPP_CANONICAL_CONVERSATION_REQUIRED');
    return { handled: true as const, outcome: 'FAILED_CONVERSATION_REQUIRED' as const };
  }

  const lead = await service
    .from('leads')
    .select('id,business_id')
    .eq('organization_id', organizationId)
    .eq('id', conversationRow.data.lead_id)
    .maybeSingle();
  if (lead.error || !lead.data?.business_id) {
    await finalizeFailed(service, event.id, 'WHATSAPP_CANONICAL_LEAD_REQUIRED');
    return { handled: true as const, outcome: 'FAILED_LEAD_REQUIRED' as const };
  }

  const business = await service
    .from('businesses')
    .select('whatsapp,phone')
    .eq('organization_id', organizationId)
    .eq('id', lead.data.business_id)
    .maybeSingle();
  if (business.error || !business.data) {
    await finalizeFailed(service, event.id, 'WHATSAPP_CANONICAL_RECIPIENT_REQUIRED');
    return { handled: true as const, outcome: 'FAILED_RECIPIENT_REQUIRED' as const };
  }
  const recipient = normalizeCanonicalPhone(business.data.whatsapp)
    || normalizeCanonicalPhone(business.data.phone);
  if (recipient.length < 8) {
    await finalizeFailed(service, event.id, 'WHATSAPP_CANONICAL_RECIPIENT_REQUIRED');
    return { handled: true as const, outcome: 'FAILED_RECIPIENT_REQUIRED' as const };
  }

  const claimed = await claimCanonicalMessage({
    service,
    event,
    conversationId: projection.conversation_id,
    leadId: conversationRow.data.lead_id,
    chatwootMessageId,
    chatwootSenderId: senderId,
    smartUserId: human.smartUserId,
    smartRole: human.role,
    content,
    mediaType: canonicalMediaType,
    attachmentId,
    attachmentContentType,
  });

  if (!claimed.claimed) {
    if (claimed.row.status === 'SENT' && claimed.row.provider_message_id) {
      await completeProcessed(service, event.id, String(claimed.row.id));
      return {
        handled: true as const,
        outcome: 'REPLAY' as const,
        messageId: String(claimed.row.id),
        providerMessageId: String(claimed.row.provider_message_id),
      };
    }
    await finalizeFailed(service, event.id, 'WHATSAPP_HUMAN_RECONCILIATION_REQUIRED');
    return {
      handled: true as const,
      outcome: 'RECONCILIATION_REQUIRED' as const,
      messageId: String(claimed.row.id),
    };
  }

  const messageId = String(claimed.row.id);
  let providerAccepted = false;
  let providerMessageId: string | null = null;

  try {
    const gate = await assertCanonicalSendAllowed({
      supabase: service,
      organizationId,
      leadId: conversationRow.data.lead_id,
      conversationId: projection.conversation_id,
      channel: 'WHATSAPP',
      recipient,
      humanAgentSendVerified: true,
    });
    if (!gate.whatsappPolicy?.allowed || gate.whatsappPolicy.mode !== 'FREEFORM') {
      throw new Error('WhatsApp human reply requires an open customer service window');
    }

    const cost = await getCostGuardState(organizationId);
    assertPaidOperationAllowed(cost, 'NORMAL');

    const provider = await resolveMetaWhatsAppProvider({
      service,
      organizationId,
      tenantBusinessId,
      branchId: projection.branch_id,
    });
    if (provider.bindingId !== binding.data.id) {
      throw new Error('WhatsApp human reply credential does not match canonical binding');
    }

    let result;
    if (attachmentId && mediaKind) {
      const downloaded = await downloadChatwootMessageAttachmentForProvider({
        service,
        organizationId,
        tenantBusinessId,
        conversationDisplayId: displayId,
        chatwootMessageId,
        attachmentId,
      });
      const uploaded = await provider.provider.uploadMedia({
        bytes: downloaded.bytes,
        mimeType: downloaded.contentType,
        filename: downloaded.filename,
        kind: mediaKind,
      });
      result = await provider.provider.sendMedia({
        to: recipient,
        mediaId: uploaded.mediaId,
        kind: mediaKind,
        caption: mediaKind === 'audio' ? null : rawContent || null,
        filename: mediaKind === 'document' ? downloaded.filename : null,
      });
    } else {
      result = await provider.provider.sendText({ to: recipient, text: content });
    }
    providerAccepted = true;
    providerMessageId = result.providerMessageId;
    const now = new Date().toISOString();

    const accepted = await service
      .from('conversation_messages')
      .update({
        status: 'SENT',
        provider_message_id: providerMessageId,
        provider_delivery_status: 'ACCEPTED',
        sent_at: now,
        processed_at: now,
        approval_reason: null,
      })
      .eq('organization_id', organizationId)
      .eq('id', messageId)
      .eq('status', 'PROCESSING');
    if (accepted.error) {
      throw new Error('Provider accepted human reply but canonical message reconciliation failed');
    }

    await service.from('whatsapp_events').upsert({
      organization_id: organizationId,
      lead_id: conversationRow.data.lead_id,
      conversation_id: projection.conversation_id,
      provider_message_id: providerMessageId,
      direction: 'OUTBOUND',
      event_type: mediaKind ? `${mediaKind.toUpperCase()}_SENT` : 'TEXT_SENT',
      payload: {
        source: 'CHATWOOT_SIGNED_WEBHOOK',
        chatwoot_event_id: event.id,
        chatwoot_message_id: chatwootMessageId,
        smart_user_id: human.smartUserId,
        media_kind: mediaKind,
        attachment_id: attachmentId,
        attachment_content_type: attachmentContentType,
        tenant_business_id: tenantBusinessId,
        branch_id: projection.branch_id,
        communication_channel_binding_id: binding.data.id,
      },
    }, {
      onConflict: 'organization_id,provider_message_id,direction,event_type',
      ignoreDuplicates: true,
    });

    await replayPersistedWhatsAppStatuses({
      organizationId,
      providerMessageId,
      tenantBusinessId,
      branchId: projection.branch_id,
      bindingId: binding.data.id,
    });

    await service.from('sales_conversations')
      .update({
        last_outbound_at: now,
        last_message_at: now,
        awaiting_party: 'CUSTOMER',
        unread_count: 0,
        updated_at: now,
      })
      .eq('organization_id', organizationId)
      .eq('id', projection.conversation_id);

    try {
      await recordUsage({
        organizationId,
        provider: 'WHATSAPP',
        operation: mediaKind ? 'SEND_MEDIA' : 'SEND_TEXT',
        costUsd: 0,
        units: 1,
        leadId: conversationRow.data.lead_id,
        metadata: {
          source: 'CHATWOOT_SIGNED_WEBHOOK',
          smart_user_id: human.smartUserId,
          media_kind: mediaKind,
          attachment_id: attachmentId,
          tenant_business_id: tenantBusinessId,
          branch_id: projection.branch_id,
          communication_channel_binding_id: binding.data.id,
          pricing_status: 'PENDING_RECONCILIATION',
          canonical_last_inbound_at: gate.lastInboundAt,
        },
      });
    } catch {
      // Usage reconciliation must not cause a second provider send.
    }

    await completeProcessed(service, event.id, messageId);
    return {
      handled: true as const,
      outcome: 'SENT' as const,
      messageId,
      providerMessageId,
    };
  } catch (error) {
    const confirmedRejected = error instanceof ProviderHttpError;
    if (!providerAccepted) {
      await service.from('conversation_messages')
        .update({
          status: confirmedRejected ? 'FAILED' : 'PROCESSING',
          approval_reason: confirmedRejected
            ? 'WHATSAPP_PROVIDER_REJECTED'
            : 'WHATSAPP_PROVIDER_OUTCOME_AMBIGUOUS_OR_BLOCKED',
          processed_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('id', messageId);
    }

    try {
      await finalizeFailed(
        service,
        event.id,
        providerAccepted
          ? 'WHATSAPP_LOCAL_RECONCILIATION_REQUIRED'
          : confirmedRejected
            ? 'WHATSAPP_PROVIDER_REJECTED'
            : 'WHATSAPP_PROVIDER_OUTCOME_AMBIGUOUS',
      );
    } catch {
      // Signed journal stays non-terminal rather than risking a duplicate provider send.
    }

    return {
      handled: true as const,
      outcome: providerAccepted
        ? 'RECONCILIATION_REQUIRED' as const
        : confirmedRejected
          ? 'FAILED_PROVIDER_REJECTED' as const
          : 'RECONCILIATION_REQUIRED' as const,
      messageId,
      providerMessageId,
    };
  }
}
