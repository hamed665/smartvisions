import { describe, expect, it } from 'vitest';
import { extractWhatsAppInbound, extractWhatsAppStatuses } from '@/lib/whatsapp/webhook';

describe('WhatsApp webhook normalization', () => {
  it('normalizes inbound text and voice messages', () => {
    const payload = {
      entry: [{ id: 'waba-123', changes: [{ value: {
        metadata: { display_phone_number: '+968 9000 0000', phone_number_id: 'phone-123' },
        contacts: [{ profile: { name: 'Customer' }, wa_id: '96890000000' }],
        messages: [
          { id: 'wamid.text', from: '96890000000', timestamp: '1787350000', type: 'text', text: { body: 'hello' } },
          { id: 'wamid.voice', from: '96890000000', timestamp: '1787350001', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg', voice: true } },
        ],
      } }] }],
    };

    const events = extractWhatsAppInbound(payload);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      providerMessageId: 'wamid.text',
      text: 'hello',
      contactName: 'Customer',
      destination: {
        displayPhoneNumber: '+968 9000 0000',
        phoneNumberId: 'phone-123',
        wabaId: 'waba-123',
      },
    });
    expect(events[1]).toMatchObject({ providerMessageId: 'wamid.voice', mediaId: 'media-1', mimeType: 'audio/ogg', voice: true });
  });

  it('normalizes image, video, document and sticker media without inventing storage URLs', () => {
    const events = extractWhatsAppInbound({
      entry: [{ id: 'waba-media', changes: [{ value: {
        metadata: { phone_number_id: 'phone-media' },
        messages: [
          { id: 'wamid.image', from: '96890000000', type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg', caption: 'front view' } },
          { id: 'wamid.video', from: '96890000000', type: 'video', video: { id: 'vid-1', mime_type: 'video/mp4', caption: 'walkaround' } },
          { id: 'wamid.doc', from: '96890000000', type: 'document', document: { id: 'doc-1', mime_type: 'application/pdf', filename: 'quote.pdf', caption: 'quote' } },
          { id: 'wamid.sticker', from: '96890000000', type: 'sticker', sticker: { id: 'sticker-1', mime_type: 'image/webp', animated: false } },
        ],
      } }] }],
    });

    expect(events).toEqual([
      expect.objectContaining({ providerMessageId: 'wamid.image', type: 'image', mediaId: 'img-1', mimeType: 'image/jpeg', caption: 'front view' }),
      expect.objectContaining({ providerMessageId: 'wamid.video', type: 'video', mediaId: 'vid-1', mimeType: 'video/mp4', caption: 'walkaround' }),
      expect.objectContaining({ providerMessageId: 'wamid.doc', type: 'document', mediaId: 'doc-1', mimeType: 'application/pdf', filename: 'quote.pdf', caption: 'quote' }),
      expect.objectContaining({ providerMessageId: 'wamid.sticker', type: 'sticker', mediaId: 'sticker-1', mimeType: 'image/webp' }),
    ]);
  });

  it('keeps destination context on status events for tenant routing', () => {
    const statuses = extractWhatsAppStatuses({
      entry: [{
        id: 'waba-status',
        changes: [{
          value: {
            metadata: { phone_number_id: 'phone-status' },
            statuses: [{ id: 'wamid.status', status: 'read' }],
          },
        }],
      }],
    });
    expect(statuses[0]).toMatchObject({
      providerMessageId: 'wamid.status',
      destination: { phoneNumberId: 'phone-status', wabaId: 'waba-status' },
    });
  });

  it('preserves click-to-whatsapp referral attribution from Meta inbound payloads', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        contacts: [{ profile: { name: 'Ad Customer' }, wa_id: '971501234567' }],
        messages: [{
          id: 'wamid.ctwa',
          from: '971501234567',
          timestamp: '1787350002',
          type: 'text',
          text: { body: 'I saw your ad' },
          referral: {
            source_url: 'https://www.instagram.com/p/example',
            source_id: 'ig-ad-123',
            source_type: 'ad',
            headline: 'Smart Visions',
            body: 'Website and automation',
            media_type: 'image',
            ctwa_clid: 'clid-123',
          },
        }],
      } }] }],
    };

    expect(extractWhatsAppInbound(payload)[0]).toMatchObject({
      providerMessageId: 'wamid.ctwa',
      referral: {
        sourceUrl: 'https://www.instagram.com/p/example',
        sourceId: 'ig-ad-123',
        sourceType: 'ad',
        headline: 'Smart Visions',
        body: 'Website and automation',
        mediaType: 'image',
        ctwaClid: 'clid-123',
      },
    });
  });

  it('normalizes delivery/read/failure statuses without treating them as inbound messages', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        statuses: [
          { id: 'wamid.sent', status: 'delivered', timestamp: '1787350100', recipient_id: '96890000000', conversation: { id: 'conv-1' }, pricing: { category: 'service' } },
          { id: 'wamid.failed', status: 'failed', timestamp: '1787350101', recipient_id: '96890000000', errors: [{ code: 131047, title: 'Re-engagement message' }] },
        ],
      } }] }],
    };

    expect(extractWhatsAppInbound(payload)).toEqual([]);
    expect(extractWhatsAppStatuses(payload)).toEqual([
      expect.objectContaining({ providerMessageId: 'wamid.sent', status: 'delivered', conversationId: 'conv-1', pricingCategory: 'service' }),
      expect.objectContaining({ providerMessageId: 'wamid.failed', status: 'failed', errorCode: '131047', errorTitle: 'Re-engagement message' }),
    ]);
  });

  it('keeps unknown provider statuses explicit instead of fabricating a known state', () => {
    const statuses = extractWhatsAppStatuses({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.x', status: 'mystery' }] } }] }] });
    expect(statuses[0]?.status).toBe('unknown');
  });
});