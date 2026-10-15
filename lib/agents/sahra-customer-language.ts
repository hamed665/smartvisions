import type { AgentContext, ReplyDraft } from './contracts';
import { detectLanguageZeroCost } from '@/lib/outreach/language-detection';
import { SAHRA_FAST_SCOPE } from '@/lib/whatsapp/sahra-fast-inbound-core';

/** Customer-facing policy for Sahra only. Operator translations remain independent. */
export function isSahraCustomerContext(context: AgentContext): boolean {
  const scopedId = context.permissionContext?.targetScope?.tenantBusinessId;
  if (scopedId) return scopedId === SAHRA_FAST_SCOPE.tenantBusinessId;
  const providerName = String(context.servingBusiness?.name ?? '');
  const country = String(context.servingBusiness?.countryCode ?? context.countryCode ?? '').toUpperCase();
  return country === 'OM' && /(?:\bsahra\b|صحرا)/iu.test(providerName);
}

function englishNeutralShort(text: string) {
  return /^(?:ok|okay|yes|no|sure|thanks|thank you|thx|great|fine|ppf|led|5d|3d|carplay|android|tint|ceramic|screen|screens|price|cost|quote|stock|available)[?!. ]*$/i.test(text);
}

function explicitEnglish(text: string) {
  if (/[\u0600-\u06ff]/u.test(text)) return false;
  if (/^(?:hi|hello|hey|hiya|good morning|good afternoon|good evening)[!?. ]*$/i.test(text)) return true;
  if (englishNeutralShort(text)) return false;
  if (/\b(?:how much|what(?:'s| is)|price|cost|quote|do you have|can you|could you|i want|i need|i'm looking|i am looking|please tell|is it available|for my car|floor mats?|seat covers?|window tint|need help|thank you for)\b/i.test(text)) return true;
  const detection = detectLanguageZeroCost(text);
  return detection.language === 'en' && detection.confidence >= 0.9
    && text.trim().split(/\s+/).length >= 3;
}

function lastClearCustomerLanguage(context: AgentContext): 'en' | 'ar-OM' | null {
  const inbound = [...(context.conversationHistory ?? [])].reverse()
    .filter(turn => turn.direction === 'INBOUND').slice(0, 8);
  for (const turn of inbound) {
    if (explicitEnglish(turn.body)) return 'en';
    if (/[\u0600-\u06FF]/u.test(turn.body)) return 'ar-OM';
  }
  return null;
}

/** Unknown, Persian, Urdu, Arabic and mixed-script messages default to Omani Arabic.
 * English needs an explicit current English turn or English conversation continuity.
 */
export function sahraCustomerReplyLanguage(context: AgentContext): 'ar-OM' | 'en' {
  const message = String(context.message ?? '').trim();
  if (explicitEnglish(message)) return 'en';
  if (englishNeutralShort(message) || /^(?:\d+[dD]|ppf|led)[!?. ]*$/i.test(message)) {
    const recent = lastClearCustomerLanguage(context);
    if (recent) return recent;
    return /^en\b/i.test(String(context.language ?? '')) ? 'en' : 'ar-OM';
  }
  return 'ar-OM';
}

const PERSIAN_WORDING =
  /(?:^|[^\p{L}])(?:خوش\s*آمدید|خوش\s*اومدید|قیمت|کفپوش|مدلش|لطفا|لطفاً|ممنونم|میخوام|می‌خوام|میتونم|می‌تونم|درباره|چنده|چطور|شما|هستید|بفرمایید|برای|نیاز\s+به\s+تأیید)(?=$|[^\p{L}])/iu;

/** Never rely on an LLM's declared language field alone. */
export function sahraCustomerDraftAllowed(context: AgentContext, draft: ReplyDraft): boolean {
  const wanted = sahraCustomerReplyLanguage(context);
  const label = draft.language.toLowerCase();
  const body = draft.text.trim();
  if (!body) return false;
  if (wanted === 'en' ? !/^en(?:-|$)/i.test(label) : label !== 'ar-om') return false;
  // Persian-only code points and common Persian sentences are not valid Omani Arabic.
  if (/[پچژگک‌ی]/u.test(body) || PERSIAN_WORDING.test(body)) return false;
  const latinLetters = (body.match(/[a-z]/gi) ?? []).length;
  const arabicLetters = (body.match(/[\u0621-\u064A]/gu) ?? []).length;
  if (wanted === 'en') return latinLetters > 0 && latinLetters >= arabicLetters;
  // Latin brands/product abbreviations are allowed within Arabic replies.
  return arabicLetters > 0 && arabicLetters >= Math.min(latinLetters, 12);
}
