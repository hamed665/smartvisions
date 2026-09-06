import type { SupabaseClient } from '@supabase/supabase-js';

export const MAILBOX_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function mailboxUsageWindowStart(now = new Date()) {
  return new Date(now.getTime() - MAILBOX_USAGE_WINDOW_MS).toISOString();
}

export function effectiveMailboxSendCount(input: {
  ledgerRows: Array<{ id?: string | null; provider_message_id?: string | null }>;
  providerSentEvents: Array<{ provider_message_id?: string | null }>;
}) {
  const providerIds = new Set<string>();
  let ledgerWithoutProviderId = 0;

  for (const row of input.ledgerRows) {
    const providerId = String(row.provider_message_id ?? '').trim();
    if (providerId) providerIds.add(providerId);
    else ledgerWithoutProviderId += 1;
  }
  for (const event of input.providerSentEvents) {
    const providerId = String(event.provider_message_id ?? '').trim();
    if (providerId) providerIds.add(providerId);
  }

  return providerIds.size + ledgerWithoutProviderId;
}

export async function countMailboxSendsLast24Hours(input: {
  supabase: SupabaseClient;
  organizationId: string;
  mailboxId: string;
  now?: Date;
}) {
  const windowStart = mailboxUsageWindowStart(input.now);
  const [ledgerResult, providerEventResult] = await Promise.all([
    input.supabase
      .from('outreach_messages')
      .select('id,provider_message_id')
      .eq('organization_id', input.organizationId)
      .eq('mailbox_id', input.mailboxId)
      .eq('channel', 'EMAIL')
      .eq('direction', 'OUTBOUND')
      .not('sent_at', 'is', null)
      .gte('sent_at', windowStart),
    input.supabase
      .from('email_events')
      .select('provider_message_id')
      .eq('organization_id', input.organizationId)
      .eq('event_type', 'email.sent')
      .not('provider_message_id', 'is', null)
      .gte('created_at', windowStart),
  ]);

  if (ledgerResult.error) throw new Error(`Mailbox usage lookup failed: ${ledgerResult.error.message}`);
  if (providerEventResult.error) throw new Error(`Email provider usage reconciliation failed: ${providerEventResult.error.message}`);

  // A provider-confirmed send is quota-relevant even if the application crashed after
  // provider acceptance but before outreach_messages persistence. Provider events do not
  // currently carry mailbox_id, so unmatched events are conservatively charged to this
  // mailbox. That can under-send in a future multi-mailbox setup, but it cannot over-send.
  return effectiveMailboxSendCount({
    ledgerRows: ledgerResult.data ?? [],
    providerSentEvents: providerEventResult.data ?? [],
  });
}
