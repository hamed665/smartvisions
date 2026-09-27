import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractInstagramEvents, verifyMetaSignature } from '@/lib/instagram/webhook';

describe('Instagram webhook boundary', () => {
  it('normalizes messaging events with exact destination identity', () => {
    const events = extractInstagramEvents({
      object: 'instagram',
      entry: [{
        id: 'ig-business-1',
        messaging: [{
          sender: { id: 'customer-1' },
          recipient: { id: 'ig-business-1' },
          timestamp: 1_700_000_000_000,
          message: { mid: 'mid-1', text: 'hello' },
        }],
      }],
    });
    expect(events).toEqual([expect.objectContaining({
      providerEventId: 'ig-business-1:mid-1',
      destinationId: 'ig-business-1',
      senderId: 'customer-1',
      eventType: 'MESSAGE',
      payload: expect.objectContaining({ messageId: 'mid-1', text: 'hello' }),
    })]);
  });

  it('ignores a different Meta object instead of guessing', () => {
    expect(extractInstagramEvents({ object: 'whatsapp_business_account', entry: [] })).toEqual([]);
  });

  it('shares the existing Meta HMAC authenticity boundary', () => {
    const raw = JSON.stringify({ object: 'instagram', entry: [] });
    const secret = 'test-secret';
    const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifyMetaSignature(raw, sig, secret)).toBe(true);
    expect(verifyMetaSignature(raw, 'sha256=00', secret)).toBe(false);
  });
});
