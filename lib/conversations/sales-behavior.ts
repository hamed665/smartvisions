import type { AgentContext, CommercialDecision, ReplyDraft, SalesStateSnapshot } from '@/lib/agents/contracts';

const SERVICE_PATTERNS: Record<string, RegExp[]> = {
  CONTENT_REELS: [/\bcontent\b/i, /\breels?\b/i, /\bstor(?:y|ies)\b/i, /محتو[ىا]/i, /ريل/i],
  SOCIAL_MEDIA_MANAGEMENT: [/social media/i, /instagram management/i, /إدارة.*(?:انستغرام|السوشيال)/i, /مدیریت.*اینستاگرام/i],
  BUSINESS_WEBSITE: [/\bwebsite\b/i, /\bweb site\b/i, /موقع (?:إلكتروني|الكتروني)/i, /وب[‌\s-]?سایت/i],
  SEO: [/\bseo\b/i, /google visibility/i, /google ranking/i, /\bسيو\b/i],
  WHATSAPP_AUTOMATION: [/whatsapp automation/i, /automate.*whatsapp/i, /أتمتة.*واتساب/i, /اتوماسیون.*واتس/i],
  BUSINESS_AUTOMATION: [/business automation/i, /workflow automation/i, /أتمتة.*(?:الأعمال|العمل)/i, /اتوماسیون.*کسب/i],
  AI_AGENT: [/\bai agent\b/i, /artificial intelligence agent/i, /وكيل.*ذكاء/i, /ایجنت.*هوش/i],
};

export function hasFinancialPaymentIntent(message: string) {
  const text = message.trim();
  if (!text) return false;
  return [
    /\b(?:how|where|when)\s+(?:do|can|should|would)\s+i\s+(?:pay|make (?:the )?payment)\b/i,
    /\b(?:ready to pay|want to pay|pay (?:now|today|the invoice|the deposit)|make (?:a )?payment|payment (?:link|method|methods|terms|option|options|details)|send (?:me )?(?:an? )?invoice|invoice me|bank (?:account|details)|card payment|checkout|deposit)\b/i,
    /(?:كيف|وين|أين|متى)\s*(?:أدفع|ادفع)|(?:أريد|ابي|أبغى)\s*(?:أدفع|ادفع)|رابط\s*الدفع|(?:أرسل|ارسل)\s*(?:لي\s*)?فاتورة|فاتورة\s*(?:الدفع)?|عربون|حساب\s*بنكي|بيانات\s*البنك/i,
    /(?:چطور|چجوری|کجا|کی)\s*(?:پرداخت|واریز)\s*(?:کنم)?|می[‌\s-]?(?:خوام|خواهم)\s*(?:پرداخت|واریز)\s*(?:کنم)?|لینک\s*پرداخت|فاکتور\s*(?:رو|را)?\s*(?:بفرست|ارسال)|بیعانه|شماره\s*حساب|اطلاعات\s*بانکی/i,
  ].some((pattern) => pattern.test(text));
}

export function hasContractExecutionIntent(message: string) {
  const text = message.trim();
  if (!text) return false;
  return [
    /\b(?:send|share|prepare|sign|accept|execute)\s+(?:me\s+)?(?:the\s+)?(?:contract|agreement)\b/i,
    /\b(?:contract|agreement)\s+(?:to sign|for signature|ready to sign)\b/i,
    /(?:أرسل|ارسل|جهز|وقّع|وقع|أوقع|اوقع)\s*(?:لي\s*)?(?:العقد|الاتفاقية)|(?:العقد|الاتفاقية)\s*(?:للتوقيع|جاهز للتوقيع)/i,
    /(?:قرارداد|توافقنامه)\s*(?:رو|را)?\s*(?:بفرست|ارسال|آماده)|(?:قرارداد|توافقنامه)\s*(?:برای\s*)?(?:امضا|امضاء)/i,
  ].some((pattern) => pattern.test(text));
}

