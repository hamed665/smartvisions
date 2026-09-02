export type ReplyCategory =
  | 'positive'
  | 'negative'
  | 'price'
  | 'portfolio'
  | 'timeline'
  | 'meeting'
  | 'payment'
  | 'unsubscribe'
  | 'question'
  | 'other';

export interface ReplySignals {
  positive: boolean;
  askedPrice: boolean;
  askedPortfolio: boolean;
  askedTimeline: boolean;
  askedMeeting: boolean;
  askedPayment: boolean;
  unsubscribe: boolean;
  negative: boolean;
}

function has(text: string, patterns: RegExp[]) {
  return patterns.some((p) => p.test(text));
}

export function extractReplySignals(input: string): ReplySignals {
  const text = input.toLowerCase();
  return {
    positive: has(text, [/interested/, /sounds good/, /let['’]?s proceed/, /yes,? please/, /موافق/, /مهتم/, /مناسب/, /تمام/]),
    askedPrice: has(text, [/price/, /cost/, /how much/, /quote/, /سعر/, /كم/, /تكلفة/]),
    askedPortfolio: has(text, [/portfolio/, /example/, /sample/, /previous work/, /نماذج/, /اعمالكم/, /أعمالكم/, /مثال/]),
    askedTimeline: has(text, [/how long/, /timeline/, /when can/, /delivery/, /مدة/, /متى/, /كم يوم/]),
    askedMeeting: has(text, [/meeting/, /call/, /zoom/, /meet/, /مكالمة/, /اجتماع/, /نتكلم/]),
    askedPayment: has(text, [/payment/, /deposit/, /invoice/, /pay/, /دفع/, /فاتورة/, /عربون/]),
    unsubscribe: has(text, [
      /unsubscribe/,
      /remove me/,
      /stop (emailing|messaging|contacting) me/,
      /do not contact/,
      /don['’]?t contact me/,
      /لا تراسل/,
      /لا ترسل(وا|ون)? (لي|لنا)? ?(رسائل|مسجات)/,
      /لا تتواصل/,
      /وقف(وا)? (الرسائل|المسجات)/,
      /ما (اريد|أريد|ابغى|أبغى) (رسائل|مسجات)/,
      /احذف بريدي/,
      /پیام نده/,
      /پیام ندید/,
      /دیگه پیام نده/,
      /دیگر پیام نده/,
      /تماس نگیر/,
      /تماس نگیرید/,
    ]),
    negative: has(text, [/not interested/, /no thanks/, /don['’]?t need/, /غير مهتم/, /لا شكرا/, /ما نحتاج/]),
  };
}

export function classifyReply(text: string): ReplyCategory {
  const s = extractReplySignals(text);
  if (s.unsubscribe) return 'unsubscribe';
  if (s.negative) return 'negative';
  if (s.askedPayment) return 'payment';
  if (s.askedMeeting) return 'meeting';
  if (s.askedPrice) return 'price';
  if (s.askedTimeline) return 'timeline';
  if (s.askedPortfolio) return 'portfolio';
  if (s.positive) return 'positive';
  if (text.trim().endsWith('?') || /\b(can|could|do|does|is|are|what|which|how)\b/i.test(text)) return 'question';
  return 'other';
}

export function calculateIntentScore(signals: ReplySignals) {
  let score = 0;
  const reasons: string[] = [];
  const add = (condition: boolean, points: number, reason: string) => {
    if (condition) { score += points; reasons.push(reason); }
  };

  add(signals.positive, 10, 'Positive reply');
  add(signals.askedPrice, 20, 'Asked price');
  add(signals.askedTimeline, 20, 'Asked timeline');
  add(signals.askedPortfolio, 15, 'Asked portfolio');
  add(signals.askedMeeting, 30, 'Asked meeting');
  add(signals.askedPayment, 40, 'Asked payment');

  if (signals.negative || signals.unsubscribe) score = 0;
  const bounded = Math.min(score, 100);
  return { score: bounded, reasons, hot: bounded >= 70 || signals.askedPayment };
}
