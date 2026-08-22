import { describe, expect, it } from 'vitest';
import { mapWhatsAppDeliveryStatus, normalizePhoneDigits } from '@/lib/whatsapp/lifecycle';

describe('WhatsApp lifecycle helpers', () => {
  it('normalizes international phone formats deterministically', () => {
    expect(normalizePhoneDigits('+968 9497 4431')).toBe('96894974431');
    expect(normalizePhoneDigits('https://wa.me/96894974431')).toBe('96894974431');
  });

  it('maps Meta delivery states without inventing unknown state semantics', () => {
    expect(mapWhatsAppDeliveryStatus('sent')).toBe('SENT');
    expect(mapWhatsAppDeliveryStatus('delivered')).toBe('DELIVERED');
    expect(mapWhatsAppDeliveryStatus('read')).toBe('READ');
    expect(mapWhatsAppDeliveryStatus('failed')).toBe('FAILED');
    expect(mapWhatsAppDeliveryStatus('unknown')).toBe('UNKNOWN');
  });
});
