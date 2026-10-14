import { describe, expect, it } from 'vitest';
import { executeAgent } from '@/lib/agents/executor';
import {
  detectHighConfidenceMessageLanguage,
  replyMatchesHighConfidenceMessageLanguage,
  resolveReplyLanguage,
} from '@/lib/outreach/locale';

describe('customer reply language policy', () => {
  it('recognizes supported customer languages without a provider call', () => {
    expect(detectHighConfidenceMessageLanguage('Hi')).toBe('en');
    expect(detectHighConfidenceMessageLanguage('مرحبا')).toBe('ar');
    expect(detectHighConfidenceMessageLanguage('قیمت چنده؟')).toBe('fa');
    expect(detectHighConfidenceMessageLanguage('آپ کیسے ہیں؟')).toBe('ur');
    expect(detectHighConfidenceMessageLanguage('वेबसाइट की कीमत क्या है?')).toBe('hi');
  });

  it('lets the current customer turn override a stale Oman language preference', () => {
    expect(resolveReplyLanguage({
      message: 'Hi',
      primaryLocale: 'ar-OM',
      fallbackLocale: 'en',
      preferredLanguage: 'ar-OM',
    })).toBe('en');
    expect(resolveReplyLanguage({
      message: 'قیمت چنده؟',
      primaryLocale: 'ar-OM',
      fallbackLocale: 'en',
      preferredLanguage: 'en',
    })).toBe('fa');
  });

  it('does not force an unknown substantive language to the market default', () => {
    expect(resolveReplyLanguage({
      message: 'Hola, necesito ayuda con mi negocio',
      primaryLocale: 'ar-OM',
      fallbackLocale: 'en',
      preferredLanguage: 'ar-OM',
    })).toBe('und');
  });

  it('uses the remembered customer language only for language-neutral turns', () => {
    expect(resolveReplyLanguage({
      message: '👍',
      primaryLocale: 'ar-OM',
      fallbackLocale: 'en',
      preferredLanguage: 'es',
    })).toBe('es');
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

  it('keeps Arabic Oman replies natural when the customer writes Arabic', async () => {
    const result = await executeAgent('culture_locale', {
      message: 'مرحبا، ممكن أعرف عن خدماتكم؟',
      language: 'en',
      marketLocaleStyle: {
        countryCode: 'OM',
        primaryLocale: 'ar-OM',
        fallbackLocale: 'en',
        dialect: 'omani',
        toneProfile: 'warm_short_business',
      },
    });
    expect(result.data).toMatchObject({ locale: 'ar-OM', dialect: 'omani' });
  });

  it('keeps the Omani Arabic conversation when a customer replies with the isolated car brand تویوتا', async () => {
    const conversationHistory = [{ direction: 'INBOUND' as const, body: 'كم سعر تلبيس المقاعد؟' }];
    expect(resolveReplyLanguage({
      message: 'تویوتا',
      primaryLocale: 'ar-OM',
      preferredLanguage: 'fa',
      conversationHistory,
    })).toBe('ar-OM');
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'تویوتا',
      replyLanguage: 'ar-OM',
      replyText: 'تمام، تويوتا. ممكن الموديل وسنة الصنع؟',
      conversationHistory,
    })).toBe(true);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'قیمت تویوتا چنده؟',
      replyLanguage: 'ar-OM',
      replyText: 'ممكن الموديل؟',
      conversationHistory,
    })).toBe(false);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'تویوتا',
      replyLanguage: 'ar-OM',
      replyText: 'ممكن الموديل؟',
    })).toBe(false);

    const locale = await executeAgent('culture_locale', {
      message: 'تویوتا',
      conversationHistory,
      language: 'fa',
      marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'ar-OM', dialect: 'omani', toneProfile: 'warm_short_business' },
    });
    expect(locale.data).toMatchObject({ locale: 'ar-OM', dialect: 'omani' });
  });

  it('blocks obvious or unresolved reply-language mismatches before delivery', () => {
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'Hi',
      replyLanguage: 'ar-OM',
      replyText: 'مرحباً! كيف نقدر نساعدك؟',
    })).toBe(false);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'قیمت چنده؟',
      replyLanguage: 'en',
      replyText: 'The price depends on the service.',
    })).toBe(false);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'Hola, necesito ayuda con mi negocio',
      replyLanguage: 'und',
      replyText: 'I can help with that.',
    })).toBe(false);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'Hola, necesito ayuda con mi negocio',
      replyLanguage: 'es',
      replyText: 'Claro, cuéntame qué necesitas.',
    })).toBe(true);
  });
});
