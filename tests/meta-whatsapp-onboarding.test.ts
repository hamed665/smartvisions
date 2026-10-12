import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  discoverMetaWhatsAppPhoneNumber,
  exchangeMetaAuthorizationCode,
  normalizeMetaWhatsAppConnectionMode,
  safeMetaWhatsAppCompletionError,
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

  it('exchanges Meta authorization codes server-side without putting the App Secret in the URL', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://graph.facebook.com/v23.0/oauth/access_token');
      expect(url).not.toContain('client_secret');
      expect(url).not.toContain('secret-1');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      });
      const body = String(init?.body ?? '');
      expect(body).toContain('client_id=app-1');
      expect(body).toContain('client_secret=secret-1');
      expect(body).toContain('code=auth-code-1');
      return new Response(JSON.stringify({ access_token: 'token-with-enough-length-123456789' }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(exchangeMetaAuthorizationCode({
      code: 'auth-code-1',
      appId: 'app-1',
      appSecret: 'secret-1',
      fetchImpl,
    })).resolves.toBe('token-with-enough-length-123456789');
  });

  it('does not leak arbitrary provider errors to the setup participant', () => {
    expect(safeMetaWhatsAppCompletionError(new Error('provider secret detail'))).not.toContain('provider secret detail');
    expect(safeMetaWhatsAppCompletionError(
      new Error('Selected phone number is not part of the selected WhatsApp Business Account'),
    )).toContain('not part of the selected WhatsApp Business Account');
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

  it('discovers exactly one WhatsApp phone for Coexistence completion when Meta omits phone_number_id', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/waba-1/phone_numbers');
      return new Response(JSON.stringify({
        data: [{ id: 'phone-1', display_phone_number: '+96890000000', verified_name: 'Clinic' }],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(discoverMetaWhatsAppPhoneNumber({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      wabaId: 'waba-1',
      fetchImpl,
    })).resolves.toMatchObject({
      phoneNumberId: 'phone-1',
      displayPhoneNumber: '+96890000000',
      verifiedName: 'Clinic',
    });
  });

  it('fails closed when Coexistence completion cannot identify exactly one phone', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'phone-1' }, { id: 'phone-2' }],
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(discoverMetaWhatsAppPhoneNumber({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      wabaId: 'waba-1',
      fetchImpl,
    })).rejects.toThrow('exactly one WhatsApp phone number');
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
