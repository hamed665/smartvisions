import type { AgentContext, ReplyDraft } from './contracts';
import { resolveReplyLanguage } from '@/lib/outreach/locale';
import { updateAutomotiveSalesMemory } from '@/lib/conversations/automotive-sales-memory';

/** Resolve only customer-provided facts using the canonical automotive parser. */
export function vehicleDetailClarification(context: AgentContext, language: string, quote = true) {
  let vehicle = { ...(context.salesState?.automotive ?? {}) };
  const turns = [...(context.conversationHistory ?? []).filter((turn) => turn.direction === 'INBOUND').slice(-6),
    { direction: 'INBOUND' as const, body: context.message }];
  for (const item of turns) {
    vehicle = updateAutomotiveSalesMemory({ previous: vehicle, body: item.body, item, evidence: {}, revisions: [] });
  }
  const missing = !vehicle.model && !vehicle.year ? 'both' : !vehicle.model ? 'model' : !vehicle.year ? 'year' : 'none';
  if (language.startsWith('ar')) {
    if (missing === 'both') return { text: 'أبشر، عشان نحدد المناسب لسيارتك، ممكن الموديل وسنة الصنع؟', translation: 'حتماً، برای بررسی گزینه مناسب، مدل و سال ساخت خودرو را می‌فرمایید؟' };
    if (missing === 'model') return { text: 'سنة الصنع واضحة، ممكن تذكر موديل السيارة؟', translation: 'سال ساخت مشخص است، مدل خودرو را می‌فرمایید؟' };
    if (missing === 'year') return { text: 'موديل السيارة واضح، من أي سنة؟', translation: 'مدل خودرو مشخص است، سال ساخت چیست؟' };
    return { text: quote
      ? 'بيانات سيارتك واضحة. السعر النهائي والتوفر يحتاجان تأكيد المسؤول؛ ممكن ترسل صورة للجزء اللي تقصد تركب له؟'
      : 'بيانات سيارتك واضحة. التوافق يحتاج تأكيد المسؤول؛ ممكن ترسل صورة للجزء اللي تقصد تركب له؟',
      translation: 'مشخصات خودرو مشخص است. '+(quote ? 'قیمت نهایی و موجودی' : 'سازگاری')+' نیاز به تأیید مسئول دارد؛ از بخش موردنظر برای نصب عکس می‌فرستید؟' };
  }
  if (language.startsWith('fa')) {
    const text = missing === 'both' ? 'حتماً، برای بررسی گزینه مناسب، مدل و سال ساخت خودرو رو می‌فرمایید؟'
      : missing === 'model' ? 'سال ساخت مشخصه؛ مدل خودرو رو می‌فرمایید؟'
      : missing === 'year' ? 'مدل خودرو مشخصه؛ سال ساختش چنده؟'
      : 'مشخصات خودرو مشخصه. '+(quote ? 'قیمت نهایی و موجودی' : 'سازگاری')+' نیاز به تأیید مسئول داره؛ از بخش موردنظر برای نصب عکس می‌فرستید؟';
    return { text, translation: text };
  }
  const text = missing === 'both' ? "What's your car's model and year?"
    : missing === 'model' ? "I have the year. What's the car model?"
    : missing === 'year' ? "I have the model. What year is your car?"
    : 'I have your vehicle details. '+(quote ? 'Final pricing and availability' : 'Compatibility')+' need staff confirmation. Could you send a photo of the area you want fitted?';
  return { text, translation: missing === 'both' ? 'مدل و سال ساخت خودرو چیست؟' : missing === 'model' ? 'مدل خودرو چیست؟' : missing === 'year' ? 'سال ساخت خودرو چیست؟' : 'مشخصات خودرو مشخص است؛ تأیید مسئول لازم است. از بخش موردنظر عکس می‌فرستید؟' };
}


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

  if (!['ar', 'fa', 'en'].some((prefix) => language.startsWith(prefix))) return null;
  const clarification = vehicleDetailClarification(context, language);
  return {
    draft: { text: clarification.text, language: language.startsWith('ar') ? 'ar-OM' : language, generatedBy: 'secretary' },
    persianTranslation: clarification.translation,
  };
}
