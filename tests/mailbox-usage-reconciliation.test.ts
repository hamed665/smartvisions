import { describe, expect, it } from 'vitest';
import { effectiveMailboxSendCount, mailboxUsageWindowStart } from '@/lib/outreach/mailbox-usage';

describe('mailbox usage reconciliation', () => {
  it('deduplicates application ledger and provider sent evidence', () => {
    expect(effectiveMailboxSendCount({
      ledgerRows: [
        { id: 'a', provider_message_id: 'provider-1' },
        { id: 'b', provider_message_id: 'provider-2' },
      ],
      providerSentEvents: [
        { provider_message_id: 'provider-1' },
        { provider_message_id: 'provider-2' },
      ],
    })).toBe(2);
  });

  it('counts a provider-confirmed send missing from the application ledger', () => {
    expect(effectiveMailboxSendCount({
      ledgerRows: [{ id: 'a', provider_message_id: 'provider-1' }],
      providerSentEvents: [{ provider_message_id: 'provider-1' }, { provider_message_id: 'provider-2' }],
    })).toBe(2);
  });

  it('keeps a ledger send without provider id quota-relevant', () => {
    expect(effectiveMailboxSendCount({
      ledgerRows: [{ id: 'a', provider_message_id: null }],
      providerSentEvents: [],
    })).toBe(1);
  });

  it('deduplicates replayed provider sent events by provider message id', () => {
    expect(effectiveMailboxSendCount({
      ledgerRows: [],
      providerSentEvents: [{ provider_message_id: 'provider-1' }, { provider_message_id: 'provider-1' }],
    })).toBe(1);
  });

  it('uses a rolling 24-hour quota window', () => {
    expect(mailboxUsageWindowStart(new Date('2026-09-07T02:00:00.000Z'))).toBe('2026-09-06T02:00:00.000Z');
  });
});
