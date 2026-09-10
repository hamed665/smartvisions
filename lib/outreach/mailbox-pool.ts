import { mailboxWarmupAllowsAutomaticSend } from './controlled-email-auto-pilot';

export type MailboxPoolCandidate = {
  id: string;
  address?: string | null;
  enabled?: boolean | null;
  daily_limit?: number | null;
  warmup_status?: string | null;
  health_status?: string | null;
  sentLast24Hours: number;
};

export type MailboxPoolSelection = {
  id: string;
  address?: string | null;
  dailyLimit: number;
  sentLast24Hours: number;
  remaining: number;
  utilization: number;
};

export function selectAvailableMailbox(candidates: MailboxPoolCandidate[]): MailboxPoolSelection | null {
  const available = candidates.flatMap((mailbox) => {
    const dailyLimit = Math.max(0, Number(mailbox.daily_limit ?? 0));
    const sentLast24Hours = Math.max(0, Number(mailbox.sentLast24Hours ?? 0));
    if (
      !mailbox.id
      || mailbox.enabled !== true
      || String(mailbox.health_status ?? '').toUpperCase() !== 'HEALTHY'
      || !mailboxWarmupAllowsAutomaticSend(mailbox.warmup_status)
      || dailyLimit <= 0
      || sentLast24Hours >= dailyLimit
    ) return [];

    return [{
      id: mailbox.id,
      address: mailbox.address ?? null,
      dailyLimit,
      sentLast24Hours,
      remaining: dailyLimit - sentLast24Hours,
      utilization: sentLast24Hours / dailyLimit,
    }];
  });

  available.sort((left, right) =>
    left.utilization - right.utilization
    || left.sentLast24Hours - right.sentLast24Hours
    || right.remaining - left.remaining
    || left.id.localeCompare(right.id));
  return available[0] ?? null;
}
