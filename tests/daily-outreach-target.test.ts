import { describe, expect, it } from 'vitest';
import { calculateDailyOutreachProgress, omanDateKey, omanDayUtcRange } from '@/lib/outreach/daily-target';

describe('daily outreach target', () => {
  it('counts only real sends toward completion', () => {
    expect(calculateDailyOutreachProgress({ target: 30, sent: 7, pending: 5, eligible: 20 })).toEqual({
      target: 30,
      sent: 7,
      pending: 5,
      eligible: 20,
      remaining: 23,
      progressPct: 23,
      status: 'IN_PROGRESS',
    });
  });

  it('does not subtract pending approvals from remaining sends', () => {
    const progress = calculateDailyOutreachProgress({ target: 30, sent: 0, pending: 12, eligible: 12 });
    expect(progress.remaining).toBe(30);
    expect(progress.status).toBe('IN_PROGRESS');
  });

  it('shows pipeline building when no safe recipient is channel-ready', () => {
    expect(calculateDailyOutreachProgress({ target: 30, sent: 0, pending: 0, eligible: 0 }).status).toBe('BUILDING_PIPELINE');
  });

  it('completes only when actual sent count reaches the target', () => {
    const progress = calculateDailyOutreachProgress({ target: 30, sent: 30, pending: 4, eligible: 40 });
    expect(progress.status).toBe('COMPLETE');
    expect(progress.remaining).toBe(0);
    expect(progress.progressPct).toBe(100);
  });

  it('uses the Muscat calendar day and fixed Oman UTC+4 boundary', () => {
    const now = new Date('2026-09-05T22:30:00.000Z');
    expect(omanDateKey(now)).toBe('2026-09-06');
    expect(omanDayUtcRange(now)).toEqual({
      dateKey: '2026-09-06',
      startIso: '2026-09-05T20:00:00.000Z',
      endIso: '2026-09-06T20:00:00.000Z',
    });
  });
});
