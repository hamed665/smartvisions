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

type ConversationLanguageTurn = { direction: string; body: string };

function isAutomotiveBrandOnly(message: string) {
  const value = message.trim().normalize('NFKC').replace(/[.,،؛!?؟]+$/gu, '').replace(/\s+/g, ' ');
  // A car brand is an entity, not proof that the customer switched languages.
  // This narrow exception does not cover a genuine Persian/Urdu price question.
  return /^(?:تویوتا|تويوتا|نیسان|نيسان|هوندا|هيونداي|هیوندای|كيا|کیا|لكزس|لکسوس|مازدا|فورد|مرسيدس|مرسدس|جيب|جیپ)(?:\s+[0-9۰-۹٠-٩]{2,4})?$/iu.test(value);
}

function hasRecentArabicCustomerTurn(history?: ConversationLanguageTurn[]) {
  return (history ?? []).slice(-8).some((turn) =>
    turn.direction === 'INBOUND'
    && detectHighConfidenceMessageLanguage(turn.body) === 'ar'
  );
}

export function detectHighConfidenceMessageLanguage(message: string): Exclude<DetectedLanguage, 'mixed' | 'unknown'> | undefined {
  const detected = detectLanguageZeroCost(message);
  if (detected.language === 'unknown' || detected.language === 'mixed' || detected.confidence < 0.75) return undefined;
  return detected.language;
}

/**
 * Bounded customer-language continuity for Sahra's Omani car-care vocabulary.
 * A technical product name is not proof of an English language switch.
 * Do not let this specialization affect other markets or general conversations.
 */
export function resolveOmaniAutomotiveShortLanguage(input: {
  message: string;
  primaryLocale?: string;
  preferredLanguage?: string;
  conversationHistory?: ConversationLanguageTurn[];
}): string | null {
  if (input.primaryLocale?.toLowerCase() !== 'ar-om') return null;
  const text = input.message.trim().normalize('NFKC');
  if (!text || text.length > 100) return null;
  const prev = [...(input.conversationHistory ?? [])].reverse()
    .filter(turn => turn.direction === 'INBOUND').slice(0, 8)
    .map(turn => detectHighConfidenceMessageLanguage(turn.body))
    .find(lang => lang === 'ar' || lang === 'en' || lang === 'fa');
  const previous = prev === 'ar' ? 'ar-OM' : prev ?? (
    /^(?:ar|en|fa)(?:-|$)/i.test(input.preferredLanguage ?? '')
      ? input.preferredLanguage! : null
  );
  const romanService = /\b(?:ppf|5d|3d|led|carplay|android|screen|screens|tint|tinting|ceramic|floor\s*mats?|seat\s*covers?|head\s*unit)\b/i;
  const arabicService = /(?:عازل|تظليل|تضليل|دودي|شاشات|شاشة|شاشه|اندرويد|أندرويد|كاربلاي|كار\s*بلاي|ارضيات|أرضيات|فرشات|دواسات|تنجيد|تلبيسات|حماية|سيراميك|مقاعد|كراسي)/i;
  // Full Persian, Urdu and other-language questions must not be force-labeled
  // Arabic just because the product name is a familiar Latin abbreviation.
  if (/[پچژگک‌یٹڈڑںھہۓے]/.test(text)
    && !/^(?:تويوتا|تویوتا|نيسان|نیسان|هيونداي|هیوندای)\s*$/iu.test(text)) return null;

  const neutralShort = /^(?:(?:ppf|5d|3d|led|carplay|android|screen|screens|tint|ceramic|floor\s*mats?|head\s*unit|price|cost|available)|(?:عازل|تظليل|دودي|شاشات|شاشة|ارضيات|أرضيات|فرشات|سيراميك|تنجيد|تلبيسات|تمام|زين|اوكي|أوكي|اي|إي|ايوه|أيوا|نعم|لا|موجود|متوفر|ينفع|تنفع|يركب|ok|okay|yep|yup|yes|no|sure))[؟?!.,،\s]*$/iu.test(text);
  if (neutralShort) {
    if (/^(?:ok|okay|yep|yup|yes|no|sure|تمام|زين|اوكي|أوكي|اي|إي|ايوه|أيوا|نعم|لا)[؟?!.,،\s]*$/iu.test(text)) {
      return previous ?? (/[\u0600-\u06FF]/.test(text) ? 'ar-OM' : 'en');
    }
    return previous ?? (/[A-Za-z]/.test(text) && !/^(?:ppf|5d|3d|led|carplay|android)$/i.test(text)
      ? 'en' : 'ar-OM');
  }

  // A complete English sentence with an Arabic product name remains English.
  if (/^(?:i\s+)?(?:need|want|looking\s+for|do\s+you\s+have|can\s+you|how\s+much|price\s+for)\b/i.test(text)
    && arabicService.test(text)) return 'en';
  // Omani syntax plus a Latin technical word remains Omani Arabic.
  const omaniSyntax = /(?:^|\s)(?:في\s+)?(?:عندكم|عندك|عندكو|ابي|أبي|ابغي|أبغي|بغيت|ممكن|كم|جم|بجم|بكم|وش|شو|للسيارة|حق|تركيب|تركبون|يصلح|السعر|سعر|موجود|متوفر)(?:\s|$|[؟?،])/iu;
  if (romanService.test(text) && /[\u0600-\u06FF]/.test(text)
    && (omaniSyntax.test(text) || arabicService.test(text))) return 'ar-OM';
  // A short Arabic-only service question can be unrecognized by the generic
  // marketing lexicon, but still be obvious in the automotive domain.
  if (!/[A-Za-z]/.test(text) && previous?.startsWith('ar')
    && /(?:عندكم|عندكو|عندك|شو|وش|تنصح|بغيت|ابغي|أبغي|حلو|زين|حق|يناسب|بكم|بجم)/iu.test(text))
    return 'ar-OM';
  if (!/[A-Za-z]/.test(text) && arabicService.test(text)
    && !/[پچژگک‌ی]/.test(text)) return 'ar-OM';
  return null;
}

