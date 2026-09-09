export type FollowupChannel = 'EMAIL' | 'WHATSAPP' | 'INSTAGRAM_HUMAN';

export interface FollowupPolicy {
  maxFollowups: number;
  delaysDays: number[];
  stopOnReply: boolean;
  stopOnUnsubscribe: boolean;
  stopOnSpam?: boolean;
}

export const emailFollowupPolicy: FollowupPolicy = {
  maxFollowups: 3,
  delaysDays: [3, 7, 14],
  stopOnReply: true,
  stopOnUnsubscribe: true,
  stopOnSpam: true,
};

export const whatsappFollowupPolicy: FollowupPolicy = {
  maxFollowups: 2,
  delaysDays: [2, 5],
  stopOnReply: true,
  stopOnUnsubscribe: true,
  stopOnSpam: true,
};

export const humanInstagramFollowupPolicy: FollowupPolicy = {
  maxFollowups: 0,
  delaysDays: [],
  stopOnReply: true,
  stopOnUnsubscribe: true,
  stopOnSpam: true,
};

// Legacy default remains email-shaped so existing callers do not silently change cadence.
export const defaultFollowupPolicy = emailFollowupPolicy;

export function followupPolicyForChannel(channel?: string | null): FollowupPolicy {
  const normalized = String(channel ?? '').trim().toUpperCase();
  if (normalized === 'WHATSAPP') return whatsappFollowupPolicy;
  if (normalized === 'INSTAGRAM' || normalized === 'INSTAGRAM_HUMAN') return humanInstagramFollowupPolicy;
  return emailFollowupPolicy;
}

export function buildFollowupSchedule(input: {
  sentAt: Date;
  channel?: FollowupChannel | 'INSTAGRAM';
  policy?: FollowupPolicy;
  hasReply?: boolean;
  unsubscribed?: boolean;
  spam?: boolean;
  humanTakeover?: boolean;
  won?: boolean;
  lost?: boolean;
  paused?: boolean;
}) {
  const policy = input.policy ?? followupPolicyForChannel(input.channel);
  const terminalOrManual = input.humanTakeover || input.won || input.lost || input.paused;
  if (terminalOrManual) return [];
  if (
    (policy.stopOnReply && input.hasReply)
    || (policy.stopOnUnsubscribe && input.unsubscribed)
    || (policy.stopOnSpam !== false && input.spam)
  ) return [];

  return policy.delaysDays
    .slice(0, policy.maxFollowups)
    .map((days, index) => ({
      sequence: index + 1,
      scheduledAt: new Date(input.sentAt.getTime() + days * 86_400_000).toISOString(),
    }));
}
