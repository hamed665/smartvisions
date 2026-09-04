import { describe, expect, it } from 'vitest';
import {
  buildVerifiedInboundBusinessSeed,
  mapWhatsAppDeliveryStatus,
  normalizePhoneDigits,
  phonesRepresentSameNumber,
  verifiedInboundMarketForPhone,
} from '@/lib/whatsapp/lifecycle';

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

  it('admits only canonical Oman Meta sender numbers into the inbound pilot', () => {
    expect(verifiedInboundMarketForPhone('+968 9497 4431')).toBe('OM');
    expect(verifiedInboundMarketForPhone('94974431')).toBeNull();
    expect(verifiedInboundMarketForPhone('+971501234567')).toBeNull();
    expect(verifiedInboundMarketForPhone('968123')).toBeNull();
  });

  it('builds a deterministic dedupe identity from a verified Oman inbound without inventing business evidence', () => {
    expect(buildVerifiedInboundBusinessSeed({ from: '+968 9497 4431', contactName: '  Test   Customer  ' })).toEqual({
      name: 'Test Customer',
      countryCode: 'OM',
      whatsapp: '+96894974431',
      dedupeDomain: 'wa-96894974431.whatsapp-inbound.invalid',
    });
    expect(buildVerifiedInboundBusinessSeed({ from: '+971 50 123 4567', contactName: 'UAE Contact' })).toBeNull();
  });

  it('maps Meta delivery states without inventing unknown state semantics', () => {
    expect(mapWhatsAppDeliveryStatus('sent')).toBe('SENT');
    expect(mapWhatsAppDeliveryStatus('delivered')).toBe('DELIVERED');
    expect(mapWhatsAppDeliveryStatus('read')).toBe('READ');
    expect(mapWhatsAppDeliveryStatus('failed')).toBe('FAILED');
    expect(mapWhatsAppDeliveryStatus('unknown')).toBe('UNKNOWN');
  });
});
