import { describe, expect, it } from 'vitest';
import { MUTATING_COMMANDS } from '@/lib/telegram/contracts';
import { parseTelegramOwnerCommand } from '@/lib/telegram/parser';
import { isOperationalDailyCampaign, operationalCampaignLine, operationalCampaignWindow } from '@/lib/telegram/outreach-command-center';

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


  it('excludes stale and non-outreach RUNNING records from operational totals', () => {
    const base = {
      id: 'campaign-1',
      name: 'Daily Oman',
      country_code: 'OM',
      city: 'Muscat',
      industry: null,
      target_count: 10,
      status: 'RUNNING',
    };
    expect(isOperationalDailyCampaign({
      ...base,
      config: { dailyOutreachTarget: true, outreachEnabled: true, targetDate: '2026-09-10' },
    }, '2026-09-10')).toBe(true);
    expect(isOperationalDailyCampaign({
      ...base,
      config: { dailyOutreachTarget: false, outreachEnabled: false, targetDate: '2026-09-10' },
    }, '2026-09-10')).toBe(false);
    expect(isOperationalDailyCampaign({
      ...base,
      config: { dailyOutreachTarget: true, outreachEnabled: true, targetDate: '2026-09-09' },
    }, '2026-09-10')).toBe(false);
  });


  it('marks an Oman campaign closed after its local send window', () => {
    const campaign = {
      id: 'campaign-1',
      name: 'Daily Oman',
      country_code: 'OM',
      city: 'Muscat',
      industry: null,
      target_count: 10,
      status: 'RUNNING',
      config: {
        dailyOutreachTarget: true,
        outreachEnabled: true,
        targetDate: '2026-09-10',
        agentWindowStart: '09:00',
        agentWindowEnd: '19:00',
        agentWindowTimezone: 'Asia/Muscat',
      },
    };
    expect(operationalCampaignWindow(campaign, new Date('2026-09-10T19:10:00Z'))).toMatchObject({
      state: 'CLOSED',
      timezone: 'Asia/Muscat',
      start: '09:00',
      end: '19:00',
    });
    expect(operationalCampaignLine(
      campaign,
      { sent: 1, delivered: 1, bounced: 0, replies: 0 },
      new Date('2026-09-10T19:10:00Z'),
    )).toContain('remaining 9 · window CLOSED');
  });

  it('renders campaign-attributed progress instead of copying an aggregate', () => {
    const campaign = {
      id: 'campaign-1',
      name: 'Daily Oman',
      country_code: 'OM',
      city: 'Muscat',
      industry: 'dental',
      target_count: 10,
      status: 'RUNNING',
      config: { lastEvidenceReason: 'NO_ADVANCEABLE_EVIDENCE_CANDIDATE' },
    };
    expect(operationalCampaignLine(campaign, { sent: 1, delivered: 1, bounced: 0, replies: 0 }))
      .toContain('1/10 · delivered 1 · bounce 0 · reply 0');
  });

  it('requires confirmation for daily email mutation', () => {
    expect(MUTATING_COMMANDS.has('SET_DAILY_EMAIL_OUTREACH')).toBe(true);
    expect(MUTATING_COMMANDS.has('SHOW_OUTREACH_REPORT')).toBe(false);
  });
});