export function hasAvailabilityExecutionIntent(message: string) {
  const text = message.trim();
  if (!text) return false;
  return [
    /\b(?:are you|are they|is (?:he|she|it)|will you be)\s+available\b/i,
    /\b(?:do you have|have you got|can you check|please check|check)\s+(?:any\s+)?(?:availability|an?\s+slot|slots?)\b/i,
    /\b(?:can|could|please)\s+(?:you\s+)?(?:book|reserve|hold)\s+(?:it|this|a slot|the slot|a date|the date)\b/i,
    /\b(?:do you have|can you provide|can you arrange)\s+(?:an?\s+|any\s+|\d+\s+)?(?:videographer|photographer|models?|actors?)\b/i,
    /(?:هل|انتو|عندكم).*?(?:متاح|متوفر)|(?:شيك|تأكد|تشيك).*?(?:التوفر|الموعد)|(?:احجز|حجز|ثبّت|ثبت).*?(?:الموعد|الوقت)|(?:عندكم|توفرون).*?(?:مصور|مودل|عارض|ممثل)/i,
    /(?:آیا|هستید|هستن).*?(?:آزاد|موجود)|(?:چک|بررسی).*?(?:موجودی|وقت خالی)|(?:رزرو|نگه دار).*?(?:وقت|تاریخ)|(?:دارید|فراهم می‌کنید).*?(?:فیلمبردار|عکاس|مدل|بازیگر)/i,
  ].some((pattern) => pattern.test(text));
}

