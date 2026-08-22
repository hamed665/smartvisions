export interface FollowupPolicy {
  maxFollowups: number;
  delaysDays: number[];
  stopOnReply: boolean;
  stopOnUnsubscribe: boolean;
}

export const defaultFollowupPolicy: FollowupPolicy = {
  maxFollowups: 2,
  delaysDays: [3, 7],
  stopOnReply: true,
  stopOnUnsubscribe: true,
};

export function buildFollowupSchedule(input: {
  sentAt: Date;
  policy?: FollowupPolicy;
  hasReply?: boolean;
  unsubscribed?: boolean;
  humanTakeover?: boolean;
  won?: boolean;
  lost?: boolean;
  paused?: boolean;
}) {
  const policy = input.policy ?? defaultFollowupPolicy;
  const terminalOrManual = input.humanTakeover || input.won || input.lost || input.paused;
  if (terminalOrManual) return [];
  if ((policy.stopOnReply && input.hasReply) || (policy.stopOnUnsubscribe && input.unsubscribed)) return [];

  return policy.delaysDays
    .slice(0, policy.maxFollowups)
    .map((days, index) => ({
      sequence: index + 1,
      scheduledAt: new Date(input.sentAt.getTime() + days * 86_400_000).toISOString(),
    }));
}
