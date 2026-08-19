import { describe, expect, it } from 'vitest';
import { evaluateSendWindow } from '../lib/outreach/scheduler';
import { getQuote } from '../lib/outreach/pricing';
import { getLocaleProfile, chooseLanguage } from '../lib/outreach/locale';
import { buildFollowupSchedule } from '../lib/outreach/followups';
import { calculateIntentScore, classifyReply, extractReplySignals } from '../lib/outreach/replies';
import { buildMessagePlan } from '../lib/outreach/message-plan';
import { choosePreferredVariant } from '../lib/outreach/variants';
import { evaluateMailboxHealth } from '../lib/outreach/mailbox-health';

describe('outreach scheduler', () => {
  it('allows Oman messages during 09:00-19:00 local time', () => {
    const result = evaluateSendWindow({ marketCode: 'OM', nowUtc: new Date('2026-08-20T06:00:00Z') });
    expect(result.allowed).toBe(true); // 10:00 Muscat
  });

  it('queues Oman messages after 19:00 local time', () => {
    const result = evaluateSendWindow({ marketCode: 'OM', nowUtc: new Date('2026-08-20T15:00:00Z') });
    expect(result.allowed).toBe(false); // 19:00 Muscat is outside [09:00,19:00)
    expect(result.reason).toBe('outside_window');
  });

  it('requires a lead timezone for the US', () => {
    const result = evaluateSendWindow({ marketCode: 'US', nowUtc: new Date('2026-08-20T14:00:00Z') });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('timezone_unknown');
  });

  it('uses the lead-specific timezone in the US', () => {
    const result = evaluateSendWindow({ marketCode: 'US', leadTimezone: 'America/New_York', nowUtc: new Date('2026-08-20T14:00:00Z') });
    expect(result.allowed).toBe(true); // 10:00 New York in August
  });
});

describe('country pricing guard', () => {
  it('quotes configured OMR price', () => {
    const quote = getQuote({ serviceId: 'premium_bilingual_website', marketCode: 'OM' });
    expect(quote.allowed).toBe(true);
    expect(quote.currency).toBe('OMR');
    expect(quote.basePrice).toBe(249);
  });

  it('adds configured country-specific addons', () => {
    const quote = getQuote({ serviceId: 'business_website', marketCode: 'OM', addons: ['online_booking', 'extra_page'] });
    expect(quote.allowed).toBe(true);
    expect(quote.addonsTotal).toBe(55);
    expect(quote.basePrice).toBe(234);
  });

  it('requires human approval above auto discount ceiling', () => {
    const quote = getQuote({ serviceId: 'premium_bilingual_website', marketCode: 'OM', requestedDiscountPct: 8 });
    expect(quote.allowed).toBe(true);
    expect(quote.requiresHuman).toBe(true);
  });

  it('blocks discount beyond configured approval ceiling', () => {
    const quote = getQuote({ serviceId: 'premium_bilingual_website', marketCode: 'OM', requestedDiscountPct: 15 });
    expect(quote.allowed).toBe(false);
    expect(quote.reason).toBe('discount_above_configured_ceiling');
  });
});

describe('locale profiles', () => {
  it('uses Omani Arabic when Arabic is preferred in Oman', () => {
    expect(chooseLanguage({ marketCode: 'OM', preferredLanguage: 'ar' })).toBe('ar-OM');
    expect(getLocaleProfile('OM').dialect).toBe('omani');
  });

  it('uses British English for the UK', () => {
    expect(chooseLanguage({ marketCode: 'GB', detectedLanguage: 'en' })).toBe('en-GB');
    expect(getLocaleProfile('GB').tone).toBe('polite_understated');
  });
});

describe('reply intelligence', () => {
  it('detects a price and meeting reply as high intent', () => {
    const text = 'Sounds good. How much does it cost and can we have a call tomorrow?';
    const signals = extractReplySignals(text);
    const intent = calculateIntentScore(signals);
    expect(signals.askedPrice).toBe(true);
    expect(signals.askedMeeting).toBe(true);
    expect(intent.score).toBeGreaterThanOrEqual(50);
    expect(classifyReply(text)).toBe('meeting');
  });

  it('detects Arabic unsubscribe intent', () => {
    expect(classifyReply('لا تتواصل معي مرة ثانية')).toBe('unsubscribe');
  });
});

describe('follow-up policy', () => {
  it('builds day 3 and day 7 follow-ups', () => {
    const jobs = buildFollowupSchedule({ sentAt: new Date('2026-08-20T10:00:00Z') });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].sequence).toBe(1);
    expect(jobs[1].sequence).toBe(2);
  });

  it('stops follow-ups when a reply exists', () => {
    expect(buildFollowupSchedule({ sentAt: new Date(), hasReply: true })).toEqual([]);
  });
});

describe('message planning', () => {
  it('requires verified evidence before personalized outreach', () => {
    expect(() => buildMessagePlan({
      marketCode: 'AE',
      businessName: 'Example Clinic',
      evidence: [],
      recommendedOffer: 'premium_bilingual_website',
    })).toThrow(/verified business-specific observation/);
  });

  it('creates a concise localized plan with evidence', () => {
    const plan = buildMessagePlan({
      marketCode: 'SA',
      businessName: 'Example Dental',
      evidence: ['Mobile booking requires multiple steps'],
      recommendedOffer: 'premium_bilingual_website',
      preferredLanguage: 'ar',
    });
    expect(plan.language).toBe('ar-SA');
    expect(plan.dialect).toBe('saudi');
    expect(plan.evidence).toHaveLength(1);
  });
});

describe('controlled A/B testing', () => {
  it('does not choose a winner before minimum sample size', () => {
    const result = choosePreferredVariant([
      { variantKey: 'A', strategy: 'problem_first', sent: 20, replies: 5, positive: 3, hot: 1, won: 1 },
      { variantKey: 'B', strategy: 'direct_idea', sent: 20, replies: 7, positive: 5, hot: 2, won: 1 },
    ]);
    expect(result.preferred).toBeNull();
  });
});

describe('mailbox health', () => {
  it('blocks sending after daily limit', () => {
    const result = evaluateMailboxHealth({ enabled: true, dailyLimit: 20, sentToday: 20, bounceRate: 0.01, complaintRate: 0, providerHealthy: true });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toContain('DAILY_LIMIT_REACHED');
  });

  it('blocks unhealthy bounce rate', () => {
    const result = evaluateMailboxHealth({ enabled: true, dailyLimit: 20, sentToday: 5, bounceRate: 0.06, complaintRate: 0, providerHealthy: true });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toContain('BOUNCE_RATE_TOO_HIGH');
  });
});
