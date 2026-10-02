import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  normalizeMetaWhatsAppRegistrationPin,
  provisionMetaWhatsAppBinding,
  readMetaWhatsAppBindingHealth,
  registerMetaWhatsAppPhone,
  safeMetaWhatsAppProvisioningError,
  unsubscribeMetaWhatsAppBinding,
} from '@/lib/whatsapp/meta-provisioning';

describe('Meta WhatsApp provisioning reconciler', () => {
  it('returns existing provider subscription without re-subscribing', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/waba-1/phone_numbers')) {
        return new Response(JSON.stringify({
          data: [{
            id: 'phone-1',
            display_phone_number: '+96890000000',
            verified_name: 'Clinic',
            quality_rating: 'GREEN',
          }],
        }), { status: 200 });
      }
      if (url.includes('/waba-1/subscribed_apps')) {
        expect(init?.method ?? 'GET').toBe('GET');
        return new Response(JSON.stringify({
          data: [{ whatsapp_business_api_data: { id: 'app-1', name: 'Smart Visions' } }],
        }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(provisionMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).resolves.toMatchObject({
      subscriptionConfirmed: true,
      subscriptionCreated: false,
      displayPhoneNumber: '+96890000000',
      verifiedName: 'Clinic',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('subscribes once and then reconciles provider truth', async () => {
    let subscribed = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/waba-1/phone_numbers')) {
        return new Response(JSON.stringify({ data: [{ id: 'phone-1' }] }), { status: 200 });
      }
      if (url.includes('/waba-1/subscribed_apps') && (init?.method ?? 'GET') === 'POST') {
        subscribed = true;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/waba-1/subscribed_apps')) {
        return new Response(JSON.stringify({ data: subscribed ? [{ id: 'app-1' }] : [] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(provisionMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).resolves.toMatchObject({
      subscriptionConfirmed: true,
      subscriptionCreated: true,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('recovers from an ambiguous subscribe response when readback confirms success', async () => {
    let reads = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/waba-1/phone_numbers')) {
        return new Response(JSON.stringify({ data: [{ id: 'phone-1' }] }), { status: 200 });
      }
      if (url.includes('/waba-1/subscribed_apps') && (init?.method ?? 'GET') === 'POST') {
        return new Response(JSON.stringify({ error: { message: 'timeout after provider commit' } }), { status: 500 });
      }
      if (url.includes('/waba-1/subscribed_apps')) {
        reads += 1;
        return new Response(JSON.stringify({ data: reads > 1 ? [{ id: 'app-1' }] : [] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(provisionMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).resolves.toMatchObject({
      subscriptionConfirmed: true,
      subscriptionCreated: false,
    });
  });

  it('fails closed when selected phone is no longer on the WABA', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: 'phone-2' }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(provisionMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).rejects.toThrow('no longer assigned');
  });

  it('rejects untrusted provider pagination during provisioning', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/waba-1/phone_numbers')) {
        return new Response(JSON.stringify({
          data: [],
          paging: { next: 'https://evil.example/steal-token' },
        }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(provisionMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).rejects.toThrow('untrusted pagination URL');
  });

  it('registers a new Cloud API phone with a bounded 6-digit PIN', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/phone-1/register');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toEqual({ messaging_product: 'whatsapp', pin: '482615' });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(registerMetaWhatsAppPhone({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      phoneNumberId: 'phone-1',
      pin: '482615',
      fetchImpl,
    })).resolves.toEqual({ registered: true });

    expect(normalizeMetaWhatsAppRegistrationPin('482615')).toBe('482615');
    expect(normalizeMetaWhatsAppRegistrationPin('12345')).toBeNull();
    expect(normalizeMetaWhatsAppRegistrationPin('1234567')).toBeNull();
    expect(normalizeMetaWhatsAppRegistrationPin('12a456')).toBeNull();
  });

  it('does not leak arbitrary provider details', () => {
    expect(safeMetaWhatsAppProvisioningError(new Error('provider token secret detail')))
      .not.toContain('provider token secret detail');
  });

  it('verifies phone membership and webhook subscription without mutating Meta', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.method ?? 'GET').toBe('GET');
      if (url.includes('/waba-1/phone_numbers')) {
        return new Response(JSON.stringify({
          data: [{ id: 'phone-1', display_phone_number: '+96890000000', quality_rating: 'GREEN' }],
        }), { status: 200 });
      }
      if (url.includes('/waba-1/subscribed_apps')) {
        return new Response(JSON.stringify({ data: [{ id: 'app-1' }] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(readMetaWhatsAppBindingHealth({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).resolves.toMatchObject({
      displayPhoneNumber: '+96890000000',
      qualityRating: 'GREEN',
      subscriptionConfirmed: true,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('classifies an invalid or revoked Meta credential without leaking provider detail', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 190, message: 'sensitive provider token detail' },
    }), { status: 401 })) as unknown as typeof fetch;

    await expect(readMetaWhatsAppBindingHealth({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      fetchImpl,
    })).rejects.toMatchObject({
      kind: 'INVALID_OR_REVOKED',
      message: 'Meta WhatsApp credential is invalid or revoked',
    });
  });

  it('treats an already-unsubscribed WABA as an idempotent disconnect without DELETE', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(unsubscribeMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      fetchImpl,
    })).resolves.toEqual({ unsubscribed: true, mutationPerformed: false });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reconciles an ambiguous WABA unsubscribe from provider readback instead of retrying DELETE', async () => {
    let getCount = 0;
    let deleteCount = 0;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        deleteCount += 1;
        return new Response(JSON.stringify({ error: { message: 'timeout after provider commit' } }), { status: 500 });
      }
      getCount += 1;
      return new Response(JSON.stringify({
        data: getCount === 1 ? [{ id: 'app-1' }] : [],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(unsubscribeMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      fetchImpl,
    })).resolves.toEqual({ unsubscribed: true, mutationPerformed: true });

    expect(deleteCount).toBe(1);
    expect(getCount).toBe(2);
  });

  it('fails closed when WABA unsubscribe cannot be confirmed and never blindly retries DELETE', async () => {
    let deleteCount = 0;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        deleteCount += 1;
        return new Response(JSON.stringify({ error: { message: 'provider timeout' } }), { status: 500 });
      }
      return new Response(JSON.stringify({ data: [{ id: 'app-1' }] }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(unsubscribeMetaWhatsAppBinding({
      graphVersion: 'v23.0',
      accessToken: 'token-with-enough-length-123456789',
      appId: 'app-1',
      wabaId: 'waba-1',
      fetchImpl,
    })).rejects.toMatchObject({ kind: 'UNCONFIRMED' });

    expect(deleteCount).toBe(1);
  });
});
