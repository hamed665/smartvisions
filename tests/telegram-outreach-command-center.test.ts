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
  });

  it('supports explicit slash commands', () => {
    expect(parseTelegramOwnerCommand('/email OM 10 dental clinic')).toEqual({
      type: 'SET_DAILY_EMAIL_OUTREACH',
      countryCode: 'OM',
      targetCount: 10,
      industry: 'dental clinic',
    });
  });

  it('keeps report questions read-only and market-scoped', () => {
    expect(parseTelegramOwnerCommand('چند تا ایمیل دادی؟')).toEqual({ type: 'SHOW_OUTREACH_REPORT', countryCode: undefined });
    expect(parseTelegramOwnerCommand('گزارش ایمیل عمان')).toEqual({ type: 'SHOW_OUTREACH_REPORT', countryCode: 'OM' });
    expect(parseTelegramOwnerCommand('/outreach_status AE')).toEqual({ type: 'SHOW_OUTREACH_REPORT', countryCode: 'AE' });
  });

  it('requires confirmation for daily email mutation', () => {
    expect(MUTATING_COMMANDS.has('SET_DAILY_EMAIL_OUTREACH')).toBe(true);
    expect(MUTATING_COMMANDS.has('SHOW_OUTREACH_REPORT')).toBe(false);
  });
});
