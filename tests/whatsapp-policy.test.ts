import { describe, expect, it } from 'vitest';
import { evaluateWhatsAppSendPolicy } from '../lib/whatsapp/policy';

describe('WhatsApp customer service window policy', () => {
  const now = new Date('2026-08-22T00:00:00Z');

  it('allows free-form replies within 24 hours of the customer message', () => {
    const result = evaluateWhatsAppSendPolicy({
      now,
      lastCustomerMessageAt: '2026-08-21T12:00:00Z',
    });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('FREEFORM');
  });

  it('blocks free-form outbound outside the 24-hour window', () => {
    const result = evaluateWhatsAppSendPolicy({
      now,
      lastCustomerMessageAt: '2026-08-20T12:00:00Z',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('OUTSIDE_24H_WINDOW_TEMPLATE_REQUIRED');
  });

  it('allows an approved template path outside the 24-hour window', () => {
    const result = evaluateWhatsAppSendPolicy({
      now,
      templateName: 'business_intro_om',
    });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('TEMPLATE');
  });
});
