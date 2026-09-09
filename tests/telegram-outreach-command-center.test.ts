import { describe, expect, it } from 'vitest';
import { MUTATING_COMMANDS } from '@/lib/telegram/contracts';
import { parseTelegramOwnerCommand } from '@/lib/telegram/parser';

describe('Telegram outreach command center', () => {
  it('parses Persian daily email commands with Persian digits', () => {
    expect(parseTelegramOwnerCommand('امروز ۱۰ تا ایمیل عمان برای dental شروع کن')).toEqual({
      type: 'SET_DAILY_EMAIL_OUTREACH',
      countryCode: 'OM',
      targetCount: 10,
      industry: 'dental',
    });
    expect(parseTelegramOwnerCommand('امروز ۲۰ تا ایمیل امارات برای beauty clinic شروع کن')).toEqual({
      type: 'SET_DAILY_EMAIL_OUTREACH',
      countryCode: 'AE',
      targetCount: 20,
      industry: 'beauty clinic',
    });
    expect(parseTelegramOwnerCommand('امروز ۱۲ تا ایمیل کانادا برای restaurant شروع کن')).toEqual({
      type: 'SET_DAILY_EMAIL_OUTREACH',
      countryCode: 'CA',
      targetCount: 12,
      industry: 'restaurant',
    });
  });

  it('supports explicit slash commands and full country aliases', () => {
    expect(parseTelegramOwnerCommand('/email OM 10 dental clinic')).toEqual({
      type: 'SET_DAILY_EMAIL_OUTREACH',
      countryCode: 'OM',
      targetCount: 10,
      industry: 'dental clinic',
    });
    expect(parseTelegramOwnerCommand('/email Canada 8 salon')).toEqual({
      type: 'SET_DAILY_EMAIL_OUTREACH',
      countryCode: 'CA',
      targetCount: 8,
      industry: 'salon',
    });
  });

  it('keeps report questions read-only and market-scoped', () => {
    expect(parseTelegramOwnerCommand('چند تا ایمیل دادی؟')).toEqual({ type: 'SHOW_OUTREACH_REPORT', countryCode: undefined });
    expect(parseTelegramOwnerCommand('گزارش ایمیل عمان')).toEqual({ type: 'SHOW_OUTREACH_REPORT', countryCode: 'OM' });
    expect(parseTelegramOwnerCommand('گزارش ایمیل کانادا')).toEqual({ type: 'SHOW_OUTREACH_REPORT', countryCode: 'CA' });
    expect(parseTelegramOwnerCommand('/outreach_status AE')).toEqual({ type: 'SHOW_OUTREACH_REPORT', countryCode: 'AE' });
  });

  it('requires confirmation for daily email mutation', () => {
    expect(MUTATING_COMMANDS.has('SET_DAILY_EMAIL_OUTREACH')).toBe(true);
    expect(MUTATING_COMMANDS.has('SHOW_OUTREACH_REPORT')).toBe(false);
  });
});