import type { AgentContext, ReplyDraft, SalesStateSnapshot } from '@/lib/agents/contracts';
import { hasPaymentExecutionIntent } from '@/lib/handoff/policy';

const SERVICE_PATTERNS: Record<string, RegExp[]> = {
  CONTENT_REELS: [/\bcontent\b/i, /\breels?\b/i, /\bstor(?:y|ies)\b/i, /محتو[ىا]/i, /ريل/i],
  SOCIAL_MEDIA_MANAGEMENT: [/social media/i, /instagram management/i, /إدارة.*(?:انستغرام|السوشيال)/i, /مدیریت.*اینستاگرام/i],
  BUSINESS_WEBSITE: [/\bwebsite\b/i, /\bweb site\b/i, /موقع (?:إلكتروني|الكتروني)/i, /وب[‌\s-]?سایت/i],
  SEO: [/\bseo\b/i, /google visibility/i, /google ranking/i, /\bسيو\b/i],
  WHATSAPP_AUTOMATION: [/whatsapp automation/i, /automate.*whatsapp/i, /أتمتة.*واتساب/i, /اتوماسیون.*واتس/i],
  BUSINESS_AUTOMATION: [/business automation/i, /workflow automation/i, /أتمتة.*(?:الأعمال|العمل)/i, /اتوماسیون.*کسب/i],
  AI_AGENT: [/\bai agent\b/i, /artificial intelligence agent/i, /وكيل.*ذكاء/i, /ایجنت.*هوش/i],
};

export function inferSalesHandoffSignals(message: string, state?: SalesStateSnapshot) {
  const asksPayment = hasPaymentExecutionIntent(message);
  return {
    asksHuman: /(human|person|manager|someone|موظف|شخص|مدير|مسؤول|انسان|مدیر)/i.test(message),
    asksMeeting: /(meeting|call|zoom|meet|consultation|consult|مكالمة|اجتماع|استشارة|تماس|جلسه)/i.test(message),
    asksPayment,
    asksContract: /\b(?:contract|agreement|sign)\b|(?:العقد|الاتفاقية|توقيع)|(?:قرارداد|امضا)/i.test(message),
    asksAvailability: /\b(?:availability|available|slot|book(?:ing)?|reserve|reservation|do you have|can you provide)\b|(?:متاح|متوفر|موعد|حجز|عندكم)|(?:وقت خالی|رزرو|موجود دارید)/i.test(message),
    customQuote: state?.customQuoteRequired === true || /custom (?:quote|package|scope)|bespoke|عرض مخصص|باقة مخصصة|پکیج اختصاصی|قیمت اختصاصی/i.test(message),
    specialDiscount: /\b(?:discount|best price|last price|reduce (?:the )?price)\b|(?:خصم|تخفيض|آخر سعر)|(?:تخفیف|قیمت بهتر)/i.test(message),
    complaint: /(complaint|unhappy|bad service|شكوى|مشكلة|غير راضي|شکایت|ناراضی)/i.test(message),
  };
}

function questionCount(text: string) {
  const punctuation = (text.match(/[?؟]/g) ?? []).length;
  if (punctuation > 0) return punctuation;
  return text.split(/(?<=[.!])\s+/).filter((sentence) => /^(?:who|what|when|where|why|how|which|can|could|do|does|is|are|كم|كيف|وين|أين|متى|هل|شو|چی|چطور|کجا)\b/i.test(sentence.trim())).length;
}

function asksLocation(text: string) {
  return /(where|which location|what location|location\?|وين|أين|الموقع|کجا|لوکیشن)/i.test(text);
}

function asksDate(text: string) {
  return /(when|which date|what date|date\?|متى|تاريخ|موعد|چه تاریخ|کی\s)/i.test(text);
}

function asksBudget(text: string) {
  return /(budget|how much can you spend|what can you spend|ميزانية|بودجه)/i.test(text);
}

function asksDecisionMaker(text: string) {
  return /(decision[ -]?maker|who decides|who approves|صاحب القرار|من يقرر|تصمیم گیرنده|چه کسی تصمیم)/i.test(text);
}