export function resolveReplyLanguage(input: {
  message: string;
  primaryLocale: string;
  fallbackLocale?: string;
  preferredLanguage?: string;
  marketCode?: MarketCode;
  conversationHistory?: ConversationLanguageTurn[];
}) {
  const omaniShort = resolveOmaniAutomotiveShortLanguage(input);
  if (omaniShort) return omaniShort;
  if (isAutomotiveBrandOnly(input.message) && hasRecentArabicCustomerTurn(input.conversationHistory)) {
    return normalizeDetectedLanguage('ar', input.marketCode, input.primaryLocale);
  }
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
  conversationHistory?: ConversationLanguageTurn[];
  primaryLocale?: string;
}) {
  const detected = detectLanguageZeroCost(input.message);
  const replyLanguage = String(input.replyLanguage ?? '').toLowerCase();
  // A Persian-script reply must not pass as Arabic merely because both use
  // the Arabic Unicode block (e.g. 'سلام، خوش آمدید' after 'السلام عليكم').
  const replyDetection = detectLanguageZeroCost(input.replyText);
  if (replyDetection.language === 'fa' && !replyLanguage.startsWith('fa')) return false;
  const scopedLanguage = resolveOmaniAutomotiveShortLanguage(input);
  if (scopedLanguage) {
    if (!replyLanguage.startsWith(scopedLanguage.toLowerCase().split('-')[0])) return false;
    const script = dominantScript(input.replyText);
    return script === (scopedLanguage.startsWith('en') ? 'LATIN' : 'ARABIC')
      || script === 'OTHER';
  }
  const automotiveArabicContinuity = isAutomotiveBrandOnly(input.message)
    && hasRecentArabicCustomerTurn(input.conversationHistory) && replyLanguage.startsWith('ar');

  if (hasSubstantiveLanguageSignal(input.message) && replyLanguage === 'und') return false;

  if (!automotiveArabicContinuity && detected.language !== 'unknown' && detected.language !== 'mixed' && detected.confidence >= 0.75) {
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
