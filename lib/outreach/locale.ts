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

const englishSingleTurn = new Set([
  'hi', 'hello', 'hey', 'hiya', 'thanks', 'thankyou', 'thx', 'yes', 'no', 'ok', 'okay',
]);

const englishSignals = new Set([
  'i', 'we', 'you', 'my', 'our', 'your', 'me', 'us',
  'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'yes', 'no', 'ok', 'okay',
  'need', 'want', 'looking', 'interested', 'help', 'show', 'tell', 'explain',
  'can', 'could', 'would', 'do', 'does', 'is', 'are', 'what', 'how', 'much',
  'website', 'service', 'services', 'price', 'cost', 'marketing', 'instagram', 'content',
  'restaurant', 'clinic', 'business', 'company', 'for', 'with', 'this', 'that', 'the', 'a', 'an',
]);

export function getLocaleProfile(marketCode: MarketCode): LocaleProfile {
  if (!marketsJson[marketCode]) throw new Error(`Unsupported market: ${marketCode}`);
  return { marketCode, ...overrides[marketCode] };
}

export function detectHighConfidenceMessageLanguage(message: string): 'en' | undefined {
  const value = String(message ?? '').trim();
  if (!value || /[\u0600-\u06FF]/u.test(value)) return undefined;

  const cleaned = value
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/g, ' ')
    .replace(/[^a-z'\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (!tokens.length) return undefined;
  if (tokens.length === 1 && englishSingleTurn.has(tokens[0])) return 'en';

  const hits = tokens.reduce((count, token) => count + (englishSignals.has(token) ? 1 : 0), 0);
  if (tokens.length <= 4) return hits >= 2 ? 'en' : undefined;
  return hits >= 3 && hits / tokens.length >= 0.25 ? 'en' : undefined;
}

export function resolveReplyLanguage(input: {
  message: string;
  primaryLocale: string;
  fallbackLocale?: string;
  preferredLanguage?: string;
  marketCode?: MarketCode;
}) {
  const detected = detectHighConfidenceMessageLanguage(input.message);
  if (detected === 'en') {
    if (input.marketCode === 'GB') return 'en-GB';
    if (input.marketCode === 'US') return 'en-US';
    if (input.fallbackLocale?.toLowerCase().startsWith('en')) return input.fallbackLocale;
    return 'en';
  }
  return input.preferredLanguage?.trim() || input.primaryLocale;
}

export function replyMatchesHighConfidenceMessageLanguage(input: {
  message: string;
  replyLanguage?: string;
  replyText: string;
}) {
  if (detectHighConfidenceMessageLanguage(input.message) !== 'en') return true;
  if (!String(input.replyLanguage ?? '').toLowerCase().startsWith('en')) return false;

  const latinLetters = (input.replyText.match(/[A-Za-z]/g) ?? []).length;
  const arabicLetters = (input.replyText.match(/[\u0621-\u064A\u066E-\u06D3]/gu) ?? []).length;
  return arabicLetters <= Math.max(2, Math.floor(latinLetters * 0.2));
}

export function chooseLanguage(input: { marketCode: MarketCode; detectedLanguage?: string; preferredLanguage?: string }) {
  const profile = getLocaleProfile(input.marketCode);
  const requested = input.preferredLanguage ?? input.detectedLanguage;
  if (requested?.toLowerCase().startsWith('ar') && profile.primaryLocale.startsWith('ar')) return profile.primaryLocale;
  if (requested?.toLowerCase().startsWith('en')) return input.marketCode === 'GB' ? 'en-GB' : input.marketCode === 'US' ? 'en-US' : 'en';
  return profile.primaryLocale;
}
