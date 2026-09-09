import { describe, expect, it } from 'vitest';
import { getMarketOperationalProfile, isSupportedMarketCode, marketDayUtcRange } from '@/lib/outreach/market-profile';
import { getLocaleProfile } from '@/lib/outreach/locale';
import { buildCanonicalFirstTouchDraft } from '@/lib/outreach/message-plan';
import { verifyControlledEmailAutoPilot } from '@/lib/outreach/controlled-email-auto-pilot';
import { evaluateDailyAcquisitionPolicy } from '@/lib/operations/daily-acquisition-policy';
import type { MarketCode } from '@/lib/outreach/scheduler';

const markets: MarketCode[] = ['OM','AE','SA','QA','GB','US','CA'];
const evidence = ['cached deterministic website audit marks seo quality as weak/poor'];

describe('multi-market daily outreach', () => {
  it('supports all launch markets with deterministic defaults', () => {
    for (const code of markets) {
      expect(isSupportedMarketCode(code)).toBe(true);
      const profile = getMarketOperationalProfile(code);
      expect(profile.defaultCity.length).toBeGreaterThan(2);
      expect(marketDayUtcRange(code, new Date('2026-09-09T12:00:00Z')).dateKey).toMatch(/^2026-09-0[89]$/);
    }
    expect(getMarketOperationalProfile('US').defaultCity).toBe('New York');
    expect(getMarketOperationalProfile('CA').defaultCity).toBe('Toronto');
    expect(getLocaleProfile('CA').primaryLocale).toBe('en-CA');
  });

  it('preserves bilingual Oman and renders other markets in their selected local language', () => {
    const oman = buildCanonicalFirstTouchDraft({ marketCode: 'OM', businessName: 'Example Clinic', evidence, recommendedOffer: 'seo_growth' });
    expect(oman.plan.languageMode).toBe('BILINGUAL_FIRST_TOUCH');
    expect(oman.text).toContain('SEO performance');
    expect(oman.text).toContain('السيو في موقعكم يحتاج تحسين');

    for (const code of ['AE','SA','QA'] as MarketCode[]) {
      const draft = buildCanonicalFirstTouchDraft({ marketCode: code, businessName: 'Example Clinic', evidence, recommendedOffer: 'seo_growth', preferredLanguage: 'ar' });
      expect(draft.plan.languageMode).toBe('SINGLE_LANGUAGE');
      expect(String(draft.plan.language)).toMatch(/^ar-/);
      expect(draft.text).toContain('السيو في موقعكم يحتاج تحسين');
      expect(draft.text).not.toContain('SEO performance');
    }

    for (const code of ['GB','US','CA'] as MarketCode[]) {
      const draft = buildCanonicalFirstTouchDraft({ marketCode: code, businessName: 'Example Clinic', evidence, recommendedOffer: 'seo_growth' });
      expect(draft.plan.languageMode).toBe('SINGLE_LANGUAGE');
      expect(draft.text).toContain('SEO performance');
      expect(draft.text).not.toContain('السيو في موقعكم يحتاج تحسين');
    }
  });

  it('verifies a matching multi-market campaign and fails market mismatch closed', () => {
    const base = {
      messageStatus: 'APPROVED', requiresApproval: false, channel: 'EMAIL', metadataSource: 'SHADOW_MODE',
      providerMessageId: 'shadow:growth-first-touch:lead-1', idempotencyKey: 'growth-first-touch:lead-1',
      messageLeadId: 'lead-1', conversationLeadId: 'lead-1', conversationChannel: 'EMAIL',
      campaignStatus: 'RUNNING', currentMarketDateKey: '2026-09-09',
      campaignConfig: { marketCode:'US', targetDate:'2026-09-09', outreachMode:'CONTROLLED', dailyOutreachTarget:true, shadowModeRequired:true, outreachEnabled:true, autoApprovalEnabled:true, automatedSendingEnabled:true, manualReviewOnly:false, automationAuthorization:'OWNER_REQUESTED_FULL_AUTOMATION' },
    };
    expect(verifyControlledEmailAutoPilot({ ...base, marketCode:'US', campaignCountryCode:'US' }).verified).toBe(true);
    expect(verifyControlledEmailAutoPilot({ ...base, marketCode:'CA', campaignCountryCode:'US' }).verified).toBe(false);
  });

  it('allows only explicitly authorized controlled acquisition', () => {
    const config = { dailyOutreachTarget:true, autoAcquisitionEnabled:true, outreachMode:'CONTROLLED', shadowModeRequired:true, outreachEnabled:true, automatedSendingEnabled:true, automationAuthorization:'OWNER_REQUESTED_FULL_AUTOMATION' };
    expect(evaluateDailyAcquisitionPolicy({ status:'RUNNING', countryCode:'AE', config, shadowMode:true, globalKillSwitch:false, agentsPaused:false, emailPaused:false }).allowed).toBe(true);
    expect(evaluateDailyAcquisitionPolicy({ status:'RUNNING', countryCode:'CA', config, shadowMode:true, globalKillSwitch:true, agentsPaused:false, emailPaused:false }).allowed).toBe(false);
  });
});