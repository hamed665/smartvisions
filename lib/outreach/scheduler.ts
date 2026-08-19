import { DateTime } from 'luxon';
import marketsJson from '@/lib/config/markets.json';

export type MarketCode = keyof typeof marketsJson;

type MarketConfig = {
  timezone: string;
  sendWindow: { start: string; end: string };
  coldEmailEnabled: boolean;
};

function parseHm(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}

export function resolveTimezone(marketCode: MarketCode, leadTimezone?: string) {
  const market = marketsJson[marketCode] as MarketConfig;
  if (market.timezone === 'lead_specific') return leadTimezone ?? null;
  return market.timezone;
}

export function evaluateLocalWindow(input: {
  marketCode: MarketCode;
  nowUtc?: Date;
  leadTimezone?: string;
}) {
  const market = marketsJson[input.marketCode] as MarketConfig;
  const zone = resolveTimezone(input.marketCode, input.leadTimezone);
  if (!zone) return { allowed: false, reason: 'timezone_unknown' as const };

  const now = DateTime.fromJSDate(input.nowUtc ?? new Date(), { zone: 'utc' }).setZone(zone);
  if (!now.isValid) return { allowed: false, reason: 'timezone_invalid' as const };

  const start = parseHm(market.sendWindow.start);
  const end = parseHm(market.sendWindow.end);
  const startAt = now.set({ hour: start.hour, minute: start.minute, second: 0, millisecond: 0 });
  const endAt = now.set({ hour: end.hour, minute: end.minute, second: 0, millisecond: 0 });

  if (now >= startAt && now < endAt) {
    return { allowed: true, reason: 'inside_window' as const, localNow: now.toISO(), timezone: zone };
  }

  const nextLocal = now < startAt ? startAt : startAt.plus({ days: 1 });
  return {
    allowed: false,
    reason: 'outside_window' as const,
    localNow: now.toISO(),
    timezone: zone,
    nextAllowedAtUtc: nextLocal.toUTC().toISO(),
  };
}

export function evaluateSendWindow(input: {
  marketCode: MarketCode;
  nowUtc?: Date;
  leadTimezone?: string;
}) {
  const market = marketsJson[input.marketCode] as MarketConfig;
  if (!market.coldEmailEnabled) return { allowed: false, reason: 'market_disabled' as const };
  return evaluateLocalWindow(input);
}
