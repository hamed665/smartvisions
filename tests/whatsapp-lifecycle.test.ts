import { describe, expect, it } from 'vitest';
import { mapWhatsAppDeliveryStatus, normalizePhoneDigits, phonesRepresentSameNumber } from '@/lib/whatsapp/lifecycle';

describe('WhatsApp lifecycle helpers', () => {
  it('normalizes international phone formats deterministically', () => {
    expect(normalizePhoneDigits('+968 9497 4431')).toBe('96894974431');
    expect(normalizePhoneDigits('https://wa.me/96894974431')).toBe('96894974431');
  });

  it('never treats empty or short phone candidates as a match', () => {
    expect(phonesRepresentSameNumber('96894974431', '')).toBe(false);
    expect(phonesRepresentSameNumber('96894974431', null)).toBe(false);
    expect(phonesRepresentSameNumber('96894974431', '4431')).toBe(false);
    expect(phonesRepresentSameNumber('96894974431', '96811112222')).toBe(false);
  });

  it('matches the same number with or without a country-code prefix', () => {
    expect(phonesRepresentSameNumber('96894974431', '94974431')).toBe(true);
    expect(phonesRepresentSameNumber('94974431', '+968 9497 4431')).toBe(true);
  });

  it('maps Meta delivery states without inventing unknown state semantics', () => {
    expect(mapWhatsAppDeliveryStatus('sent')).toBe('SENT');
    expect(mapWhatsAppDeliveryStatus('delivered')).toBe('DELIVERED');
    expect(mapWhatsAppDeliveryStatus('read')).toBe('READ');
    expect(mapWhatsAppDeliveryStatus('failed')).toBe('FAILED');
    expect(mapWhatsAppDeliveryStatus('unknown')).toBe('UNKNOWN');
  });
});
