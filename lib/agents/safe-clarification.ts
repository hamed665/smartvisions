import type { AgentContext, ReplyDraft } from './contracts';
import { resolveReplyLanguage } from '@/lib/outreach/locale';

/**
 * A conservative recovery draft when an otherwise ordinary car-service price
 * question is blocked because final vehicle/quote details are unavailable.
 * Never includes a price, availability, guarantee, discount or provider promise.
 * The caller must re-run deterministic safety, relevance and send gates.
 */
export function safeVehicleQuoteClarification(
  context: AgentContext,
): { draft: ReplyDraft; persianTranslation: string } | null {
  if (String(context.servingBusiness?.countryCode ?? context.countryCode ?? '').toUpperCase() !== 'OM') return null;
  const currentMessage = context.message.trim().normalize('NFKC');
  const recentCustomerMessages = [
    ...(context.conversationHistory ?? []).filter((message) => message.direction === 'INBOUND').slice(-6).map((message) => message.body),
    currentMessage,
  ].join(' ');
  const isPriceRequest = /(?:سعر|السعر|بكم|بكام|بقديش|جم\s*(?:تسوون|يطلع|السعر)|كم\s*(?:يطلع|تطلع|يكلف|السعر)|وش\s*(?:سعره|السعر)|شو\s*(?:سعره|السعر)|تكلفة|قيمة|قیمت|هزینه|چقدر|price|cost|quote|how much)/i.test(currentMessage);
  // Single-make follow-ups require a real prior price/service request; never
  // revive old price context in response to a new location or complaint query.
  const isMakeFollowUp = /^(?:تویوتا|تويوتا|نیسان|نيسان|لكزس|لکسوس|لکسز|جيب|جیپ|فورد|هوندا|هيونداي|هیوندای|كيا|کیا|لاندكروزر|لاند کروزر|كورولا|كامري|يارس|برادو|باترول|صني|ألتيما|التيما|سنترا|راف4)(?:\s+[0-9۰-۹٠-٩]{2,4})?$/iu.test(currentMessage);
  const previousPriceRequest = (context.conversationHistory ?? []).some((turn) =>
    turn.direction === 'INBOUND'
    && /(?:سعر|بكم|جم\s*تسوون|كم\s*يطلع|تكلفة|قیمت|هزینه|price|how much)/i.test(turn.body)
  );
  if (!isPriceRequest && !(isMakeFollowUp && previousPriceRequest)) return null;
  if (!/(?:سعر|السعر|بكم|بكام|بقديش|جم\s*تسوون|كم\s*يطلع|تكلفة|قیمت|هزینه|price|cost|quote)/i.test(recentCustomerMessages)) return null;
  if (!/(?:سيار|سيارة|السيارة|مقاعد|المقاعد|تلبيس|تلبيسات|تنجيد|عازل|تظليل|دواسات|فرش|كفبوش|كفپوش|تویوتا|تويوتا|نيسان|نیسان|لكزس|لکسوس|لاندكروزر|كامري|كورولا|خودرو|ماشین|روکش|مقعد|ppf|ceramic|vehicle|car|seat|upholster)/i.test(recentCustomerMessages)) return null;

  const language = resolveReplyLanguage({
    message: context.message,
    primaryLocale: context.marketLocaleStyle?.primaryLocale ?? 'ar-OM',
    preferredLanguage: context.language,
    conversationHistory: context.conversationHistory,
  });
  if (language === 'und') return null;

  if (language.startsWith('ar')) {
    return {
      draft: {
        text: 'أبشر، عشان نعطيك سعر مضبوط على سيارتك، ممكن الموديل وسنة الصنع؟ وبنتأكد لك من التفاصيل حسب اللي يناسبك.',
        language: 'ar-OM',
        generatedBy: 'secretary',
      },
      persianTranslation: 'حتماً. برای اینکه قیمت متناسب با خودروی شما اعلام کنیم، مدل و سال ساخت را می‌فرمایید؟ بعد جزئیات مناسب را بررسی می‌کنیم.',
    };
  }
  if (language.startsWith('fa')) {
    return {
      draft: {
        text: 'حتماً، برای اینکه قیمت مناسب خودروی شما رو دقیق بررسی کنیم، مدل و سال ساختش رو می‌فرمایید؟',
        language: 'fa',
        generatedBy: 'secretary',
      },
      persianTranslation: 'حتماً، برای اینکه قیمت مناسب خودروی شما رو دقیق بررسی کنیم، مدل و سال ساختش رو می‌فرمایید؟',
    };
  }
  if (language.startsWith('en')) {
    return {
      draft: {
        text: "I can check the right price for your car. What's the model and year? I'll make sure the details match before quoting.",
        language: 'en',
        generatedBy: 'secretary',
      },
      persianTranslation: 'می‌توانم قیمت متناسب با خودروی شما را بررسی کنم. مدل و سال خودرو چیست؟ قبل از اعلام قیمت، جزئیات را تطبیق می‌دهم.',
    };
  }
  return null;
}
