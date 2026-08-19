import marketsJson from '@/lib/config/markets.json';
import type { MarketCode } from './scheduler';

export interface LocaleProfile {
  marketCode: MarketCode;
  primaryLocale: string;
  fallbackLocale: string;
  dialect: string;
  tone: string;
  dialectIntensity: number;
  emojiLevel: 'none' | 'low' | 'medium';
  maxFirstTouchWords: number;
  maxReplyWords: number;
}

const overrides: Record<MarketCode, Omit<LocaleProfile, 'marketCode'>> = {
  OM: { primaryLocale: 'ar-OM', fallbackLocale: 'en', dialect: 'omani', tone: 'warm_short_business', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  AE: { primaryLocale: 'ar-AE', fallbackLocale: 'en', dialect: 'emirati', tone: 'polished_concise', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  SA: { primaryLocale: 'ar-SA', fallbackLocale: 'en', dialect: 'saudi', tone: 'warm_confident_direct', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  QA: { primaryLocale: 'ar-QA', fallbackLocale: 'en', dialect: 'qatari', tone: 'respectful_concise', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  GB: { primaryLocale: 'en-GB', fallbackLocale: 'en', dialect: 'british', tone: 'polite_understated', dialectIntensity: 0, emojiLevel: 'none', maxFirstTouchWords: 90, maxReplyWords: 140 },
  US: { primaryLocale: 'en-US', fallbackLocale: 'en', dialect: 'american', tone: 'direct_outcome_focused', dialectIntensity: 0, emojiLevel: 'none', maxFirstTouchWords: 90, maxReplyWords: 140 },
};

export function getLocaleProfile(marketCode: MarketCode): LocaleProfile {
  if (!marketsJson[marketCode]) throw new Error(`Unsupported market: ${marketCode}`);
  return { marketCode, ...overrides[marketCode] };
}

export function chooseLanguage(input: { marketCode: MarketCode; detectedLanguage?: string; preferredLanguage?: string }) {
  const profile = getLocaleProfile(input.marketCode);
  const requested = input.preferredLanguage ?? input.detectedLanguage;
  if (requested?.toLowerCase().startsWith('ar') && profile.primaryLocale.startsWith('ar')) return profile.primaryLocale;
  if (requested?.toLowerCase().startsWith('en')) return input.marketCode === 'GB' ? 'en-GB' : input.marketCode === 'US' ? 'en-US' : 'en';
  return profile.primaryLocale;
}
