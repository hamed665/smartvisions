import 'server-only';

import type { ChatwootPublicIncomingAttachment } from '@/lib/chatwoot/public-conversation-projection';

const MAX_CHATWOOT_MEDIA_BYTES = 10 * 1024 * 1024;

function graphVersion() {
  return process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
}

function safeMetaMediaUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (
      host !== 'lookaside.fbsbx.com'
      && !host.endsWith('.fbcdn.net')
      && !host.endsWith('.facebook.com')
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function safeFilename(input: string | null | undefined, mimeType: string) {
  const supplied = input?.trim().replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 160);
  if (supplied) return supplied;
  const extension = mimeType === 'image/jpeg' ? 'jpg'
    : mimeType === 'image/png' ? 'png'
      : mimeType === 'image/webp' ? 'webp'
        : mimeType === 'video/mp4' ? 'mp4'
          : mimeType === 'audio/ogg' ? 'ogg'
            : mimeType === 'audio/mpeg' ? 'mp3'
              : mimeType === 'application/pdf' ? 'pdf'
                : 'bin';
  return `whatsapp-media.${extension}`;
}

export async function downloadMetaWhatsAppMediaForChatwoot(input: {
  mediaId: string;
  accessToken: string;
  expectedMimeType?: string | null;
  filename?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<ChatwootPublicIncomingAttachment> {
  const mediaId = input.mediaId.trim();
  const token = input.accessToken.trim();
  if (!mediaId || mediaId.length > 512 || !token) {
    throw new Error('WhatsApp media download input is invalid');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const metadataResponse = await fetchImpl(
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(mediaId)}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
    },
  );
  if (!metadataResponse.ok) throw new Error('Meta WhatsApp media metadata read failed');

  const metadata = await metadataResponse.json() as {
    id?: string;
    url?: string;
    mime_type?: string;
    file_size?: number | string;
  };
  if (metadata.id !== mediaId) throw new Error('Meta WhatsApp media identity mismatch');

  const url = safeMetaMediaUrl(metadata.url);
  const mimeType = typeof metadata.mime_type === 'string' && metadata.mime_type.trim()
    ? metadata.mime_type.trim().slice(0, 120)
    : input.expectedMimeType?.trim().slice(0, 120) || 'application/octet-stream';
  const advertisedSize = Number(metadata.file_size ?? 0);
  if (!url) throw new Error('Meta WhatsApp media URL is not trusted');
  if (
    Number.isFinite(advertisedSize)
    && advertisedSize > 0
    && advertisedSize > MAX_CHATWOOT_MEDIA_BYTES
  ) {
    throw new Error('WhatsApp media exceeds the bounded Chatwoot projection limit');
  }

  const mediaResponse = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!mediaResponse.ok) throw new Error('Meta WhatsApp media download failed');

  const contentLength = Number(mediaResponse.headers.get('content-length') ?? 0);
  if (
    Number.isFinite(contentLength)
    && contentLength > MAX_CHATWOOT_MEDIA_BYTES
  ) {
    await mediaResponse.body?.cancel();
    throw new Error('WhatsApp media exceeds the bounded Chatwoot projection limit');
  }

  const bytes = await mediaResponse.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_CHATWOOT_MEDIA_BYTES) {
    throw new Error('WhatsApp media size is outside the bounded Chatwoot projection limit');
  }

  const responseMime = mediaResponse.headers.get('content-type')?.split(';', 1)[0]?.trim();
  const contentType = responseMime || mimeType;
  if (input.expectedMimeType?.trim() && contentType !== input.expectedMimeType.trim()) {
    throw new Error('WhatsApp media MIME type does not match the signed webhook evidence');
  }

  return {
    filename: safeFilename(input.filename, contentType),
    contentType,
    blob: new Blob([bytes], { type: contentType }),
  };
}
