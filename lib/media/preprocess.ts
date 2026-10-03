import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { resolveMetaWhatsAppProvider } from '@/lib/whatsapp/tenant-routing';
import { transcribeWhatsAppVoiceOnce } from '@/lib/voice/transcription';
import { analyzeCanonicalWhatsAppMediaOnce } from './understanding';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown, max = 512) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isPlaceholder(value: string) {
  return /^\[WhatsApp (?:voice|audio|image|video|document|other) message\]$/i.test(value.trim());
}

export type MediaPreprocessResult =
  | { kind: 'NONE'; conversationId?: string }
  | { kind: 'VOICE'; conversationId: string; messageId: string; cached: boolean }
  | { kind: 'MEDIA'; conversationId: string; messageId: string; cached: boolean; status: 'SUCCEEDED' }
  | { kind: 'CAPTION_ONLY'; conversationId: string; messageId: string; mediaType: string };

export async function prepareLatestInboundMediaForAi(input: {
  organizationId: string;
  conversationId?: string;
  leadId?: string;
  signal?: AbortSignal;
}): Promise<MediaPreprocessResult> {
  const service = createSupabaseServiceClient();
  let conversationId = text(input.conversationId, 80);

  if (!conversationId && input.leadId) {
    const conversation = await service
      .from('sales_conversations')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('lead_id', input.leadId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (conversation.error) {
      throw new Error(`Media conversation lookup failed: ${conversation.error.message}`);
    }
    conversationId = text(conversation.data?.id, 80);
  }

  if (!conversationId) return { kind: 'NONE' };

  const latest = await service
    .from('conversation_messages')
    .select('id,conversation_id,lead_id,provider_message_id,channel,direction,media_type,original_text,transcript,metadata,created_at')
    .eq('organization_id', input.organizationId)
    .eq('conversation_id', conversationId)
    .eq('direction', 'INBOUND')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) throw new Error(`Latest inbound media lookup failed: ${latest.error.message}`);
  if (!latest.data) return { kind: 'NONE', conversationId };

  const message = latest.data as Record<string, unknown>;
  if (text(message.channel, 40).toUpperCase() !== 'WHATSAPP') {
    return { kind: 'NONE', conversationId };
  }
  const mediaType = text(message.media_type, 40).toUpperCase();
  if (!['VOICE', 'AUDIO', 'IMAGE', 'DOCUMENT', 'VIDEO'].includes(mediaType)) {
    return { kind: 'NONE', conversationId };
  }

  const messageId = text(message.id, 80);
  const originalText = text(message.original_text, 4000);
  const metadata = record(message.metadata);

  if (mediaType === 'VIDEO') {
    if (originalText && !isPlaceholder(originalText)) {
      return { kind: 'CAPTION_ONLY', conversationId, messageId, mediaType };
    }
    throw new Error('VIDEO_UNDERSTANDING_REQUIRED_BEFORE_AI_REPLY');
  }

  if (mediaType === 'VOICE' || mediaType === 'AUDIO') {
    if (text(message.transcript, 12000)) {
      return { kind: 'VOICE', conversationId, messageId, cached: true };
    }

    const providerMessageId = text(message.provider_message_id, 320);
    const mediaId = text(metadata.media_id, 512);
    const mimeType = text(metadata.mime_type, 120);
    const tenantBusinessId = text(metadata.tenant_business_id, 80);
    const branchId = text(metadata.branch_id, 80) || null;
    const bindingId = text(metadata.communication_channel_binding_id, 80);
    if (!providerMessageId || !mediaId || !tenantBusinessId || !bindingId) {
      throw new Error('VOICE_CANONICAL_MEDIA_EVIDENCE_INCOMPLETE');
    }

    const tenantProvider = await resolveMetaWhatsAppProvider({
      service,
      organizationId: input.organizationId,
      tenantBusinessId,
      branchId,
    });
    if (tenantProvider.bindingId !== bindingId) {
      throw new Error('VOICE_TENANT_PROVIDER_BINDING_MISMATCH');
    }

    const result = await transcribeWhatsAppVoiceOnce({
      organizationId: input.organizationId,
      providerMessageId,
      mediaId,
      mimeType: mimeType || undefined,
      leadId: text(message.lead_id, 80) || input.leadId,
      conversationId,
      priority: 'NORMAL',
      metaAccessToken: tenantProvider.accessToken,
    });
    if (result.status !== 'SUCCEEDED' || !result.transcript) {
      throw new Error(`VOICE_TRANSCRIPTION_NOT_READY:${result.status}`);
    }
    return { kind: 'VOICE', conversationId, messageId, cached: result.cached };
  }

  const analysis = await analyzeCanonicalWhatsAppMediaOnce({
    organizationId: input.organizationId,
    messageId,
    requestKey: `ai-media:${messageId}:v1`,
    signal: input.signal,
  });
  if (analysis.status !== 'SUCCEEDED') {
    if (originalText && !isPlaceholder(originalText)) {
      return { kind: 'CAPTION_ONLY', conversationId, messageId, mediaType };
    }
    throw new Error('MEDIA_UNDERSTANDING_UNSUPPORTED_BEFORE_AI_REPLY');
  }

  return {
    kind: 'MEDIA',
    conversationId,
    messageId,
    cached: analysis.cached,
    status: 'SUCCEEDED',
  };
}
