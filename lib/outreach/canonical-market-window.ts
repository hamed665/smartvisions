import { DateTime } from 'luxon';

function parseTime(value: string) {
  const normalized = String(value).slice(0, 5);
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? { hour:Number(match[1]), minute:Number(match[2]), normalized } : null;
}

export function evaluateCanonicalMarketWindow(input: {
  marketEnabled: boolean;
  marketTimezone: string;
  leadTimezone?: string | null;
  start: string;
  end: string;
  nowUtc?: Date;
}) {
  if (!input.marketEnabled) return { allowed:false, reason:'market_disabled' as const };
  const start = parseTime(input.start), end = parseTime(input.end);
  if (!start || !end || start.normalized >= end.normalized) return { allowed:false, reason:'window_invalid' as const };
  const zone = input.marketTimezone === 'lead_specific' ? input.leadTimezone ?? null : input.marketTimezone;
  if (!zone) return { allowed:false, reason:'timezone_unknown' as const };
  const now = DateTime.fromJSDate(input.nowUtc ?? new Date(), {zone:'utc'}).setZone(zone);
  if (!now.isValid) return { allowed:false, reason:'timezone_invalid' as const };
  const startAt = now.set({hour:start.hour,minute:start.minute,second:0,millisecond:0});
  const endAt = now.set({hour:end.hour,minute:end.minute,second:0,millisecond:0});
  if (now >= startAt && now < endAt) return { allowed:true, reason:'inside_window' as const, localNow:now.toISO(), timezone:zone };
  const nextLocal = now < startAt ? startAt : startAt.plus({days:1});
  return { allowed:false, reason:'outside_window' as const, localNow:now.toISO(), timezone:zone, nextAllowedAtUtc:nextLocal.toUTC().toISO() };
}
