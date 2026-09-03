import type { SupabaseClient } from '@supabase/supabase-js';

export const MAILBOX_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function mailboxUsageWindowStart(now = new Date()) {
  return new Date(now.getTime() - MAILBOX_USAGE_WINDOW_MS).toISOString();
}

export async function countMailboxSendsLast24Hours(input: {
  supabase: SupabaseClient;
  organizationId: string;
  mailboxId: string;
  now?: Date;
}) {
  const { count, error } = await input.supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', input.organizationId)
    .eq('mailbox_id', input.mailboxId)
    .eq('channel', 'EMAIL')
    .eq('direction', 'OUTBOUND')
    .not('sent_at', 'is', null)
    .gte('sent_at', mailboxUsageWindowStart(input.now));
  if (error) throw new Error(`Mailbox usage lookup failed: ${error.message}`);
  return Math.max(0, Number(count ?? 0));
}
