import { DateTime } from 'luxon';
import marketsJson from '@/lib/config/markets.json';
import type { MarketCode } from './scheduler';

export const SUPPORTED_MARKET_CODES = ['OM', 'AE', 'SA', 'QA', 'GB', 'US', 'CA'] as const;
export type SupportedMarketCode = (typeof SUPPORTED_MARKET_CODES)[number];

type OperationalProfile = {
  defaultCity: string;
  accountingTimezone: string;
};

const OPERATING_PROFILES: Record<SupportedMarketCode, OperationalProfile> = {
  OM: { defaultCity: 'Muscat', accountingTimezone: 'Asia/Muscat' },
  AE: { defaultCity: 'Dubai', accountingTimezone: 'Asia/Dubai' },
  SA: { defaultCity: 'Riyadh', accountingTimezone: 'Asia/Riyadh' },
  QA: { defaultCity: 'Doha', accountingTimezone: 'Asia/Qatar' },
  GB: { defaultCity: 'London', accountingTimezone: 'Europe/London' },
  US: { defaultCity: 'New York', accountingTimezone: 'America/New_York' },
  CA: { defaultCity: 'Toronto', accountingTimezone: 'America/Toronto' },
};

export function isSupportedMarketCode(value: unknown): value is SupportedMarketCode {
  return SUPPORTED_MARKET_CODES.includes(String(value ?? '').trim().toUpperCase() as SupportedMarketCode);
}

export function getMarketOperationalProfile(value: string): OperationalProfile & { marketCode: SupportedMarketCode } {
  const marketCode = String(value ?? '').trim().toUpperCase();
  if (!isSupportedMarketCode(marketCode) || !marketsJson[marketCode as MarketCode]) {
    throw new Error(`Unsupported market: ${marketCode || '(empty)'}`);
  }
  return { marketCode, ...OPERATING_PROFILES[marketCode] };
}

export function marketDateKey(marketCode: string, now = new Date()) {
  const { accountingTimezone } = getMarketOperationalProfile(marketCode);
  const local = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(accountingTimezone);
  if (!local.isValid) throw new Error(`Invalid accounting timezone for ${marketCode}`);
  return local.toISODate() ?? '';
}

export function marketDayUtcRange(marketCode: string, now = new Date()) {
  const { accountingTimezone } = getMarketOperationalProfile(marketCode);
  const local = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(accountingTimezone);
  if (!local.isValid) throw new Error(`Invalid accounting timezone for ${marketCode}`);
  const start = local.startOf('day');
  const end = start.plus({ days: 1 });
  return {
    dateKey: start.toISODate() ?? '',
    timezone: accountingTimezone,
    startIso: start.toUTC().toISO()!,
    endIso: end.toUTC().toISO()!,
  };
}

export function resolveMarketSendTimezone(input: {
  marketCode: string;
  configuredTimezone?: string | null;
  leadTimezone?: string | null;
}) {
  const profile = getMarketOperationalProfile(input.marketCode);
  const configured = String(input.configuredTimezone ?? '').trim();
  if (configured && configured !== 'lead_specific') return configured;
  const lead = String(input.leadTimezone ?? '').trim();
  return lead || profile.accountingTimezone;
}
