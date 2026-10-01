import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  normalizeMetaWhatsAppConnectionMode,
  verifyMetaWhatsAppSelectedAssets,
} from '@/lib/whatsapp/meta-onboarding';

describe('Meta WhatsApp onboarding contract', () => {
  it('accepts only non-destructive supported modes', () => {
    expect(normalizeMetaWhatsAppConnectionMode('BUSINESS_APP_COEXISTENCE')).toBe('BUSINESS_APP_COEXISTENCE');
    expect(normalizeMetaWhatsAppConnectionMode('api_new_number')).toBe('API_NEW_NUMBER');
    expect(normalizeMetaWhatsAppConnectionMode('EXISTING_API_RECONNECT')).toBe('EXISTING_API_RECONNECT');
    expect(normalizeMetaWhatsAppConnectionMode('FULL_MIGRATION_FROM_BUSINESS_APP')).toBeNull();
    expect(normalizeMetaWhatsAppConnectionMode('DELETE_ACCOUNT')).toBeNull();
  });

  it('verifies the selected phone really belongs to the selected WABA', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/phone-1?')) return new Response(JSON.stringify({ id: 'phone-1', display_phone_number: '+96890000000', verified_name: 'Clinic' }), { status: 200 });
      if (url.includes('/waba-1?')) return new Response(JSON.stringify({ id: 'waba-1', name: 'Clinic WABA' }), { status: 200 });
      if (url.includes('/waba-1/phone_numbers')) return new Response(JSON.stringify({ data: [{ id: 'phone-1', display_phone_number: '+96890000000', verified_name: 'Clinic' }] }), { status: 200 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(verifyMetaWhatsAppSelectedAssets({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).resolves.toMatchObject({
      wabaName: 'Clinic WABA',
      displayPhoneNumber: '+96890000000',
      verifiedName: 'Clinic',
    });
  });

  it('rejects a phone that is valid but belongs to another WABA', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/phone-1?')) return new Response(JSON.stringify({ id: 'phone-1' }), { status: 200 });
      if (url.includes('/waba-1?')) return new Response(JSON.stringify({ id: 'waba-1' }), { status: 200 });
      if (url.includes('/waba-1/phone_numbers')) return new Response(JSON.stringify({ data: [{ id: 'phone-2' }] }), { status: 200 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(verifyMetaWhatsAppSelectedAssets({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).rejects.toThrow('not part of the selected WhatsApp Business Account');
  });

  it('rejects untrusted Meta pagination URLs', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/phone-1?')) return new Response(JSON.stringify({ id: 'phone-1' }), { status: 200 });
      if (url.includes('/waba-1?')) return new Response(JSON.stringify({ id: 'waba-1' }), { status: 200 });
      if (url.includes('/waba-1/phone_numbers')) return new Response(JSON.stringify({ data: [], paging: { next: 'https://evil.example/next' } }), { status: 200 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(verifyMetaWhatsAppSelectedAssets({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).rejects.toThrow('untrusted pagination URL');
  });
});
