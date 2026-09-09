import { describe, expect, it } from 'vitest';
import { buildFollowupSchedule, followupPolicyForChannel } from '@/lib/outreach/followups';

const sentAt = new Date('2026-09-10T08:00:00.000Z');

describe('channel-aware follow-up policy', () => {
  it('uses email day 3, 7 and 14 cadence', () => {
    expect(buildFollowupSchedule({ sentAt, channel: 'EMAIL' }).map(item => item.scheduledAt)).toEqual([
      '2026-09-13T08:00:00.000Z',
      '2026-09-17T08:00:00.000Z',
      '2026-09-24T08:00:00.000Z',
    ]);
  });

  it('uses WhatsApp day 2 and 5 cadence only after a WhatsApp conversation exists', () => {
    expect(buildFollowupSchedule({ sentAt, channel: 'WHATSAPP' }).map(item => item.scheduledAt)).toEqual([
      '2026-09-12T08:00:00.000Z',
      '2026-09-15T08:00:00.000Z',
    ]);
  });

  it('does not automate Instagram human-acquisition follow-ups', () => {
    expect(followupPolicyForChannel('INSTAGRAM').maxFollowups).toBe(0);
    expect(buildFollowupSchedule({ sentAt, channel: 'INSTAGRAM' })).toEqual([]);
  });

  it.each([
    ['reply', { hasReply: true }],
    ['unsubscribe', { unsubscribed: true }],
    ['spam', { spam: true }],
    ['human takeover', { humanTakeover: true }],
    ['won', { won: true }],
    ['lost', { lost: true }],
    ['paused', { paused: true }],
  ])('stops all pending follow-ups on %s', (_label, terminal) => {
    expect(buildFollowupSchedule({ sentAt, channel: 'EMAIL', ...terminal })).toEqual([]);
    expect(buildFollowupSchedule({ sentAt, channel: 'WHATSAPP', ...terminal })).toEqual([]);
  });

  it('keeps legacy custom policies source-compatible while treating spam as a stop by default', () => {
    const legacyPolicy = { maxFollowups: 1, delaysDays: [4], stopOnReply: true, stopOnUnsubscribe: true };
    expect(buildFollowupSchedule({ sentAt, policy: legacyPolicy })).toHaveLength(1);
    expect(buildFollowupSchedule({ sentAt, policy: legacyPolicy, spam: true })).toEqual([]);
  });
});
