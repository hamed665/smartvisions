export type DailyOutreachProgressInput = {
  target: number;
  sent: number;
  pending: number;
  eligible: number;
};

export type DailyOutreachStatus = 'COMPLETE' | 'IN_PROGRESS' | 'BUILDING_PIPELINE' | 'NOT_STARTED';

const OMAN_OFFSET = '+04:00';

function boundedNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function omanDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Muscat',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function omanDayUtcRange(now = new Date()) {
  const dateKey = omanDateKey(now);
  const start = new Date(`${dateKey}T00:00:00${OMAN_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateKey, startIso: start.toISOString(), endIso: end.toISOString() };
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
