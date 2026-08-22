import { describe, expect, it } from 'vitest';
import { extractWhatsAppInbound, extractWhatsAppStatuses } from '@/lib/whatsapp/webhook';

describe('WhatsApp webhook normalization', () => {
  it('normalizes inbound text and voice messages', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        contacts: [{ profile: { name: 'Customer' }, wa_id: '96890000000' }],
        messages: [
          { id: 'wamid.text', from: '96890000000', timestamp: '1787350000', type: 'text', text: { body: 'hello' } },
          { id: 'wamid.voice', from: '96890000000', timestamp: '1787350001', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg', voice: true } },
        ],
      } }] }],
    };

    const events = extractWhatsAppInbound(payload);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ providerMessageId: 'wamid.text', text: 'hello', contactName: 'Customer' });
    expect(events[1]).toMatchObject({ providerMessageId: 'wamid.voice', mediaId: 'media-1', mimeType: 'audio/ogg', voice: true });
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
