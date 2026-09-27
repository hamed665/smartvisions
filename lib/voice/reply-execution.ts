import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';
import {
  finalizeCostGuardUsage,
  reserveCostGuardUsage,
} from '@/lib/reliability/cost-guard';
import { synthesizeOpenAiVoiceReply } from '@/lib/voice/reply-synthesis';
import {
  voiceReplySynthesisText,
  type VoiceReplyRuntimeConfig,
} from '@/lib/voice/reply-config';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function voiceReplyReservationKey(messageId: string) {
  const id = messageId.trim();
  if (!id) throw new Error('Voice reply message id is required');
  return `voice-reply:${id}:tts`;
}

async function replayedMediaId(input: {
  service: SupabaseClient;
  organizationId: string;
  reservationKey: string;
}) {
  const { data, error } = await input.service
    .from('usage_events')
    .select('metadata')
    .eq('organization_id', input.organizationId)
    .contains('metadata', { reservation_key: input.reservationKey })
    .maybeSingle();
  if (error) throw new Error(`Voice reply cost replay lookup failed: ${error.message}`);
  const metadata = record(data?.metadata);
  if (metadata.accounting_state !== 'SETTLED') {
    throw new Error('VOICE_REPLY_PROVIDER_RECONCILIATION_REQUIRED');
  }
  const mediaId = typeof metadata.meta_media_id === 'string'
    ? metadata.meta_media_id.trim()
    : '';
  if (!mediaId) throw new Error('VOICE_REPLY_MEDIA_RECONCILIATION_REQUIRED');
  return mediaId;
}

export async function prepareControlledVoiceReplyAudio(input: {
  service: SupabaseClient;
  provider: WhatsAppProvider;
  organizationId: string;
  messageId: string;
  leadId?: string | null;
  replyText: string;
  config: VoiceReplyRuntimeConfig;
}) {
  const reservationKey = voiceReplyReservationKey(input.messageId);
  const reservation = await reserveCostGuardUsage({
    organizationId: input.organizationId,
    provider: 'OPENAI',
    operation: 'VOICE_REPLY_TTS',
    reservationKey,
    reservedUsd: input.config.costReserveUsd,
    leadId: input.leadId ?? undefined,
    metadata: {
      source: 'APPROVED_SHADOW_DRAFT',
      pricing_status: input.config.pricingStatus,
      disclosure_present: true,
      message_id: input.messageId,
    },
  });

  if (reservation.replayed) {
    return {
      mediaId: await replayedMediaId({
        service: input.service,
        organizationId: input.organizationId,
        reservationKey,
      }),
      reservationKey,
      replayed: true as const,
    };
  }

  const synthesized = await synthesizeOpenAiVoiceReply({
    text: voiceReplySynthesisText(
      input.config.aiGeneratedDisclosureText,
      input.replyText,
    ),
  });

  const uploaded = await input.provider.uploadAudio({
    bytes: synthesized.bytes,
    mimeType: synthesized.mimeType,
    filename: 'smart-visions-ai-reply.mp3',
  });

  await finalizeCostGuardUsage({
    organizationId: input.organizationId,
    reservationKey,
    state: 'SETTLED',
    actualCostUsd: reservation.reservedUsd,
    units: 1,
    metadata: {
      pricing_status: input.config.pricingStatus,
      cost_basis: 'OWNER_CONFIGURED_CONSERVATIVE_RESERVE',
      disclosure_present: true,
      model: synthesized.model,
      voice: synthesized.voice,
      response_format: synthesized.responseFormat,
      audio_bytes: synthesized.bytes.byteLength,
      meta_media_id: uploaded.mediaId,
    },
  });

  return {
    mediaId: uploaded.mediaId,
    reservationKey,
    replayed: false as const,
  };
}
