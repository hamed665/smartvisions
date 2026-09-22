import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_CHANNEL_ADAPTERS,
  EMAIL_CHANNEL_DESCRIPTOR,
  WHATSAPP_CHANNEL_DESCRIPTOR,
  emailSemanticAdapter,
  whatsappSemanticAdapter,
} from '@/lib/omnichannel';

const adapterTypesSource = readFileSync(
  new URL('../lib/omnichannel/types.ts', import.meta.url),
  'utf8',
);

const adapterSource = readFileSync(
  new URL('../lib/omnichannel/adapters.ts', import.meta.url),
  'utf8',
);

describe('Business OS omnichannel semantic boundary', () => {
  it('exposes only the production-proven Email and WhatsApp adapters', () => {
    expect(Object.keys(ACTIVE_CHANNEL_ADAPTERS)).toEqual(['EMAIL', 'WHATSAPP']);
    expect(EMAIL_CHANNEL_DESCRIPTOR.provider).toBe('RESEND');
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.provider).toBe('META_CLOUD');
  });

  it('keeps outbound execution behind the canonical send gate', () => {
    expect(EMAIL_CHANNEL_DESCRIPTOR.outboundExecution).toBe('CANONICAL_SEND_GATE_ONLY');
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.outboundExecution).toBe('CANONICAL_SEND_GATE_ONLY');

    expect(adapterTypesSource).not.toMatch(/send\s*\(/);
    expect(adapterTypesSource).not.toContain('sendEmail');
    expect(adapterTypesSource).not.toContain('sendText');
    expect(adapterTypesSource).not.toContain('sendTemplate');
    expect(adapterSource).not.toContain('MetaCloudWhatsAppProvider');
    expect(adapterSource).not.toContain('ResendEmailProvider');
  });

  it('records the real outbound idempotency boundary instead of pretending providers are equal', () => {
    expect(EMAIL_CHANNEL_DESCRIPTOR.idempotency).toBe('APPLICATION_AND_PROVIDER');
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.idempotency).toBe('APPLICATION_CLAIM_ONLY');
  });

  it('keeps human priority explicit and does not invent native-app activity evidence', () => {
    for (const descriptor of [EMAIL_CHANNEL_DESCRIPTOR, WHATSAPP_CHANNEL_DESCRIPTOR]) {
      expect(descriptor.coexistence.humanPriority).toBe(true);
      expect(descriptor.coexistence.nativeProviderActivity).toBe('UNPROVEN');
      expect(descriptor.policy.humanTakeoverBlocksAutomation).toBe(true);
      expect(descriptor.policy.finalProviderBoundaryRecheckRequired).toBe(true);
    }
  });

  it('describes channel-specific capabilities without flattening provider differences', () => {
    expect(EMAIL_CHANNEL_DESCRIPTOR.supports).toMatchObject({
      inbound: true,
      text: true,
      html: true,
      subject: true,
      templates: false,
      catalogProduct: false,
      deliveryReceipts: true,
      readReceipts: false,
      providerThreadIdentity: true,
    });

    expect(WHATSAPP_CHANNEL_DESCRIPTOR.supports).toMatchObject({
      inbound: true,
      text: true,
      html: false,
      subject: false,
      templates: true,
      catalogProduct: true,
      deliveryReceipts: true,
      readReceipts: true,
      providerThreadIdentity: true,
    });
  });

  it('normalizes Resend inbound evidence without changing the durable provider identity', () => {
    const normalized = emailSemanticAdapter.normalizeInbound({
      eventId: 'evt_1',
      eventType: 'email.received',
      providerMessageId: 'email_1',
      occurredAt: '2026-09-22T10:20:00.000Z',
      from: 'customer@example.com',
      to: 'sales@example.com',
      subject: 'Hello',
      text: 'Need a quote',
      messageId: '<thread@example.com>',
      raw: {},
    });

    expect(normalized).toEqual({
      channel: 'EMAIL',
      provider: 'RESEND',
      providerMessageId: 'email_1',
      providerThreadId: '<thread@example.com>',
      occurredAt: '2026-09-22T10:20:00.000Z',
      from: 'customer@example.com',
      to: 'sales@example.com',
      contentType: 'TEXT',
      text: 'Need a quote',
      subject: 'Hello',
      metadata: {
        providerEventId: 'evt_1',
      },
    });
  });

  it('maps Resend delivery evidence to canonical statuses', () => {
    const cases = [
      ['email.scheduled', 'QUEUED'],
      ['email.sent', 'SENT'],
      ['email.delivered', 'DELIVERED'],
      ['email.bounced', 'BOUNCED'],
      ['email.complained', 'COMPLAINED'],
      ['email.failed', 'FAILED'],
      ['email.suppressed', 'SUPPRESSED'],
    ] as const;

    for (const [eventType, expected] of cases) {
      expect(emailSemanticAdapter.normalizeStatus({
        eventId: `evt_${eventType}`,
        eventType,
        providerMessageId: 'email_1',
        occurredAt: '2026-09-22T10:20:00.000Z',
        raw: {},
      })?.status).toBe(expected);
    }

    expect(emailSemanticAdapter.normalizeStatus({
      eventId: 'evt_received',
      eventType: 'email.received',
      providerMessageId: 'email_1',
      occurredAt: '2026-09-22T10:20:00.000Z',
      raw: {},
    })).toBeNull();
  });

  it('normalizes WhatsApp inbound/referral evidence without doing lifecycle work', () => {
    const normalized = whatsappSemanticAdapter.normalizeInbound({
      providerMessageId: 'wamid.1',
      from: '96890000000',
      timestamp: '1789986000',
      type: 'text',
      text: 'Hi',
      contactName: 'Customer',
      referral: {
        sourceType: 'ad',
        ctwaClid: 'ctwa-1',
      },
    });

    expect(normalized).toMatchObject({
      channel: 'WHATSAPP',
      provider: 'META_CLOUD',
      providerMessageId: 'wamid.1',
      from: '96890000000',
      contentType: 'TEXT',
      text: 'Hi',
      metadata: {
        providerType: 'text',
        contactName: 'Customer',
        referral: {
          sourceType: 'ad',
          ctwaClid: 'ctwa-1',
        },
      },
    });
  });

  it('maps WhatsApp delivery/read evidence to canonical statuses', () => {
    const cases = [
      ['sent', 'SENT'],
      ['delivered', 'DELIVERED'],
      ['read', 'READ'],
      ['failed', 'FAILED'],
      ['deleted', 'DELETED'],
      ['unknown', 'UNKNOWN'],
    ] as const;

    for (const [status, expected] of cases) {
      expect(whatsappSemanticAdapter.normalizeStatus({
        providerMessageId: 'wamid.1',
        status,
      }).status).toBe(expected);
    }
  });

  it('keeps provider policy differences explicit', () => {
    expect(EMAIL_CHANNEL_DESCRIPTOR.policy.replyPolicy).toBe('NONE');
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.policy.replyPolicy).toBe('WHATSAPP_24H_OR_TEMPLATE');
    expect(EMAIL_CHANNEL_DESCRIPTOR.policy.marketWindowRequired).toBe(true);
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.policy.marketWindowRequired).toBe(true);
  });
});
