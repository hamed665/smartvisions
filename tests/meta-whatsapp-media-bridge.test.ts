import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import { downloadMetaWhatsAppMediaForChatwoot } from '@/lib/whatsapp/media';

describe('WhatsApp media bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads only trusted Meta media with matching signed MIME evidence', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'media-1',
        url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media-1',
        mime_type: 'image/jpeg',
        file_size: 4,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': '4',
        },
      }));

    const result = await downloadMetaWhatsAppMediaForChatwoot({
      mediaId: 'media-1',
      accessToken: 'token-123',
      expectedMimeType: 'image/jpeg',
      filename: 'photo.jpg',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.filename).toBe('photo.jpg');
    expect(result.contentType).toBe('image/jpeg');
    expect(result.blob.size).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects an untrusted provider media URL before downloading bytes', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'media-1',
      url: 'https://evil.example.invalid/file',
      mime_type: 'image/jpeg',
      file_size: 4,
    }), { status: 200 }));

    await expect(downloadMetaWhatsAppMediaForChatwoot({
      mediaId: 'media-1',
      accessToken: 'token-123',
      expectedMimeType: 'image/jpeg',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('not trusted');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects downloaded bytes whose MIME no longer matches webhook evidence', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'media-1',
        url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=media-1',
        mime_type: 'image/jpeg',
        file_size: 4,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': '4' },
      }));

    await expect(downloadMetaWhatsAppMediaForChatwoot({
      mediaId: 'media-1',
      accessToken: 'token-123',
      expectedMimeType: 'image/jpeg',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow('MIME type does not match');
  });

  it('uploads and sends one bounded image through the existing Meta provider', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'uploaded-media-1' }), {
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        messages: [{ id: 'wamid.outbound-media-1' }],
      }), {
        status: 200,
      }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MetaCloudWhatsAppProvider({
      token: 'meta-token',
      phoneNumberId: 'phone-1',
      graphVersion: 'v23.0',
    });

    const uploaded = await provider.uploadMedia({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'image/jpeg',
      filename: 'photo.jpg',
      kind: 'image',
    });
    expect(uploaded).toEqual({ mediaId: 'uploaded-media-1' });

    const sent = await provider.sendMedia({
      to: '96890000000',
      mediaId: uploaded.mediaId,
      kind: 'image',
      caption: 'hello',
    });
    expect(sent).toMatchObject({
      providerMessageId: 'wamid.outbound-media-1',
      status: 'accepted',
    });

    const sendInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(sendInit.body))).toMatchObject({
      messaging_product: 'whatsapp',
      to: '96890000000',
      type: 'image',
      image: { id: 'uploaded-media-1', caption: 'hello' },
    });
  });

  it('fails closed when a media kind and MIME type do not match', async () => {
    const provider = new MetaCloudWhatsAppProvider({
      token: 'meta-token',
      phoneNumberId: 'phone-1',
    });

    await expect(provider.uploadMedia({
      bytes: new Uint8Array([1]).buffer,
      mimeType: 'application/pdf',
      filename: 'document.pdf',
      kind: 'image',
    })).rejects.toThrow('unsupported for this media kind');
  });
});
