import { describe, expect, it } from 'vitest';
import {
  evaluateWhatsAppMarketingPermission,
  WHATSAPP_MARKETING_OPT_IN_FIELD,
  WHATSAPP_MARKETING_OPT_OUT_FIELD,
} from '@/lib/whatsapp/marketing-opt-in';

const recipient = '+968 9123 4567';
const validOptIn = {
  field_name: WHATSAPP_MARKETING_OPT_IN_FIELD,
  source_type: 'WEBSITE_FORM',
  retrieved_at: '2026-09-08T10:00:00.000Z',
  verified_at: '2026-09-08T10:05:00.000Z',
  value: {
    consent: true,
    business_name: 'Smart Visions',
    purpose: 'MARKETING',
    recipient: '+96891234567',
    opted_in_at: '2026-09-08T10:00:00.000Z',
  },
};

describe('WhatsApp marketing permission evidence', () => {
  it('accepts a verified, purpose-bound opt-in for the exact recipient', () => {
    expect(evaluateWhatsAppMarketingPermission([validOptIn], recipient)).toMatchObject({
      allowed: true,
      reason: 'VERIFIED_OPT_IN',
      sourceType: 'WEBSITE_FORM',
      recipient: '96891234567',
    });
  });

  it('does not treat a public WhatsApp number as opt-in evidence', () => {
    expect(evaluateWhatsAppMarketingPermission([], recipient))
      .toEqual({ allowed: false, reason: 'NO_OPT_IN_EVIDENCE' });
  });

  it('rejects unverified evidence and recipient mismatches', () => {
    expect(evaluateWhatsAppMarketingPermission([
      { ...validOptIn, verified_at: null },
    ], recipient)).toEqual({ allowed: false, reason: 'OPT_IN_NOT_VERIFIED' });

    expect(evaluateWhatsAppMarketingPermission([
      { ...validOptIn, value: { ...validOptIn.value, recipient: '+96899999999' } },
    ], recipient)).toEqual({ allowed: false, reason: 'OPT_IN_RECIPIENT_MISMATCH' });
  });

  it('lets the latest opt-out override older opt-in evidence', () => {
    const optOut = {
      field_name: WHATSAPP_MARKETING_OPT_OUT_FIELD,
      source_type: 'CUSTOMER_WHATSAPP_MESSAGE',
      retrieved_at: '2026-09-08T11:00:00.000Z',
      verified_at: '2026-09-08T11:00:00.000Z',
      value: { recipient: '+96891234567' },
    };
    expect(evaluateWhatsAppMarketingPermission([validOptIn, optOut], recipient))
      .toEqual({ allowed: false, reason: 'LATEST_PERMISSION_IS_OPT_OUT' });
  });
});