function asksKnownDeliverable(text: string, state: SalesStateSnapshot) {
  return state.deliverables.some((item) => {
    if (item.quantity == null) return false;
    const kind = item.kind.toLowerCase();
    const noun = kind === 'reel' ? /how many reels?|كم.*ريل/i
      : kind === 'story' ? /how many stor(?:y|ies)|كم.*ستوري/i
        : kind === 'model' ? /how many models?|كم.*مودل/i
          : kind === 'actor' ? /how many actors?|كم.*ممثل/i
            : new RegExp(`how many ${kind}s?`, 'i');
    return noun.test(text);
  });
}

function mentionedServiceKeys(text: string) {
  return Object.entries(SERVICE_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)))
    .map(([key]) => key);
}

function positiveOperationalCommitment(text: string) {
  return [
    /\b(?:it|your (?:slot|booking|reservation)) (?:is|has been) (?:booked|reserved|confirmed)\b/i,
    /\b(?:we|i) (?:have|checked|confirmed) (?:the )?(?:availability|slot)\b/i,
    /\bavailability (?:is )?confirmed\b/i,
    /\b(?:payment link|bank details|bank account) (?:is|are|below|here)\b/i,
    /\b(?:i|we) (?:sent|have sent) (?:the )?(?:contract|agreement|invoice)\b/i,
    /(?:تم الحجز|الحجز مؤكد|التوفر مؤكد|رابط الدفع|بيانات البنك|أرسلت.*العقد)/i,
    /(?:رزرو شد|رزرو قطعی|لینک پرداخت|اطلاعات بانکی|قرارداد را فرستادم)/i,
  ].some((pattern) => pattern.test(text));
}

function simpleGreeting(text: string) {
  return /^(?:hi|hello|hey|salam|سلام|هلا|مرحبا|السلام عليكم|السلام علیکم)[!.,\s]*$/i.test(text.trim());
}

export function evaluateSalesReplyPolicy(input: {
  context: AgentContext;
  draft: ReplyDraft;
}) {
  const reasons: string[] = [];
  const text = input.draft.text.trim();
  const state = input.context.salesState;

  if (questionCount(text) > 1) reasons.push('TOO_MANY_PRIMARY_QUESTIONS');
  if (positiveOperationalCommitment(text)) reasons.push('UNVERIFIED_OPERATIONAL_COMMITMENT');

  if (state) {
    if (state.location && asksLocation(text)) reasons.push('REPEATED_KNOWN_LOCATION_QUESTION');
    if (state.date?.precision === 'EXPLICIT' && asksDate(text)) reasons.push('REPEATED_KNOWN_DATE_QUESTION');
    if (state.budget && asksBudget(text)) reasons.push('REPEATED_KNOWN_BUDGET_QUESTION');
    if (asksKnownDeliverable(text, state)) reasons.push('REPEATED_KNOWN_DELIVERABLE_QUESTION');

    const mentioned = mentionedServiceKeys(text);
    if (mentioned.some((service) => state.rejectedServices.includes(service)) && !mentionedServiceKeys(input.context.message).some((service) => state.rejectedServices.includes(service))) {
      reasons.push('RECOMMENDS_REJECTED_SERVICE');
    }

    // Budget is not a universal qualification ritual. This state model only marks information
    // as required when the next safe action actually depends on it.
    if (!state.budget && !state.missingRequiredInfo.includes('budget') && asksBudget(text)) {
      reasons.push('UNNECESSARY_BUDGET_QUESTION');
    }
  }

  if (asksDecisionMaker(text) && !/(decision[ -]?maker|approver|صاحب القرار|تصمیم گیرنده)/i.test(input.context.message)) {
    reasons.push('UNNECESSARY_DECISION_MAKER_QUESTION');
  }

  if (simpleGreeting(input.context.message) && mentionedServiceKeys(text).length >= 3) {
    reasons.push('CATALOG_DUMP_AFTER_GREETING');
  }

  return { passed: reasons.length === 0, reasons };
}
