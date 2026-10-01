import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  provisionMetaWhatsAppBinding,
  safeMetaWhatsAppProvisioningError,
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
            platform_type: 'CLOUD_API',
            code_verification_status: 'VERIFIED',
          }],
        }), { status: 200 });
      }
      if (url.includes('/waba-1/subscribed_apps')) {
        expect(init?.method ?? 'GET').toBe('GET');
        return new Response(JSON.stringify({ data: [{ id: 'app-1', name: 'Smart Visions' }] }), { status: 200 });
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
      platformType: 'CLOUD_API',
      codeVerificationStatus: 'VERIFIED',
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

  it('does not leak arbitrary provider details', () => {
    expect(safeMetaWhatsAppProvisioningError(new Error('provider token secret detail')))
      .not.toContain('provider token secret detail');
  });
});
