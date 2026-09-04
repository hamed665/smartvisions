import { describe, expect, it } from 'vitest';
import { executeAgent } from '@/lib/agents/executor';
import {
  detectHighConfidenceMessageLanguage,
  replyMatchesHighConfidenceMessageLanguage,
  resolveReplyLanguage,
} from '@/lib/outreach/locale';

describe('customer reply language policy', () => {
  it('recognizes short English customer turns without paying for language detection', () => {
    expect(detectHighConfidenceMessageLanguage('Hi')).toBe('en');
    expect(detectHighConfidenceMessageLanguage('Can you show me your website service?')).toBe('en');
    expect(detectHighConfidenceMessageLanguage('restaurant')).toBeUndefined();
    expect(detectHighConfidenceMessageLanguage('مرحبا')).toBeUndefined();
  });

  it('lets the current English message override an Oman Arabic market default', () => {
    expect(resolveReplyLanguage({
      message: 'Hi',
      primaryLocale: 'ar-OM',
      fallbackLocale: 'en',
      preferredLanguage: 'ar-OM',
    })).toBe('en');
  });

  it('keeps Oman market language only as a fallback when current language is not strongly known', () => {
    expect(resolveReplyLanguage({
      message: 'مرحبا',
      primaryLocale: 'ar-OM',
      fallbackLocale: 'en',
    })).toBe('ar-OM');
  });

  it('makes deterministic culture routing answer English Hi in English, not Omani Arabic', async () => {
    const result = await executeAgent('culture_locale', {
      message: 'Hi',
      language: 'ar-OM',
      marketLocaleStyle: {
        countryCode: 'OM',
        primaryLocale: 'ar-OM',
        fallbackLocale: 'en',
        dialect: 'omani',
        toneProfile: 'warm_short_business',
        dialectIntensity: 0.35,
        maxFirstTouchWords: 70,
        maxReplyWords: 120,
      },
    });
    expect(result.data).toMatchObject({ locale: 'en', dialect: null });
  });

  it('blocks an Arabic draft for a high-confidence English customer turn', () => {
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'Hi',
      replyLanguage: 'ar-OM',
      replyText: 'مرحباً! كيف نقدر نساعدك؟',
    })).toBe(false);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'Hi',
      replyLanguage: 'en',
      replyText: 'Hi! How can we help?',
    })).toBe(true);
  });
});
