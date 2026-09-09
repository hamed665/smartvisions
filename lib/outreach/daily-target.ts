import { marketDateKey, marketDayUtcRange } from './market-profile';

export type DailyOutreachProgressInput = {
  target: number;
  sent: number;
  pending: number;
  eligible: number;
};

export type DailyOutreachStatus = 'COMPLETE' | 'IN_PROGRESS' | 'BUILDING_PIPELINE' | 'NOT_STARTED';

function boundedNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export { marketDateKey, marketDayUtcRange };

// Compatibility aliases for existing Oman-specific callers. New code should use
// marketDateKey / marketDayUtcRange so accounting remains correct for every market.
export function omanDateKey(now = new Date()) {
  return marketDateKey('OM', now);
}

export function omanDayUtcRange(now = new Date()) {
  return marketDayUtcRange('OM', now);
}

export function calculateDailyOutreachProgress(input: DailyOutreachProgressInput) {
  const target = Math.max(1, boundedNonNegative(input.target));
  const sent = boundedNonNegative(input.sent);
  const pending = boundedNonNegative(input.pending);
  const eligible = boundedNonNegative(input.eligible);
  const remaining = Math.max(0, target - sent);
  const progressPct = Math.min(100, Math.round((sent / target) * 100));
  const status: DailyOutreachStatus = sent >= target
    ? 'COMPLETE'
    : sent > 0 || pending > 0
      ? 'IN_PROGRESS'
      : eligible > 0
        ? 'NOT_STARTED'
        : 'BUILDING_PIPELINE';

  return { target, sent, pending, eligible, remaining, progressPct, status };
}