export function hasReadyToStartIntent(message: string) {
  const text = message.trim();
  if (!text) return false;
  if (/\b(?:not|never)\s+(?:yet\s+)?ready\b|\b(?:don['’]?t|do not|cannot|can't)\s+(?:want to\s+)?(?:start|begin|proceed)|(?:مو|مش|غير|ماني)\s*جاهز|آماده\s*نیستم|شروع\s*نکن/i.test(text)) return false;
  return [
    /\b(?:let['’]?s|lets)\s+(?:start|begin|go ahead|do it|move forward)\b/i,
    /\b(?:i(?:'m| am)|we(?:'re| are))\s+ready\s+to\s+(?:start|begin|proceed|go ahead|move forward)\b/i,
    /\bready\s+to\s+get\s+started\b/i,
    /\b(?:how do we|how can we|what(?:'s| is) the next step to)\s+(?:start|begin|proceed)\b/i,
    /(?:يلا|خلنا|خلينا)\s*(?:نبدأ|نبتدي)|(?:أنا|انا|نحن|احنا)\s*(?:جاهز|جاهزين|مستعد|مستعدين)\s*(?:نبدأ|نبتدي|نبدأ معكم|نبتدي معكم)?|كيف\s*(?:نبدأ|نبتدي)|(?:ابدأوا|ابدوا)\s*(?:معنا|معانا)?/i,
    /(?:شروع کنیم|بریم جلو|بزن بریم)|(?:آماده[‌\s-]?ام|آماده هستیم)\s*(?:برای\s*)?(?:شروع|ادامه)|(?:چطور|چجوری)\s*شروع\s*کنیم|مرحله\s*بعد\s*(?:چیه|چیست)/i,
  ].some((pattern) => pattern.test(text));
}

export function inferSalesHandoffSignals(message: string, state?: SalesStateSnapshot) {
  return {
    asksHuman: /(human|person|manager|someone|موظف|شخص|مدير|مسؤول|انسان|مدیر)/i.test(message),
    asksMeeting: /(meeting|call|zoom|meet|consultation|consult|مكالمة|اجتماع|استشارة|تماس|جلسه)/i.test(message),
    asksPayment: hasFinancialPaymentIntent(message),
    asksContract: hasContractExecutionIntent(message),
    asksAvailability: hasAvailabilityExecutionIntent(message),
    readyToStart: hasReadyToStartIntent(message),
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

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function asksLocation(text: string) {
  return [
    /\b(?:where|which|what)\b.{0,28}\b(?:location|place|area)\b/i,
    /\bwhere\b.{0,28}\b(?:shoot|filming|business)\b/i,
    /\b(?:can|could|would|please)\s+(?:you\s+)?(?:share|send|confirm|tell me)\b.{0,28}\b(?:location|area)\b/i,
    /(?:وين|أين)(?:.{0,20}(?:التصوير|الشوت))?|(?:ما|شو)\s*(?:هو|هي)?\s*(?:الموقع|اللوكيشن)/i,
    /(?:کجا|چه\s*(?:لوکیشن|موقعیت)|لوکیشن\s*کجاست)/i,
  ].some((pattern) => pattern.test(text));
}

export function asksDate(text: string) {
  return [
    /\bwhen\b/i,
    /\b(?:which|what)\s+(?:date|day)\b/i,
    /\b(?:can|could|would|please)\s+(?:you\s+)?(?:share|send|confirm|tell me)\b.{0,28}\b(?:date|day)\b/i,
    /(?:متى|أي\s*(?:تاريخ|يوم)|ما\s*(?:هو|هي)?\s*(?:التاريخ|الموعد))/i,
    /(?:چه\s*تاریخ|چه\s*روزی|کی\s*(?:مناسبه|میاد|هست)|تاریخ\s*چیه)/i,
  ].some((pattern) => pattern.test(text));
}

export function asksBudget(text: string) {
  return [
    /\b(?:what(?:'s| is)|how much is)\s+(?:your\s+)?budget\b/i,
    /\b(?:how much can you spend|what can you spend|what budget do you have)\b/i,
    /\b(?:can|could|would|please)\s+(?:you\s+)?(?:share|confirm|tell me)\b.{0,24}\bbudget\b/i,
    /(?:كم\s*(?:ميزانيتك|الميزانية)|ما\s*(?:هي|هو)?\s*الميزانية)/i,
    /(?:بودجه(?:‌|\s)*(?:تون|شما)\s*(?:چقدره|چقدر است)|چقدر\s*بودجه)/i,
  ].some((pattern) => pattern.test(text));
}

function asksDecisionMaker(text: string) {
  return /(decision[ -]?maker|who decides|who approves|صاحب القرار|من يقرر|تصمیم گیرنده|چه کسی تصمیم)/i.test(text);
}

function asksPrice(text: string) {
  return /\b(?:how much|price|pricing|cost|what does .* cost)\b|(?:كم\s*(?:السعر|يكلف|تكلف)|السعر|سعر|تكلفة)|(?:قیمت|هزینه|چقدر\s*(?:قیمت|هزینه|می[‌\s-]?شه|میشه|درمیاد|است|هست))/i.test(text);
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

function canonicalPrice(context: AgentContext, decision?: CommercialDecision) {
  const serviceId = decision?.serviceId || context.quotedService;
  if (serviceId) {
    const service = context.serviceKnowledge?.find((item) => item.id === serviceId);
    if (service?.marketPrice && Number.isFinite(service.marketPrice.price) && service.marketPrice.currency) {
      return { price: Number(service.marketPrice.price), currency: service.marketPrice.currency };
    }
    if (serviceId === context.quotedService && Number.isFinite(context.quotedPrice) && context.quotedCurrency) {
      return { price: Number(context.quotedPrice), currency: context.quotedCurrency };
    }
    return null;
  }
  if (Number.isFinite(context.quotedPrice) && context.quotedCurrency) {
    return { price: Number(context.quotedPrice), currency: context.quotedCurrency };
  }
  return null;
}

function containsCanonicalPrice(text: string, quote: { price: number; currency: string }) {
  const normalized = text.replace(/[٠-٩۰-۹]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.includes(digit)
    ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  const amounts = normalized.match(/(?<![\d.,-])\d+(?:\.\d+)?(?![\d.]|,\d)/g) ?? [];
  const currency = quote.currency.toUpperCase();
  const currencyPresent = new RegExp('\\b' + currency + '\\b', 'i').test(normalized)
    || (currency === 'OMR' && /(?:ر\.?\s*ع\.?|ريال\s*ع[ُ]?ماني|ریال\s*عمان)/i.test(normalized));
  return amounts.some((value) => Number(value) === quote.price) && currencyPresent;
}

export function evaluateSalesReplyPolicy(input: {
  context: AgentContext;
  draft: ReplyDraft;
  decision?: CommercialDecision;
}) {
  const reasons: string[] = [];
  const text = input.draft.text.trim();
  const state = input.context.salesState;
  const questions = questionCount(text);
  const words = wordCount(text);
  const maxReplyWords = input.context.marketLocaleStyle?.maxReplyWords;
  const closeSignal = hasReadyToStartIntent(input.context.message);
  const quote = canonicalPrice(input.context, input.decision);
  const directPriceAnswerRequired = asksPrice(input.context.message) && quote != null && input.decision?.action !== 'HUMAN';
  const directPriceAnswered = !directPriceAnswerRequired || (quote != null && containsCanonicalPrice(text, quote));
  const qualificationQuestions = [
    asksLocation(text) ? 'location' : null,
    asksDate(text) ? 'date' : null,
    asksBudget(text) ? 'budget' : null,
    asksDecisionMaker(text) ? 'decision_maker' : null,
  ].filter((value): value is string => Boolean(value));

  if (questions > 1) reasons.push('TOO_MANY_PRIMARY_QUESTIONS');
  if (positiveOperationalCommitment(text)) reasons.push('UNVERIFIED_OPERATIONAL_COMMITMENT');
  if (Number.isFinite(maxReplyWords) && Number(maxReplyWords) > 0 && words > Number(maxReplyWords)) {
    reasons.push('REPLY_EXCEEDS_MARKET_WORD_LIMIT');
  }
  if (directPriceAnswerRequired && !directPriceAnswered) reasons.push('MISSES_CANONICAL_PRICE_ANSWER');
  if (closeSignal && questions > 0) reasons.push('QUALIFICATION_AFTER_READY_TO_START');

  if (state) {
    if (state.location && asksLocation(text)) reasons.push('REPEATED_KNOWN_LOCATION_QUESTION');
    if (!state.location && !state.missingRequiredInfo.includes('location') && asksLocation(text)) reasons.push('UNNECESSARY_LOCATION_QUESTION');
    if (state.date?.precision === 'EXPLICIT' && asksDate(text)) reasons.push('REPEATED_KNOWN_DATE_QUESTION');
    if (!state.date && !state.missingRequiredInfo.includes('date') && asksDate(text)) reasons.push('UNNECESSARY_DATE_QUESTION');
    if (state.budget && asksBudget(text)) reasons.push('REPEATED_KNOWN_BUDGET_QUESTION');
    if (asksKnownDeliverable(text, state)) reasons.push('REPEATED_KNOWN_DELIVERABLE_QUESTION');

    const mentioned = mentionedServiceKeys(text);
    if (mentioned.some((service) => state.rejectedServices.includes(service)) && !mentionedServiceKeys(input.context.message).some((service) => state.rejectedServices.includes(service))) {
      reasons.push('RECOMMENDS_REJECTED_SERVICE');
    }

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

  const uniqueReasons = [...new Set(reasons)];
  return {
    passed: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    metrics: {
      policyPassed: uniqueReasons.length === 0,
      wordCount: words,
      questionCount: questions,
      maxReplyWords: Number.isFinite(maxReplyWords) && Number(maxReplyWords) > 0 ? Number(maxReplyWords) : undefined,
      directPriceAnswerRequired,
      directPriceAnswered,
      readyToStart: closeSignal,
      qualificationQuestions,
    },
  };
}
