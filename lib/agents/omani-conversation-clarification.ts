import type { AgentContext, ReplyDraft } from './contracts';
import { resolveReplyLanguage } from '@/lib/outreach/locale';
import { vehicleDetailClarification } from './safe-clarification';
import { automotiveServiceCandidates, type AutomotiveService } from '@/lib/conversations/automotive-sales-memory';

function isOmaniAutomotive(context: AgentContext) {
  if (String(context.servingBusiness?.countryCode ?? context.countryCode ?? '').toUpperCase() !== 'OM') return false;
  return /sahra|صحرا|car|auto|automotive|سيار|خودرو/i.test(
    [context.servingBusiness?.name, context.industry].join(' ')
  ) || (context.knowledgeContext ?? []).some((item) => item.key.startsWith('sahra_'));
}

const NON_SALES_REQUEST = /(?:خصم|تخفيض|سعر خاص|ادفع|دفع|عربون|شكوى|اشتك|زعلان|خرب|مشكلة|مضايق|مدير|موظف|حجز|احجز|الموعد|وين موقع|لوكيشن|location|address|complaint|refund|discount|payment|book|cancel)/i;

/** Narrow recovery for colloquial Omani automotive enquiries.
 * May only be used after the pipeline rechecks evidence and all safety guards. */
export function safeOmaniConversationClarification(context: AgentContext): {
  draft: ReplyDraft;
  persianTranslation: string;
} | null {
  if (!isOmaniAutomotive(context)) return null;
  const message = context.message.trim().normalize('NFKC');
  if (!message || message.length > 85 || NON_SALES_REQUEST.test(message)) return null;
  const currentServices = automotiveServiceCandidates(message);
  const history = (context.conversationHistory ?? [])
    .filter(turn => turn.direction === 'INBOUND').slice(-6);
  const priorService = [...history].reverse()
    .map(turn => automotiveServiceCandidates(turn.body))
    .find(items => items.length === 1)?.[0] ?? context.salesState?.automotive?.service;
  const hasShortService = currentServices.length > 0;
  // Silence is better than inventing an offer after a bare acknowledgement.
  if (/^(?:ok(?:ay)?|yes|no|hi|hello|تمام|اوكي|أوكي|نعم|لا|شكرا|thanks)[؟?!. ]*$/iu.test(message)) return null;
  const contextualFollowUp = /^(?:كم|جم|بكم|بجم|شحال|السعر|بكام|موجود|متوفر|يركب|تنفع|ينفع|كله|كلها|all|full|both|fit|fits|cost|stock|شو الفرق|وش الفرق|شو تنصح|وش تنصح|تنصحني|شو رايك|وش رايك|how much|price|available|which one|what about)(?:\s+[^؟?!.]{0,32})?[؟?!. ]*$/iu.test(message);
  const explicitEnquiry = /(?:عندكم|عندكو|عندك|تركبون|تركبونه|يركب|ينفع|يناسب|تضبط|تضبطون|شو تنصح|وش تنصح|تنصحني|شو رايك|وش رايك|شو الفرق|وش الفرق|أبغي|ابغي|اريد|أريد|ابي|بغيت|هل يصلح|نفس هذا|هذا يضبط|حق ال|للاند|للتويوتا|للجيب|need|want|looking for|have|price|how much)/i.test(message);
  if (!hasShortService && !explicitEnquiry && !(priorService && contextualFollowUp)) return null;
  const language = resolveReplyLanguage({
    message,
    primaryLocale: context.marketLocaleStyle?.primaryLocale ?? 'ar-OM',
    preferredLanguage: context.language,
    conversationHistory: context.conversationHistory,
  });
  // Short Omani questions with English product names must follow the
  // customer's Arabic syntax, not the Latin product spelling.
  const arabicQuestion = /[\u0600-\u06ff]/u.test(message)
    && !/[پچژگک‌ی]/u.test(message)
    && /(?:عندكم|عندك|عندكو|في|أبغي|ابغي|ابي|بغيت|كم|جم|بكم|بجم|شحال|يركب|موجود|متوفر|تنفع|شو|وش)/iu.test(message);
  const englishQuestion = /(?:^|\s)(?:how\s*much|price|cost|available|stock|need|want|have|fit|fits|which\s*one)(?:\s|$|[?!.])/iu.test(message);
  const replyLanguage = arabicQuestion ? 'ar-OM'
    : language === 'und' && englishQuestion ? 'en'
    : language === 'und' && priorService && contextualFollowUp
      ? context.language ?? 'und' : language;
  if (!['ar-OM', 'ar', 'en', 'fa'].includes(replyLanguage)) return null;
  // Two new services in one sentence cannot be silently collapsed to one.
  // A correction such as "لا قصدي PPF مو 5D" must be resolved by the canonical
  // customer-memory parser, not by reading older outbound bot claims.
  const corrected = /(?:قصدي|أقصد|اقصد|أعني|اعني|i\s+mean)\s+(.+?)(?=\s+(?:مو|مش|not|instead\s+of|rather\s+than)|$)/i.exec(message);
  const correctedServices = corrected ? automotiveServiceCandidates(corrected[1]) : [];
  const service: AutomotiveService | undefined = correctedServices.length === 1 ? correctedServices[0]
    : currentServices.length === 1 ? currentServices[0]
      : currentServices.length > 1 ? undefined : priorService;
  const ambiguousServices = currentServices.length > 1 && correctedServices.length !== 1;
  if (ambiguousServices) {
    const text = replyLanguage.startsWith('ar') ? 'تقصد أي خدمة بالضبط من اللي ذكرتها؟'
      : replyLanguage.startsWith('fa') ? 'منظورتون دقیقاً کدوم یکی از این خدماته؟'
        : 'Which of those services do you mean?';
    return { draft: { text, language: replyLanguage, generatedBy: 'secretary' }, persianTranslation: 'مشتری چند خدمت گفت؛ باید منظورش مشخص شود.' };
  }
  if (!service) {
    const text = replyLanguage.startsWith('ar') ? 'حياك، أي خدمة تقصد عشان أساعدك بشكل أدق؟'
      : replyLanguage.startsWith('fa') ? 'کدوم خدمت رو می‌خواید تا دقیق راهنمایی کنم؟'
        : 'Which service are you looking for?';
    return { draft: { text, language: replyLanguage, generatedBy: 'secretary' }, persianTranslation: 'برای انتخاب خدمت، سؤال کوتاه بپرس.' };
  }
  const labels: Record<AutomotiveService, { ar: string; en: string; fa: string }> = {
    FLOOR_MATS: { ar: 'فرش الأرضيات', en: 'floor mats', fa: 'کفپوش' },
    SEAT_UPHOLSTERY: { ar: 'تنجيد الكراسي', en: 'seat upholstery', fa: 'تودوزی صندلی' },
    THERMAL_TINT: { ar: 'العازل الحراري', en: 'window tint', fa: 'عایق شیشه' },
    PPF: { ar: 'حماية البوية PPF', en: 'PPF paint protection', fa: 'کاور محافظ رنگ PPF' },
    CERAMIC_COATING: { ar: 'السيراميك', en: 'ceramic coating', fa: 'سرامیک بدنه' },
    CAR_SCREEN: { ar: 'شاشات السيارة', en: 'car screens', fa: 'مانیتور خودرو' },
    LED_LIGHTING: { ar: 'إضاءة LED', en: 'LED lighting', fa: 'چراغ LED' },
    CAR_AUDIO: { ar: 'سماعات السيارة', en: 'car audio', fa: 'سیستم صوتی خودرو' },
  };
  const label = labels[service];
  const clarification = vehicleDetailClarification(context, replyLanguage, false);
  const text = replyLanguage.startsWith('ar')
    ? 'بالنسبة لـ' + label.ar + '، ' + clarification.text
    : replyLanguage.startsWith('fa')
      ? 'درباره ' + label.fa + '، ' + clarification.text
      : 'For ' + label.en + ', ' + clarification.text;
  const translation = label.fa + ': ' + clarification.translation;
  return {
    draft: { text, language: replyLanguage, generatedBy: 'secretary' },
    persianTranslation: translation,
  };
}
