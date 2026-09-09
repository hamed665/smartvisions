import marketsJson from '@/lib/config/markets.json';
import type { MarketCode } from './scheduler';
import { detectLanguageZeroCost, hasSubstantiveLanguageSignal, type DetectedLanguage } from './language-detection';

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

type ScriptFamily = 'ARABIC' | 'DEVANAGARI' | 'LATIN' | 'CYRILLIC' | 'CJK' | 'OTHER' | 'NONE';
type CountedScript = Exclude<ScriptFamily, 'OTHER' | 'NONE'>;

const overrides: Record<MarketCode, Omit<LocaleProfile, 'marketCode'>> = {
  OM: { primaryLocale: 'ar-OM', fallbackLocale: 'en', dialect: 'omani', tone: 'warm_short_business', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  AE: { primaryLocale: 'ar-AE', fallbackLocale: 'en', dialect: 'emirati', tone: 'polished_concise', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  SA: { primaryLocale: 'ar-SA', fallbackLocale: 'en', dialect: 'saudi', tone: 'warm_confident_direct', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  QA: { primaryLocale: 'ar-QA', fallbackLocale: 'en', dialect: 'qatari', tone: 'respectful_concise', dialectIntensity: 0.2, emojiLevel: 'low', maxFirstTouchWords: 80, maxReplyWords: 120 },
  GB: { primaryLocale: 'en-GB', fallbackLocale: 'en', dialect: 'british', tone: 'polite_understated', dialectIntensity: 0, emojiLevel: 'none', maxFirstTouchWords: 90, maxReplyWords: 140 },
  US: { primaryLocale: 'en-US', fallbackLocale: 'en', dialect: 'american', tone: 'direct_outcome_focused', dialectIntensity: 0, emojiLevel: 'none', maxFirstTouchWords: 90, maxReplyWords: 140 },
  CA: { primaryLocale: 'en-CA', fallbackLocale: 'en', dialect: 'canadian', tone: 'clear_consultative', dialectIntensity: 0, emojiLevel: 'none', maxFirstTouchWords: 90, maxReplyWords: 140 },
};

export function getLocaleProfile(marketCode: MarketCode): LocaleProfile {
  if (!marketsJson[marketCode]) throw new Error(`Unsupported market: ${marketCode}`);
  return { marketCode, ...overrides[marketCode] };
}

function normalizeDetectedLanguage(language: Exclude<DetectedLanguage, 'mixed' | 'unknown'>, marketCode?: MarketCode, marketPrimaryLocale?: string) {
  if (language === 'ar') {
    if (marketPrimaryLocale?.toLowerCase().startsWith('ar-')) return marketPrimaryLocale;
    if (marketCode && getLocaleProfile(marketCode).primaryLocale.startsWith('ar-')) return getLocaleProfile(marketCode).primaryLocale;
    return 'ar';
  }
  if (language === 'en') {
    if (marketCode === 'GB') return 'en-GB';
    if (marketCode === 'US') return 'en-US';
    if (marketCode === 'CA') return 'en-CA';
    return 'en';
  }
  return language;
}

export function detectHighConfidenceMessageLanguage(message: string): Exclude<DetectedLanguage, 'mixed' | 'unknown'> | undefined {
  const detected = detectLanguageZeroCost(message);
  if (detected.language === 'unknown' || detected.language === 'mixed' || detected.confidence < 0.75) return undefined;
  return detected.language;
}

export function resolveReplyLanguage(input: {
  message: string;
  primaryLocale: string;
  fallbackLocale?: string;
  preferredLanguage?: string;
  marketCode?: MarketCode;
}) {
  const detected = detectLanguageZeroCost(input.message);
  if (detected.language !== 'unknown' && detected.language !== 'mixed' && detected.confidence >= 0.75) {
    return normalizeDetectedLanguage(detected.language, input.marketCode, input.primaryLocale);
  }

  if (hasSubstantiveLanguageSignal(input.message)) return 'und';

  const remembered = String(input.preferredLanguage ?? '').trim();
  return remembered || 'und';
}

function dominantScript(text: string): ScriptFamily {
  const counts: Record<CountedScript, number> = {
    ARABIC: (text.match(/[\u0600-\u06FF]/gu) ?? []).length,
    DEVANAGARI: (text.match(/[\u0900-\u097F]/gu) ?? []).length,
    LATIN: (text.match(/[A-Za-z]/g) ?? []).length,
    CYRILLIC: (text.match(/[\u0400-\u04FF]/gu) ?? []).length,
    CJK: (text.match(/[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/gu) ?? []).length,
  };
  const entries = Object.entries(counts) as Array<[CountedScript, number]>;
  const [script, count] = entries.sort((a, b) => b[1] - a[1])[0];
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return /\p{L}/u.test(text) ? 'OTHER' : 'NONE';
  return count / total >= 0.6 ? script : 'OTHER';
}

export function replyMatchesHighConfidenceMessageLanguage(input: {
  message: string;
  replyLanguage?: string;
  replyText: string;
}) {
  const detected = detectLanguageZeroCost(input.message);
  const replyLanguage = String(input.replyLanguage ?? '').toLowerCase();

  if (hasSubstantiveLanguageSignal(input.message) && replyLanguage === 'und') return false;

  if (detected.language !== 'unknown' && detected.language !== 'mixed' && detected.confidence >= 0.75) {
    const expected = detected.language;
    if (expected === 'ar') {
      if (!replyLanguage.startsWith('ar')) return false;
    } else if (!replyLanguage.startsWith(expected)) {
      return false;
    }
  }

  const messageScript = dominantScript(input.message);
  const replyScript = dominantScript(input.replyText);
  if (!['NONE', 'OTHER'].includes(messageScript) && !['NONE', 'OTHER'].includes(replyScript) && messageScript !== replyScript) return false;

  return true;
}

export function chooseLanguage(input: { marketCode: MarketCode; detectedLanguage?: string; preferredLanguage?: string }) {
  const profile = getLocaleProfile(input.marketCode);
  const requested = input.preferredLanguage ?? input.detectedLanguage;
  if (requested?.toLowerCase().startsWith('ar') && profile.primaryLocale.startsWith('ar')) return profile.primaryLocale;
  if (requested?.toLowerCase().startsWith('en')) {
    if (input.marketCode === 'GB') return 'en-GB';
    if (input.marketCode === 'US') return 'en-US';
    if (input.marketCode === 'CA') return 'en-CA';
    return 'en';
  }
  if (requested?.trim()) return requested.trim();
  return profile.primaryLocale;
}
