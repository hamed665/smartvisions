import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeResendWebhook, verifyResendWebhook } from '../lib/outreach/resend-webhook';

describe('Resend webhook verification', () => {
  it('accepts a current valid Svix signature and rejects stale signatures', () => {
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'mail_1' } });
    const id = 'msg_test_1';
    const timestamp = '1787389200';
    const key = Buffer.from('smartvisions-test-webhook-secret');
    const secret = `whsec_${key.toString('base64')}`;
    const digest = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
    const signature = `v1,${digest}`;
    const nowMs = Number(timestamp) * 1000;

    expect(verifyResendWebhook({ rawBody, id, timestamp, signature, secret, nowMs })).toBe(true);
    expect(verifyResendWebhook({ rawBody, id, timestamp, signature, secret, nowMs: nowMs + 10 * 60 * 1000 })).toBe(false);
  });
});

describe('Resend webhook normalization', () => {
  it('normalizes delivery metadata without inventing fields', () => {
    const event = normalizeResendWebhook({
      type: 'email.bounced',
      created_at: '2026-08-22T09:00:00.000Z',
      data: {
        email_id: 'mail_123',
        from: 'Smart Visions <sales@example.com>',
        to: ['lead@example.com'],
        subject: 'Website idea',
        bounce: { message: 'Mailbox unavailable' },
      },
    }, 'evt_123');

    expect(event).toMatchObject({
      eventId: 'evt_123',
      eventType: 'email.bounced',
      providerMessageId: 'mail_123',
      to: 'lead@example.com',
      bounceDetail: 'Mailbox unavailable',
    });
  });

  it('ignores non-email provider events', () => {
    expect(normalizeResendWebhook({ type: 'domain.updated', data: {} }, 'evt_2')).toBeNull();
  });
});
