export function studioAudioEvidence(input: {
  metadata: unknown;
  direction: string;
  sourcePlane: string | null;
  mediaType: string;
  providerMessageId: string | null;
}, businessId: string, bindingId: string) {
  if (!['VOICE', 'AUDIO'].includes(input.mediaType) || !input.providerMessageId) return null;
  if (!input.metadata || typeof input.metadata !== 'object' || Array.isArray(input.metadata)) return null;
  const metadata = input.metadata as Record<string, unknown>;
  if (metadata.tenant_business_id !== businessId || metadata.communication_channel_binding_id !== bindingId) return null;
  const inbound = input.direction === 'INBOUND' && input.sourcePlane === 'META_WHATSAPP' && metadata.source === 'META_WHATSAPP_WEBHOOK';
  const outbound = input.direction === 'OUTBOUND' && (
    (input.sourcePlane === 'META_WHATSAPP' && metadata.source === 'META_WHATSAPP_NATIVE_ECHO')
    || (input.sourcePlane === 'SMART_CORE' && metadata.source === 'OWNER_MANUAL_REPLY')
  );
  if (!inbound && !outbound) return null;
  const mediaId = typeof metadata.media_id === 'string' ? metadata.media_id.trim() : '';
  if (!/^\d{1,64}$/.test(mediaId)) return null;
  const mime = typeof metadata.mime_type === 'string' ? metadata.mime_type.split(';', 1)[0]?.trim().toLowerCase() : '';
  return { mediaId, mimeType: isStudioPlayableAudio(mime) ? mime : undefined };
}

export function isStudioPlayableAudio(mime: string | null | undefined) {
  return mime === 'audio/ogg' || mime === 'audio/mpeg' || mime === 'audio/mp4' || mime === 'audio/aac' || mime === 'audio/amr';
}

export function studioAudioRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size < 1) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = !match[1] || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]));
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end ? { start, end } : null;
}
