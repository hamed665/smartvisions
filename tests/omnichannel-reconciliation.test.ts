import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_CHANNEL_DESCRIPTOR,
  WHATSAPP_CHANNEL_DESCRIPTOR,
  getChannelDescriptor,
  getChannelIntegrationIdentity,
  isActiveOmnichannelChannel,
} from '@/lib/omnichannel';
import { approvedSendFailureDisposition } from '@/lib/outreach/approved-send-policy';

const outreachMigration = readFileSync(
  new URL('../supabase/migrations/0067_outreach_provider_message_reconciliation.sql', import.meta.url),
  'utf8',
);

const emailEventsMigration = readFileSync(
  new URL('../supabase/migrations/0030_email_provider_events.sql', import.meta.url),
  'utf8',
);

const whatsappMigration = readFileSync(
  new URL('../supabase/migrations/0004_ai_sales_preview_whatsapp.sql', import.meta.url),
  'utf8',
);

const approvedSendRoute = readFileSync(
  new URL('../app/api/outreach/approved-send/route-core.ts', import.meta.url),
  'utf8',
);

describe('Business OS omnichannel reconciliation contract', () => {
  it('resolves only production-proven integration identities', () => {
    expect(isActiveOmnichannelChannel('EMAIL')).toBe(true);
    expect(isActiveOmnichannelChannel('WHATSAPP')).toBe(true);
    expect(isActiveOmnichannelChannel('INSTAGRAM')).toBe(false);
    expect(isActiveOmnichannelChannel(null)).toBe(false);

    expect(getChannelIntegrationIdentity('EMAIL')).toEqual({
      provider: 'EMAIL_PROVIDER',
      channel: 'EMAIL',
    });
    expect(getChannelIntegrationIdentity('WHATSAPP')).toEqual({
      provider: 'META',
      channel: 'WHATSAPP',
    });
    expect(getChannelIntegrationIdentity('INSTAGRAM')).toBeNull();
    expect(getChannelDescriptor('SMS')).toBeNull();
  });

  it('keeps approved-send provider lookup on the shared channel registry', () => {
    expect(approvedSendRoute).toContain(
      'const providerIdentity = getChannelIntegrationIdentity(message.channel);',
    );
    expect(approvedSendRoute).not.toContain(
      "message.channel === 'EMAIL'\n    ? { provider: 'EMAIL_PROVIDER'",
    );
  });

  it('matches the durable shared provider-message uniqueness boundary', () => {
    expect(outreachMigration).toContain(
      'on public.outreach_messages (organization_id, provider_message_id)',
    );

    for (const descriptor of [EMAIL_CHANNEL_DESCRIPTOR, WHATSAPP_CHANNEL_DESCRIPTOR]) {
      expect(descriptor.reconciliation.messageLedger).toBe('outreach_messages');
      expect(descriptor.reconciliation.providerMessageUniqueness)
        .toBe('organization_id+provider_message_id');
    }
  });

  it('matches the durable Email provider-event dedupe key', () => {
    expect(emailEventsMigration).toContain(
      'unique (organization_id, provider, provider_event_id)',
    );
    expect(EMAIL_CHANNEL_DESCRIPTOR.reconciliation).toMatchObject({
      providerEventJournal: 'email_events',
      providerEventDedupeKey: 'organization_id+provider+provider_event_id',
      statusAuthority: 'PROVIDER_WEBHOOK_JOURNAL',
    });
  });

  it('matches the durable WhatsApp provider-event dedupe key', () => {
    expect(whatsappMigration).toContain(
      'unique (organization_id, provider_message_id, direction, event_type)',
    );
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.reconciliation).toMatchObject({
      providerEventJournal: 'whatsapp_events',
      providerEventDedupeKey:
        'organization_id+provider_message_id+direction+event_type',
      statusAuthority: 'PROVIDER_WEBHOOK_JOURNAL',
    });
  });

  it('keeps accepted provider failures reconciliation-only and never blind retries', () => {
    const accepted = approvedSendFailureDisposition(true);
    const notAccepted = approvedSendFailureDisposition(false);

    for (const descriptor of [EMAIL_CHANNEL_DESCRIPTOR, WHATSAPP_CHANNEL_DESCRIPTOR]) {
      expect(descriptor.reconciliation.providerAcceptedPersistenceFailure)
        .toBe(accepted.retryPolicy);
      expect(descriptor.reconciliation.preAcceptanceFailure)
        .toBe(notAccepted.retryPolicy);
      expect(descriptor.reconciliation.ambiguousProviderResult).toBe('NO_BLIND_RETRY');
    }

    expect(accepted).toEqual({
      markFailed: false,
      httpStatus: 202,
      retryPolicy: 'RECONCILIATION_ONLY',
    });
    expect(notAccepted).toEqual({
      markFailed: true,
      httpStatus: 502,
      retryPolicy: 'NO_AUTOMATIC_RETRY',
    });
  });

  it('does not confuse integration identity with provider implementation identity', () => {
    expect(EMAIL_CHANNEL_DESCRIPTOR.integrationProvider).toBe('EMAIL_PROVIDER');
    expect(EMAIL_CHANNEL_DESCRIPTOR.provider).toBe('RESEND');
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.integrationProvider).toBe('META');
    expect(WHATSAPP_CHANNEL_DESCRIPTOR.provider).toBe('META_CLOUD');
  });
});
