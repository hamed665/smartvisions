export type DetectedLanguage = 'ar' | 'fa' | 'ur' | 'hi' | 'en' | 'mixed' | 'unknown';

const persianSpecific = /[پچژگک‌ی]/;
const urduSpecific = /[ٹڈڑںھہۓے]/;
const devanagari = /[\u0900-\u097F]/;
const arabicScript = /[\u0600-\u06FF]/;
const latin = /[A-Za-z]/;
const otherSupportedScripts = /[\u0400-\u04FF\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0DFF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

const englishSingleTurn = new Set(['hi', 'hello', 'hey', 'hiya', 'thanks', 'thankyou', 'thx', 'yes']);
const englishSignals = new Set([
  'i', 'we', 'you', 'my', 'our', 'your', 'us',
  'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'yes',
  'need', 'want', 'looking', 'interested', 'help', 'show', 'tell', 'explain',
  'can', 'could', 'would', 'do', 'does', 'is', 'are', 'what', 'how', 'much',
  'website', 'service', 'services', 'price', 'cost', 'marketing', 'instagram', 'content',
  'restaurant', 'clinic', 'business', 'company', 'for', 'with', 'this', 'that', 'the',
]);

const arabicSignals = new Set([
  'مرحبا', 'مرحباً', 'اهلا', 'أهلا', 'ممكن', 'اريد', 'أريد', 'احتاج', 'أحتاج',
  'كيف', 'خدماتكم', 'خدمات', 'سعر', 'السعر', 'كم', 'موقع', 'الموقع', 'عندي', 'عندنا',
  'مطعم', 'عيادة', 'شركة', 'تسويق', 'انستغرام', 'إنستغرام', 'واتساب', 'شكرا', 'شكراً',
]);

const hindiSignals = new Set([
  'क्या', 'है', 'हैं', 'मुझे', 'चाहिए', 'की', 'का', 'के', 'आप', 'हम', 'मेरी', 'हमारी',
  'वेबसाइट', 'कीमत', 'सेवा', 'सेवाएं', 'व्यवसाय', 'मदद',
]);

function signalHits(value: string, lexicon: Set<string>) {
  const normalized = value.toLowerCase().normalize('NFC');
  return [...lexicon].reduce((count, signal) => count + (normalized.includes(signal.normalize('NFC')) ? 1 : 0), 0);
}

function latinEnglishConfidence(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/g, ' ')
    .replace(/[^a-z'\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  if (tokens.length === 1) return englishSingleTurn.has(tokens[0]) ? 0.99 : 0;
  const hits = tokens.reduce((count, token) => count + (englishSignals.has(token) ? 1 : 0), 0);
  if (tokens.length <= 4) return hits >= 2 ? 0.94 : 0;
  return hits >= 3 && hits / tokens.length >= 0.25 ? 0.92 : 0;
}

export function hasSubstantiveLanguageSignal(text: string) {
  const stripped = String(text ?? '')
    .replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/g, ' ')
    .replace(/[\d\p{P}\p{S}_]+/gu, ' ')
    .trim();
  return (stripped.match(/\p{L}/gu) ?? []).length >= 2;
}

export function detectLanguageZeroCost(text: string): { language: DetectedLanguage; confidence: number; signals: string[] } {
  const value = String(text ?? '').trim();
  if (!value) return { language: 'unknown', confidence: 0, signals: ['EMPTY'] };

  const hasLatin = latin.test(value);
  const hasArabic = arabicScript.test(value);
  const hasDevanagari = devanagari.test(value);
  const hasOtherScript = otherSupportedScripts.test(value);
  const scriptHits = [hasLatin, hasArabic, hasDevanagari, hasOtherScript].filter(Boolean).length;
  if (scriptHits > 1) return { language: 'mixed', confidence: 0.88, signals: ['MULTIPLE_SCRIPTS'] };

  if (hasDevanagari) {
    const hits = signalHits(value, hindiSignals);
    return hits >= 2
      ? { language: 'hi', confidence: 0.9, signals: ['HINDI_LEXICAL_SIGNAL'] }
      : { language: 'unknown', confidence: 0.6, signals: ['DEVANAGARI_LANGUAGE_UNRESOLVED'] };
  }

  if (hasArabic) {
    const signals: string[] = [];
    if (urduSpecific.test(value)) signals.push('URDU_SPECIFIC_CHARS');
    if (persianSpecific.test(value)) signals.push('PERSIAN_SPECIFIC_CHARS');
    if (urduSpecific.test(value)) return { language: 'ur', confidence: 0.93, signals };
    if (persianSpecific.test(value)) return { language: 'fa', confidence: 0.88, signals };
    if (signalHits(value, arabicSignals) >= 1) return { language: 'ar', confidence: 0.9, signals: [...signals, 'ARABIC_LEXICAL_SIGNAL'] };
    return { language: 'unknown', confidence: 0.6, signals: [...signals, 'ARABIC_SCRIPT_LANGUAGE_UNRESOLVED'] };
  }

  if (hasLatin) {
    const confidence = latinEnglishConfidence(value);
    if (confidence > 0) return { language: 'en', confidence, signals: ['ENGLISH_LEXICAL_SIGNAL'] };
    return { language: 'unknown', confidence: 0.45, signals: ['LATIN_SCRIPT_LANGUAGE_UNRESOLVED'] };
  }

  if (hasOtherScript) return { language: 'unknown', confidence: 0.65, signals: ['NON_LATIN_LANGUAGE_REQUIRES_EXISTING_MODEL'] };
  return { language: 'unknown', confidence: 0.3, signals: ['NO_SUPPORTED_SCRIPT_SIGNAL'] };
}

export function resolveReplyLanguage(input: { text: string; explicitLanguage?: string; lastConversationLanguage?: string; marketPrimaryLanguage?: string; allowMarketFallback?: boolean }) {
  if (input.explicitLanguage) return { language: input.explicitLanguage, source: 'EXPLICIT' as const };
  const detected = detectLanguageZeroCost(input.text);
  if (detected.language !== 'unknown' && detected.language !== 'mixed' && detected.confidence >= 0.75) {
    return { language: detected.language, source: 'DETERMINISTIC' as const, confidence: detected.confidence };
  }
  if (!hasSubstantiveLanguageSignal(input.text) && input.lastConversationLanguage) {
    return { language: input.lastConversationLanguage, source: 'CONVERSATION_MEMORY' as const, confidence: detected.confidence };
  }
  if (input.allowMarketFallback && input.marketPrimaryLanguage) {
    return { language: input.marketPrimaryLanguage, source: 'MARKET_FALLBACK' as const, confidence: detected.confidence };
  }
  return { language: 'und', source: 'UNRESOLVED_CURRENT_MESSAGE' as const, confidence: detected.confidence };
}
