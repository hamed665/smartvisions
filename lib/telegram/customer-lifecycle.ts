import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureChatwootPublicConversationProjection,
  type ChatwootPublicIncomingAttachment,
} from '@/lib/chatwoot/public-conversation-projection';
import type {
  NormalizedTelegramCustomerEvent,
  TelegramCustomerMedia,
} from './customer-webhook';
import type { TelegramCustomerWebhookContext } from './customer-routing';
import type { TelegramCustomerProvider } from './customer-provider';

export type TelegramBusinessResolution =
  | { status: 'NO_MATCH' }
  | { status: 'MATCH'; businessId: string; identityId: string };

export async function resolveTelegramInboundBusiness(input: {
  service: SupabaseClient;
  context: TelegramCustomerWebhookContext;
  event: NormalizedTelegramCustomerEvent;
}): Promise<TelegramBusinessResolution> {
  if (!input.event.senderId) return { status: 'NO_MATCH' };
  const { data, error } = await input.service.rpc('resolve_telegram_provider_business', {
    p_organization_id: input.context.organizationId,
    p_binding_id: input.context.bindingId,
    p_provider_user_id: input.event.senderId,
  });
  if (error) throw new Error(`Telegram canonical identity resolution failed: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) return { status: 'NO_MATCH' };
  if (data.length !== 1) throw new Error('Telegram canonical identity resolution was not unique');
  return {
    status: 'MATCH',
    businessId: String(data[0].business_id),
    identityId: String(data[0].identity_id),
  };
}

function safeFilename(media: TelegramCustomerMedia, index: number) {
  const explicit = media.fileName?.trim().replace(/[\\/\0\r\n]/g, '_').slice(0, 180);
  if (explicit) return explicit;
  const ext = media.kind === 'PHOTO' ? '.jpg'
    : media.kind === 'VIDEO' || media.kind === 'VIDEO_NOTE' ? '.mp4'
      : media.kind === 'AUDIO' ? '.mp3'
        : media.kind === 'VOICE' ? '.ogg'
          : media.kind === 'STICKER' ? '.webp'
            : '';
  return `telegram-${media.kind.toLowerCase()}-${index + 1}${ext}`;
}

function defaultMime(media: TelegramCustomerMedia) {
  if (media.mimeType?.trim()) return media.mimeType.trim().slice(0, 120);
  if (media.kind === 'PHOTO') return 'image/jpeg';
  if (media.kind === 'VIDEO' || media.kind === 'VIDEO_NOTE') return 'video/mp4';
  if (media.kind === 'AUDIO') return 'audio/mpeg';
  if (media.kind === 'VOICE') return 'audio/ogg';
  if (media.kind === 'STICKER') return 'image/webp';
  return 'application/octet-stream';
}

export async function downloadTelegramInboundMedia(input: {
  provider: TelegramCustomerProvider;
  media: TelegramCustomerMedia[];
}): Promise<ChatwootPublicIncomingAttachment[]> {
  const attachments: ChatwootPublicIncomingAttachment[] = [];
  for (const [index, media] of input.media.slice(0, 4).entries()) {
    const downloaded = await input.provider.downloadMedia({
      fileId: media.fileId,
      declaredSize: media.fileSize,
      declaredMimeType: media.mimeType ?? defaultMime(media),
    });
    attachments.push({
      filename: safeFilename(media, index),
      contentType: downloaded.contentType || defaultMime(media),
      blob: downloaded.blob,
    });
  }
  return attachments;
}

export function telegramInboundMediaType(event: NormalizedTelegramCustomerEvent) {
  const first = event.media[0]?.kind;
  if (!first) return 'TEXT';
  if (first === 'PHOTO') return 'IMAGE';
  if (first === 'VIDEO' || first === 'VIDEO_NOTE') return 'VIDEO';
  if (first === 'VOICE') return 'VOICE';
  if (first === 'AUDIO') return 'AUDIO';
  if (first === 'DOCUMENT') return 'DOCUMENT';
  return 'OTHER';
}

export function canonicalTelegramMediaMetadata(event: NormalizedTelegramCustomerEvent) {
  return event.media.map((media) => ({
    kind: media.kind,
    fileUniqueId: media.fileUniqueId,
    fileSize: media.fileSize,
    mimeType: media.mimeType,
    fileName: media.fileName,
  }));
}

export async function ensureTelegramChatwootConversation(input: {
  service: SupabaseClient;
  context: TelegramCustomerWebhookContext;
  identity: Extract<TelegramBusinessResolution, { status: 'MATCH' }>;
}) {
  return ensureChatwootPublicConversationProjection({
    service: input.service,
    organizationId: input.context.organizationId,
    tenantBusinessId: input.context.tenantBusinessId,
    bindingId: input.context.bindingId,
    canonicalIdentityId: input.identity.identityId,
  });
}

export async function projectMatchedTelegramInbound(input: {
  service: SupabaseClient;
  context: TelegramCustomerWebhookContext;
  eventId: string;
  event: NormalizedTelegramCustomerEvent;
  identity: Extract<TelegramBusinessResolution, { status: 'MATCH' }>;
  external: Awaited<ReturnType<typeof ensureTelegramChatwootConversation>>;
}) {
  if (input.event.eventType !== 'MESSAGE' || !input.event.providerMessageId) {
    return { projected: false as const, reason: 'NOT_NEW_CUSTOMER_MESSAGE' as const };
  }
  const displayId = Number(input.external.conversation.id);
  const contactId = Number(input.external.contact.id);
  if (!Number.isSafeInteger(displayId) || displayId <= 0 || !Number.isSafeInteger(contactId) || contactId <= 0) {
    throw new Error('Telegram Chatwoot projection returned invalid identifiers');
  }

  const { data, error } = await input.service.rpc('project_telegram_inbound_message', {
    p_organization_id: input.context.organizationId,
    p_tenant_business_id: input.context.tenantBusinessId,
    p_branch_id: input.context.branchId,
    p_binding_id: input.context.bindingId,
    p_business_id: input.identity.businessId,
    p_identity_id: input.identity.identityId,
    p_event_id: input.eventId,
    p_provider_message_id: input.event.providerMessageId,
    p_message_text: input.event.text,
    p_media_type: telegramInboundMediaType(input.event),
    p_message_metadata: {
      telegram: {
        updateId: input.event.updateId,
        chatId: input.event.chatId,
        senderId: input.event.senderId,
        media: canonicalTelegramMediaMetadata(input.event),
      },
    },
    p_chatwoot_conversation_display_id: displayId,
    p_chatwoot_conversation_uuid: input.external.conversation.uuid ?? null,
    p_chatwoot_contact_id: contactId,
    p_occurred_at: input.event.occurredAt,
    p_request_key: `telegram:${input.context.bindingId}:${input.event.updateId}`.slice(0, 200),
  });
  if (error) throw new Error(`Telegram inbound CRM projection failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.conversation_id || !row?.message_id || !row?.projection_id) {
    throw new Error('Telegram inbound CRM projection returned invalid result');
  }
  return {
    projected: true as const,
    leadId: String(row.lead_id),
    conversationId: String(row.conversation_id),
    messageId: String(row.message_id),
    projectionId: String(row.projection_id),
    messageInserted: Boolean(row.message_inserted),
    chatwootOutcome: input.external.outcome,
  };
}
