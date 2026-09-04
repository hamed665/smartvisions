export type DetectedLanguage = 'ar' | 'fa' | 'ur' | 'hi' | 'en' | 'ru' | 'bn' | 'ml' | 'ta' | 'te' | 'si' | 'zh' | 'ja' | 'ko' | 'th' | 'mixed' | 'unknown';

const persianSpecific = /[پچژگک‌ی]/;
const urduSpecific = /[ٹڈڑںھہۓے]/;
const devanagari = /[\u0900-\u097F]/;
const bengali = /[\u0980-\u09FF]/;
const tamil = /[\u0B80-\u0BFF]/;
const telugu = /[\u0C00-\u0C7F]/;
const malayalam = /[\u0D00-\u0D7F]/;
const sinhala = /[\u0D80-\u0DFF]/;
const thai = /[\u0E00-\u0E7F]/;
const cyrillic = /[\u0400-\u04FF]/;
const hiraganaKatakana = /[\u3040-\u30FF]/;
const han = /[\u3400-\u9FFF]/;
const hangul = /[\uAC00-\uD7AF]/;
const arabicScript = /[\u0600-\u06FF]/;
const latin = /[A-Za-z]/;

const englishSingleTurn = new Set(['hi', 'hello', 'hey', 'hiya', 'thanks', 'thankyou', 'thx', 'yes', 'no', 'ok', 'okay']);
const englishSignals = new Set([
  'i', 'we', 'you', 'my', 'our', 'your', 'me', 'us',
  'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'yes', 'no', 'ok', 'okay',
  'need', 'want', 'looking', 'interested', 'help', 'show', 'tell', 'explain',
  'can', 'could', 'would', 'do', 'does', 'is', 'are', 'what', 'how', 'much',
  'website', 'service', 'services', 'price', 'cost', 'marketing', 'instagram', 'content',
  'restaurant', 'clinic', 'business', 'company', 'for', 'with', 'this', 'that', 'the', 'a', 'an',
]);

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

  const signals: string[] = [];
  const scriptHits = [
    latin.test(value), arabicScript.test(value), devanagari.test(value), bengali.test(value), tamil.test(value), telugu.test(value),
    malayalam.test(value), sinhala.test(value), thai.test(value), cyrillic.test(value), hiraganaKatakana.test(value), han.test(value), hangul.test(value),
  ].filter(Boolean).length;

  if (scriptHits > 1) return { language: 'mixed', confidence: 0.88, signals: ['MULTIPLE_SCRIPTS'] };

  if (devanagari.test(value)) return { language: 'hi', confidence: 0.98, signals: ['DEVANAGARI_SCRIPT'] };
  if (bengali.test(value)) return { language: 'bn', confidence: 0.98, signals: ['BENGALI_SCRIPT'] };
  if (tamil.test(value)) return { language: 'ta', confidence: 0.98, signals: ['TAMIL_SCRIPT'] };
  if (telugu.test(value)) return { language: 'te', confidence: 0.98, signals: ['TELUGU_SCRIPT'] };
  if (malayalam.test(value)) return { language: 'ml', confidence: 0.98, signals: ['MALAYALAM_SCRIPT'] };
  if (sinhala.test(value)) return { language: 'si', confidence: 0.98, signals: ['SINHALA_SCRIPT'] };
  if (thai.test(value)) return { language: 'th', confidence: 0.98, signals: ['THAI_SCRIPT'] };
  if (hangul.test(value)) return { language: 'ko', confidence: 0.98, signals: ['HANGUL_SCRIPT'] };
  if (hiraganaKatakana.test(value)) return { language: 'ja', confidence: 0.98, signals: ['JAPANESE_KANA'] };
  if (han.test(value)) return { language: 'zh', confidence: 0.9, signals: ['HAN_SCRIPT'] };
  if (cyrillic.test(value)) return { language: 'ru', confidence: 0.82, signals: ['CYRILLIC_SCRIPT_FALLBACK'] };

  if (arabicScript.test(value)) {
    if (urduSpecific.test(value)) signals.push('URDU_SPECIFIC_CHARS');
    if (persianSpecific.test(value)) signals.push('PERSIAN_SPECIFIC_CHARS');
    if (urduSpecific.test(value)) return { language: 'ur', confidence: 0.93, signals };
    if (persianSpecific.test(value)) return { language: 'fa', confidence: 0.88, signals };
    return { language: 'ar', confidence: 0.76, signals: [...signals, 'ARABIC_SCRIPT_FALLBACK'] };
  }

  if (latin.test(value)) {
    const confidence = latinEnglishConfidence(value);
    if (confidence > 0) return { language: 'en', confidence, signals: ['ENGLISH_LEXICAL_SIGNAL'] };
    return { language: 'unknown', confidence: 0.45, signals: ['LATIN_SCRIPT_LANGUAGE_UNRESOLVED'] };
  }

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
