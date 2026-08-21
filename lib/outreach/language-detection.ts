export type DetectedLanguage = 'ar' | 'fa' | 'ur' | 'hi' | 'en' | 'mixed' | 'unknown';

const persianSpecific = /[پچژگک‌ی]/;
const urduSpecific = /[ٹڈڑںھہۓے]/;
const devanagari = /[\u0900-\u097F]/;
const arabicScript = /[\u0600-\u06FF]/;
const latin = /[A-Za-z]/;

export function detectLanguageZeroCost(text: string): { language: DetectedLanguage; confidence: number; signals: string[] } {
  const value = text.trim();
  if (!value) return { language: 'unknown', confidence: 0, signals: ['EMPTY'] };

  const signals: string[] = [];
  const hasLatin = latin.test(value);
  const hasArabicScript = arabicScript.test(value);
  const hasDevanagari = devanagari.test(value);

  if (hasDevanagari) {
    signals.push('DEVANAGARI_SCRIPT');
    if (hasLatin || hasArabicScript) return { language: 'mixed', confidence: 0.9, signals };
    return { language: 'hi', confidence: 0.98, signals };
  }

  if (hasArabicScript) {
    if (urduSpecific.test(value)) signals.push('URDU_SPECIFIC_CHARS');
    if (persianSpecific.test(value)) signals.push('PERSIAN_SPECIFIC_CHARS');
    if (hasLatin) signals.push('LATIN_AND_ARABIC_SCRIPT');

    if (hasLatin) return { language: 'mixed', confidence: 0.85, signals };
    if (urduSpecific.test(value)) return { language: 'ur', confidence: 0.93, signals };
    if (persianSpecific.test(value)) return { language: 'fa', confidence: 0.88, signals };
    return { language: 'ar', confidence: 0.76, signals: [...signals, 'ARABIC_SCRIPT_FALLBACK'] };
  }

  if (hasLatin) return { language: 'en', confidence: 0.9, signals: ['LATIN_SCRIPT'] };
  return { language: 'unknown', confidence: 0.3, signals: ['NO_SUPPORTED_SCRIPT_SIGNAL'] };
}

export function resolveReplyLanguage(input: { text: string; explicitLanguage?: string; marketPrimaryLanguage?: string }) {
  if (input.explicitLanguage) return { language: input.explicitLanguage, source: 'EXPLICIT' as const };
  const detected = detectLanguageZeroCost(input.text);
  if (detected.language !== 'unknown' && detected.language !== 'mixed' && detected.confidence >= 0.75) {
    return { language: detected.language, source: 'DETERMINISTIC' as const, confidence: detected.confidence };
  }
  return { language: input.marketPrimaryLanguage ?? 'en', source: 'MARKET_FALLBACK' as const, confidence: detected.confidence };
}
