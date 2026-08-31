import { describe, expect, it } from 'vitest';
import { isWhatsAppInboundDuplicateError, normalizePhoneDigits, phonesRepresentSameNumber } from '@/lib/whatsapp/lifecycle';

describe('WhatsApp inbound lifecycle safety helpers', () => {
  it('treats only unique violations as idempotent inbound duplicates', () => {
    expect(isWhatsAppInboundDuplicateError('23505')).toBe(true);
    expect(isWhatsAppInboundDuplicateError('42P10')).toBe(false);
    expect(isWhatsAppInboundDuplicateError(undefined)).toBe(false);
  });

  it('matches normalized Oman phone numbers safely', () => {
    expect(normalizePhoneDigits('+968 7751 1053')).toBe('96877511053');
    expect(phonesRepresentSameNumber('+968 7751 1053', '77511053')).toBe(true);
    expect(phonesRepresentSameNumber('1053', '96877511053')).toBe(false);
  });
});
