import type { AgentContext, ReplyDraft } from './contracts';
import { resolveReplyLanguage } from '@/lib/outreach/locale';
import { vehicleDetailClarification } from './safe-clarification';

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
  if (!/(?:عندكم|عندكو|عندك|تركبون|يركب|ينفع|يناسب|شو تنصح|وش تنصح|شو رايك|وش رايك|أبغي|ابغي|اريد|أريد|ابي|بغيت|هل يصلح|نفس هذا|هذا يضبط|حق ال|للاند|للتويوتا|للجيب)/i.test(message)) return null;
  const language = resolveReplyLanguage({
    message,
    primaryLocale: context.marketLocaleStyle?.primaryLocale ?? 'ar-OM',
    preferredLanguage: context.language,
    conversationHistory: context.conversationHistory,
  });
  // A short, specifically Omani/Gulf advice idiom can have low language
  // confidence. Preserve established Arabic; never do this for a long message
  // or one containing a clear Persian price/service question.
  const establishedArabicShortAdvice = language === 'und'
    && String(context.language ?? '').startsWith('ar')
    && /^(?:شو|وش)\s+(?:تنصح|رايك|رأيك)(?:\s+[^؟?!.]{1,50})?[؟?!. ]*$/u.test(message);
  if (!language.startsWith('ar') && !establishedArabicShortAdvice) return null;
  const floorMatPattern = /(?:فرش ارض|فرش أرض|دواسات|كفبوش|كفپوش|floor mat|5d|3d)/i;
  const tintPattern = /(?:عازل|تظليل|تضليل|جامات|تنت|window film)/i;
  const screenPattern = /(?:شاشه|شاشة|شاشات|كار بلاي|كاربلاي|carplay|اندرويد|أندرويد|winca)/i;
  const ledPattern = /(?:ليد|led|لمبات|إضاءة|اضاءة)/i;
  // New service mentions supersede older history. Only look backwards if this
  // short turn truly omits the category, e.g. "شو تنصح؟".
  const prior = (context.conversationHistory ?? [])
    .filter((item) => item.direction === 'INBOUND')
    .slice(-5).map((item) => item.body).reverse()
    .find((body) => [floorMatPattern, tintPattern, screenPattern, ledPattern].some((pattern) => pattern.test(body))) ?? '';
  const topic = [floorMatPattern, tintPattern, screenPattern, ledPattern].some((pattern) => pattern.test(message))
    ? message : prior;
  const floorMats = floorMatPattern.test(topic);
  const tint = tintPattern.test(topic);
  const screen = screenPattern.test(topic);
  const led = ledPattern.test(topic);
  let text: string;
  let translation: string;
  if (floorMats || tint || screen || led) {
    const clarification = vehicleDetailClarification(context, 'ar-OM', false);
    const topicLabel = floorMats ? 'فرش الأرضيات' : tint ? 'العازل الحراري' : screen ? 'الشاشة' : 'الإضاءة';
    text = 'بالنسبة لـ' + topicLabel + '، ' + clarification.text;
    translation = clarification.translation;
  } else {
    text = 'حياك، ممكن توضّح أي خدمة تقصد عشان أعطيك جواب مضبوط؟';
    translation = 'خوش آمدید، می‌شود بگویید کدام خدمت را می‌خواهید تا پاسخ دقیقی بدهم؟';
  }
  return {
    draft: { text, language: 'ar-OM', generatedBy: 'secretary' },
    persianTranslation: translation,
  };
}
